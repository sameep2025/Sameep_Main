const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const mongoose = require("mongoose");

const BillingSession = require("../models/BillingSession");
const Customer = require("../models/Customer");
const Transaction = require("../models/Transaction");
const billingController = require("../controllers/billingController");
const vendorDashboardController = require("../controllers/vendorDashboardController");
const vendorBillingController = require("../controllers/vendorBillingController");

const VENDOR_ID = "692403a24d4d3a1b6a7f0ae5";
const CUSTOMER_ID = "690d8bf7a6dc67fbf8757115";
const ACTIVE_BILL_ID = "6aacc880dac53725ac8225bb";
const COMPLETED_BILL_ID = "6aacc888dac53725ac8225c4";
const OUT_OF_RANGE_BILL_ID = "6aacc96cdac53725ac8225f2";

function buildBill({
  id,
  status,
  totalAmount,
  createdAt,
  grossAmount,
  discountAmount,
  pointsEarned = 0,
  pointsRedeemed = 0,
  customerId = CUSTOMER_ID,
  whatsappStatus = "skipped",
}) {
  return {
    _id: new mongoose.Types.ObjectId(id),
    vendorId: new mongoose.Types.ObjectId(VENDOR_ID),
    customerId: customerId ? new mongoose.Types.ObjectId(customerId) : null,
    status,
    totalAmount,
    ...(grossAmount !== undefined ? { grossAmount } : {}),
    ...(discountAmount !== undefined ? { discountAmount } : {}),
    pointsEarned,
    pointsRedeemed,
    createdAt: new Date(createdAt),
    whatsappStatus,
    cartItems: [
      {
        name: "Premium / Luxury",
        qty: 1,
        price: totalAmount,
        total: totalAmount,
        resourceName: "Riya",
      },
    ],
  };
}

const sampleBills = [
  buildBill({
    id: ACTIVE_BILL_ID,
    status: "ACTIVE",
    totalAmount: 60000,
    createdAt: "2026-09-18T05:13:36.230Z",
  }),
  buildBill({
    id: COMPLETED_BILL_ID,
    status: "COMPLETED",
    totalAmount: 800,
    grossAmount: 1000,
    discountAmount: 200,
    pointsEarned: 1200,
    pointsRedeemed: 300,
    createdAt: "2026-09-18T05:13:44.771Z",
    whatsappStatus: "insufficient_balance",
  }),
  buildBill({
    id: OUT_OF_RANGE_BILL_ID,
    status: "COMPLETED",
    totalAmount: 1500,
    pointsEarned: 30,
    createdAt: "2026-09-17T05:17:32.714Z",
  }),
];

const sampleTransactions = [
  {
    _id: new mongoose.Types.ObjectId("6aacc888dac53725ac8225c5"),
    billingSessionId: new mongoose.Types.ObjectId(COMPLETED_BILL_ID),
    totalAmount: 800,
    grossAmount: 1000,
    discountAmount: 200,
    redeemedPoints: 300,
    redeemValue: 300,
    finalPaidAmount: 500,
  },
  {
    _id: new mongoose.Types.ObjectId("6aacc96cdac53725ac8225f3"),
    billingSessionId: new mongoose.Types.ObjectId(OUT_OF_RANGE_BILL_ID),
    totalAmount: 1500,
    redeemedPoints: 0,
    redeemValue: 0,
    finalPaidAmount: 1500,
  },
];

function dateMatches(value, range = {}) {
  const date = new Date(value);
  if (range.$gte && date < range.$gte) return false;
  if (range.$lte && date > range.$lte) return false;
  return true;
}

function buildFindResult(query, state) {
  let rows = sampleBills.filter((bill) => {
    if (query.status && bill.status !== query.status) return false;
    if (query.vendorId && String(bill.vendorId) !== String(query.vendorId)) return false;
    if (query.createdAt && !dateMatches(bill.createdAt, query.createdAt)) return false;
    return true;
  });

  return {
    sort(sortSpec) {
      state.sortSpec = sortSpec;
      return this;
    },
    limit(limitValue) {
      state.limitValue = limitValue;
      rows = rows.slice(0, Number(limitValue));
      return this;
    },
    lean: async () => rows,
  };
}

async function callController(handler, queryOverrides = {}) {
  const req = {
    query: {
      vendorId: VENDOR_ID,
      from: "2026-09-18T00:00:00.000Z",
      to: "2026-09-18T23:59:59.999Z",
      ...queryOverrides,
    },
  };
  const res = {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };

  await handler(req, res);
  return res;
}

function withMockedBillingSessionFind(fn) {
  return async () => {
    const originals = {
      find: BillingSession.find,
      customerFindById: Customer.findById,
      transactionFind: Transaction.find,
    };
    const state = {
      queries: [],
      sortSpec: null,
      limitValue: null,
    };

    BillingSession.find = (query) => {
      state.queries.push(query);
      return buildFindResult(query, state);
    };

    Customer.findById = () => ({
      lean: async () => ({
        phone: "6309719521",
        fullNumber: "916309719521",
      }),
    });

    Transaction.find = (query) => {
      const ids = (query?.billingSessionId?.$in || []).map((id) => String(id));
      const rows = sampleTransactions.filter((transaction) =>
        ids.includes(String(transaction.billingSessionId))
      );

      return {
        lean: async () => rows,
      };
    };

    try {
      await fn(state);
    } finally {
      BillingSession.find = originals.find;
      Customer.findById = originals.customerFindById;
      Transaction.find = originals.transactionFind;
    }
  };
}

test(
  "vendor revenue drilldown excludes ACTIVE BillingSessions and keeps response shape",
  withMockedBillingSessionFind(async (state) => {
    const res = await callController(vendorDashboardController.getBillsDrilldown);

    assert.equal(res.statusCode, 200);
    assert.equal(state.queries.length, 1);
    assert.equal(state.queries[0].status, "COMPLETED");
    assert.equal(state.limitValue, 100);
    assert.deepEqual(state.sortSpec, { createdAt: -1 });

    const bills = res.payload.data;
    assert.equal(bills.length, 1);
    assert.equal(String(bills[0].billId), COMPLETED_BILL_ID);
    assert.equal(bills[0].total, 800);
    assert.equal(bills[0].grossAmount, 1000);
    assert.equal(bills[0].discountAmount, 200);
    assert.equal(bills[0].billValue, 1000);
    assert.equal(bills[0].netBillValue, 800);
    assert.equal(bills[0].rewardsRedeemedValue, 300);
    assert.equal(bills[0].netCollected, 500);
    assert.equal(bills[0].financialSnapshotAvailable, true);
    assert.equal(bills[0].transactionMissing, false);
    assert.equal(bills[0].earned, 1200);
    assert.equal(bills[0].redeemed, 300);
    assert.equal(bills[0].items[0].resourceName, "Riya");
    assert.equal(typeof bills[0].phone, "string");
  })
);

test(
  "vendor revenue drilldown preserves date filtering with COMPLETED status",
  withMockedBillingSessionFind(async (state) => {
    const res = await callController(vendorDashboardController.getBillsDrilldown, {
      from: "2026-09-17T00:00:00.000Z",
      to: "2026-09-17T23:59:59.999Z",
    });

    assert.equal(state.queries[0].status, "COMPLETED");
    assert.ok(state.queries[0].createdAt.$gte instanceof Date);
    assert.ok(state.queries[0].createdAt.$lte instanceof Date);
    assert.equal(res.payload.data.length, 1);
    assert.equal(String(res.payload.data[0].billId), OUT_OF_RANGE_BILL_ID);
    assert.equal(res.payload.data[0].grossAmount, null);
    assert.equal(res.payload.data[0].discountAmount, null);
    assert.equal(res.payload.data[0].billValue, 1500);
    assert.equal(res.payload.data[0].netBillValue, 1500);
    assert.equal(res.payload.data[0].rewardsRedeemedValue, 0);
    assert.equal(res.payload.data[0].netCollected, 1500);
    assert.equal(res.payload.data[0].financialSnapshotAvailable, false);
    assert.equal(res.payload.data[0].transactionMissing, false);
  })
);

test(
  "failed OTP redemption ACTIVE session cannot appear through revenue endpoint",
  withMockedBillingSessionFind(async () => {
    const res = await callController(vendorDashboardController.getBillsDrilldown, {
      from: "2026-09-18T05:13:30.000Z",
      to: "2026-09-18T05:13:40.000Z",
    });

    assert.equal(res.payload.data.length, 0);
  })
);

test(
  "completed bill remains returned even when WhatsApp delivery did not send",
  withMockedBillingSessionFind(async () => {
    const res = await callController(vendorDashboardController.getBillsDrilldown);

    assert.equal(res.payload.data.length, 1);
    assert.equal(String(res.payload.data[0].billId), COMPLETED_BILL_ID);
    assert.equal(res.payload.data[0].total, 800);
  })
);

test(
  "legacy vendor bill-list endpoint also requires COMPLETED status",
  withMockedBillingSessionFind(async (state) => {
    const res = await callController(vendorBillingController.getVendorBills);

    assert.equal(res.statusCode, 200);
    assert.equal(state.queries[0].status, "COMPLETED");
    assert.equal(res.payload.data.length, 1);
    assert.equal(String(res.payload.data[0].billId), COMPLETED_BILL_ID);
    assert.equal(res.payload.data[0].billValue, 1000);
    assert.equal(res.payload.data[0].netBillValue, 800);
    assert.equal(res.payload.data[0].rewardsRedeemedValue, 300);
    assert.equal(res.payload.data[0].netCollected, 500);
  })
);

test(
  "revenue response safely falls back when historical Transaction is missing",
  withMockedBillingSessionFind(async () => {
    const originalTransactionFind = Transaction.find;
    Transaction.find = () => ({ lean: async () => [] });

    try {
      const res = await callController(vendorDashboardController.getBillsDrilldown);
      const bill = res.payload.data[0];

      assert.equal(bill.transactionMissing, true);
      assert.equal(bill.rewardsRedeemedValue, 300);
      assert.equal(bill.netCollected, 500);
    } finally {
      Transaction.find = originalTransactionFind;
    }
  })
);

test(
  "discount plus full redemption reports collected amount as zero",
  withMockedBillingSessionFind(async () => {
    const originalTransactionFind = Transaction.find;
    Transaction.find = (query) => {
      const ids = (query?.billingSessionId?.$in || []).map((id) => String(id));
      const rows = ids.includes(COMPLETED_BILL_ID)
        ? [
            {
              billingSessionId: new mongoose.Types.ObjectId(COMPLETED_BILL_ID),
              totalAmount: 800,
              grossAmount: 1000,
              discountAmount: 200,
              redeemedPoints: 800,
              redeemValue: 800,
              finalPaidAmount: 0,
            },
          ]
        : [];

      return { lean: async () => rows };
    };

    try {
      const res = await callController(vendorDashboardController.getBillsDrilldown);
      const bill = res.payload.data[0];

      assert.equal(bill.grossAmount, 1000);
      assert.equal(bill.discountAmount, 200);
      assert.equal(bill.billValue, 1000);
      assert.equal(bill.netBillValue, 800);
      assert.equal(bill.rewardsRedeemedValue, 800);
      assert.equal(bill.netCollected, 0);
    } finally {
      Transaction.find = originalTransactionFind;
    }
  })
);

test(
  "discount without rewards reports gross bill value and collected net bill value",
  withMockedBillingSessionFind(async () => {
    const originalTransactionFind = Transaction.find;
    Transaction.find = (query) => {
      const ids = (query?.billingSessionId?.$in || []).map((id) => String(id));
      const rows = ids.includes(COMPLETED_BILL_ID)
        ? [
            {
              billingSessionId: new mongoose.Types.ObjectId(COMPLETED_BILL_ID),
              totalAmount: 800,
              grossAmount: 1000,
              discountAmount: 200,
              redeemedPoints: 0,
              redeemValue: 0,
              finalPaidAmount: 800,
            },
          ]
        : [];

      return { lean: async () => rows };
    };

    try {
      const res = await callController(vendorDashboardController.getBillsDrilldown);
      const bill = res.payload.data[0];

      assert.equal(bill.billValue, 1000);
      assert.equal(bill.discountAmount, 200);
      assert.equal(bill.rewardsRedeemedValue, 0);
      assert.equal(bill.netCollected, 800);
    } finally {
      Transaction.find = originalTransactionFind;
    }
  })
);

test("billing cart update stores valid financial snapshot", async () => {
  const originals = {
    findByIdAndUpdate: BillingSession.findByIdAndUpdate,
  };
  let updatePayload = null;

  BillingSession.findByIdAndUpdate = async (_id, update) => {
    updatePayload = update;
    return { _id, ...update };
  };

  const req = {
    body: {
      billingId: COMPLETED_BILL_ID,
      grossAmount: 1000,
      discountAmount: 200,
      cartItems: [
        {
          name: "Professional Hair Styling",
          price: 800,
          qty: 1,
        },
      ],
    },
  };
  const res = {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };

  try {
    await billingController.updateBillingCart(req, res);
  } finally {
    BillingSession.findByIdAndUpdate = originals.findByIdAndUpdate;
  }

  assert.equal(res.statusCode, 200);
  assert.equal(updatePayload.totalAmount, 800);
  assert.equal(updatePayload.grossAmount, 1000);
  assert.equal(updatePayload.discountAmount, 200);
});

test("billing cart update stores no-discount financial snapshot", async () => {
  const originalFindByIdAndUpdate = BillingSession.findByIdAndUpdate;
  let updatePayload = null;

  BillingSession.findByIdAndUpdate = async (_id, update) => {
    updatePayload = update;
    return { _id, ...update };
  };

  const req = {
    body: {
      billingId: COMPLETED_BILL_ID,
      grossAmount: 1000,
      discountAmount: 0,
      cartItems: [
        {
          name: "Professional Hair Styling",
          price: 1000,
          qty: 1,
        },
      ],
    },
  };
  const res = {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };

  try {
    await billingController.updateBillingCart(req, res);
  } finally {
    BillingSession.findByIdAndUpdate = originalFindByIdAndUpdate;
  }

  assert.equal(res.statusCode, 200);
  assert.equal(updatePayload.totalAmount, 1000);
  assert.equal(updatePayload.grossAmount, 1000);
  assert.equal(updatePayload.discountAmount, 0);
});

test("billing cart update accepts proportional discount rounding tolerance", async () => {
  const originalFindByIdAndUpdate = BillingSession.findByIdAndUpdate;
  let updatePayload = null;

  BillingSession.findByIdAndUpdate = async (_id, update) => {
    updatePayload = update;
    return { _id, ...update };
  };

  const req = {
    body: {
      billingId: COMPLETED_BILL_ID,
      grossAmount: 100,
      discountAmount: 33,
      cartItems: [
        {
          name: "Service A",
          price: 34,
          qty: 1,
        },
        {
          name: "Service B",
          price: 34,
          qty: 1,
        },
      ],
    },
  };
  const res = {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };

  try {
    await billingController.updateBillingCart(req, res);
  } finally {
    BillingSession.findByIdAndUpdate = originalFindByIdAndUpdate;
  }

  assert.equal(res.statusCode, 200);
  assert.equal(updatePayload.totalAmount, 68);
  assert.equal(updatePayload.grossAmount, 100);
  assert.equal(updatePayload.discountAmount, 33);
});

test("billing cart update rejects inconsistent financial snapshot", async () => {
  const req = {
    body: {
      billingId: COMPLETED_BILL_ID,
      grossAmount: 1000,
      discountAmount: 50,
      cartItems: [
        {
          name: "Professional Hair Styling",
          price: 900,
          qty: 1,
        },
      ],
    },
  };
  const res = {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };

  await billingController.updateBillingCart(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.success, false);
});

test("vendor revenue period summary and chart aggregations require COMPLETED status", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../controllers/vendorDashboardController.js"),
    "utf8"
  );

  const summarySection = source.slice(
    source.indexOf("exports.getDashboardSummary"),
    source.indexOf("exports.getFinancialYearMonthly")
  );
  const monthlySection = source.slice(
    source.indexOf("exports.getFinancialYearMonthly"),
    source.indexOf("exports.getTopServices")
  );
  const dailyTrendSection = source.slice(
    source.indexOf("exports.getDailyTrend"),
    source.indexOf("exports.getBillsDrilldown")
  );
  const stylistSection = source.slice(source.indexOf("exports.getStylistPerformance"));

  assert.match(summarySection, /status:\s*"COMPLETED"/);
  assert.match(summarySection, /todayBillValue/);
  assert.match(summarySection, /monthBillValue/);
  assert.match(monthlySection, /status:\s*"COMPLETED"/);
  assert.match(monthlySection, /billValue/);
  assert.match(dailyTrendSection, /status:\s*"COMPLETED"/);
  assert.match(stylistSection, /status:\s*"COMPLETED"/);
});
