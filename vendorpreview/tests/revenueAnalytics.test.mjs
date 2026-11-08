import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  calculateRevenueAverages,
  chooseInitialDay,
  getIstDayRange,
  getMonthKey,
  formatCompactInr,
  mergeBillPages,
  normalizeTrendPoint,
} from "../app/components/dashboard/revenueAnalytics.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("selected day ranges use exact inclusive-start exclusive-end IST boundaries", () => {
  assert.deepEqual(getIstDayRange("2026-11-01"), {
    from: "2026-10-31T18:30:00.000Z",
    to: "2026-11-01T18:30:00.000Z",
    endMode: "exclusive",
  });
  assert.deepEqual(getIstDayRange("2027-01-01"), {
    from: "2026-12-31T18:30:00.000Z",
    to: "2027-01-01T18:30:00.000Z",
    endMode: "exclusive",
  });
});

test("month keys follow Asia Kolkata rather than the browser timezone", () => {
  assert.equal(getMonthKey(new Date("2026-10-31T18:29:59.999Z")), "2026-10");
  assert.equal(getMonthKey(new Date("2026-10-31T18:30:00.000Z")), "2026-11");
});

test("zero-value days remain selectable and initial selection prefers latest active day", () => {
  const points = [
    normalizeTrendPoint({ date: "2026-11-01", netCollected: 0, completedBills: 0 }),
    normalizeTrendPoint({ date: "2026-11-02", netCollected: 500, completedBills: 2 }),
    normalizeTrendPoint({ date: "2026-11-03", netCollected: 0, completedBills: 0 }),
  ];
  assert.equal(points[0].netCollected, 0);
  assert.equal(chooseInitialDay(points), "2026-11-02");
  assert.equal(chooseInitialDay(points, "2026-11-01"), "2026-11-01");
});

test("cursor pages merge without duplicate bills", () => {
  assert.deepEqual(
    mergeBillPages(
      [{ billId: "a" }, { billId: "b" }],
      [{ billId: "b" }, { billId: "c" }]
    ).map((bill) => bill.billId),
    ["a", "b", "c"]
  );
});

test("average bill value uses gross value while average collection uses net collected", () => {
  const averages = calculateRevenueAverages({
    grossBillValue: 2200,
    netCollected: 1879,
    completedBills: 3,
  });
  assert.equal(averages.averageBillValue.toFixed(2), "733.33");
  assert.equal(averages.averageCollection.toFixed(2), "626.33");
  assert.deepEqual(calculateRevenueAverages({
    grossBillValue: 2200,
    netCollected: 1879,
    completedBills: 0,
  }), { averageBillValue: 0, averageCollection: 0 });
});

test("This Month and rolling monthly charts default to lines", () => {
  const chart = read("app/components/dashboard/RevenueTrendChart.jsx");
  const analytics = read("app/components/dashboard/RevenuePeriodAnalytics.jsx");
  const month = read("app/components/dashboard/MonthRevenue.jsx");
  const year = read("app/components/dashboard/YearRevenue.jsx");

  assert.match(chart, /defaultType = "bar"/);
  assert.match(analytics, /<RevenueTrendChart/);
  assert.match(analytics, /defaultType=\{defaultChartType\}/);
  assert.match(month, /defaultChartType="line"/);
  assert.match(year, /defaultType="line"/);
});

test("chart toggle keeps period selection in the parent and renders an SVG line without zero labels", () => {
  const chart = read("app/components/dashboard/RevenueTrendChart.jsx");
  assert.match(chart, /const \[chartType, setChartType\] = useState\(defaultType\)/);
  assert.match(chart, /<svg/);
  assert.match(chart, /<polyline/);
  assert.match(chart, /aria-pressed=\{chartType === type\}/);
  assert.match(chart, /onClick=\{\(\) => setChartType\(type\)\}/);
  assert.match(chart, /onClick=\{\(\) => onSelect\(key\)\}/);
  assert.doesNotMatch(chart, /value > 0 \? currencyFmt\.format\(value\) : "₹0"/);
  assert.match(chart, /Net Collected \{currencyFmt\.format\(selectedValue\)\}/);
});

test("line point labels use compact INR and omit zero activity", () => {
  assert.equal(formatCompactInr(1250), "₹1.3K");
  assert.equal(formatCompactInr(12500), "₹12.5K");
  assert.equal(formatCompactInr(89686), "₹89.7K");
  assert.equal(formatCompactInr(999), "₹999");
  assert.equal(formatCompactInr(0), "");

  const chart = read("app/components/dashboard/RevenueTrendChart.jsx");
  assert.match(chart, /value !== 0 \? \(/);
  assert.match(chart, /className="revenue-trend-line-value"/);
  assert.match(chart, /formatCompactInr\(value\)/);
  assert.match(chart, /y=\{y - 8\}/);
});

test("Month and Year panels use the shared authenticated analytics drilldown", () => {
  const month = read("app/components/dashboard/MonthRevenue.jsx");
  const year = read("app/components/dashboard/YearRevenue.jsx");
  const analytics = read("app/components/dashboard/RevenuePeriodAnalytics.jsx");

  assert.match(month, /RevenuePeriodAnalytics/);
  assert.match(year, /RevenuePeriodAnalytics/);
  assert.match(year, /RevenueTrendChart/);
  assert.match(analytics, /daily-trend/);
  assert.match(analytics, /bills-summary/);
  assert.match(analytics, /\/bills\?/);
  assert.match(analytics, /getVendorAuthHeaders\(vendorId\)/);
  assert.match(analytics, /cursor:\s*pagination\.nextCursor/);
  assert.match(analytics, /limit:\s*String\(PAGE_SIZE\)/);
  assert.match(analytics, /Gross Bill Value/);
  assert.match(analytics, /Net Collected/);
});

test("bill reprinting reuses authenticated vendor detail and receipt printing", () => {
  const analytics = read("app/components/dashboard/RevenuePeriodAnalytics.jsx");
  const customerSearch = read("app/components/dashboard/CustomerSearch.jsx");
  assert.match(analytics, /\/vendor-detail/);
  assert.match(analytics, /printReceiptSnapshot/);
  assert.match(analytics, /buildReceiptSnapshotFromBillDetail/);
  assert.match(customerSearch, /buildReceiptSnapshotFromBillDetail/);
});

test("analytics styles contain bounded mobile chart scrolling and compact metric grids", () => {
  const css = read("app/components/dashboard/RevenuePanels.css");
  assert.match(css, /\.revenue-trend-scroll[\s\S]*overflow-x:\s*auto/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.revenue-analytics-stat-grid/);
  assert.match(css, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
});
