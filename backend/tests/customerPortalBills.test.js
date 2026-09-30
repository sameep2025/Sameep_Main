const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const BillingSession = require("../models/BillingSession");
const Transaction = require("../models/Transaction");
const Vendor = require("../models/DummyVendor");
const billsController = require("../controllers/customerPortalBillsController");
const {
  CUSTOMER_PORTAL_SESSION_TYPE,
  requireCustomerPortalSession,
  signCustomerPortalToken,
} = require("../utils/customerPortalAuth");
const Session = require("../models/Session");

function oid(hex) {
  return new mongoose.Types.ObjectId(hex);
}

function mockReq({ auth = null, headers = {}, query = {}, params = {}, body = {} } = {}) {
  return { auth, headers, query, params, body };
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

function withMockedBillModels(fn) {
  return async () => {
    const originals = {
      billingFind: BillingSession.find,
      billingFindOne: BillingSession.findOne,
      transactionFind: Transaction.find,
      transactionFindOne: Transaction.findOne,
      vendorFind: Vendor.find,
      vendorFindById: Vendor.findById,
      sessionFindOne: Session.findOne,
      sessionUpdateOne: Session.updateOne,
    };

    try {
      await fn();
    } finally {
      BillingSession.find = originals.billingFind;
      BillingSession.findOne = originals.billingFindOne;
      Transaction.find = originals.transactionFind;
      Transaction.findOne = originals.transactionFindOne;
      Vendor.find = originals.vendorFind;
      Vendor.findById = originals.vendorFindById;
      Session.findOne = originals.sessionFindOne;
      Session.updateOne = originals.sessionUpdateOne;
    }
  };
}

function installBillRows(rows, state = {}) {
  BillingSession.find = (query) => {
    state.billQuery = query;
    return {
      sort(sortSpec) {
        state.billSort = sortSpec;
        return this;
      },
      limit(limitValue) {
        state.billLimit = limitValue;
        return this;
      },
      lean: async () => rows,
    };
  };
}

function installTransactions(rows, state = {}) {
  Transaction.find = (query) => {
    state.transactionQuery = query;
    return {
      lean: async () => rows,
    };
  };
}

function installVendors(rows, state = {}) {
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

test("bill financials follow established revenue reconciliation semantics", () => {
  const financials = billsController.buildBillFinancials(
    {
      totalAmount: 900,
      grossAmount: 1000,
      discountAmount: 100,
      pointsRedeemed: 50,
    },
    {
      redeemValue: 50,
      finalPaidAmount: 850,
    }
  );

  assert.equal(financials.billValue, 1000);
  assert.equal(financials.discountAmount, 100);
  assert.equal(financials.rewardsRedeemed, 50);
  assert.equal(financials.netCollected, 850);
  assert.equal(financials.billValue - financials.discountAmount - financials.rewardsRedeemed, financials.netCollected);
});

test("historical bill without gross or discount falls back safely", () => {
  const financials = billsController.buildBillFinancials(
    {
      totalAmount: 700,
      pointsRedeemed: 25,
    },
    null
  );

  assert.equal(financials.billValue, 700);
  assert.equal(financials.discountAmount, 0);
  assert.equal(financials.rewardsRedeemed, 25);
  assert.equal(financials.netCollected, 675);
  assert.equal(financials.financialSnapshotAvailable, false);
});

test("normal, discount, rewards, and discount-plus-rewards bills reconcile correctly", () => {
  const cases = [
    {
      name: "normal",
      bill: { totalAmount: 1000, grossAmount: 1000, discountAmount: 0, pointsRedeemed: 0 },
      transaction: { redeemValue: 0, finalPaidAmount: 1000 },
    },
    {
      name: "discount",
      bill: { totalAmount: 800, grossAmount: 1000, discountAmount: 200, pointsRedeemed: 0 },
      transaction: { redeemValue: 0, finalPaidAmount: 800 },
    },
    {
      name: "rewards",
      bill: { totalAmount: 1000, grossAmount: 1000, discountAmount: 0, pointsRedeemed: 300 },
      transaction: { redeemValue: 300, finalPaidAmount: 700 },
    },
    {
      name: "discount plus rewards",
      bill: { totalAmount: 800, grossAmount: 1000, discountAmount: 200, pointsRedeemed: 300 },
      transaction: { redeemValue: 300, finalPaidAmount: 500 },
    },
  ];

  cases.forEach(({ name, bill, transaction }) => {
    const financials = billsController.buildBillFinancials(bill, transaction);
    assert.equal(
      financials.billValue - financials.discountAmount - financials.rewardsRedeemed,
      financials.netCollected,
      name
    );
  });
});

test("authenticated customer with no completed bills returns empty history", withMockedBillModels(async () => {
  const state = {};
  installBillRows([], state);
  installTransactions([], state);
  installVendors([], state);

  const res = mockRes();
  await billsController.getBills(
    mockReq({ auth: { customerId: "692900000000000000000001" }, query: {} }),
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(state.billQuery, {
    customerId: "692900000000000000000001",
    status: "COMPLETED",
  });
  assert.deepEqual(state.billSort, { createdAt: -1, _id: -1 });
  assert.equal(state.billLimit, 21);
  assert.deepEqual(res.payload, {
    success: true,
    data: {
      bills: [],
      pagination: {
        hasMore: false,
        nextCursor: null,
        limit: 20,
      },
    },
  });
}));

test("multi-vendor bill list associates each bill with the correct vendor display", withMockedBillModels(async () => {
  const vendorOne = oid("692900000000000000000091");
  const vendorTwo = oid("692900000000000000000092");
  installBillRows([
    {
      _id: oid("692900000000000000000093"),
      vendorId: vendorOne,
      createdAt: new Date("2026-09-28T08:00:00.000Z"),
      totalAmount: 100,
      paymentMode: "ONLINE",
    },
    {
      _id: oid("692900000000000000000094"),
      vendorId: vendorTwo,
      createdAt: new Date("2026-09-27T08:00:00.000Z"),
      totalAmount: 200,
      paymentMode: "CASH",
    },
  ]);
  installTransactions([]);
  installVendors([
    { _id: vendorOne, businessName: "A Salon", subdomain: "a-salon", logoUrl: "a.png" },
    { _id: vendorTwo, businessName: "B Salon", subdomain: "b-salon", logoUrl: "b.png" },
  ]);

  const res = mockRes();
  await billsController.getBills(
    mockReq({ auth: { customerId: "692900000000000000000001" } }),
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload.data.bills.map((bill) => bill.vendor.businessName), [
    "A Salon",
    "B Salon",
  ]);
}));

test("bill list returns newest-first page with batched transaction and vendor enrichment", withMockedBillModels(async () => {
  const state = {};
  const billId = oid("692900000000000000000011");
  const vendorId = oid("692900000000000000000021");
  installBillRows([
    {
      _id: billId,
      vendorId,
      customerId: oid("692900000000000000000001"),
      status: "COMPLETED",
      createdAt: new Date("2026-09-28T08:00:00.000Z"),
      totalAmount: 900,
      grossAmount: 1000,
      discountAmount: 100,
      pointsRedeemed: 50,
      paymentMode: "CASH",
    },
  ], state);
  installTransactions([
    {
      billingSessionId: billId,
      redeemValue: 50,
      finalPaidAmount: 850,
      paymentMode: "CASH",
    },
  ], state);
  installVendors([
    {
      _id: vendorId,
      businessName: "Reelook Beauty Saloon",
      subdomain: "reelook",
      logoUrl: "logo.png",
      phone: "private",
    },
  ], state);

  const res = mockRes();
  await billsController.getBills(
    mockReq({
      auth: { customerId: "692900000000000000000001" },
      query: { limit: "10", customerId: "attacker" },
    }),
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(state.billQuery, {
    customerId: "692900000000000000000001",
    status: "COMPLETED",
  });
  assert.deepEqual(state.transactionQuery, { billingSessionId: { $in: [billId] } });
  assert.deepEqual(state.vendorQuery, { _id: { $in: [String(vendorId)] } });
  assert.equal(state.vendorSelect, "businessName subdomain logoUrl location.address");
  assert.deepEqual(res.payload.data.bills[0], {
    billId: String(billId),
    date: new Date("2026-09-28T08:00:00.000Z"),
    vendor: {
      businessName: "Reelook Beauty Saloon",
      subdomain: "reelook",
      logoUrl: "logo.png",
    },
    billValue: 1000,
    discountAmount: 100,
    rewardsRedeemed: 50,
    netCollected: 850,
    paymentMode: "CASH",
    financialSnapshotAvailable: true,
  });
}));

test("bill list pagination returns next cursor and applies cursor filter", withMockedBillModels(async () => {
  const state = {};
  const first = {
    _id: oid("692900000000000000000031"),
    vendorId: oid("692900000000000000000041"),
    createdAt: new Date("2026-09-28T08:00:00.000Z"),
    totalAmount: 100,
    status: "COMPLETED",
  };
  const second = {
    _id: oid("692900000000000000000032"),
    vendorId: oid("692900000000000000000041"),
    createdAt: new Date("2026-09-27T08:00:00.000Z"),
    totalAmount: 90,
    status: "COMPLETED",
  };
  const third = {
    _id: oid("692900000000000000000033"),
    vendorId: oid("692900000000000000000041"),
    createdAt: new Date("2026-09-26T08:00:00.000Z"),
    totalAmount: 80,
    status: "COMPLETED",
  };

  installBillRows([first, second, third], state);
  installTransactions([], state);
  installVendors([], state);

  const res = mockRes();
  await billsController.getBills(
    mockReq({ auth: { customerId: "692900000000000000000001" }, query: { limit: "2" } }),
    res
  );

  assert.equal(res.payload.data.bills.length, 2);
  assert.equal(res.payload.data.pagination.hasMore, true);
  assert.ok(res.payload.data.pagination.nextCursor);

  const decoded = billsController.decodeCursor(res.payload.data.pagination.nextCursor);
  assert.equal(decoded.createdAt.toISOString(), second.createdAt.toISOString());
  assert.equal(String(decoded.id), String(second._id));

  const secondState = {};
  installBillRows([], secondState);
  installTransactions([], secondState);
  installVendors([], secondState);
  const res2 = mockRes();
  await billsController.getBills(
    mockReq({
      auth: { customerId: "692900000000000000000001" },
      query: { cursor: res.payload.data.pagination.nextCursor },
    }),
    res2
  );

  assert.equal(res2.statusCode, 200);
  assert.equal(secondState.billQuery.status, "COMPLETED");
  assert.equal(secondState.billQuery.customerId, "692900000000000000000001");
  assert.ok(secondState.billQuery.$or);
}));

test("invalid cursor is rejected without dropping customer/status filters", withMockedBillModels(async () => {
  const state = {};
  installBillRows([], state);

  const res = mockRes();
  await billsController.getBills(
    mockReq({
      auth: { customerId: "692900000000000000000001" },
      query: { cursor: "not-a-valid-cursor" },
    }),
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(state.billQuery, undefined);
}));

test("limit is capped at max page size", withMockedBillModels(async () => {
  const state = {};
  installBillRows([], state);
  installTransactions([], state);
  installVendors([], state);

  const res = mockRes();
  await billsController.getBills(
    mockReq({ auth: { customerId: "692900000000000000000001" }, query: { limit: "500" } }),
    res
  );

  assert.equal(state.billLimit, billsController.MAX_BILL_LIMIT + 1);
  assert.equal(res.payload.data.pagination.limit, billsController.MAX_BILL_LIMIT);
}));

test("bill detail enforces authenticated ownership and completed status", withMockedBillModels(async () => {
  const state = {};
  const billId = oid("692900000000000000000051");
  BillingSession.findOne = (query) => {
    state.detailQuery = query;
    return {
      lean: async () => null,
    };
  };

  const res = mockRes();
  await billsController.getBillDetail(
    mockReq({
      auth: { customerId: "692900000000000000000001" },
      params: { billIdentifier: String(billId) },
      query: { customerId: "attacker", publicAccessCode: "public" },
    }),
    res
  );

  assert.equal(res.statusCode, 404);
  assert.deepEqual(state.detailQuery, {
    _id: String(billId),
    customerId: "692900000000000000000001",
    status: "COMPLETED",
  });
}));

test("bill detail returns customer-safe completed bill data", withMockedBillModels(async () => {
  const billId = oid("692900000000000000000061");
  const vendorId = oid("692900000000000000000062");
  BillingSession.findOne = () => ({
    lean: async () => ({
      _id: billId,
      vendorId,
      customerId: oid("692900000000000000000001"),
      status: "COMPLETED",
      createdAt: new Date("2026-09-28T08:00:00.000Z"),
      cartItems: [
        { name: "Hair Cut", qty: 2, price: 300, total: 600, resourceName: "Priya" },
      ],
      totalAmount: 800,
      grossAmount: 1000,
      discountAmount: 200,
      pointsRedeemed: 100,
      pointsEarned: 16,
      paymentMode: "ONLINE",
      publicAccessCode: "hidden",
    }),
  });
  Transaction.findOne = () => ({
    lean: async () => ({
      billingSessionId: billId,
      redeemValue: 100,
      finalPaidAmount: 700,
      paymentMode: "ONLINE",
    }),
  });
  Vendor.findById = () => ({
    select(selectSpec) {
      assert.equal(selectSpec, "businessName subdomain logoUrl location.address");
      return this;
    },
    lean: async () => ({
      _id: vendorId,
      businessName: "Mona Makeover",
      subdomain: "monamakeovers",
      logoUrl: "logo.png",
      location: { address: "Public address" },
      whatsappBusiness: { token: "hidden" },
    }),
  });

  const res = mockRes();
  await billsController.getBillDetail(
    mockReq({
      auth: { customerId: "692900000000000000000001" },
      params: { billIdentifier: String(billId) },
    }),
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload.data.bill, {
    billId: String(billId),
    date: new Date("2026-09-28T08:00:00.000Z"),
    vendor: {
      businessName: "Mona Makeover",
      subdomain: "monamakeovers",
      logoUrl: "logo.png",
      address: "Public address",
    },
    customer: {
      type: "CUSTOMER",
    },
    items: [
      {
        name: "Hair Cut",
        quantity: 2,
        unitPrice: 300,
        itemTotal: 600,
        staffName: "Priya",
      },
    ],
    billValue: 1000,
    discountAmount: 200,
    rewardsRedeemed: 100,
    netCollected: 700,
    grossAmount: 1000,
    netBillValue: 800,
    paymentMode: "ONLINE",
    pointsEarned: 16,
    pointsRedeemed: 100,
    financialSnapshotAvailable: true,
    transactionMissing: false,
  });
  assert.equal(JSON.stringify(res.payload).includes("publicAccessCode"), false);
  assert.equal(JSON.stringify(res.payload).includes("whatsappBusiness"), false);
  assert.equal(JSON.stringify(res.payload).includes("resourceId"), false);
  assert.equal(JSON.stringify(res.payload).includes("resourceName"), false);
}));

test("bill detail hides stylist field when no historical staff was recorded", () => {
  const bill = billsController.buildBillDetail({
    _id: oid("692900000000000000000071"),
    vendorId: oid("692900000000000000000072"),
    customerId: oid("692900000000000000000001"),
    status: "COMPLETED",
    cartItems: [
      { name: "Hair Spa", qty: 1, price: 500, total: 500, resourceName: "" },
      { name: "Hair Wash", qty: 1, price: 200, total: 200 },
    ],
    totalAmount: 700,
    pointsRedeemed: 0,
  });

  assert.equal("staffName" in bill.items[0], false);
  assert.equal("staffName" in bill.items[1], false);
});

test("non-completed or another customer's bill identifier alone does not grant access", withMockedBillModels(async () => {
  BillingSession.findOne = () => ({
    lean: async () => null,
  });

  const res = mockRes();
  await billsController.getBillDetail(
    mockReq({
      auth: { customerId: "692900000000000000000001" },
      params: { billIdentifier: "692900000000000000000071" },
    }),
    res
  );

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.payload, {
    success: false,
    message: "Bill not found",
  });
}));

test("missing vendor still leaves historical bill visible with safe fallback", () => {
  const bill = billsController.buildBillListItem(
    {
      _id: oid("692900000000000000000081"),
      createdAt: new Date("2026-09-28T08:00:00.000Z"),
      totalAmount: 500,
      paymentMode: "CASH",
    },
    { transaction: null, vendor: null }
  );

  assert.deepEqual(bill.vendor, {
    businessName: "Unknown Business",
    subdomain: "",
    logoUrl: "",
  });
  assert.equal(Object.prototype.hasOwnProperty.call(bill, "vendorId"), false);
});

test("customer portal bill routes require portal session middleware", () => {
  const routeSource = fs.readFileSync(
    path.join(__dirname, "../routes/customerPortalRoutes.js"),
    "utf8"
  );

  assert.match(routeSource, /router\.get\("\/bills", requireCustomerPortalSession, customerPortalBillsController\.getBills\)/);
  assert.match(routeSource, /router\.get\("\/bills\/:billIdentifier", requireCustomerPortalSession, customerPortalBillsController\.getBillDetail\)/);
});

test("no token is rejected by portal middleware for bills", async () => {
  const res = mockRes();
  let nextCalled = false;

  await requireCustomerPortalSession(mockReq(), res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test("STANDARD session token is rejected by portal middleware for bills", async () => {
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

test("valid CUSTOMER_PORTAL session can pass portal middleware for bills", withMockedBillModels(async () => {
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

test("expired portal session is rejected and marked inactive for bills", withMockedBillModels(async () => {
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

test("customer portal bills code does not modify billing, rewards, public links, or messaging behavior", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../controllers/customerPortalBillsController.js"),
    "utf8"
  );

  assert.doesNotMatch(source, /BillingSession\.create|updateOne|findOneAndUpdate|deleteOne/);
  assert.doesNotMatch(source, /Transaction\.create|updateOne|findOneAndUpdate|deleteOne/);
  assert.doesNotMatch(source, /LoyaltyLedger|sendBillWhatsapp|Meta|MSG91|publicAccessCode/);
});
