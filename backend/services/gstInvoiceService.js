const mongoose = require("mongoose");
const Vendor = require("../models/DummyVendor");
const VendorPriceNode = require("../models/VendorPriceNode");
const VendorMenuNode = require("../models/VendorMenuNode");
const VendorCustomPackage = require("../models/VendorCustomPackage");
const VendorServiceTaxOverride = require("../models/VendorServiceTaxOverride");
const { calculateGst, GstCalculationError } = require("./gstCalculationService");
const {
  allocateGstInvoiceNumber,
  getIndianFinancialYear,
} = require("./gstInvoiceNumberService");
const { normalizeBillingQuantity } = require("../utils/billingItemQuantity");
const {
  GSTIN_PATTERN,
  STATE_CODES,
  isGstDraftConfigured,
  sanitizeGstSettings,
} = require("./vendorGstSettings");

const ITEM_SOURCES = VendorServiceTaxOverride.ITEM_SOURCES;
const SAC_PATTERN = /^\d{4,8}$/;
const HSN_PATTERN = /^\d{4}(?:\d{2}){0,2}$/;
const NON_TAX_INVOICE_NUMBER_PATTERN = /^NTI\/[a-f0-9]{12}$/;

class GstInvoiceError extends Error {
  constructor(message, code, status = 400) {
    super(message);
    this.name = "GstInvoiceError";
    this.code = code;
    this.status = status;
  }
}

function toPaise(value, field) {
  const number = Number(value);
  const paise = Math.round(number * 100);
  if (!Number.isFinite(number) || number < 0 || !Number.isSafeInteger(paise)) {
    throw new GstInvoiceError(`${field} is invalid`, "invalid_money");
  }
  return paise;
}

function validateInvoiceSettings(vendor, { requireEnabled = true } = {}) {
  const settings = sanitizeGstSettings(vendor);
  if (requireEnabled && vendor?.gstSettings?.enabled !== true) {
    throw new GstInvoiceError("GST invoicing is not activated", "gst_invoicing_not_enabled");
  }
  if (!isGstDraftConfigured(vendor)) {
    throw new GstInvoiceError("GST configuration is incomplete", "invalid_gst_configuration");
  }
  if (!GSTIN_PATTERN.test(settings.gstin) || !STATE_CODES.has(settings.registeredStateCode)) {
    throw new GstInvoiceError("GST supplier identity is invalid", "invalid_gst_configuration");
  }
  return settings;
}

function withSession(query, session) {
  if (session && typeof query.session === "function") query.session(session);
  return query;
}

function itemQuery(source, vendorId, itemId) {
  const common = { _id: itemId, vendorId, isLeaf: true, price: { $ne: null } };
  if (source === "vendor_price_node") return VendorPriceNode.findOne(common);
  if (source === "vendor_menu_node") {
    return VendorMenuNode.findOne({ ...common, datasetStatus: "active" });
  }
  return VendorCustomPackage.findOne({ ...common, isDeleted: false });
}

async function resolveCanonicalInvoiceItem({ vendorId, billingItem, session }) {
  const itemId = String(billingItem?.itemId || "");
  if (!mongoose.isValidObjectId(itemId)) {
    throw new GstInvoiceError("Bill contains an invalid item identity", "invalid_item_identity");
  }
  const matches = (
    await Promise.all(ITEM_SOURCES.map(async (source) => {
      const query = withSession(itemQuery(source, vendorId, itemId), session);
      const item = await query.select("_id name price").lean();
      return item ? { source, item } : null;
    }))
  ).filter(Boolean);
  if (matches.length !== 1) {
    throw new GstInvoiceError(
      matches.length ? "Bill item identity is ambiguous" : "Bill item was not found",
      matches.length ? "ambiguous_item_identity" : "item_not_found"
    );
  }
  const [{ source, item }] = matches;
  const canonicalPricePaise = toPaise(item.price, "Canonical item price");
  if (canonicalPricePaise !== toPaise(billingItem.price, "Billing item price")) {
    throw new GstInvoiceError(
      "Bill item price changed before completion",
      "canonical_price_mismatch",
      409
    );
  }
  const overrideQuery = withSession(VendorServiceTaxOverride.findOne({
    vendorId,
    serviceSource: source,
    serviceId: itemId,
  }), session);
  const override = await overrideQuery.lean();
  return { source, item, override, canonicalPricePaise };
}

async function resolveInvoiceLines({ vendorId, cartItems, settings, session }) {
  return Promise.all((cartItems || []).map(async (billingItem) => {
    const qty = normalizeBillingQuantity(billingItem.qty);
    if (qty === null) {
      throw new GstInvoiceError("Bill item quantity is invalid", "invalid_item_quantity");
    }
    const resolved = await resolveCanonicalInvoiceItem({ vendorId, billingItem, session });
    const itemType = resolved.override?.itemType === "PRODUCT" ? "PRODUCT" : "SERVICE";
    const gstRateBps = resolved.override
      ? resolved.override.gstRateBps
      : settings.defaultGstRateBps;
    const classificationCode = itemType === "PRODUCT"
      ? resolved.override?.hsn || ""
      : resolved.override?.sac || settings.defaultSac || "";
    const pattern = itemType === "PRODUCT" ? HSN_PATTERN : SAC_PATTERN;
    if (classificationCode && !pattern.test(classificationCode)) {
      throw new GstInvoiceError(
        `${itemType === "PRODUCT" ? "HSN" : "SAC"} is invalid`,
        itemType === "PRODUCT" ? "invalid_hsn" : "invalid_sac"
      );
    }
    if (!Number.isInteger(gstRateBps) || gstRateBps < 0 || gstRateBps > 10000) {
      throw new GstInvoiceError("GST rate is invalid", "invalid_gst_rate");
    }
    const membershipDiscountPaise = toPaise(
      billingItem.membershipDiscountAmount || 0,
      "Membership discount"
    );
    const manualDiscountPaise = toPaise(
      billingItem.manualDiscountAmount || 0,
      "Manual discount"
    );
    return {
      itemId: String(billingItem.itemId),
      itemSource: resolved.source,
      name: resolved.item.name,
      quantity: qty,
      itemType,
      sac: itemType === "SERVICE" ? classificationCode : "",
      hsn: itemType === "PRODUCT" ? classificationCode : "",
      gstRateBps,
      unitPricePaise: resolved.canonicalPricePaise,
      grossAmountPaise: Math.round(resolved.canonicalPricePaise * qty),
      membershipDiscountPaise,
      manualDiscountPaise,
    };
  }));
}

function getMissingClassifications(lines) {
  return lines
    .filter((line) => !String(line.itemType === "PRODUCT" ? line.hsn : line.sac).trim())
    .map((line) => ({
      code: "classification_missing",
      message: `Add a valid ${line.itemType === "PRODUCT" ? "HSN" : "SAC"} before issuing a GST tax invoice.`,
      itemName: String(line.name || "Item"),
      classificationType: line.itemType === "PRODUCT" ? "HSN" : "SAC",
    }));
}

function buildNonTaxDocumentAllocation({ billingId, issueDate }) {
  const normalizedId = String(billingId || "").toLowerCase();
  const suffix = normalizedId.slice(-12);
  const invoiceNumber = `NTI/${suffix}`;
  if (!/^[a-f0-9]{24}$/.test(normalizedId) || !NON_TAX_INVOICE_NUMBER_PATTERN.test(invoiceNumber)) {
    throw new GstInvoiceError("Billing identity is invalid", "invalid_billing_identity");
  }
  return {
    financialYear: getIndianFinancialYear(issueDate),
    sequence: null,
    invoiceNumber,
  };
}

async function allocateInvoiceDocument({
  documentMode,
  billingId,
  vendorId,
  issueDate,
  session,
  allocator = allocateGstInvoiceNumber,
}) {
  if (documentMode === "NON_TAX_INVOICE") {
    return buildNonTaxDocumentAllocation({ billingId, issueDate });
  }
  return allocator({ vendorId, issueDate, session });
}

async function persistInitialGstInvoiceSnapshot({
  BillingSessionModel,
  billingId,
  snapshot,
  session,
}) {
  if (!session) {
    throw new GstInvoiceError(
      "GST invoice snapshot requires a MongoDB transaction",
      "invoice_transaction_required"
    );
  }
  if (!BillingSessionModel?.collection || !mongoose.isValidObjectId(billingId) || !snapshot) {
    throw new GstInvoiceError("GST invoice snapshot is invalid", "invalid_gst_invoice_snapshot", 500);
  }

  const holder = new BillingSessionModel({ gstInvoiceSnapshot: snapshot });
  const snapshotDocument = holder.gstInvoiceSnapshot;
  const validationError = snapshotDocument?.validateSync?.();
  if (!snapshotDocument || validationError) {
    throw new GstInvoiceError("GST invoice snapshot is invalid", "invalid_gst_invoice_snapshot", 500);
  }
  const persistedSnapshot = snapshotDocument.toObject({ depopulate: true, versionKey: false });
  const result = await BillingSessionModel.collection.updateOne(
    {
      _id: new mongoose.Types.ObjectId(String(billingId)),
      status: "COMPLETED",
      gstInvoiceSnapshot: { $exists: false },
    },
    { $set: { gstInvoiceSnapshot: persistedSnapshot } },
    { session }
  );
  if (result.modifiedCount !== 1) {
    throw new GstInvoiceError(
      "GST invoice snapshot could not be persisted safely",
      "gst_invoice_snapshot_conflict",
      409
    );
  }
  return persistedSnapshot;
}

function buildGstInvoiceSnapshot({
  settings,
  lines,
  totalDiscountPaise,
  loyaltyRedemptionPaise,
  placeOfSupplyStateCode,
  issueDate,
  allocation,
  documentMode = "TAX_INVOICE",
  requireCurrentlyEnabled = true,
}) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new GstInvoiceError("GST invoice requires at least one item", "empty_invoice");
  }
  const complianceWarnings = getMissingClassifications(lines);
  lines.forEach((line) => {
    const classification = line.itemType === "PRODUCT" ? line.hsn : line.sac;
    const pattern = line.itemType === "PRODUCT" ? HSN_PATTERN : SAC_PATTERN;
    if (classification && !pattern.test(String(classification))) {
      throw new GstInvoiceError(
        `${line.itemType === "PRODUCT" ? "HSN" : "SAC"} is invalid`,
        line.itemType === "PRODUCT" ? "invalid_hsn" : "invalid_sac"
      );
    }
  });
  if (documentMode === "TAX_INVOICE" && complianceWarnings.length) {
    throw new GstInvoiceError(
      "Tax classification is required for a GST tax invoice",
      "classification_missing"
    );
  }
  const placeCode = String(placeOfSupplyStateCode || settings.registeredStateCode);
  if (placeCode !== settings.registeredStateCode) {
    throw new GstInvoiceError(
      "Inter-state GST invoicing is not supported",
      "interstate_gst_not_supported",
      422
    );
  }
  let tax;
  try {
    tax = calculateGst({
      lines: lines.map((line) => ({
        id: line.itemId,
        itemType: line.itemType,
        sac: line.sac,
        hsn: line.hsn,
        amountPaise: line.grossAmountPaise,
        discountPaise: line.membershipDiscountPaise + line.manualDiscountPaise,
        gstRateBps: line.gstRateBps,
      })),
      pricingMode: settings.pricingMode,
      supplierStateCode: settings.registeredStateCode,
      placeOfSupplyStateCode: placeCode,
      totalDiscountPaise,
    });
  } catch (error) {
    if (error instanceof GstCalculationError) {
      throw new GstInvoiceError(error.message, error.code);
    }
    throw error;
  }
  const redemption = Math.min(loyaltyRedemptionPaise, tax.totals.invoiceAmountPaise);
  return {
    schemaVersion: 1,
    documentMode,
    invoiceNumber: allocation.invoiceNumber,
    financialYear: allocation.financialYear,
    invoiceIssueDate: new Date(issueDate),
    supplier: {
      gstin: settings.gstin,
      legalName: settings.legalBusinessName,
      registeredAddress: settings.registeredAddress,
      registeredStateCode: settings.registeredStateCode,
    },
    placeOfSupply: { stateCode: placeCode, supplyType: "intrastate" },
    pricingMode: settings.pricingMode,
    complianceWarnings,
    items: tax.lines.map((line, index) => ({
      itemId: lines[index].itemId,
      itemSource: lines[index].itemSource,
      name: lines[index].name,
      quantity: lines[index].quantity,
      itemType: line.itemType,
      sac: line.sac,
      hsn: line.hsn,
      gstRateBps: line.gstRateBps,
      unitPricePaise: lines[index].unitPricePaise,
      grossAmountPaise: line.amountPaise,
      membershipDiscountPaise: lines[index].membershipDiscountPaise,
      manualDiscountPaise: lines[index].manualDiscountPaise,
      totalDiscountPaise: line.discountPaise,
      taxableValuePaise: line.taxableValuePaise,
      cgstPaise: line.cgstPaise,
      sgstPaise: line.sgstPaise,
      utgstPaise: line.utgstPaise,
      igstPaise: line.igstPaise,
      totalGstPaise: line.totalTaxPaise,
      invoiceTotalPaise: line.invoiceAmountPaise,
    })),
    totals: {
      grossAmountPaise: tax.totals.grossAmountPaise,
      membershipDiscountPaise: lines.reduce((sum, line) => sum + line.membershipDiscountPaise, 0),
      manualDiscountPaise: lines.reduce((sum, line) => sum + line.manualDiscountPaise, 0),
      totalDiscountPaise: tax.totals.discountPaise,
      taxableValuePaise: tax.totals.taxableValuePaise,
      cgstPaise: tax.totals.cgstPaise,
      sgstPaise: tax.totals.sgstPaise,
      utgstPaise: tax.totals.utgstPaise,
      igstPaise: tax.totals.igstPaise,
      totalGstPaise: tax.totals.totalTaxPaise,
      invoiceTotalPaise: tax.totals.invoiceAmountPaise,
      loyaltyRedemptionPaise: redemption,
      customerPayablePaise: tax.totals.invoiceAmountPaise - redemption,
    },
  };
}

async function prepareGstInvoiceForCompletion({
  billing,
  authoritativeFinancials,
  effectiveRedeemPoints,
  issueDate,
  session,
  documentMode = "TAX_INVOICE",
  requireCurrentlyEnabled = true,
}) {
  if (!session) {
    throw new GstInvoiceError("GST invoice requires a MongoDB transaction", "invoice_transaction_required");
  }
  const vendorQuery = withSession(Vendor.findById(billing.vendorId).select("gstSettings"), session);
  const vendor = await vendorQuery.lean();
  if (requireCurrentlyEnabled && !vendor?.gstSettings?.enabled) return null;
  const settings = validateInvoiceSettings(vendor, { requireEnabled: requireCurrentlyEnabled });
  const lines = await resolveInvoiceLines({
    vendorId: billing.vendorId,
    cartItems: authoritativeFinancials.cartItems,
    settings,
    session,
  });
  const missingClassifications = getMissingClassifications(lines);
  const effectiveDocumentMode = documentMode === "TAX_INVOICE" && missingClassifications.length
    ? "NON_TAX_INVOICE"
    : documentMode;
  const allocation = await allocateInvoiceDocument({
    documentMode: effectiveDocumentMode,
    billingId: billing._id,
    vendorId: billing.vendorId,
    issueDate,
    session,
  });
  return buildGstInvoiceSnapshot({
    settings,
    lines,
    totalDiscountPaise: toPaise(authoritativeFinancials.discountAmount || 0, "Total discount"),
    loyaltyRedemptionPaise: toPaise(effectiveRedeemPoints || 0, "Loyalty redemption"),
    placeOfSupplyStateCode: settings.registeredStateCode,
    issueDate,
    allocation,
    documentMode: effectiveDocumentMode,
  });
}

module.exports = {
  GstInvoiceError,
  buildGstInvoiceSnapshot,
  persistInitialGstInvoiceSnapshot,
  prepareGstInvoiceForCompletion,
  _private: {
    resolveCanonicalInvoiceItem,
    resolveInvoiceLines,
    buildNonTaxDocumentAllocation,
    allocateInvoiceDocument,
    getMissingClassifications,
    toPaise,
    validateInvoiceSettings,
  },
};
