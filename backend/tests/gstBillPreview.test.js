const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const DummyVendor = require("../models/DummyVendor");
const VendorMenuNode = require("../models/VendorMenuNode");
const VendorServiceTaxOverride = require("../models/VendorServiceTaxOverride");
const membershipController = require("../controllers/membershipBillingPreviewController");
const {
  GstBillPreviewError,
  buildGstBillPreview,
  _private,
} = require("../services/gstBillPreviewService");

const VENDOR_ID = "692403a24d4d3a1b6a7f0ae5";
const SERVICE_ID = "692403a24d4d3a1b6a7f0ae6";
const PRODUCT_ID = "692403a24d4d3a1b6a7f0ae7";

function chain(value) {
  return {
    select() { return this; },
    sort() { return this; },
    lean: async () => value,
  };
}

function installPreviewMocks({
  enabled = false,
  pricingMode = "inclusive",
  stateCode = "36",
  membership = null,
  productHsn = "3305",
  defaultSac = "999723",
} = {}) {
  const originals = {
    vendor: DummyVendor.findById,
    item: VendorMenuNode.findOne,
    override: VendorServiceTaxOverride.findOne,
    membership: membershipController._private.findEffectiveMembership,
  };
  DummyVendor.findById = () => chain({
    gstSettings: {
      enabled,
      updatedAt: new Date(),
      gstin: `${stateCode}ABCDE1234F1Z5`,
      legalBusinessName: "Example Salon Private Limited",
      registeredAddress: "1 Sample Road, Hyderabad",
      registeredStateCode: stateCode,
      defaultGstRateBps: 1800,
      defaultSac,
      pricingMode,
    },
  });
  VendorMenuNode.findOne = (filter) => chain(
    String(filter._id) === SERVICE_ID
      ? { _id: SERVICE_ID, name: "Hair Spa", price: 118 }
      : String(filter._id) === PRODUCT_ID
        ? { _id: PRODUCT_ID, name: "Retail Shampoo", price: 105 }
        : null
  );
  VendorServiceTaxOverride.findOne = (filter) => chain(
    String(filter.serviceId) === PRODUCT_ID
      ? {
          _id: "692403a24d4d3a1b6a7f0ae8",
          itemType: "PRODUCT",
          gstRateBps: 500,
          hsn: productHsn,
        }
      : null
  );
  membershipController._private.findEffectiveMembership = async () => ({
    customer: membership ? { _id: "692403a24d4d3a1b6a7f0ae9" } : null,
    membership,
  });
  return () => {
    DummyVendor.findById = originals.vendor;
    VendorMenuNode.findOne = originals.item;
    VendorServiceTaxOverride.findOne = originals.override;
    membershipController._private.findEffectiveMembership = originals.membership;
  };
}

function cartInput(overrides = {}) {
  return {
    items: [
      { itemId: SERVICE_ID, itemSource: "vendor_menu_node", qty: 1 },
      { itemId: PRODUCT_ID, itemSource: "vendor_menu_node", qty: 1 },
    ],
    manualDiscount: {},
    redemption: {},
    ...overrides,
  };
}

test("inclusive preview resolves service SAC, product HSN, and exact line totals", async () => {
  const restore = installPreviewMocks();
  try {
    const result = await buildGstBillPreview({ vendorId: VENDOR_ID, input: cartInput() });
    assert.equal(result.simulationOnly, true);
    assert.equal(result.gstEnabledForLiveBilling, false);
    assert.equal(result.supplyType, "intrastate");
    assert.deepEqual(
      result.lines.map((line) => [line.itemType, line.classificationCode, line.gstRateBps]),
      [["SERVICE", "999723", 1800], ["PRODUCT", "3305", 500]]
    );
    assert.equal(result.totals.invoiceAmountPaise, 22300);
    assert.equal(result.totals.taxableValuePaise, 20000);
    assert.equal(result.totals.totalTaxPaise, 2300);
    assert.equal(
      result.lines.reduce((sum, line) => sum + line.invoiceTotalPaise, 0),
      result.totals.invoiceAmountPaise
    );
  } finally {
    restore();
  }
});

test("preview accepts canonical quantity 1 in numeric and serialized form", async () => {
  const restore = installPreviewMocks();
  try {
    const result = await buildGstBillPreview({
      vendorId: VENDOR_ID,
      input: cartInput({
        items: [
          { itemId: SERVICE_ID, itemSource: "vendor_menu_node", qty: "1" },
          { itemId: PRODUCT_ID, itemSource: "vendor_menu_node", qty: 1 },
        ],
      }),
    });
    assert.deepEqual(result.lines.map((line) => line.quantity), [1, 1]);
  } finally {
    restore();
  }
});

test("preview reports the persisted GST activation preference", async () => {
  const restore = installPreviewMocks({ enabled: true });
  try {
    const result = await buildGstBillPreview({ vendorId: VENDOR_ID, input: cartInput() });
    assert.equal(result.gstEnabledForLiveBilling, true);
  } finally {
    restore();
  }
});

test("preview still rejects zero, negative and malformed quantities", async () => {
  const restore = installPreviewMocks();
  try {
    for (const qty of [0, -1, "invalid"]) {
      await assert.rejects(
        buildGstBillPreview({
          vendorId: VENDOR_ID,
          input: cartInput({
            items: [{ itemId: SERVICE_ID, itemSource: "vendor_menu_node", qty }],
          }),
        }),
        (error) => error.code === "invalid_item_quantity"
      );
    }
  } finally {
    restore();
  }
});

test("exclusive local preview applies redemption after invoice tax", async () => {
  const restore = installPreviewMocks({ pricingMode: "exclusive" });
  try {
    const result = await buildGstBillPreview({
      vendorId: VENDOR_ID,
      input: cartInput({
        redemption: { amount: 10 },
      }),
    });
    assert.equal(result.supplyType, "intrastate");
    assert.ok(result.totals.cgstPaise > 0);
    assert.ok(result.totals.sgstPaise > 0);
    assert.equal(result.totals.igstPaise, 0);
    assert.equal(result.totals.loyaltyRedemptionPaise, 1000);
    assert.equal(
      result.totals.estimatedCustomerPayablePaise,
      result.totals.invoiceAmountPaise - 1000
    );
    assert.equal(result.totals.taxableValuePaise, result.totals.grossAmountPaise);
  } finally {
    restore();
  }
});

test("membership and manual discounts are allocated before GST", async () => {
  const membership = {
    planSnapshot: {
      discountPercentage: 10,
      minimumBillAmount: 0,
      eligibleMenuItemIds: [SERVICE_ID],
      benefitSemanticsVersion: "MEMBERSHIP_ITEM_FLAGS_V1",
      allowAdditionalDiscountOnMembershipItems: true,
      allowRewardsOnMembershipItems: true,
    },
  };
  const restore = installPreviewMocks({ membership });
  try {
    const result = await buildGstBillPreview({
      vendorId: VENDOR_ID,
      input: cartInput({
        customerMobile: "9999999999",
        manualDiscount: { mode: "amount", amount: 10 },
      }),
    });
    assert.equal(result.totals.membershipDiscountPaise, 1180);
    assert.equal(result.totals.manualDiscountPaise, 1000);
    assert.equal(result.totals.discountPaise, 2180);
    assert.equal(
      result.lines.reduce((sum, line) => sum + line.allocatedDiscountPaise, 0),
      2180
    );
  } finally {
    restore();
  }
});

test("applicable Union Territory preview uses CGST and UTGST", async () => {
  const restore = installPreviewMocks({ stateCode: "04" });
  try {
    const result = await buildGstBillPreview({
      vendorId: VENDOR_ID,
      input: cartInput(),
    });
    assert.ok(result.totals.cgstPaise > 0);
    assert.equal(result.totals.sgstPaise, 0);
    assert.ok(result.totals.utgstPaise > 0);
    assert.equal(result.totals.igstPaise, 0);
  } finally {
    restore();
  }
});

test("preview resolves local jurisdiction from GST settings and rejects known interstate supply", async () => {
  assert.equal(
    _private.resolveSupportedPlaceOfSupply({ registeredStateCode: "36" }, {}),
    "36"
  );
  assert.throws(
    () => _private.resolveSupportedPlaceOfSupply(
      { registeredStateCode: "36" },
      { customerStateCode: "29" }
    ),
    (error) => error.code === "interstate_preview_not_supported" && error.status === 422
  );
  assert.throws(
    () => _private.validateDraftSettings({ gstSettings: { updatedAt: new Date() } }),
    (error) => error instanceof GstBillPreviewError && error.code === "gstin_required"
  );
});

test("legacy place-of-supply input cannot silently force an interstate preview", async () => {
  const restore = installPreviewMocks();
  try {
    await assert.rejects(
      buildGstBillPreview({
        vendorId: VENDOR_ID,
        input: cartInput({ placeOfSupplyStateCode: "29" }),
      }),
      (error) => error instanceof GstBillPreviewError
        && error.code === "interstate_preview_not_supported"
        && error.status === 422
    );
  } finally {
    restore();
  }
});

test("preview calculates product GST without HSN and returns a non-blocking warning", async () => {
  const restore = installPreviewMocks({ productHsn: "" });
  try {
    const result = await buildGstBillPreview({ vendorId: VENDOR_ID, input: cartInput() });
    const product = result.lines.find((line) => line.itemType === "PRODUCT");
    assert.equal(product.classificationCode, "");
    assert.equal(product.gstRateBps, 500);
    assert.ok(product.totalGstPaise > 0);
    assert.deepEqual(result.warnings, [{
      code: "classification_missing",
      message: "Tax classification needs to be completed before GST invoicing is activated.",
      items: [{
        itemId: PRODUCT_ID,
        itemType: "PRODUCT",
        classificationType: "HSN",
      }],
    }]);
  } finally {
    restore();
  }
});

test("preview calculates service GST without SAC without inventing a classification", async () => {
  const restore = installPreviewMocks({ defaultSac: "" });
  try {
    const result = await buildGstBillPreview({ vendorId: VENDOR_ID, input: cartInput() });
    const service = result.lines.find((line) => line.itemType === "SERVICE");
    assert.equal(service.classificationCode, "");
    assert.equal(service.gstRateBps, 1800);
    assert.ok(service.totalGstPaise > 0);
    assert.equal(result.warnings[0].code, "classification_missing");
    assert.deepEqual(result.warnings[0].items, [{
      itemId: SERVICE_ID,
      itemType: "SERVICE",
      classificationType: "SAC",
    }]);
  } finally {
    restore();
  }
});

test("sample invoice uses fictional numbering and authoritative mixed-rate preview values", async () => {
  const restore = installPreviewMocks();
  try {
    const result = await require("../services/gstBillPreviewService").buildGstTestInvoice({
      vendorId: VENDOR_ID,
      input: cartInput(),
    });
    assert.equal(result.simulationOnly, true);
    assert.equal(result.invoice.isSample, true);
    assert.equal(result.invoice.invoiceNumber, "SAMPLE-00001");
    assert.equal(result.invoice.supplier.gstin, "36ABCDE1234F1Z5");
    assert.deepEqual(result.invoice.items.map((item) => item.gstRateBps), [1800, 500]);
    assert.equal(result.invoice.items[0].classificationCode, "999723");
    assert.equal(result.invoice.items[1].classificationCode, "3305");
    assert.equal(result.invoice.totals.invoiceTotalPaise, 22300);
    assert.equal(result.invoice.totals.customerPayablePaise, 22300);
  } finally {
    restore();
  }
});

test("sample invoice preserves missing classification as a warning", async () => {
  const restore = installPreviewMocks({ defaultSac: "", productHsn: "" });
  try {
    const result = await require("../services/gstBillPreviewService").buildGstTestInvoice({
      vendorId: VENDOR_ID,
      input: cartInput(),
    });
    assert.equal(result.invoice.items[0].classificationCode, "");
    assert.equal(result.invoice.items[1].classificationCode, "");
    assert.equal(result.warnings[0].code, "classification_missing");
    assert.equal(result.warnings[0].items.length, 2);
  } finally {
    restore();
  }
});

test("preview route is vendor-authorized and implementation contains no billing writes", () => {
  const route = fs.readFileSync(path.join(__dirname, "../routes/vendorGstPreviewRoutes.js"), "utf8");
  const service = fs.readFileSync(path.join(__dirname, "../services/gstBillPreviewService.js"), "utf8");
  const billingRoutes = fs.readFileSync(path.join(__dirname, "../routes/billingRoutes.js"), "utf8");
  assert.match(route, /requireVendorAccessFromExistingAuth/);
  assert.match(route, /router\.post/);
  assert.match(route, /test-invoice\/items/);
  assert.match(route, /test-invoice/);
  assert.doesNotMatch(service, /\.save\(|create\(|findByIdAndUpdate|updateOne|insertMany|deleteOne/);
  assert.doesNotMatch(service, /GstInvoiceCounter|Transaction\.create|BillingSession\.create/);
  assert.match(billingRoutes, /router\.post\("\/create", billingController\.createBillingSession\)/);
  assert.match(billingRoutes, /router\.post\("\/update", billingController\.updateBillingCart\)/);
  assert.match(billingRoutes, /router\.post\("\/complete", billingController\.completeBillingSession\)/);
});
