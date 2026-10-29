const mongoose = require("mongoose");
const BillingSession = require("../models/BillingSession");
const Customer = require("../models/Customer");
const DummyVendor = require("../models/DummyVendor");
const VendorPriceNode = require("../models/VendorPriceNode");
const VendorMenuNode = require("../models/VendorMenuNode");
const VendorCustomPackage = require("../models/VendorCustomPackage");
const VendorServiceTaxOverride = require("../models/VendorServiceTaxOverride");
const { calculateGst, GstCalculationError } = require("./gstCalculationService");
const {
  GSTIN_PATTERN,
  isGstDraftConfigured,
  sanitizeGstSettings,
  STATE_CODES,
} = require("./vendorGstSettings");
const {
  _private: membershipPreview,
} = require("../controllers/membershipBillingPreviewController");
const { calculateMembershipBillingPreview } = require("../utils/membershipBillingCalculator");
const { normalizeBillingQuantity } = require("../utils/billingItemQuantity");

const ITEM_SOURCES = VendorServiceTaxOverride.ITEM_SOURCES;

class GstBillPreviewError extends Error {
  constructor(message, code, status = 400) {
    super(message);
    this.name = "GstBillPreviewError";
    this.code = code;
    this.status = status;
  }
}

function toPaise(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new GstBillPreviewError(`${field} is invalid`, "invalid_money");
  }
  const paise = Math.round(number * 100);
  if (!Number.isSafeInteger(paise)) {
    throw new GstBillPreviewError(`${field} exceeds the supported range`, "money_out_of_range");
  }
  return paise;
}

function resolveSupportedPlaceOfSupply(settings, input = {}) {
  const registeredStateCode = settings.registeredStateCode;
  const suppliedStateCode = String(
    input.customerStateCode || input.placeOfSupplyStateCode || ""
  ).trim();

  if (suppliedStateCode && !STATE_CODES.has(suppliedStateCode)) {
    throw new GstBillPreviewError(
      "The supplied customer state code is invalid",
      "invalid_customer_state"
    );
  }
  if (suppliedStateCode && suppliedStateCode !== registeredStateCode) {
    throw new GstBillPreviewError(
      "Inter-state GST preview is not supported yet",
      "interstate_preview_not_supported",
      422
    );
  }
  return registeredStateCode;
}

function itemQuery(source, vendorId, itemId) {
  const common = { _id: itemId, vendorId, isLeaf: true, price: { $ne: null } };
  if (source === "vendor_price_node") return VendorPriceNode.findOne(common);
  if (source === "vendor_menu_node") {
    return VendorMenuNode.findOne({ ...common, datasetStatus: "active" });
  }
  return VendorCustomPackage.findOne({ ...common, isDeleted: false });
}

async function resolveCanonicalItem({ vendorId, itemId, itemSource }) {
  if (!mongoose.isValidObjectId(itemId)) {
    throw new GstBillPreviewError("Cart contains an invalid item identity", "invalid_item_identity");
  }

  const requestedSource = String(itemSource || "").trim();
  if (requestedSource && !ITEM_SOURCES.includes(requestedSource)) {
    throw new GstBillPreviewError("Cart contains an invalid item source", "invalid_item_source");
  }

  const sources = requestedSource ? [requestedSource] : ITEM_SOURCES;
  const matches = (
    await Promise.all(
      sources.map(async (source) => {
        const item = await itemQuery(source, vendorId, itemId).select("_id name price").lean();
        return item ? { source, item } : null;
      })
    )
  ).filter(Boolean);

  if (matches.length !== 1) {
    throw new GstBillPreviewError(
      matches.length === 0
        ? "A cart item could not be resolved for this vendor"
        : "A cart item identity is ambiguous",
      matches.length === 0 ? "item_not_found" : "ambiguous_item_identity",
      matches.length === 0 ? 404 : 409
    );
  }
  return matches[0];
}

function validateDraftSettings(vendor) {
  const settings = sanitizeGstSettings(vendor);
  if (!settings.updatedAt) {
    throw new GstBillPreviewError("GST settings have not been configured", "gst_settings_not_configured");
  }
  if (!settings.gstin) {
    throw new GstBillPreviewError("GSTIN is required for GST preview", "gstin_required");
  }
  if (!GSTIN_PATTERN.test(settings.gstin)) {
    throw new GstBillPreviewError("GSTIN is invalid", "invalid_gstin");
  }
  if (!STATE_CODES.has(settings.registeredStateCode)) {
    throw new GstBillPreviewError(
      "A valid registered state is required for GST preview",
      "registered_state_required"
    );
  }
  if (!Number.isInteger(settings.defaultGstRateBps)) {
    throw new GstBillPreviewError("Default GST rate is invalid", "invalid_default_gst_rate");
  }
  if (settings.gstin.slice(0, 2) !== settings.registeredStateCode) {
    throw new GstBillPreviewError(
      "GSTIN does not match the registered state",
      "gstin_state_code_mismatch"
    );
  }
  return settings;
}

async function resolveInput({ vendorId, input }) {
  const billingSessionId = String(input.billingSessionId || "").trim();
  if (billingSessionId) {
    if (!mongoose.isValidObjectId(billingSessionId)) {
      throw new GstBillPreviewError("Billing session identity is invalid", "invalid_billing_session");
    }
    const billing = await BillingSession.findOne({ _id: billingSessionId, vendorId }).lean();
    if (!billing) {
      throw new GstBillPreviewError("Billing session was not found for this vendor", "billing_session_not_found", 404);
    }
    if (billing.status !== "ACTIVE") {
      throw new GstBillPreviewError("Billing session is no longer active", "stale_billing_session", 409);
    }
    let customerMobile = "";
    if (billing.customerId) {
      const customer = await Customer.findById(billing.customerId).select("fullNumber").lean();
      customerMobile = customer?.fullNumber || "";
    }
    return {
      items: billing.cartItems || [],
      customerMobile,
      manualDiscount: {
        mode: billing.manualDiscountMode,
        amount: billing.discountAmount,
        percent: billing.manualDiscountPercent,
      },
      redemption: { amount: billing.pointsRedeemed || 0 },
    };
  }

  const items = input.items || input.cartItems;
  if (!Array.isArray(items) || items.length === 0) {
    throw new GstBillPreviewError("At least one cart item is required", "empty_cart");
  }
  return {
    items,
    customerMobile: input.customerMobile || input.mobile || "",
    manualDiscount: input.manualDiscount || {},
    redemption: input.redemption || {},
  };
}

async function resolveTaxedItems({ vendorId, items, settings }) {
  return Promise.all(
    items.map(async (input, index) => {
      const qty = normalizeBillingQuantity(input.qty);
      if (qty === null) {
        throw new GstBillPreviewError(`Item ${index + 1} has an invalid quantity`, "invalid_item_quantity");
      }
      const itemId = String(input.itemId || input.id || "").trim();
      const { source, item } = await resolveCanonicalItem({
        vendorId,
        itemId,
        itemSource: input.itemSource,
      });
      const override = await VendorServiceTaxOverride.findOne({
        vendorId,
        serviceSource: source,
        serviceId: itemId,
      }).lean();
      const itemType = override?.itemType === "PRODUCT" ? "PRODUCT" : "SERVICE";
      const gstRateBps = override ? override.gstRateBps : settings.defaultGstRateBps;
      const classificationCode = itemType === "PRODUCT"
        ? override?.hsn || ""
        : override?.sac || settings.defaultSac || "";
      if (!Number.isInteger(gstRateBps) || gstRateBps < 0 || gstRateBps > 10000) {
        throw new GstBillPreviewError(`${item.name} has an invalid GST rate`, "invalid_item_gst_rate");
      }
      const classificationPattern = itemType === "PRODUCT"
        ? /^\d{4}(?:\d{2}){0,2}$/
        : /^\d{4,8}$/;
      if (classificationCode && !classificationPattern.test(classificationCode)) {
        throw new GstBillPreviewError(
          `${item.name} has an invalid ${itemType === "PRODUCT" ? "HSN" : "SAC"}`,
          itemType === "PRODUCT" ? "invalid_hsn" : "invalid_sac"
        );
      }
      const pricePaise = toPaise(item.price, `Item ${index + 1} price`);
      const grossPaise = Math.round(pricePaise * qty);
      if (!Number.isSafeInteger(grossPaise)) {
        throw new GstBillPreviewError("Item total exceeds the supported range", "money_out_of_range");
      }
      return {
        itemId,
        itemSource: source,
        name: item.name,
        qty,
        pricePaise,
        grossPaise,
        itemType,
        gstRateBps,
        classificationCode,
      };
    })
  );
}

async function calculateDiscounts({ vendorId, items, customerMobile, manualDiscount, redemption }) {
  let membership = null;
  const mobile = String(customerMobile || "").trim();
  if (mobile) {
    const normalized = membershipPreview.normalizeMobileInput(mobile);
    if (!normalized) {
      throw new GstBillPreviewError("Customer mobile number is invalid", "invalid_customer_mobile");
    }
    membership = (await membershipPreview.findEffectiveMembership({ vendorId, fullNumber: normalized })).membership;
  }

  const benefits = membership
    ? membershipPreview.resolveEffectiveBenefitFlags(membership)
    : {
        allowAdditionalDiscountOnMembershipItems: false,
        allowRewardsOnMembershipItems: false,
      };
  const membershipInput = membership
    ? {
        discountPercentage: membership.planSnapshot?.discountPercentage,
        minimumBillAmount: membership.planSnapshot?.minimumBillAmount,
        eligibleMenuItemIds: membershipPreview.resolveEffectiveEligibleMenuItemIds(membership),
        ...benefits,
      }
    : {
        discountPercentage: 0,
        minimumBillAmount: 0,
        eligibleMenuItemIds: [],
      };
  return calculateMembershipBillingPreview({
    items: items.map((item) => ({
      itemId: item.itemId,
      name: item.name,
      qty: item.qty,
      price: item.pricePaise / 100,
      total: item.grossPaise / 100,
    })),
    membership: membershipInput,
    manualDiscount,
    redemption,
  });
}

async function buildGstBillPreview({ vendorId, input }) {
  if (!mongoose.isValidObjectId(vendorId)) {
    throw new GstBillPreviewError("Valid vendorId required", "invalid_vendor_id");
  }
  const vendor = await DummyVendor.findById(vendorId).select("gstSettings").lean();
  if (!vendor) throw new GstBillPreviewError("Vendor not found", "vendor_not_found", 404);
  const settings = validateDraftSettings(vendor);
  const placeOfSupplyStateCode = resolveSupportedPlaceOfSupply(settings, input);
  const resolvedInput = await resolveInput({ vendorId, input });
  const items = await resolveTaxedItems({ vendorId, items: resolvedInput.items, settings });
  const discount = await calculateDiscounts({
    vendorId,
    items,
    customerMobile: resolvedInput.customerMobile,
    manualDiscount: resolvedInput.manualDiscount,
    redemption: resolvedInput.redemption,
  });

  const gstLines = items.map((item, index) => {
    const breakdown = discount.items[index];
    const membershipDiscountPaise = toPaise(
      breakdown?.membershipDiscountAmount || 0,
      "Membership discount"
    );
    const manualDiscountPaise = toPaise(
      breakdown?.manualDiscountAmount || 0,
      "Manual discount"
    );
    return {
      id: item.itemId,
      itemType: item.itemType,
      sac: item.itemType === "SERVICE" ? item.classificationCode : "",
      hsn: item.itemType === "PRODUCT" ? item.classificationCode : "",
      amountPaise: item.grossPaise,
      discountPaise: membershipDiscountPaise + manualDiscountPaise,
      gstRateBps: item.gstRateBps,
      metadata: { membershipDiscountPaise, manualDiscountPaise },
    };
  });

  let tax;
  try {
    tax = calculateGst({
      lines: gstLines,
      pricingMode: settings.pricingMode,
      supplierStateCode: settings.registeredStateCode,
      placeOfSupplyStateCode,
      totalDiscountPaise: gstLines.reduce((sum, line) => sum + line.discountPaise, 0),
    });
  } catch (error) {
    if (error instanceof GstCalculationError) {
      throw new GstBillPreviewError(error.message, error.code);
    }
    throw error;
  }

  const loyaltyRedemptionPaise = Math.min(
    toPaise(discount.redeemedAmount || 0, "Loyalty redemption"),
    tax.totals.invoiceAmountPaise
  );
  const missingClassifications = items
    .filter((item) => !item.classificationCode)
    .map((item) => ({
      itemId: item.itemId,
      itemType: item.itemType,
      classificationType: item.itemType === "PRODUCT" ? "HSN" : "SAC",
    }));
  const warnings = missingClassifications.length > 0
    ? [{
        code: "classification_missing",
        message: "Tax classification needs to be completed before GST invoicing is activated.",
        items: missingClassifications,
      }]
    : [];
  return {
    simulationOnly: true,
    gstEnabledForLiveBilling: settings.enabled === true,
    pricingMode: tax.pricingMode,
    supplyType: tax.supplyType,
    supplierStateCode: tax.supplierStateCode,
    placeOfSupplyStateCode: tax.placeOfSupplyStateCode,
    warnings,
    lines: tax.lines.map((line, index) => ({
      itemId: line.id,
      itemSource: items[index].itemSource,
      name: items[index].name,
      quantity: items[index].qty,
      itemType: line.itemType,
      classificationCode: line.classificationCode,
      gstRateBps: line.gstRateBps,
      unitPricePaise: items[index].pricePaise,
      priceBeforeDiscountPaise: line.amountPaise,
      membershipDiscountPaise: gstLines[index].metadata.membershipDiscountPaise,
      manualDiscountPaise: gstLines[index].metadata.manualDiscountPaise,
      allocatedDiscountPaise: line.discountPaise,
      taxableValuePaise: line.taxableValuePaise,
      cgstPaise: line.cgstPaise,
      sgstPaise: line.sgstPaise,
      utgstPaise: line.utgstPaise,
      igstPaise: line.igstPaise,
      totalGstPaise: line.totalTaxPaise,
      invoiceTotalPaise: line.invoiceAmountPaise,
    })),
    totals: {
      ...tax.totals,
      membershipDiscountPaise: toPaise(discount.membershipDiscountAmount || 0, "Membership discount"),
      manualDiscountPaise: toPaise(discount.additionalManualDiscountAmount || 0, "Manual discount"),
      loyaltyRedemptionPaise,
      estimatedCustomerPayablePaise: tax.totals.invoiceAmountPaise - loyaltyRedemptionPaise,
    },
    limitations: [
      "Simulation only. Live billing totals are unchanged.",
      "This preview supports local supplies using the vendor's registered GST state.",
      "Inter-state supplies require a future verified place-of-supply workflow.",
      "Loyalty redemption is treated provisionally as settlement credit, not an invoice discount.",
    ],
  };
}

async function listGstTestInvoiceItems(vendorId) {
  if (!mongoose.isValidObjectId(vendorId)) {
    throw new GstBillPreviewError("Valid vendorId required", "invalid_vendor_id");
  }
  const vendor = await DummyVendor.findById(vendorId).select("gstSettings").lean();
  if (!vendor) throw new GstBillPreviewError("Vendor not found", "vendor_not_found", 404);
  if (!isGstDraftConfigured(vendor)) {
    throw new GstBillPreviewError(
      "Complete and save valid GST settings before previewing an invoice",
      "gst_settings_not_configured"
    );
  }

  const [priceNodes, menuNodes, customPackages, overrides] = await Promise.all([
    VendorPriceNode.find({
      vendorId,
      isLeaf: true,
      price: { $ne: null },
      pricingStatus: "Active",
    }).select("_id name price").sort({ name: 1 }).lean(),
    VendorMenuNode.find({
      vendorId,
      isLeaf: true,
      price: { $ne: null },
      pricingStatus: "Active",
      datasetStatus: "active",
    }).select("_id name price").sort({ name: 1 }).lean(),
    VendorCustomPackage.find({
      vendorId,
      isLeaf: true,
      price: { $ne: null },
      pricingStatus: "Active",
      isDeleted: false,
    }).select("_id name price").sort({ name: 1 }).lean(),
    VendorServiceTaxOverride.find({ vendorId })
      .select("serviceSource serviceId itemType gstRateBps sac hsn")
      .lean(),
  ]);
  const settings = sanitizeGstSettings(vendor);
  const overrideByItem = new Map(
    overrides.map((override) => [
      `${override.serviceSource}:${String(override.serviceId)}`,
      override,
    ])
  );
  const append = (items, itemSource) => items.map((item) => {
    const override = overrideByItem.get(`${itemSource}:${String(item._id)}`);
    const itemType = override?.itemType === "PRODUCT" ? "PRODUCT" : "SERVICE";
    return {
      itemId: String(item._id),
      itemSource,
      name: item.name,
      pricePaise: toPaise(item.price, "Catalog item price"),
      itemType,
      gstRateBps: override?.gstRateBps ?? settings.defaultGstRateBps,
      classificationCode: itemType === "PRODUCT"
        ? override?.hsn || ""
        : override?.sac || settings.defaultSac || "",
    };
  });

  return [
    ...append(priceNodes, "vendor_price_node"),
    ...append(menuNodes, "vendor_menu_node"),
    ...append(customPackages, "vendor_custom_package"),
  ].sort((left, right) => left.name.localeCompare(right.name, "en", { sensitivity: "base" }));
}

function mapPreviewToSampleInvoice(preview, settings) {
  const issueDate = new Date();
  return {
    isSample: true,
    schemaVersion: 1,
    invoiceNumber: "SAMPLE-00001",
    financialYear: "SAMPLE",
    invoiceIssueDate: issueDate.toISOString(),
    supplier: {
      gstin: settings.gstin,
      legalName: settings.legalBusinessName,
      registeredAddress: settings.registeredAddress,
      registeredStateCode: settings.registeredStateCode,
    },
    placeOfSupply: {
      stateCode: preview.placeOfSupplyStateCode,
      supplyType: preview.supplyType,
    },
    pricingMode: preview.pricingMode,
    items: preview.lines.map((line) => ({
      name: line.name,
      quantity: line.quantity,
      itemType: line.itemType,
      classificationType: line.itemType === "PRODUCT" ? "HSN" : "SAC",
      classificationCode: line.classificationCode,
      gstRateBps: line.gstRateBps,
      grossAmountPaise: line.priceBeforeDiscountPaise,
      membershipDiscountPaise: line.membershipDiscountPaise,
      manualDiscountPaise: line.manualDiscountPaise,
      totalDiscountPaise: line.allocatedDiscountPaise,
      taxableValuePaise: line.taxableValuePaise,
      cgstPaise: line.cgstPaise,
      sgstPaise: line.sgstPaise,
      utgstPaise: line.utgstPaise,
      igstPaise: line.igstPaise,
      totalGstPaise: line.totalGstPaise,
      invoiceTotalPaise: line.invoiceTotalPaise,
    })),
    totals: {
      grossAmountPaise: preview.totals.grossAmountPaise,
      membershipDiscountPaise: preview.totals.membershipDiscountPaise,
      manualDiscountPaise: preview.totals.manualDiscountPaise,
      totalDiscountPaise: preview.totals.discountPaise,
      taxableValuePaise: preview.totals.taxableValuePaise,
      cgstPaise: preview.totals.cgstPaise,
      sgstPaise: preview.totals.sgstPaise,
      utgstPaise: preview.totals.utgstPaise,
      igstPaise: preview.totals.igstPaise,
      totalGstPaise: preview.totals.totalTaxPaise,
      invoiceTotalPaise: preview.totals.invoiceAmountPaise,
      loyaltyRedemptionPaise: preview.totals.loyaltyRedemptionPaise,
      customerPayablePaise: preview.totals.estimatedCustomerPayablePaise,
    },
  };
}

async function buildGstTestInvoice({ vendorId, input }) {
  if (!mongoose.isValidObjectId(vendorId)) {
    throw new GstBillPreviewError("Valid vendorId required", "invalid_vendor_id");
  }
  const vendor = await DummyVendor.findById(vendorId).select("gstSettings").lean();
  if (!vendor) throw new GstBillPreviewError("Vendor not found", "vendor_not_found", 404);
  if (!isGstDraftConfigured(vendor)) {
    throw new GstBillPreviewError(
      "Complete and save valid GST settings before previewing an invoice",
      "gst_settings_not_configured"
    );
  }
  const settings = validateDraftSettings(vendor);
  const preview = await buildGstBillPreview({
    vendorId,
    input: {
      items: input?.items,
      manualDiscount: {},
      redemption: {},
    },
  });
  return {
    simulationOnly: true,
    invoice: mapPreviewToSampleInvoice(preview, settings),
    warnings: preview.warnings,
  };
}

module.exports = {
  GstBillPreviewError,
  buildGstBillPreview,
  buildGstTestInvoice,
  listGstTestInvoiceItems,
  _private: {
    mapPreviewToSampleInvoice,
    resolveSupportedPlaceOfSupply,
    resolveCanonicalItem,
    toPaise,
    validateDraftSettings,
  },
};
