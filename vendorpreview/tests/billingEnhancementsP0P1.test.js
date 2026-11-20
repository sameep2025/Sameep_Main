/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("Card is shown distinctly across bill details and revenue reports", () => {
  const customerSearch = read("app/components/dashboard/CustomerSearch.jsx");
  const today = read("app/components/dashboard/TodayRevenue.jsx");
  const month = read("app/components/dashboard/MonthRevenue.jsx");
  const year = read("app/components/dashboard/YearRevenue.jsx");
  const period = read("app/components/dashboard/RevenuePeriodAnalytics.jsx");
  const snapshot = read("app/components/dashboard/RevenueSnapshot.jsx");

  assert.match(customerSearch, /paymentMode === "CARD"\) return "Card"/);
  assert.match(today, /paymentMode === "CARD"\) return "Card"/);
  for (const report of [today, month, year, period, snapshot]) {
    assert.match(report, /cardCollected/);
    assert.match(report, /<span>Card/);
  }
});

test("Quick Billing keeps Online as default and includes Card in split inputs", () => {
  const explore = read("app/_Explore/Explore.jsx");
  assert.match(explore, /useState\("ONLINE"\)/);
  assert.match(explore, /paymentMode: "CARD"/);
  assert.match(explore, /cardAmountPaise: paymentFinalPayablePaise/);
  assert.match(explore, /paymentMode: "SPLIT"/);
  assert.match(explore, /cardAmountPaise: card\.paise/);
  assert.match(explore, /positiveMethodCount < 2/);
  assert.match(explore, /\["ONLINE", "UPI"\]/);
  assert.doesNotMatch(explore, /Cash \/ Online \/ Card \/ Split/);
});

test("Prepaid Packages clear and hide loyalty redemption", () => {
  const explore = read("app/_Explore/Explore.jsx");
  assert.match(explore, /selectedPaymentMode !== "PREPAID_SESSIONS"/);
  assert.match(explore, /setRedeemPoints\(0\)/);
  assert.match(explore, /setShowOtpInput\(false\)/);
});
