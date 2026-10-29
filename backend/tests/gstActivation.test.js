const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const mongoose = require("mongoose");

const BillingSession = require("../models/BillingSession");
const Transaction = require("../models/Transaction");
const DummyVendor = require("../models/DummyVendor");
const gstSettingsController = require("../controllers/vendorGstSettingsController");
const { buildGstInvoiceSnapshot } = require("../services/gstInvoiceService");
const {
  getGstActivationState,
  resolveGstInvoiceMode,
} = require("../services/gstActivationService");
const { buildGstInvoicePresentation } = require("../services/gstInvoicePresentationService");

const VENDOR_ID = "692403a24d4d3a1b6a7f0ae5";

function validVendor(enabled = false) {
  return {
    gstSettings: {
      enabled,
      updatedAt: new Date(),
      gstin: "36ABCDE1234F1Z5",
      legalBusinessName: "Example Salon Private Limited",
      registeredAddress: "1 Main Road, Hyderabad",
      registeredStateCode: "36",
      defaultGstRateBps: 1800,
      defaultSac: "999723",
      pricingMode: "inclusive",
    },
  };
}

function mockRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

test("any complete vendor configuration can expose its persisted activation state", () => {
  assert.deepEqual(getGstActivationState({ vendor: validVendor(true) }), {
    enabled: true,
    configurationComplete: true,
  });
  assert.equal(getGstActivationState({ vendor: validVendor(false) }).enabled, false);
});

test("new billing sessions lock GST mode from activation and runtime", () => {
  assert.equal(resolveGstInvoiceMode(validVendor(false), { YNOT_RUNTIME_ENVIRONMENT: "test" }), "NONE");
  assert.equal(resolveGstInvoiceMode(validVendor(true), { YNOT_RUNTIME_ENVIRONMENT: "test" }), "TEST");
  assert.equal(resolveGstInvoiceMode(validVendor(true), { YNOT_RUNTIME_ENVIRONMENT: "production" }), "LIVE");
  assert.equal(resolveGstInvoiceMode(validVendor(true), { YNOT_RUNTIME_ENVIRONMENT: "preprod" }), "TEST");
  assert.equal(resolveGstInvoiceMode(validVendor(true), {}), "TEST");
});

test("authenticated settings controller enables and disables complete vendors without allowlists", async () => {
  const originalFind = DummyVendor.findById;
  const originalUpdate = DummyVendor.findByIdAndUpdate;
  let storedEnabled = false;
  let updateSeen;
  DummyVendor.findById = () => ({ select: () => ({ lean: async () => validVendor(storedEnabled) }) });
  DummyVendor.findByIdAndUpdate = (_id, update) => {
    updateSeen = update;
    storedEnabled = update.$set["gstSettings.enabled"];
    return { select: () => ({ lean: async () => validVendor(storedEnabled) }) };
  };
  try {
    const enableRes = mockRes();
    await gstSettingsController.updateGstSettings({
      params: { vendorId: "ignored" },
      vendorWriteAuth: { vendorId: VENDOR_ID },
      body: { enabled: true },
    }, enableRes);
    assert.equal(enableRes.statusCode, 200);
    assert.equal(updateSeen.$set["gstSettings.enabled"], true);
    assert.equal(enableRes.payload.data.activation.enabled, true);

    const disableRes = mockRes();
    await gstSettingsController.updateGstSettings({
      params: { vendorId: "ignored" },
      vendorWriteAuth: { vendorId: VENDOR_ID },
      body: { enabled: false },
    }, disableRes);
    assert.equal(disableRes.statusCode, 200);
    assert.equal(updateSeen.$set["gstSettings.enabled"], false);
  } finally {
    DummyVendor.findById = originalFind;
    DummyVendor.findByIdAndUpdate = originalUpdate;
  }
});

test("TEST and LIVE snapshots share calculation while only TEST is watermarked", () => {
  const createSnapshot = (documentMode) => buildGstInvoiceSnapshot({
    settings: validVendor(true).gstSettings,
    lines: [{
      itemId: new mongoose.Types.ObjectId(),
      itemSource: "vendor_menu_node",
      name: "Hair Spa",
      quantity: 1,
      itemType: "SERVICE",
      sac: "999723",
      hsn: "",
      gstRateBps: 1800,
      unitPricePaise: 11800,
      grossAmountPaise: 11800,
      membershipDiscountPaise: 0,
      manualDiscountPaise: 0,
    }],
    totalDiscountPaise: 0,
    loyaltyRedemptionPaise: 0,
    placeOfSupplyStateCode: "36",
    issueDate: new Date("2026-10-29T10:00:00Z"),
    allocation: { invoiceNumber: "GST/26-27/00001", financialYear: "26-27" },
    documentMode,
  });
  const testInvoice = buildGstInvoicePresentation(createSnapshot("TEST"));
  const liveInvoice = buildGstInvoicePresentation(createSnapshot("TAX_INVOICE"));
  assert.equal(testInvoice.documentMode, "TEST");
  assert.equal(liveInvoice.documentMode, "TAX_INVOICE");
  assert.deepEqual(testInvoice.totals, liveInvoice.totals);
});

test("completion preserves customer, loyalty and WhatsApp paths for GST invoices", () => {
  const source = fs.readFileSync(path.join(__dirname, "../controllers/billingController.js"), "utf8");
  assert.match(source, /gstInvoiceMode,/);
  assert.match(source, /const isGstInvoice = \["TEST", "LIVE"\]\.includes/);
  assert.match(source, /documentMode: isGstTestInvoice \? "TEST" : "TAX_INVOICE"/);
  assert.match(source, /recordMode: isGstTestInvoice \? "GST_TEST" : "NORMAL"/);
  assert.match(source, /requireCurrentlyEnabled: false/);
  assert.match(source, /const whatsapp = await buildWhatsAppCompletionStatus\(closed\)/);
  assert.match(source, /setImmediate\(async \(\) =>/);
  assert.match(source, /if \(!isWalkIn && pointsEarned > 0\)/);
  assert.doesNotMatch(source, /GST TEST invoices must use a walk-in/);
});

test("completion service supports the session-locked activation decision", () => {
  const source = fs.readFileSync(path.join(__dirname, "../services/gstInvoiceService.js"), "utf8");
  assert.match(source, /requireCurrentlyEnabled = true/);
  assert.match(source, /validateInvoiceSettings\(vendor, \{ requireEnabled: requireCurrentlyEnabled \}\)/);
});

test("historical mode and report markers are immutable and backward-compatible", () => {
  assert.deepEqual(BillingSession.schema.path("gstInvoiceMode").enumValues, ["NONE", "TEST", "LIVE"]);
  assert.equal(BillingSession.schema.path("gstInvoiceMode").options.immutable, true);
  assert.deepEqual(Transaction.schema.path("recordMode").enumValues, ["NORMAL", "GST_TEST"]);
  assert.equal(Transaction.schema.path("recordMode").options.default, "NORMAL");
});
