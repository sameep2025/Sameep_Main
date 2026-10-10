const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const jwt = require("jsonwebtoken");

const LoyaltyLedger = require("../models/LoyaltyLedger");
const CustomerRewardReveal = require("../models/CustomerRewardReveal");
const Vendor = require("../models/DummyVendor");
const rewardsController = require("../controllers/customerPortalRewardsController");
const {
  CUSTOMER_PORTAL_SESSION_TYPE,
  requireCustomerPortalSession,
  signCustomerPortalToken,
} = require("../utils/customerPortalAuth");
const Session = require("../models/Session");

const CUSTOMER_A_ID = "692403a24d4d3a1b6a7f0a01";
const CUSTOMER_B_ID = "692403a24d4d3a1b6a7f0a02";
const VENDOR_A_ID = "692403a24d4d3a1b6a7f0b01";
const VENDOR_B_ID = "692403a24d4d3a1b6a7f0b02";
const REWARD_A_ID = "692403a24d4d3a1b6a7f0c01";
const REWARD_B_ID = "692403a24d4d3a1b6a7f0c02";
const REWARD_C_ID = "692403a24d4d3a1b6a7f0c03";

function mockReq({ auth = null, headers = {}, query = {}, body = {}, params = {} } = {}) {
  return { auth, headers, query, body, params };
}

function mockRes() {
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

function vendorMap(entries = []) {
  return new Map(entries.map((vendor) => [String(vendor._id), vendor]));
}

function withMockedRewardModels(fn) {
  return async () => {
    const originals = {
      ledgerFind: LoyaltyLedger.find,
      ledgerAggregate: LoyaltyLedger.aggregate,
      revealFind: CustomerRewardReveal.find,
      revealFindOne: CustomerRewardReveal.findOne,
      revealFindOneAndUpdate: CustomerRewardReveal.findOneAndUpdate,
      vendorFind: Vendor.find,
      vendorFindById: Vendor.findById,
      sessionFindOne: Session.findOne,
      sessionUpdateOne: Session.updateOne,
      launchAt: process.env.SCRATCH_REVEAL_LAUNCHED_AT,
    };

    try {
      await fn();
    } finally {
      LoyaltyLedger.find = originals.ledgerFind;
      LoyaltyLedger.aggregate = originals.ledgerAggregate;
      CustomerRewardReveal.find = originals.revealFind;
      CustomerRewardReveal.findOne = originals.revealFindOne;
      CustomerRewardReveal.findOneAndUpdate = originals.revealFindOneAndUpdate;
      Vendor.find = originals.vendorFind;
      Vendor.findById = originals.vendorFindById;
      Session.findOne = originals.sessionFindOne;
      Session.updateOne = originals.sessionUpdateOne;
      if (originals.launchAt === undefined) {
        delete process.env.SCRATCH_REVEAL_LAUNCHED_AT;
      } else {
        process.env.SCRATCH_REVEAL_LAUNCHED_AT = originals.launchAt;
      }
    }
  };
}

function installLedgerRows(rows, state = {}) {
  LoyaltyLedger.find = (query) => {
    state.ledgerQuery = query;
    const queryApi = {
      sort(sortSpec) {
        state.ledgerSort = sortSpec;
        return this;
      },
      lean: async () => rows,
    };
    return queryApi;
  };
}

function installActivityLedgerRows(rows, state = {}) {
  LoyaltyLedger.find = (query) => {
    state.activityQuery = query;
    let sortSpec = null;
    let limitCount = rows.length;

    const queryApi = {
      sort(nextSortSpec) {
        sortSpec = nextSortSpec;
        state.activitySort = nextSortSpec;
        return this;
      },
      limit(nextLimit) {
        limitCount = nextLimit;
        state.activityLimit = nextLimit;
        return this;
      },
      lean: async () => {
        let result = rows.filter((row) => {
          const typeMatches =
            !query.type?.$in || query.type.$in.includes(row.type);
          const customerMatches = String(row.customerId || "") === String(query.customerId || "");
          const vendorMatches = String(row.vendorId || "") === String(query.vendorId || "");

          if (!typeMatches || !customerMatches || !vendorMatches) return false;

          if (!query.$or) return true;

          return query.$or.some((condition) => {
            if (condition.createdAt?.$lt) {
              return new Date(row.createdAt) < condition.createdAt.$lt;
            }

            if (condition.createdAt && condition._id?.$lt) {
              return (
                new Date(row.createdAt).getTime() === new Date(condition.createdAt).getTime() &&
                String(row._id) < String(condition._id.$lt)
              );
            }

            return false;
          });
        });

        if (sortSpec?.createdAt === -1 && sortSpec?._id === -1) {
          result = result.sort((a, b) => {
            const dateDelta = new Date(b.createdAt) - new Date(a.createdAt);
            if (dateDelta !== 0) return dateDelta;
            return String(b._id).localeCompare(String(a._id));
          });
        }

        return result.slice(0, limitCount);
      },
    };

    return queryApi;
  };
}

function installEligibleEarnRows(rows, state = {}) {
  LoyaltyLedger.aggregate = async (pipeline) => {
    state.aggregatePipeline = pipeline;
    return rows;
  };
}

function installRevealRows(rows, state = {}) {
  CustomerRewardReveal.find = (query) => {
    state.revealQuery = query;
    return {
      select(selectSpec) {
        state.revealSelect = selectSpec;
        return this;
      },
      lean: async () => rows,
    };
  };
}

function installVendorRows(rows, state = {}) {
  Vendor.find = (query) => {
    state.vendorQuery = query;
    return {
      select(selectSpec) {
        state.vendorSelect = selectSpec;
        return this;
      },
      lean: async () => rows,
    };
  };
}

function installVendorById(row, state = {}) {
  Vendor.findById = (vendorId) => {
    state.vendorFindById = vendorId;
    return {
      select(selectSpec) {
        state.vendorFindByIdSelect = selectSpec;
        return this;
      },
      lean: async () => row,
    };
  };
}

test("reward summary calculates available, earned, redeemed, expired, and expiring soon", () => {
  const now = new Date("2026-09-28T00:00:00.000Z");
  const summary = rewardsController.buildCustomerRewardSummary({
    now,
    vendorMap: vendorMap([
      {
        _id: "vendor-1",
        businessName: "Mona Makeover",
        subdomain: "monamakeovers",
        logoUrl: "logo.png",
        phone: "hidden",
      },
    ]),
    ledgerRows: [
      {
        vendorId: "vendor-1",
        type: "EARN",
        points: 100,
        remainingPoints: 40,
        expiryDate: "2026-09-27T00:00:00.000Z",
        createdAt: "2026-09-20T00:00:00.000Z",
      },
      {
        vendorId: "vendor-1",
        type: "EARN",
        points: 200,
        remainingPoints: 120,
        expiryDate: "2026-10-02T00:00:00.000Z",
        createdAt: "2026-09-21T00:00:00.000Z",
      },
      {
        vendorId: "vendor-1",
        type: "EARN",
        points: 50,
        remainingPoints: 50,
        expiryDate: null,
        createdAt: "2026-09-22T00:00:00.000Z",
      },
      {
        vendorId: "vendor-1",
        type: "REDEEM",
        points: -80,
        createdAt: "2026-09-23T00:00:00.000Z",
      },
    ],
  });

  assert.equal(summary.vendors.length, 1);
  const row = summary.vendors[0];
  assert.deepEqual(row.vendor, {
    businessName: "Mona Makeover",
    subdomain: "monamakeovers",
    logoUrl: "logo.png",
  });
  assert.equal(row.totalEarnedPoints, 350);
  assert.equal(row.totalRedeemedPoints, 80);
  assert.equal(row.availablePoints, 170);
  assert.equal(row.totalExpiredPoints, 40);
  assert.equal(row.expiringSoonPoints, 120);
  assert.deepEqual(row.expiryBatches, [
    {
      points: 120,
      expiryDate: "2026-10-02T00:00:00.000Z",
    },
  ]);
});

test("partial redemption plus expiry counts only remaining expired points", () => {
  const summary = rewardsController.buildCustomerRewardSummary({
    now: new Date("2026-09-28T00:00:00.000Z"),
    vendorMap: vendorMap([{ _id: "vendor-1", businessName: "Vendor" }]),
    ledgerRows: [
      {
        vendorId: "vendor-1",
        type: "EARN",
        points: 100,
        remainingPoints: 40,
        expiryDate: "2026-09-01T00:00:00.000Z",
        createdAt: "2026-08-01T00:00:00.000Z",
      },
    ],
  });

  assert.equal(summary.vendors[0].totalEarnedPoints, 100);
  assert.equal(summary.vendors[0].totalExpiredPoints, 40);
  assert.equal(summary.vendors[0].availablePoints, 0);
});

test("expiring soon includes only future batches within 7 days and sorts nearest first", () => {
  const summary = rewardsController.buildCustomerRewardSummary({
    now: new Date("2026-09-28T00:00:00.000Z"),
    vendorMap: vendorMap([{ _id: "vendor-1", businessName: "Vendor" }]),
    ledgerRows: [
      {
        vendorId: "vendor-1",
        type: "EARN",
        points: 10,
        remainingPoints: 10,
        expiryDate: "2026-10-06T00:00:00.000Z",
      },
      {
        vendorId: "vendor-1",
        type: "EARN",
        points: 20,
        remainingPoints: 20,
        expiryDate: "2026-10-01T00:00:00.000Z",
      },
      {
        vendorId: "vendor-1",
        type: "EARN",
        points: 30,
        remainingPoints: 30,
        expiryDate: "2026-09-30T00:00:00.000Z",
      },
      {
        vendorId: "vendor-1",
        type: "EARN",
        points: 40,
        remainingPoints: 0,
        expiryDate: "2026-09-29T00:00:00.000Z",
      },
      {
        vendorId: "vendor-1",
        type: "EARN",
        points: 50,
        remainingPoints: 50,
        expiryDate: "2026-09-27T00:00:00.000Z",
      },
    ],
  });

  assert.equal(summary.vendors[0].expiringSoonPoints, 50);
  assert.deepEqual(summary.vendors[0].expiryBatches, [
    { points: 30, expiryDate: "2026-09-30T00:00:00.000Z" },
    { points: 20, expiryDate: "2026-10-01T00:00:00.000Z" },
  ]);
});

test("reward activity includes ledger EARN and REDEEM only with customer-facing signs", () => {
  const summary = rewardsController.buildCustomerRewardSummary({
    now: new Date("2026-09-28T00:00:00.000Z"),
    vendorMap: vendorMap([{ _id: "vendor-1", businessName: "Vendor" }]),
    ledgerRows: [
      {
        vendorId: "vendor-1",
        type: "REDEEM",
        points: -25,
        createdAt: "2026-09-27T00:00:00.000Z",
      },
      {
        vendorId: "vendor-1",
        type: "EARN",
        points: 50,
        remainingPoints: 50,
        expiryDate: "2026-10-01T00:00:00.000Z",
        createdAt: "2026-09-26T00:00:00.000Z",
      },
    ],
  });

  assert.deepEqual(summary.vendors[0].recentActivity, [
    {
      type: "REDEEM",
      points: 25,
      signedPoints: -25,
      createdAt: "2026-09-27T00:00:00.000Z",
      expiryDate: null,
    },
    {
      type: "EARN",
      points: 50,
      signedPoints: 50,
      createdAt: "2026-09-26T00:00:00.000Z",
      expiryDate: "2026-10-01T00:00:00.000Z",
      remainingPoints: 50,
    },
  ]);
  assert.equal(
    Object.prototype.hasOwnProperty.call(summary.vendors[0].recentActivity[0], "remainingPoints"),
    false
  );
});

test("reward activity preserves original and remaining points for partially redeemed EARN rows", () => {
  const summary = rewardsController.buildCustomerRewardSummary({
    now: new Date("2026-09-28T00:00:00.000Z"),
    vendorMap: vendorMap([{ _id: "vendor-1", businessName: "Vendor" }]),
    ledgerRows: [
      {
        vendorId: "vendor-1",
        type: "EARN",
        points: 100,
        remainingPoints: 30,
        expiryDate: "2026-10-01T00:00:00.000Z",
        createdAt: "2026-09-26T00:00:00.000Z",
      },
    ],
  });

  assert.deepEqual(summary.vendors[0].recentActivity, [
    {
      type: "EARN",
      points: 100,
      signedPoints: 100,
      createdAt: "2026-09-26T00:00:00.000Z",
      expiryDate: "2026-10-01T00:00:00.000Z",
      remainingPoints: 30,
    },
  ]);
});

test("expired EARN rows remain in recent activity with remainingPoints", () => {
  const summary = rewardsController.buildCustomerRewardSummary({
    now: new Date("2026-09-28T00:00:00.000Z"),
    vendorMap: vendorMap([{ _id: "vendor-1", businessName: "Vendor" }]),
    ledgerRows: [
      {
        vendorId: "vendor-1",
        type: "EARN",
        points: 40,
        remainingPoints: 40,
        expiryDate: "2026-09-01T00:00:00.000Z",
        createdAt: "2026-08-01T00:00:00.000Z",
      },
    ],
  });

  assert.deepEqual(summary.vendors[0].recentActivity, [
    {
      type: "EARN",
      points: 40,
      signedPoints: 40,
      createdAt: "2026-08-01T00:00:00.000Z",
      expiryDate: "2026-09-01T00:00:00.000Z",
      remainingPoints: 40,
    },
  ]);
});

test("multi-vendor rewards are grouped without mixing balances", () => {
  const summary = rewardsController.buildCustomerRewardSummary({
    now: new Date("2026-09-28T00:00:00.000Z"),
    vendorMap: vendorMap([
      { _id: "vendor-1", businessName: "A Vendor", subdomain: "a" },
      { _id: "vendor-2", businessName: "B Vendor", subdomain: "b" },
    ]),
    ledgerRows: [
      {
        vendorId: "vendor-2",
        type: "EARN",
        points: 200,
        remainingPoints: 200,
      },
      {
        vendorId: "vendor-1",
        type: "EARN",
        points: 100,
        remainingPoints: 100,
      },
      {
        vendorId: "vendor-2",
        type: "REDEEM",
        points: -75,
      },
    ],
  });

  assert.equal(summary.vendors.length, 2);
  assert.equal(summary.vendors[0].vendor.businessName, "A Vendor");
  assert.equal(summary.vendors[0].availablePoints, 100);
  assert.equal(summary.vendors[1].vendor.businessName, "B Vendor");
  assert.equal(summary.vendors[1].availablePoints, 200);
  assert.equal(summary.vendors[1].totalRedeemedPoints, 75);
});

test("missing vendor is handled safely without leaking IDs", () => {
  const summary = rewardsController.buildCustomerRewardSummary({
    now: new Date("2026-09-28T00:00:00.000Z"),
    vendorMap: new Map(),
    ledgerRows: [
      {
        vendorId: "deleted-vendor",
        type: "EARN",
        points: 10,
        remainingPoints: 10,
      },
    ],
  });

  assert.deepEqual(summary.vendors[0].vendor, {
    businessName: "Unknown Business",
    subdomain: "",
    logoUrl: "",
  });
  assert.equal(Object.prototype.hasOwnProperty.call(summary.vendors[0], "vendorId"), false);
});

test("authenticated customer with no loyalty history returns empty vendors", withMockedRewardModels(async () => {
  const state = {};
  installLedgerRows([], state);
  installVendorRows([], state);
  const res = mockRes();

  await rewardsController.getRewards(
    mockReq({ auth: { customerId: "customer-empty" } }),
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload, {
    success: true,
    data: { vendors: [], unrevealedRewards: [] },
  });
  assert.deepEqual(state.ledgerQuery, { customerId: "customer-empty" });
  assert.equal(state.vendorQuery, undefined);
}));

test("rewards endpoint uses authenticated customerId and ignores supplied customerId", withMockedRewardModels(async () => {
  const state = {};
  installLedgerRows([
    {
      vendorId: "vendor-1",
      type: "EARN",
      points: 100,
      remainingPoints: 100,
      createdAt: "2026-09-28T00:00:00.000Z",
    },
  ], state);
  installVendorRows([
    {
      _id: "vendor-1",
      businessName: "Safe Vendor",
      subdomain: "safe",
      logoUrl: "safe.png",
      phone: "private",
    },
  ], state);

  const res = mockRes();
  await rewardsController.getRewards(
    mockReq({
      auth: { customerId: "customer-authenticated" },
      query: { customerId: "customer-attacker" },
      body: { customerId: "customer-attacker" },
    }),
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(state.ledgerQuery, { customerId: "customer-authenticated" });
  assert.deepEqual(state.vendorQuery, { _id: { $in: ["vendor-1"] } });
  assert.equal(state.vendorSelect, "businessName subdomain logoUrl");
  assert.deepEqual(res.payload.data.vendors[0].vendor, {
    businessName: "Safe Vendor",
    subdomain: "safe",
    logoUrl: "safe.png",
  });
}));

test("portal rewards route requires customer portal session middleware", () => {
  const routeSource = fs.readFileSync(
    path.join(__dirname, "../routes/customerPortalRoutes.js"),
    "utf8"
  );

  assert.match(routeSource, /router\.get\("\/rewards", requireCustomerPortalSession, customerPortalRewardsController\.getRewards\)/);
  assert.match(routeSource, /router\.get\("\/rewards\/:vendorId\/activity", requireCustomerPortalSession, customerPortalRewardsController\.getRewardActivity\)/);
  assert.match(routeSource, /router\.post\("\/rewards\/:rewardId\/reveal", requireCustomerPortalSession, customerPortalRewardsController\.revealReward\)/);
});

test("reward activity endpoint returns first 10 newest records with cursor metadata", withMockedRewardModels(async () => {
  const state = {};
  const rows = Array.from({ length: 12 }, (_, index) => ({
    _id: `692403a24d4d3a1b6a7f1${String(index).padStart(3, "0")}`,
    customerId: CUSTOMER_A_ID,
    vendorId: VENDOR_A_ID,
    type: "EARN",
    points: index + 1,
    remainingPoints: index + 1,
    createdAt: new Date(Date.UTC(2026, 8, 30, 12, index)).toISOString(),
  }));
  installActivityLedgerRows(rows, state);

  const res = mockRes();
  await rewardsController.getRewardActivity(
    mockReq({
      auth: { customerId: CUSTOMER_A_ID },
      params: { vendorId: VENDOR_A_ID },
      query: { limit: "10" },
    }),
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.data.items.length, 10);
  assert.deepEqual(
    res.payload.data.items.map((row) => row.activityId),
    rows.slice().reverse().slice(0, 10).map((row) => row._id)
  );
  assert.equal(res.payload.data.hasMore, true);
  assert.ok(res.payload.data.nextCursor);
  assert.deepEqual(state.activitySort, { createdAt: -1, _id: -1 });
  assert.equal(state.activityLimit, 11);
  assert.equal(String(state.activityQuery.customerId), CUSTOMER_A_ID);
  assert.equal(String(state.activityQuery.vendorId), VENDOR_A_ID);
}));

test("reward activity cursor returns next page without duplicates and end sets hasMore false", withMockedRewardModels(async () => {
  const state = {};
  const rows = Array.from({ length: 12 }, (_, index) => ({
    _id: `692403a24d4d3a1b6a7f2${String(index).padStart(3, "0")}`,
    customerId: CUSTOMER_A_ID,
    vendorId: VENDOR_A_ID,
    type: "EARN",
    points: index + 1,
    remainingPoints: index + 1,
    createdAt: new Date(Date.UTC(2026, 8, 30, 12, index)).toISOString(),
  }));
  installActivityLedgerRows(rows, state);

  const firstRes = mockRes();
  await rewardsController.getRewardActivity(
    mockReq({ auth: { customerId: CUSTOMER_A_ID }, params: { vendorId: VENDOR_A_ID } }),
    firstRes
  );

  const secondRes = mockRes();
  await rewardsController.getRewardActivity(
    mockReq({
      auth: { customerId: CUSTOMER_A_ID },
      params: { vendorId: VENDOR_A_ID },
      query: { cursor: firstRes.payload.data.nextCursor },
    }),
    secondRes
  );

  const firstIds = firstRes.payload.data.items.map((row) => row.activityId);
  const secondIds = secondRes.payload.data.items.map((row) => row.activityId);
  assert.equal(secondRes.statusCode, 200);
  assert.equal(secondIds.length, 2);
  assert.equal(secondRes.payload.data.hasMore, false);
  assert.equal(secondRes.payload.data.nextCursor, null);
  assert.deepEqual(firstIds.filter((id) => secondIds.includes(id)), []);
}));

test("reward activity uses _id tie-breaker for equal createdAt timestamps", withMockedRewardModels(async () => {
  const state = {};
  const sharedDate = "2026-09-30T12:00:00.000Z";
  installActivityLedgerRows([
    {
      _id: "692403a24d4d3a1b6a7f0301",
      customerId: CUSTOMER_A_ID,
      vendorId: VENDOR_A_ID,
      type: "EARN",
      points: 1,
      remainingPoints: 1,
      createdAt: sharedDate,
    },
    {
      _id: "692403a24d4d3a1b6a7f0303",
      customerId: CUSTOMER_A_ID,
      vendorId: VENDOR_A_ID,
      type: "REDEEM",
      points: -3,
      createdAt: sharedDate,
    },
    {
      _id: "692403a24d4d3a1b6a7f0302",
      customerId: CUSTOMER_A_ID,
      vendorId: VENDOR_A_ID,
      type: "EARN",
      points: 2,
      remainingPoints: 2,
      createdAt: sharedDate,
    },
  ], state);

  const res = mockRes();
  await rewardsController.getRewardActivity(
    mockReq({
      auth: { customerId: CUSTOMER_A_ID },
      params: { vendorId: VENDOR_A_ID },
      query: { limit: "2" },
    }),
    res
  );

  assert.deepEqual(
    res.payload.data.items.map((row) => row.activityId),
    ["692403a24d4d3a1b6a7f0303", "692403a24d4d3a1b6a7f0302"]
  );

  const secondRes = mockRes();
  await rewardsController.getRewardActivity(
    mockReq({
      auth: { customerId: CUSTOMER_A_ID },
      params: { vendorId: VENDOR_A_ID },
      query: { cursor: res.payload.data.nextCursor, limit: "2" },
    }),
    secondRes
  );

  assert.deepEqual(
    secondRes.payload.data.items.map((row) => row.activityId),
    ["692403a24d4d3a1b6a7f0301"]
  );
}));

test("reward activity endpoint rejects invalid vendor IDs and malformed cursors", withMockedRewardModels(async () => {
  installActivityLedgerRows([]);

  const invalidVendorRes = mockRes();
  await rewardsController.getRewardActivity(
    mockReq({ auth: { customerId: CUSTOMER_A_ID }, params: { vendorId: "bad-vendor" } }),
    invalidVendorRes
  );

  assert.equal(invalidVendorRes.statusCode, 400);

  const invalidCursorRes = mockRes();
  await rewardsController.getRewardActivity(
    mockReq({
      auth: { customerId: CUSTOMER_A_ID },
      params: { vendorId: VENDOR_A_ID },
      query: { cursor: "not-a-valid-cursor" },
    }),
    invalidCursorRes
  );

  assert.equal(invalidCursorRes.statusCode, 400);
}));

test("reward activity endpoint is scoped to authenticated customer and requested vendor", withMockedRewardModels(async () => {
  installActivityLedgerRows([
    {
      _id: "692403a24d4d3a1b6a7f0401",
      customerId: CUSTOMER_A_ID,
      vendorId: VENDOR_A_ID,
      type: "EARN",
      points: 10,
      remainingPoints: 10,
      createdAt: "2026-09-30T12:00:00.000Z",
    },
    {
      _id: "692403a24d4d3a1b6a7f0402",
      customerId: CUSTOMER_B_ID,
      vendorId: VENDOR_A_ID,
      type: "EARN",
      points: 20,
      remainingPoints: 20,
      createdAt: "2026-09-30T13:00:00.000Z",
    },
    {
      _id: "692403a24d4d3a1b6a7f0403",
      customerId: CUSTOMER_A_ID,
      vendorId: VENDOR_B_ID,
      type: "EARN",
      points: 30,
      remainingPoints: 30,
      createdAt: "2026-09-30T14:00:00.000Z",
    },
  ]);

  const res = mockRes();
  await rewardsController.getRewardActivity(
    mockReq({
      auth: { customerId: CUSTOMER_A_ID },
      params: { vendorId: VENDOR_A_ID },
      query: { customerId: CUSTOMER_B_ID },
    }),
    res
  );

  assert.deepEqual(
    res.payload.data.items.map((row) => row.activityId),
    ["692403a24d4d3a1b6a7f0401"]
  );
}));

test("reward activity endpoint maps earn, redeem, and reversal activity types", withMockedRewardModels(async () => {
  installActivityLedgerRows([
    {
      _id: "692403a24d4d3a1b6a7f0501",
      customerId: CUSTOMER_A_ID,
      vendorId: VENDOR_A_ID,
      type: "EARN",
      points: 40,
      remainingPoints: 25,
      expiryDate: "2026-11-01T00:00:00.000Z",
      createdAt: "2026-09-30T15:00:00.000Z",
    },
    {
      _id: "692403a24d4d3a1b6a7f0502",
      customerId: CUSTOMER_A_ID,
      vendorId: VENDOR_A_ID,
      type: "REDEEM",
      points: -15,
      createdAt: "2026-09-30T14:00:00.000Z",
    },
    {
      _id: "692403a24d4d3a1b6a7f0503",
      customerId: CUSTOMER_A_ID,
      vendorId: VENDOR_A_ID,
      type: "EARN_REVERSAL",
      points: -40,
      createdAt: "2026-09-30T13:00:00.000Z",
    },
    {
      _id: "692403a24d4d3a1b6a7f0504",
      customerId: CUSTOMER_A_ID,
      vendorId: VENDOR_A_ID,
      type: "REDEEM_REVERSAL",
      points: 15,
      createdAt: "2026-09-30T12:00:00.000Z",
    },
  ]);

  const res = mockRes();
  await rewardsController.getRewardActivity(
    mockReq({ auth: { customerId: CUSTOMER_A_ID }, params: { vendorId: VENDOR_A_ID } }),
    res
  );

  assert.deepEqual(
    res.payload.data.items.map((row) => row.type),
    ["EARN", "REDEEM", "EARN_REVERSAL", "REDEEM_REVERSAL"]
  );
  assert.deepEqual(
    res.payload.data.items.map((row) => row.signedPoints),
    [40, -15, -40, 15]
  );
  assert.equal(res.payload.data.items[0].remainingPoints, 25);
}));

test("no token is rejected by portal middleware for rewards", async () => {
  const res = mockRes();
  let nextCalled = false;

  await requireCustomerPortalSession(mockReq(), res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test("STANDARD session token is rejected by portal middleware for rewards", async () => {
  const token = jwt.sign(
    {
      customerId: "customer-1",
      sessionId: "session-1",
      sessionType: "STANDARD",
    },
    process.env.JWT_SECRET || "dev_jwt_secret_change_me",
    { expiresIn: "1h" }
  );
  const res = mockRes();
  let nextCalled = false;

  await requireCustomerPortalSession(
    mockReq({ headers: { authorization: `Bearer ${token}` } }),
    res,
    () => {
      nextCalled = true;
    }
  );

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test("valid CUSTOMER_PORTAL session can pass portal middleware", withMockedRewardModels(async () => {
  const token = signCustomerPortalToken({
    customerId: "customer-1",
    sessionId: "session-1",
  });
  Session.findOne = () => ({
    lean: async () => ({
      _id: "session-1",
      userId: "customer-1",
      sessionType: CUSTOMER_PORTAL_SESSION_TYPE,
      isActive: true,
      expiryTime: new Date(Date.now() + 10000),
    }),
  });

  const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
  const res = mockRes();
  let nextCalled = false;

  await requireCustomerPortalSession(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.auth.customerId, "customer-1");
}));

test("expired portal session is rejected and marked inactive", withMockedRewardModels(async () => {
  const updates = [];
  const token = signCustomerPortalToken({
    customerId: "customer-1",
    sessionId: "session-1",
  });
  Session.findOne = () => ({
    lean: async () => ({
      _id: "session-1",
      userId: "customer-1",
      sessionType: CUSTOMER_PORTAL_SESSION_TYPE,
      isActive: true,
      expiryTime: new Date(Date.now() - 1000),
    }),
  });
  Session.updateOne = async (query, update) => {
    updates.push({ query, update });
    return { modifiedCount: 1 };
  };

  const res = mockRes();
  let nextCalled = false;
  await requireCustomerPortalSession(
    mockReq({ headers: { authorization: `Bearer ${token}` } }),
    res,
    () => {
      nextCalled = true;
    }
  );

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(updates[0].query.sessionType, CUSTOMER_PORTAL_SESSION_TYPE);
  assert.equal(updates[0].update.$set.isActive, false);
}));

test("CustomerRewardReveal stores presentation state only with unique customer reward index", () => {
  const CustomerRewardRevealModel = require("../models/CustomerRewardReveal");
  const schema = CustomerRewardRevealModel.schema;

  assert.equal(schema.path("customerId").options.required, true);
  assert.equal(schema.path("vendorId").options.required, true);
  assert.equal(schema.path("rewardLedgerId").options.required, true);
  assert.equal(schema.path("revealedAt").options.required, true);
  assert.equal(schema.path("points"), undefined);
  assert.equal(schema.path("remainingPoints"), undefined);
  assert.equal(schema.path("expiryDate"), undefined);
  assert.equal(schema.path("businessName"), undefined);

  const indexes = schema.indexes();
  assert.ok(
    indexes.some(([fields, options]) =>
      fields.customerId === 1 &&
      fields.rewardLedgerId === 1 &&
      options.unique === true
    )
  );
});

test("missing or invalid scratch launch config exposes no unrevealed rewards", withMockedRewardModels(async () => {
  for (const value of [undefined, "", "not-a-date"]) {
    if (value === undefined) {
      delete process.env.SCRATCH_REVEAL_LAUNCHED_AT;
    } else {
      process.env.SCRATCH_REVEAL_LAUNCHED_AT = value;
    }

    const state = {};
    installLedgerRows([
      {
        _id: REWARD_A_ID,
        vendorId: VENDOR_A_ID,
        type: "EARN",
        points: 40,
        remainingPoints: 40,
        createdAt: "2026-09-28T00:00:00.000Z",
      },
    ], state);
    installVendorRows([
      { _id: VENDOR_A_ID, businessName: "Mona", subdomain: "mona", logoUrl: "logo.png" },
    ], state);
    installEligibleEarnRows([
      {
        _id: REWARD_A_ID,
        vendorId: VENDOR_A_ID,
        type: "EARN",
        points: 40,
        remainingPoints: 40,
        createdAt: "2026-09-28T00:00:00.000Z",
      },
    ], state);

    const res = mockRes();
    await rewardsController.getRewards(
      mockReq({ auth: { customerId: CUSTOMER_A_ID } }),
      res
    );

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.payload.data.unrevealedRewards, []);
    assert.equal(state.aggregatePipeline, undefined);
  }
}));

test("pre-launch EARN is filtered by launch boundary in scratch eligibility", withMockedRewardModels(async () => {
  process.env.SCRATCH_REVEAL_LAUNCHED_AT = "2026-09-20T00:00:00.000Z";
  const state = {};
  installLedgerRows([
    {
      _id: REWARD_A_ID,
      vendorId: VENDOR_A_ID,
      type: "EARN",
      points: 40,
      remainingPoints: 40,
      createdAt: "2026-09-01T00:00:00.000Z",
    },
  ], state);
  installVendorRows([
    { _id: VENDOR_A_ID, businessName: "Mona", subdomain: "mona", logoUrl: "logo.png" },
  ], state);
  installEligibleEarnRows([], state);
  installRevealRows([], state);

  const res = mockRes();
  await rewardsController.getRewards(mockReq({ auth: { customerId: CUSTOMER_A_ID } }), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload.data.unrevealedRewards, []);
  assert.deepEqual(state.aggregatePipeline[0].$match.createdAt, {
    $gte: new Date("2026-09-20T00:00:00.000Z"),
  });
}));

test("post-launch eligible EARN rows appear separately newest first and REDEEM is never queried as scratch", withMockedRewardModels(async () => {
  process.env.SCRATCH_REVEAL_LAUNCHED_AT = "2026-09-20T00:00:00.000Z";
  const state = {};
  installLedgerRows([
    {
      _id: REWARD_A_ID,
      vendorId: VENDOR_A_ID,
      type: "EARN",
      points: 40,
      remainingPoints: 40,
      createdAt: "2026-09-28T00:00:00.000Z",
    },
  ], state);
  installVendorRows([
    { _id: VENDOR_A_ID, businessName: "Mona", subdomain: "mona", logoUrl: "mona.png" },
    { _id: VENDOR_B_ID, businessName: "Reelook", subdomain: "reelook", logoUrl: "reelook.png" },
  ], state);
  installEligibleEarnRows([
    {
      _id: REWARD_C_ID,
      vendorId: VENDOR_A_ID,
      points: 30,
      remainingPoints: 30,
      expiryDate: null,
      createdAt: "2026-09-30T00:00:00.000Z",
    },
    {
      _id: REWARD_B_ID,
      vendorId: VENDOR_B_ID,
      points: 25,
      remainingPoints: 25,
      expiryDate: "2026-11-01T00:00:00.000Z",
      createdAt: "2026-09-29T00:00:00.000Z",
    },
    {
      _id: REWARD_A_ID,
      vendorId: VENDOR_A_ID,
      points: 40,
      remainingPoints: 40,
      expiryDate: "2026-10-01T00:00:00.000Z",
      createdAt: "2026-09-28T00:00:00.000Z",
    },
  ], state);
  installRevealRows([], state);

  const res = mockRes();
  await rewardsController.getRewards(
    mockReq({
      auth: { customerId: CUSTOMER_A_ID },
      query: { customerId: CUSTOMER_B_ID },
      body: { customerId: CUSTOMER_B_ID },
    }),
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(
    res.payload.data.unrevealedRewards.map((row) => row.rewardId),
    [REWARD_C_ID, REWARD_B_ID, REWARD_A_ID]
  );
  assert.deepEqual(
    res.payload.data.unrevealedRewards.map((row) => row.points),
    [30, 25, 40]
  );
  assert.equal(res.payload.data.unrevealedRewards[0].vendor.businessName, "Mona");
  assert.equal(res.payload.data.unrevealedRewards[1].vendor.businessName, "Reelook");
  assert.equal(state.aggregatePipeline[0].$match.type, "EARN");
  assert.deepEqual(state.aggregatePipeline[0].$match.points, { $gt: 0 });
  assert.equal(String(state.aggregatePipeline[0].$match.customerId), CUSTOMER_A_ID);
}));

test("revealed reward disappears but other unrevealed rewards remain", withMockedRewardModels(async () => {
  process.env.SCRATCH_REVEAL_LAUNCHED_AT = "2026-09-20T00:00:00.000Z";
  const state = {};
  installLedgerRows([
    { _id: REWARD_A_ID, vendorId: VENDOR_A_ID, type: "EARN", points: 40, remainingPoints: 40 },
  ], state);
  installVendorRows([
    { _id: VENDOR_A_ID, businessName: "Mona", subdomain: "mona", logoUrl: "" },
  ], state);
  installEligibleEarnRows([
    { _id: REWARD_A_ID, vendorId: VENDOR_A_ID, points: 40, remainingPoints: 40 },
    { _id: REWARD_B_ID, vendorId: VENDOR_A_ID, points: 25, remainingPoints: 25 },
  ], state);
  installRevealRows([{ rewardLedgerId: REWARD_A_ID }], state);

  const res = mockRes();
  await rewardsController.getRewards(mockReq({ auth: { customerId: CUSTOMER_A_ID } }), res);

  assert.deepEqual(
    res.payload.data.unrevealedRewards.map((row) => row.rewardId),
    [REWARD_B_ID]
  );
}));

test("valid customer can reveal own eligible reward and response uses authoritative balance", withMockedRewardModels(async () => {
  process.env.SCRATCH_REVEAL_LAUNCHED_AT = "2026-09-20T00:00:00.000Z";
  const state = {};
  const revealDate = new Date("2026-09-30T12:00:00.000Z");

  installEligibleEarnRows([
    {
      _id: REWARD_A_ID,
      customerId: CUSTOMER_A_ID,
      vendorId: VENDOR_A_ID,
      type: "EARN",
      points: 100,
      remainingPoints: 0,
      expiryDate: "2026-11-01T00:00:00.000Z",
      createdAt: "2026-09-30T00:00:00.000Z",
    },
  ], state);
  installVendorById(
    { _id: VENDOR_A_ID, businessName: "Mona", subdomain: "mona", logoUrl: "mona.png" },
    state
  );
  installLedgerRows([
    {
      vendorId: VENDOR_A_ID,
      type: "EARN",
      points: 100,
      remainingPoints: 30,
      expiryDate: "2026-11-01T00:00:00.000Z",
    },
  ], state);

  CustomerRewardReveal.findOneAndUpdate = async (query, update, options) => {
    state.revealUpsert = { query, update, options };
    return {
      customerId: query.customerId,
      rewardLedgerId: query.rewardLedgerId,
      vendorId: VENDOR_A_ID,
      revealedAt: revealDate,
    };
  };

  const res = mockRes();
  await rewardsController.revealReward(
    mockReq({
      auth: { customerId: CUSTOMER_A_ID },
      params: { rewardId: REWARD_A_ID },
      body: { customerId: CUSTOMER_B_ID, vendorId: VENDOR_B_ID },
    }),
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.success, true);
  assert.equal(res.payload.data.rewardId, REWARD_A_ID);
  assert.equal(res.payload.data.revealed, true);
  assert.equal(res.payload.data.points, 100);
  assert.equal(res.payload.data.remainingPoints, 0);
  assert.equal(res.payload.data.availablePoints, 30);
  assert.equal(res.payload.data.vendor.businessName, "Mona");
  assert.equal(String(state.aggregatePipeline[0].$match.customerId), CUSTOMER_A_ID);
  assert.equal(String(state.revealUpsert.query.customerId), CUSTOMER_A_ID);
  assert.equal(String(state.revealUpsert.query.rewardLedgerId), REWARD_A_ID);
  assert.equal(state.revealUpsert.options.upsert, true);
  assert.equal(state.revealUpsert.options.new, true);
}));

test("customer cannot reveal another customer's reward or nonexistent/invalid rewards", withMockedRewardModels(async () => {
  process.env.SCRATCH_REVEAL_LAUNCHED_AT = "2026-09-20T00:00:00.000Z";
  const state = {};
  installEligibleEarnRows([], state);

  for (const rewardId of [REWARD_B_ID, "not-an-object-id"]) {
    const res = mockRes();
    await rewardsController.revealReward(
      mockReq({
        auth: { customerId: CUSTOMER_A_ID },
        params: { rewardId },
        body: { customerId: CUSTOMER_B_ID },
      }),
      res
    );

    assert.equal(res.statusCode, 404);
    assert.equal(res.payload.success, false);
  }
}));

test("historical pre-launch and REDEEM rewardIds cannot be revealed", withMockedRewardModels(async () => {
  process.env.SCRATCH_REVEAL_LAUNCHED_AT = "2026-09-20T00:00:00.000Z";
  const state = {};
  installEligibleEarnRows([], state);

  const res = mockRes();
  await rewardsController.revealReward(
    mockReq({ auth: { customerId: CUSTOMER_A_ID }, params: { rewardId: REWARD_A_ID } }),
    res
  );

  assert.equal(res.statusCode, 404);
  assert.equal(state.aggregatePipeline[0].$match.type, "EARN");
  assert.deepEqual(state.aggregatePipeline[0].$match.createdAt, {
    $gte: new Date("2026-09-20T00:00:00.000Z"),
  });
}));

test("reveal is idempotent and duplicate-key race falls back to existing reveal", withMockedRewardModels(async () => {
  process.env.SCRATCH_REVEAL_LAUNCHED_AT = "2026-09-20T00:00:00.000Z";
  const state = {};
  const revealedAt = new Date("2026-09-30T12:00:00.000Z");

  installEligibleEarnRows([
    {
      _id: REWARD_A_ID,
      vendorId: VENDOR_A_ID,
      points: 40,
      remainingPoints: 40,
      createdAt: "2026-09-30T00:00:00.000Z",
    },
  ], state);
  installVendorById({ _id: VENDOR_A_ID, businessName: "Mona" }, state);
  installLedgerRows([
    { vendorId: VENDOR_A_ID, type: "EARN", points: 40, remainingPoints: 40 },
  ], state);

  CustomerRewardReveal.findOneAndUpdate = async () => {
    const err = new Error("duplicate");
    err.code = 11000;
    throw err;
  };
  CustomerRewardReveal.findOne = async (query) => {
    state.revealFindOne = query;
    return { ...query, vendorId: VENDOR_A_ID, revealedAt };
  };

  const res = mockRes();
  await rewardsController.revealReward(
    mockReq({ auth: { customerId: CUSTOMER_A_ID }, params: { rewardId: REWARD_A_ID } }),
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.data.revealed, true);
  assert.equal(res.payload.data.revealedAt, revealedAt);
  assert.equal(String(state.revealFindOne.customerId), CUSTOMER_A_ID);
  assert.equal(String(state.revealFindOne.rewardLedgerId), REWARD_A_ID);
}));

test("customer portal rewards code does not modify loyalty or billing behavior", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../controllers/customerPortalRewardsController.js"),
    "utf8"
  );

  assert.doesNotMatch(source, /LoyaltyLedger\.create|LoyaltyLedger\.updateOne|LoyaltyLedger\.findOneAndUpdate|LoyaltyLedger\.deleteOne/);
  assert.doesNotMatch(source, /BillingSession|Transaction|deductOTP|deductWhatsApp/);
});
