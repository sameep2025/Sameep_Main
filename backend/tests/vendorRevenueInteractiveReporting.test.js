const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");

const BillingSession = require("../models/BillingSession");
const Customer = require("../models/Customer");
const CustomerMembership = require("../models/CustomerMembership");
const Transaction = require("../models/Transaction");
const VendorCustomerProfile = require("../models/VendorCustomerProfile");
const controller = require("../controllers/vendorDashboardController");
const {
  getIstDayKeys,
  getIstMonthBounds,
} = require("../services/revenueReportingTimezone");

const VENDOR_ID = "692403a24d4d3a1b6a7f0ae5";

function response() {
  return {
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
}

test("IST month and day helpers cross month and year boundaries without gaps", () => {
  const november = getIstMonthBounds("2026-11");
  assert.equal(november.start.toISOString(), "2026-10-31T18:30:00.000Z");
  assert.equal(november.endExclusive.toISOString(), "2026-11-30T18:30:00.000Z");
  assert.equal(getIstDayKeys(november.start, november.endExclusive).length, 30);

  const january = getIstMonthBounds("2027-01");
  assert.equal(january.start.toISOString(), "2026-12-31T18:30:00.000Z");
  assert.equal(january.endExclusive.toISOString(), "2027-01-31T18:30:00.000Z");
  assert.equal(getIstDayKeys(january.start, january.endExclusive)[0], "2027-01-01");
});

test("reporting ranges preserve legacy inclusive ends and accept exact IST exclusive boundaries", () => {
  const { resolveReportingRange } = controller._private;
  const legacy = resolveReportingRange({
    from: "2026-10-31T18:30:00.000Z",
    to: "2026-11-30T18:29:59.999Z",
  });
  assert.equal(legacy.endExclusive.toISOString(), "2026-11-30T18:30:00.000Z");

  const selectedMonth = resolveReportingRange({
    from: "2026-10-31T18:30:00.000Z",
    to: "2026-11-30T18:30:00.000Z",
  });
  assert.equal(selectedMonth.endExclusive.toISOString(), "2026-11-30T18:30:00.000Z");

  const explicitInclusive = resolveReportingRange({
    from: "2026-10-31T18:30:00.000Z",
    to: "2026-11-30T18:30:00.000Z",
    endMode: "inclusive",
  });
  assert.equal(explicitInclusive.endExclusive.toISOString(), "2026-11-30T18:30:00.001Z");
});

test("daily trend uses authoritative IST financial buckets and fills zero-activity days", async () => {
  const originals = {
    billingAggregate: BillingSession.aggregate,
    membershipAggregate: CustomerMembership.aggregate,
    readyState: mongoose.connection.readyState,
  };
  const pipelines = [];
  BillingSession.aggregate = async (pipeline) => {
    pipelines.push(pipeline);
    const status = pipeline[0]?.$match?.status;
    if (status === "COMPLETED") {
      return [{
        _id: "2026-11-01",
        revenue: 118,
        billValue: 118,
        netBillValue: 118,
        discountsGiven: 10,
        rewardsRedeemed: 8,
        netCollected: 100,
        onlineCollected: 40,
        cashCollected: 60,
        notRecordedCollected: 0,
        totalBills: 2,
        orders: 2,
      }];
    }
    return [{
      _id: "2026-11-01",
      serviceActivityPaise: 5000,
      ordinaryFreshCollectionsPaise: 0,
      prepaidServiceActivityPaise: 5000,
      valueWalletRedemptionBills: 1,
      valueWalletUsedPaise: 5000,
      reversedValueWalletBills: 1,
      reversedValueWalletPaise: 2500,
    }];
  };
  CustomerMembership.aggregate = async () => [];
  mongoose.connection.readyState = 1;

  try {
    const res = response();
    await controller.getDailyTrend({
      query: { vendorId: VENDOR_ID, month: "2026-11" },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.data.length, 30);
    assert.equal(res.payload.range.timezone, "Asia/Kolkata");
    assert.equal(res.payload.range.from, "2026-10-31T18:30:00.000Z");
    assert.equal(res.payload.range.endExclusive, "2026-11-30T18:30:00.000Z");
    assert.deepEqual(res.payload.data[0]._id, { day: 1, date: "2026-11-01" });
    assert.equal(res.payload.data[0].revenue, 118);
    assert.equal(res.payload.data[0].completedBills, 2);
    assert.equal(res.payload.data[0].grossBillValue, 118);
    assert.equal(res.payload.data[0].discountsGiven, 10);
    assert.equal(res.payload.data[0].rewardsRedeemed, 8);
    assert.equal(res.payload.data[0].netCollected, 100);
    assert.deepEqual(res.payload.data[0].paymentBreakdown, {
      onlineCollected: 40,
      cashCollected: 60,
      notRecordedCollected: 0,
    });
    assert.equal(res.payload.data[0].prepaidReporting.valueWalletUsed, 50);
    assert.equal(res.payload.data[0].prepaidReporting.reversedValueWallet, 25);
    assert.equal(res.payload.data[1].date, "2026-11-02");
    assert.equal(res.payload.data[1].completedBills, 0);
    assert.equal(res.payload.data[1].netCollected, 0);

    const ordinaryPipeline = pipelines.find((pipeline) => pipeline[0]?.$match?.status === "COMPLETED");
    assert.equal(ordinaryPipeline[0].$match.createdAt.$gte.toISOString(), "2026-10-31T18:30:00.000Z");
    assert.equal(ordinaryPipeline[0].$match.createdAt.$lt.toISOString(), "2026-11-30T18:30:00.000Z");
    assert.equal(ordinaryPipeline[3].$group._id.$dateToString.timezone, "Asia/Kolkata");
  } finally {
    BillingSession.aggregate = originals.billingAggregate;
    CustomerMembership.aggregate = originals.membershipAggregate;
    mongoose.connection.readyState = originals.readyState;
  }
});

test("bill drilldown cursor is deterministic for equal timestamps and pages do not overlap", async () => {
  const originals = {
    billingFind: BillingSession.find,
    customerFind: Customer.find,
    transactionFind: Transaction.find,
    profileFind: VendorCustomerProfile.find,
  };
  const createdAt = new Date("2026-11-01T06:00:00.000Z");
  const rows = [
    "692500000000000000000003",
    "692500000000000000000002",
    "692500000000000000000001",
  ].map((id) => ({
    _id: new mongoose.Types.ObjectId(id),
    vendorId: new mongoose.Types.ObjectId(VENDOR_ID),
    status: "COMPLETED",
    totalAmount: 100,
    paymentMode: "CASH",
    createdAt,
    cartItems: [],
  }));

  BillingSession.find = (query) => {
    let selected = rows.slice();
    const cursorId = query.$or?.[1]?._id?.$lt;
    if (cursorId) selected = selected.filter((row) => row._id < cursorId);
    return {
      sort() { return this; },
      limit(value) {
        selected = selected.slice(0, value);
        return this;
      },
      lean: async () => selected,
    };
  };
  Customer.find = () => ({ select() { return this; }, lean: async () => [] });
  Transaction.find = () => ({ lean: async () => [] });
  VendorCustomerProfile.find = () => ({ select() { return this; }, lean: async () => [] });

  try {
    const first = response();
    await controller.getBillsDrilldown({
      query: {
        vendorId: VENDOR_ID,
        from: "2026-10-31T18:30:00.000Z",
        to: "2026-11-30T18:30:00.000Z",
        limit: "2",
      },
    }, first);
    assert.equal(first.payload.data.length, 2);
    assert.equal(first.payload.pagination.hasMore, true);
    assert.ok(first.payload.pagination.nextCursor);

    const second = response();
    await controller.getBillsDrilldown({
      query: {
        vendorId: VENDOR_ID,
        from: "2026-10-31T18:30:00.000Z",
        to: "2026-11-30T18:30:00.000Z",
        limit: "2",
        cursor: first.payload.pagination.nextCursor,
      },
    }, second);
    assert.equal(second.payload.data.length, 1);
    assert.equal(second.payload.pagination.hasMore, false);
    assert.equal(second.payload.pagination.nextCursor, null);

    const ids = [...first.payload.data, ...second.payload.data].map((bill) => String(bill.billId));
    assert.deepEqual(ids, rows.map((row) => String(row._id)));
    assert.equal(new Set(ids).size, 3);
  } finally {
    BillingSession.find = originals.billingFind;
    Customer.find = originals.customerFind;
    Transaction.find = originals.transactionFind;
    VendorCustomerProfile.find = originals.profileFind;
  }
});

test("bill pagination rejects malformed cursors and bounds page size", async () => {
  assert.equal(controller._private.parseBillPageLimit("9999"), 250);
  assert.equal(controller._private.parseBillPageLimit("invalid"), 100);
  assert.throws(
    () => controller._private.decodeBillCursor("not-a-cursor"),
    /Invalid bill pagination cursor/
  );
});

test("daily and summary reporting reject invalid or excessive ranges before querying", async () => {
  const originalAggregate = BillingSession.aggregate;
  let aggregateCalls = 0;
  BillingSession.aggregate = async () => {
    aggregateCalls += 1;
    return [];
  };
  try {
    const daily = response();
    await controller.getDailyTrend({
      query: {
        vendorId: VENDOR_ID,
        from: "2025-01-01T18:30:00.000Z",
        to: "2027-01-01T18:30:00.000Z",
      },
    }, daily);
    assert.equal(daily.statusCode, 400);
    assert.match(daily.payload.message, /cannot exceed 366 days/);

    const summary = response();
    await controller.getBillsSummary({
      query: { vendorId: VENDOR_ID, from: "not-a-date" },
    }, summary);
    assert.equal(summary.statusCode, 400);
    assert.match(summary.payload.message, /from must be a valid ISO date/);
    assert.equal(aggregateCalls, 0);
  } finally {
    BillingSession.aggregate = originalAggregate;
  }
});
