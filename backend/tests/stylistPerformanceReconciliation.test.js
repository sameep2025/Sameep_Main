const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");

const BillingSession = require("../models/BillingSession");
const CustomerMembership = require("../models/CustomerMembership");
const Transaction = require("../models/Transaction");
const vendorDashboardController = require("../controllers/vendorDashboardController");

const VENDOR_ID = "692403a24d4d3a1b6a7f0ae5";

function validBill(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    grossAmount: 100,
    discountAmount: 10,
    cartItems: [{
      name: "Haircut",
      qty: 1,
      total: 100,
      resourceName: "Ravi",
    }],
    ...overrides,
  };
}

function ambiguousBill(overrides = {}) {
  return validBill({
    grossAmount: 200,
    discountAmount: 100,
    membershipDiscountAmount: 100,
    membershipBillingSnapshot: {
      customerMembershipId: new mongoose.Types.ObjectId(),
      discountPercentage: 50,
    },
    cartItems: [{ name: "Historical service", qty: 1, total: 200, resourceName: "Veena" }],
    ...overrides,
  });
}

async function runStylistReport({ bills, transactions = [], memberships = [], databaseError = null }) {
  const originals = {
    billingFind: BillingSession.find,
    transactionFind: Transaction.find,
    membershipFind: CustomerMembership.find,
  };
  BillingSession.find = () => ({
    select() { return this; },
    lean: async () => {
      if (databaseError) throw databaseError;
      return bills;
    },
  });
  Transaction.find = () => ({ lean: async () => transactions });
  CustomerMembership.find = () => ({ lean: async () => memberships });

  const res = {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
  try {
    await vendorDashboardController.getStylistPerformance(
      { query: { vendorId: VENDOR_ID, range: "mtd" } },
      res
    );
  } finally {
    BillingSession.find = originals.billingFind;
    Transaction.find = originals.transactionFind;
    CustomerMembership.find = originals.membershipFind;
  }
  return res;
}

test("fully reconciled reports return complete metadata and unchanged valid totals", async () => {
  const res = await runStylistReport({ bills: [validBill()] });

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.reconciliation.complete, true);
  assert.equal(res.payload.reconciliation.unreconciledBillCount, 0);
  assert.deepEqual(res.payload.reconciliation.issues, []);
  assert.equal(res.payload.data[0].grossRevenue, 100);
  assert.equal(res.payload.data[0].allocatedDiscounts, 10);
  assert.equal(res.payload.data[0].netRevenue, 90);
  assert.equal(res.payload.data[0].revenue, 90);
});

test("one ambiguous bill does not hide valid stylist performance", async () => {
  const badBill = ambiguousBill();
  const res = await runStylistReport({ bills: [validBill(), badBill] });

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.data.length, 1);
  assert.equal(res.payload.data[0].stylist, "Ravi");
  assert.equal(res.payload.data[0].customersAttended, 1);
  assert.equal(res.payload.data[0].unidentifiedCustomerBills, 1);
  assert.deepEqual(res.payload.reconciliation, {
    complete: false,
    unreconciledBillCount: 1,
    unreconciledGrossRevenue: 200,
    unreconciledDiscounts: 100,
    unreconciledNetRevenue: 100,
    issues: [{
      billingSessionId: String(badBill._id),
      code: "membership_allocation_unavailable",
    }],
  });
});

test("multiple ambiguous bills aggregate only authoritative persisted totals", async () => {
  const first = ambiguousBill();
  const second = ambiguousBill({ grossAmount: 300, discountAmount: 30, membershipDiscountAmount: 30 });
  const res = await runStylistReport({ bills: [first, second] });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload.data, []);
  assert.equal(res.payload.reconciliation.complete, false);
  assert.equal(res.payload.reconciliation.unreconciledBillCount, 2);
  assert.equal(res.payload.reconciliation.unreconciledGrossRevenue, 500);
  assert.equal(res.payload.reconciliation.unreconciledDiscounts, 130);
  assert.equal(res.payload.reconciliation.unreconciledNetRevenue, 370);
  assert.equal(res.payload.reconciliation.issues.length, 2);
});

test("unavailable authoritative amounts remain null instead of being estimated", async () => {
  const badBill = ambiguousBill({ grossAmount: undefined });
  const res = await runStylistReport({ bills: [badBill] });

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.reconciliation.unreconciledGrossRevenue, null);
  assert.equal(res.payload.reconciliation.unreconciledDiscounts, 100);
  assert.equal(res.payload.reconciliation.unreconciledNetRevenue, null);
});

test("unexpected database errors still fail the whole request", async () => {
  const res = await runStylistReport({ bills: [], databaseError: new Error("database unavailable") });

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.payload, { message: "Server error" });
});
