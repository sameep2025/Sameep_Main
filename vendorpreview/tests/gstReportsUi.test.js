/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app/components/dashboard/GstReports.jsx"), "utf8");
const css = fs.readFileSync(path.join(root, "app/components/dashboard/GstReports.css"), "utf8");
const explore = fs.readFileSync(path.join(root, "app/_Explore/Explore.jsx"), "utf8");

test("GST Reports is available from the vendor dashboard", () => {
  assert.match(explore, /import GstReports/);
  assert.match(explore, /title:\s*"GST Reports"/);
  assert.match(explore, /viewMode === "gst-reports-dashboard"/);
  assert.match(explore, /<GstReports vendorId=\{vendorId\}/);
});

test("GST Reports uses authenticated APIs and full filtered export endpoints", () => {
  assert.match(source, /getVendorAuthHeaders\(vendorId\)/);
  assert.match(source, /api\/vendor\/gst-reports/);
  assert.match(source, /export\.xlsx/);
  assert.match(source, /export\.csv/);
  assert.match(source, /tax-rates/);
});

test("GST Reports exposes approved date, status and isolated document-mode filters", () => {
  assert.match(source, /Today/);
  assert.match(source, /This Month/);
  assert.match(source, /Custom Range/);
  assert.match(source, /All statuses/);
  assert.match(source, /TAX_INVOICE/);
  assert.match(source, /NON_TAX_INVOICE/);
  assert.match(source, /Amount at Bill Completion/);
  assert.match(source, /not reversed/);
});

test("GST report table includes each tax component and mobile overflow protection", () => {
  for (const label of ["CGST", "SGST", "UTGST", "IGST", "Total GST"]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(css, /overflow-x:\s*auto/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /@media \(max-width: 430px\)/);
});
