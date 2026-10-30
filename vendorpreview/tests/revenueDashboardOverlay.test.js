/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const explore = fs.readFileSync(path.join(root, "app/_Explore/Explore.jsx"), "utf8");
const css = fs.readFileSync(path.join(root, "app/_Explore/ExploreInline.css"), "utf8");

test("Revenue dashboard uses an isolated opaque full-screen overlay", () => {
  assert.match(
    explore,
    /viewMode === "revenue-dashboard"[\s\S]*?className="new-dashboard-overlay revenue-dashboard-overlay"/
  );
  assert.match(css, /\.revenue-dashboard-overlay\s*\{[\s\S]*?background:\s*#080808/);
  assert.match(css, /\.revenue-dashboard-overlay\s*\{[\s\S]*?isolation:\s*isolate/);
  assert.match(css, /\.revenue-dashboard-overlay\s*\{[\s\S]*?z-index:\s*10010/);
});

test("Revenue dashboard contains mobile scrolling without horizontal overflow", () => {
  assert.match(css, /\.revenue-dashboard-overlay\s*\{[\s\S]*?overflow-x:\s*hidden/);
  assert.match(css, /\.revenue-dashboard-overlay\s*\{[\s\S]*?overscroll-behavior:\s*contain/);
  assert.match(css, /-webkit-overflow-scrolling:\s*touch/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*?\.revenue-dashboard-overlay/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
});

test("Today, Month and Year Revenue views remain mounted inside the overlay", () => {
  for (const component of ["TodayRevenue", "MonthRevenue", "YearRevenue"]) {
    assert.match(explore, new RegExp(`<${component}`));
  }
  assert.match(explore, /<div className="revenue-data-container">/);
});

test("mobile Revenue navigation uses a compact two-column grid", () => {
  assert.match(explore, /className="new-dashboard-grid revenue-dashboard-grid"/);
  const baseGridPosition = css.indexOf(".new-dashboard-grid {");
  const mobileGridPosition = css.indexOf(".new-dashboard-grid.revenue-dashboard-grid {");

  assert.ok(baseGridPosition >= 0);
  assert.ok(mobileGridPosition > baseGridPosition);
  assert.match(
    css,
    /@media \(max-width: 768px\)[\s\S]*?\.new-dashboard-grid\.revenue-dashboard-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/
  );
  assert.match(css, /\.new-dashboard-card\.revenue-dashboard-card\s*\{[\s\S]*?min-height:\s*100px/);
  assert.match(css, /\.new-dashboard-card\.revenue-dashboard-card\s*\{[\s\S]*?min-width:\s*0/);
  assert.match(
    css,
    /\.new-dashboard-card-title\.revenue-dashboard-card-title\s*\{[\s\S]*?overflow-wrap:\s*anywhere/
  );
});

test("mobile Revenue cards use concise copy and preserve existing tab navigation", () => {
  for (const [key, title, description] of [
    ["today", "Today", "Daily sales"],
    ["month", "This Month", "Monthly sales"],
    ["year", "Last 12 Months", "Revenue trends"],
    ["customer", "Customers", "Billing history"],
  ]) {
    assert.match(
      explore,
      new RegExp(
        `mobileTitle: "${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[\\s\\S]*?mobileDescription: "${description}"[\\s\\S]*?key: "${key}"`
      )
    );
  }

  assert.match(explore, /setActiveRevenueTab\(card\.key\)/);
  assert.match(explore, /activeRevenueTab === "customer"[\s\S]*?<CustomerSearch/);
});
