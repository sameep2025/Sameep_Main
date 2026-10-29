/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const settingsSource = fs.readFileSync(
  path.join(root, "app/components/dashboard/GstSettings.jsx"),
  "utf8"
);
const profileSource = fs.readFileSync(
  path.join(root, "app/components/dashboard/ProfileDashboard.jsx"),
  "utf8"
);
const cssSource = fs.readFileSync(
  path.join(root, "app/components/dashboard/GstSettings.css"),
  "utf8"
);
const samplePreviewSource = fs.readFileSync(
  path.join(root, "app/components/dashboard/GstTestInvoicePreview.jsx"),
  "utf8"
);
const invoiceDetailsSource = fs.readFileSync(
  path.join(root, "app/components/billing/GstInvoiceDetails.jsx"),
  "utf8"
);
const receiptPrintSource = fs.readFileSync(
  path.join(root, "app/utils/receiptPrint.js"),
  "utf8"
);

function extractFunction(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const openingBrace = source.indexOf("{", start);
  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unable to extract ${functionName}`);
}

const helperNames = [
  "gstRateBpsToPercent",
  "gstPercentToBps",
  "getGstErrorFields",
  "getLocalTaxLabel",
  "calculateGstPriceIllustration",
  "validateGstForm",
];
const context = { module: { exports: {} } };
vm.runInNewContext(
  `const UTGST_STATE_CODES = new Set(["04", "25", "26", "31", "35", "38", "97"]);\n` +
    `${helperNames.map((name) => extractFunction(settingsSource, name)).join("\n")}\n` +
    `module.exports = { ${helperNames.join(", ")} };`,
  context
);
const {
  gstRateBpsToPercent,
  gstPercentToBps,
  getGstErrorFields,
  getLocalTaxLabel,
  calculateGstPriceIllustration,
  validateGstForm,
} = context.module.exports;

function validForm(overrides = {}) {
  return {
    gstin: "36ABCDE1234F1Z5",
    legalBusinessName: "Example Salon",
    registeredAddress: "Hyderabad, Telangana",
    registeredStateCode: "36",
    defaultGstRatePercent: "18",
    defaultSac: "999723",
    pricingMode: "inclusive",
    ...overrides,
  };
}

test("GST percentages convert to and from integer basis points", () => {
  assert.equal(gstRateBpsToPercent(1800), "18");
  assert.equal(gstRateBpsToPercent(1825), "18.25");
  assert.equal(gstPercentToBps("18"), 1800);
  assert.equal(gstPercentToBps("18.25"), 1825);
  assert.equal(gstPercentToBps("18.256"), null);
  assert.equal(gstPercentToBps("101"), null);
});

test("GST draft form validates identity, state, SAC, rate and pricing mode", () => {
  assert.deepEqual(Object.keys(validateGstForm(validForm())), []);
  const errors = validateGstForm(
    validForm({
      gstin: "29ABCDE1234F1Z5",
      defaultGstRatePercent: "18.999",
      defaultSac: "SAC",
      pricingMode: "mixed",
    })
  );
  assert.equal(typeof errors.gstin, "string");
  assert.equal(typeof errors.registeredStateCode, "string");
  assert.equal(typeof errors.defaultGstRatePercent, "string");
  assert.equal(typeof errors.defaultSac, "string");
  assert.equal(typeof errors.pricingMode, "string");
});

test("backend validation codes map to the relevant form fields", () => {
  assert.deepEqual(Array.from(getGstErrorFields("invalid_gstin")), ["gstin"]);
  assert.deepEqual(Array.from(getGstErrorFields("gstin_state_code_mismatch")), [
    "gstin",
    "registeredStateCode",
  ]);
  assert.deepEqual(Array.from(getGstErrorFields("invalid_default_gst_rate_bps")), [
    "defaultGstRatePercent",
  ]);
  assert.deepEqual(Array.from(getGstErrorFields("invalid_default_sac")), ["defaultSac"]);
  assert.deepEqual(Array.from(getGstErrorFields("unknown")), []);
});

test("tax illustration distinguishes UTGST jurisdictions from legislative UTs", () => {
  assert.equal(getLocalTaxLabel("04"), "UTGST");
  assert.equal(getLocalTaxLabel("38"), "UTGST");
  assert.equal(getLocalTaxLabel("07"), "SGST");
  assert.equal(getLocalTaxLabel("34"), "SGST");
  assert.equal(getLocalTaxLabel("01"), "SGST");
  assert.equal(getLocalTaxLabel(""), "SGST / UTGST");
});

test("₹1,000 pricing illustrations use integer paise for inclusive and exclusive GST", () => {
  assert.deepEqual(
    { ...calculateGstPriceIllustration(1800, "inclusive") },
    { listedPricePaise: 100000, gstPaise: 15254, customerPaysPaise: 100000 }
  );
  assert.deepEqual(
    { ...calculateGstPriceIllustration(1800, "exclusive") },
    { listedPricePaise: 100000, gstPaise: 18000, customerPaysPaise: 118000 }
  );
});

test("GST settings UI uses authenticated vendor GET and PATCH endpoints", () => {
  assert.match(settingsSource, /api\/vendor\/gst-settings\/\$\{encodeURIComponent\(vendorId\)\}/);
  assert.match(settingsSource, /method:\s*"PATCH"/);
  assert.match(settingsSource, /getVendorAuthHeaders\(vendorId\)/);
  assert.match(settingsSource, /handleActivationChange/);
  assert.match(settingsSource, /disabled=\{!draftConfigured \|\| activationSaving\}/);
  assert.doesNotMatch(settingsSource, /activation\.authorized/);
  assert.match(settingsSource, /future billing sessions only/);
});

test("Profile dashboard exposes GST settings with clear activation state", () => {
  assert.match(profileSource, /title:\s*"GST Settings"/);
  assert.match(profileSource, /setActivePanel\("gst-settings"\)/);
  assert.match(profileSource, /<GstSettings vendorId=\{vendorId\}/);
  assert.match(settingsSource, /GST Billing Enabled/);
  assert.match(settingsSource, /GST Billing Disabled/);
  assert.match(settingsSource, /GST Draft Saved Successfully/);
  assert.match(settingsSource, /Confirm the correct rate with your accountant/);
  assert.match(settingsSource, /Service Accounting Code/);
  assert.match(settingsSource, /Actual tax type is determined during billing/);
});

test("GST settings layout collapses to one column on mobile", () => {
  assert.match(cssSource, /@media \(max-width: 700px\)/);
  assert.match(cssSource, /\.gst-settings-grid\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(cssSource, /\.gst-settings-save\s*\{[\s\S]*?width:\s*100%/);
});

test("GST test invoice is visible only from backend-confirmed valid drafts", () => {
  assert.match(settingsSource, /setDraftConfigured\(data\?\.data\?\.draftConfigured === true\)/);
  assert.match(settingsSource, /\{draftConfigured \? \(/);
  assert.match(settingsSource, /Preview GST Invoice/);
  assert.doesNotMatch(settingsSource, /gstSettings\.enabled/);
});

test("sample preview uses authenticated catalog identities and never submits prices", () => {
  assert.match(samplePreviewSource, /test-invoice\/items/);
  assert.match(samplePreviewSource, /getVendorAuthHeaders\(vendorId\)/);
  assert.match(samplePreviewSource, /itemId: item\.itemId/);
  assert.match(samplePreviewSource, /itemSource: item\.itemSource/);
  assert.match(samplePreviewSource, /qty: item\.qty/);
  assert.doesNotMatch(samplePreviewSource, /pricePaise: item\.pricePaise/);
  assert.doesNotMatch(samplePreviewSource, /billingSession|Transaction|WhatsApp|loyalty/i);
});

test("screen and print layouts prominently identify the sample as non-tax", () => {
  assert.match(samplePreviewSource, /<GstInvoiceDetails invoice=\{preview\.invoice\} sample/);
  assert.match(invoiceDetailsSource, /TEST — NOT A TAX INVOICE/);
  assert.match(receiptPrintSource, /isSampleGstInvoice === true/);
  assert.match(receiptPrintSource, /TEST — NOT A TAX INVOICE/);
  assert.match(cssSource, /@media print/);
  assert.match(cssSource, /@media \(max-width: 700px\)/);
});
