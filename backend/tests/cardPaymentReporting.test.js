const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const BillingSession = require("../models/BillingSession");
const Transaction = require("../models/Transaction");

const backendRoot = path.resolve(__dirname, "..");
const source = (relativePath) => fs.readFileSync(path.join(backendRoot, relativePath), "utf8");

test("billing and transaction schemas persist Card as a distinct payment method", () => {
  const vendorId = "507f1f77bcf86cd799439011";
  const billing = new BillingSession({
    vendorId,
    paymentMode: "CARD",
    paymentBreakdown: {
      cashAmountPaise: 0,
      onlineAmountPaise: 0,
      cardAmountPaise: 12500,
    },
  });
  const transaction = new Transaction({
    vendorId,
    paymentMode: "CARD",
    paymentBreakdown: {
      cashAmountPaise: 0,
      onlineAmountPaise: 0,
      cardAmountPaise: 12500,
    },
  });

  assert.equal(billing.validateSync(), undefined);
  assert.equal(transaction.validateSync(), undefined);
  assert.equal(billing.paymentBreakdown.cardAmountPaise, 12500);
  assert.equal(transaction.paymentBreakdown.cardAmountPaise, 12500);
});

test("revenue reporting separates Card and does not classify it as unrecorded", () => {
  const dashboard = source("controllers/vendorDashboardController.js");
  assert.match(dashboard, /cardCollected:\s*\{/);
  assert.match(dashboard, /\$eq:\s*\["\$paymentMode", "CARD"\]/);
  assert.match(dashboard, /\["ONLINE", "CASH", "CARD"\]/);
  assert.match(dashboard, /paymentBreakdown:\s*\{[\s\S]*cardCollected: summary\.cardCollected/);
  assert.match(dashboard, /paymentBreakdown\.cardAmountPaise/);
  assert.match(dashboard, /\$divide:\s*\[\{ \$ifNull: \["\$paymentBreakdown\.cardAmountPaise", 0\] \}, 100\]/);
});

test("customer bill serialization recognizes Card without changing prepaid modes", () => {
  const portal = source("controllers/customerPortalBillsController.js");
  const dashboard = source("controllers/vendorDashboardController.js");
  assert.match(portal, /"ONLINE", "CASH", "CARD", "SPLIT", "PREPAID_VALUE", "PREPAID_SESSIONS"/);
  assert.match(dashboard, /if \(paymentMode === "CARD"\) return "Card"/);
});
