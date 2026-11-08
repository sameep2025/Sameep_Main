/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const component = fs.readFileSync(
  path.join(root, "app/components/dashboard/PrepaidRevenueSummary.jsx"),
  "utf8"
);
const css = fs.readFileSync(
  path.join(root, "app/components/dashboard/PrepaidRevenueSummary.css"),
  "utf8"
);
const revenueFiles = ["TodayRevenue.jsx", "MonthRevenue.jsx", "YearRevenue.jsx"].map((file) =>
  fs.readFileSync(path.join(root, "app/components/dashboard", file), "utf8")
);

test("prepaid reporting uses clear service, collection, and wallet labels", () => {
  assert.match(component, /Service Sales/);
  assert.match(component, /Money Collected/);
  assert.match(component, /Membership Payments/);
  assert.match(component, /Wallet Used/);
  assert.match(component, /Sessions Used/);
  assert.match(component, /Cash/);
  assert.match(component, /Online/);
  assert.match(component, /UPI/);
  assert.match(component, /Card/);
  assert.match(component, /previously purchased credit, not new money collected/);
});

test("Today, Month, and Year dashboards use authenticated additive reporting", () => {
  for (const source of revenueFiles) {
    assert.match(source, /PrepaidRevenueSummary/);
    assert.match(source, /getVendorAuthHeaders\(vendorId\)/);
    assert.match(source, /prepaidReporting/);
  }
});

test("Today and Month dashboards use explicit IST reporting boundaries", () => {
  assert.match(revenueFiles[0], /getIstTodayRange/);
  assert.match(revenueFiles[1], /getIstMonthToDateRange/);
});

test("rolling reports sum server metrics without combining session counts into rupees", () => {
  assert.match(component, /addPrepaidReporting/);
  assert.match(component, /sessionsUsed/);
  assert.doesNotMatch(component, /sessionsUsed\s*\*/);
});

test("prepaid reporting remains compact and responsive", () => {
  assert.match(css, /grid-template-columns:\s*repeat\(3/);
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(css, /grid-template-columns:\s*repeat\(2/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
});
