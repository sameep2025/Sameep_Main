const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app/_Explore/Explore.jsx"), "utf8");
const css = fs.readFileSync(path.join(root, "app/_Explore/ExploreInline.css"), "utf8");

test("GST preview uses the authenticated read-only preview endpoint", () => {
  assert.match(source, /api\/vendor\/gst-preview\/\$\{vendorId\}/);
  assert.match(source, /Authorization: `Bearer \$\{vendorToken\}`/);
  assert.doesNotMatch(source, /placeOfSupplyStateCode: placeCode/);
  assert.match(source, /items: gstPreviewItems/);
});

test("preview visibility loads saved GST draft status and resets across vendors", () => {
  assert.match(source, /api\/vendor\/gst-settings\/\$\{encodeURIComponent\(vendorId\)\}/);
  assert.match(source, /setGstDraftStatus\("loading"\)/);
  assert.match(source, /setGstDraftVendorId\(""\)/);
  assert.match(source, /hasEnabledGstBilling\(payload\)/);
  assert.match(source, /\[vendorId, hasActiveVendorSession, viewMode\]/);
  assert.match(source, /isGstPreviewAvailable\(\{/);
  assert.match(source, /gstPreviewAvailable \? renderGstPreviewCard\(\) : null/);
  assert.match(source, /!gstPreviewAvailable/);
});

test("frontend displays only backend-provided paise values", () => {
  assert.match(source, /formatGstPreviewAmount\(totals\.taxableValuePaise\)/);
  assert.match(source, /formatGstPreviewAmount\(totals\.totalTaxPaise\)/);
  assert.match(source, /formatGstPreviewAmount\(totals\.estimatedCustomerPayablePaise\)/);
  assert.doesNotMatch(source, /gstRateBps\s*\*\s*.*price|price\s*\*\s*.*gstRateBps/);
});

test("summary percentages are optional while item-level percentages remain visible", () => {
  assert.match(source, /getGstSummaryPercentages\(gstPreview\?\.lines, totals\)/);
  assert.match(source, /summaryRates\?\.cgst/);
  assert.match(source, /summaryRates\?\.igst/);
  assert.match(source, /summaryRates\?\.total/);
  assert.match(source, /line\.gstRateBps \/ 100/);
});

test("enabled GST uses a current bill summary without obsolete simulation messaging", () => {
  assert.match(source, /GST Bill Summary/);
  assert.match(source, /Current bill tax summary based on the saved GST settings/);
  assert.doesNotMatch(source, /Simulation Only/);
  assert.doesNotMatch(source, /Place-of-supply state code/);
  assert.doesNotMatch(source, /This does not change the current bill or issue a GST invoice/);
  assert.match(source, /<span>Final payable<\/span>/);
});

test("missing SAC or HSN warning is non-blocking and clearly displayed", () => {
  assert.match(source, /warning\.code === "classification_missing"/);
  assert.match(
    source,
    /SAC\/HSN is not provided\. GST remains calculated/
  );
  assert.match(source, /Classification pending/);
  assert.match(css, /\.gst-bill-preview-warning/);
});

test("tax source hint is isolated from the existing billing completion snapshot", () => {
  assert.match(source, /itemSource:\s*item\.itemSource/);
  const billingSnapshot = source.slice(
    source.indexOf("const buildBillingCartItemsSnapshot"),
    source.indexOf("const buildMembershipPreviewItems")
  );
  assert.doesNotMatch(billingSnapshot, /itemSource/);
});

test("preview styling follows the existing responsive dark-and-gold cart", () => {
  assert.match(css, /\.gst-bill-preview-card/);
  assert.match(css, /#f5d97a/);
  assert.match(css, /background:\s*#111/);
});
