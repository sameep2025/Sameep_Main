/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const dashboardRoot = path.join(root, "app/components/dashboard");

test("average service value uses existing revenue and service count", async () => {
  const metrics = await import(
    pathToFileURL(path.join(dashboardRoot, "staffPerformanceMath.mjs")).href
  );

  assert.equal(metrics.getAverageServiceValue(1500, 3), 500);
  assert.equal(metrics.getAverageServiceValue(1000, 0), null);
  assert.equal(metrics.getAverageServiceValue(1000, undefined), null);
});

test("Today, Month and Year use the shared metrics row without changing API data", () => {
  for (const file of ["TodayRevenue.jsx", "MonthRevenue.jsx", "YearRevenue.jsx"]) {
    const source = fs.readFileSync(path.join(dashboardRoot, file), "utf8");
    assert.match(source, /import StaffPerformanceMetrics/);
    assert.match(source, /<StaffPerformanceMetrics/);
    assert.match(source, /row=\{row\}/);
    assert.match(source, /key=\{row\._id \|\| row\.stylist \|\| index\}/);
  }
});

test("staff metrics expose all labels, zero fallback and responsive layout", () => {
  const source = fs.readFileSync(
    path.join(dashboardRoot, "StaffPerformanceMetrics.jsx"),
    "utf8"
  );
  const css = fs.readFileSync(
    path.join(dashboardRoot, "StaffPerformanceMetrics.css"),
    "utf8"
  );

  assert.match(source, />Revenue</);
  assert.match(source, />Services</);
  assert.match(source, />Avg\. Service Value</);
  assert.match(source, /averageServiceValue === null \? "—"/);
  assert.match(css, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
});
