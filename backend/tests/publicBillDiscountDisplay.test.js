const assert = require("node:assert");
const test = require("node:test");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const BillingSession = require("../models/BillingSession");
const Transaction = require("../models/Transaction");
const Vendor = require("../models/DummyVendor");
const billingController = require("../controllers/billingController");

const BILL_ID = "6aacc888dac53725ac8225c4";
const VENDOR_ID = "692403a24d4d3a1b6a7f0ae5";
const BILL_LINK_SECRET = process.env.BILL_LINK_SECRET || process.env.JWT_SECRET || "dev_jwt_secret_change_me";

function mockReq({ params = {}, query = {} } = {}) {
  return { params, query };
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

function buildBill(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(BILL_ID),
    vendorId: new mongoose.Types.ObjectId(VENDOR_ID),
    customerId: null,
    billingMode: "WALK_IN",
    status: "COMPLETED",
    totalAmount: 800,
    grossAmount: 1000,
    discountAmount: 200,
    pointsEarned: 0,
    pointsRedeemed: 0,
    createdAt: new Date("2026-10-10T05:00:00.000Z"),
    cartItems: [
      {
        name: "Hair Cut",
        qty: 1,
        price: 800,
        total: 800,
      },
    ],
    ...overrides,
  };
}

function buildTransaction(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId("6aacc888dac53725ac8225c5"),
    billingSessionId: new mongoose.Types.ObjectId(BILL_ID),
    totalAmount: 800,
    grossAmount: 1000,
    discountAmount: 200,
    redeemedPoints: 0,
    redeemValue: 0,
    finalPaidAmount: 800,
    ...overrides,
  };
}

function installPublicBillMocks({ bill, transaction = null, code = "" }) {
  BillingSession.findById = (id) => ({
    lean: async () => (String(id) === String(bill._id) ? bill : null),
  });
  BillingSession.findOne = (query) => ({
    select() {
      return this;
    },
    lean: async () =>
      code && query?.publicAccessCode === code
        ? { _id: bill._id }
        : null,
  });
  Transaction.findOne = (query) => ({
    lean: async () =>
      String(query?.billingSessionId || "") === String(bill._id) ? transaction : null,
  });
  Vendor.findById = (id) => ({
    lean: async () =>
      String(id) === String(bill.vendorId)
        ? {
            _id: bill.vendorId,
            businessName: "Test Salon",
            phone: "919999999999",
          }
        : null,
  });
}

async function withMockedPublicBillModels(options, fn) {
  const originals = {
    billingFindById: BillingSession.findById,
    billingFindOne: BillingSession.findOne,
    transactionFindOne: Transaction.findOne,
    vendorFindById: Vendor.findById,
  };

  try {
    installPublicBillMocks(options);
    await fn();
  } finally {
    BillingSession.findById = originals.billingFindById;
    BillingSession.findOne = originals.billingFindOne;
    Transaction.findOne = originals.transactionFindOne;
    Vendor.findById = originals.vendorFindById;
  }
}

function publicBillToken() {
  return jwt.sign({ scope: "bill_link", billingId: BILL_ID }, BILL_LINK_SECRET);
}

test("public bill totals expose persisted discount fields", async () => {
  const bill = buildBill();
  const transaction = buildTransaction();

  await withMockedPublicBillModels({ bill, transaction }, async () => {
    const res = mockRes();
    await billingController.getPublicBillDetails(
      mockReq({ params: { id: BILL_ID }, query: { token: publicBillToken() } }),
      res
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.data.totals.grossAmount, 1000);
    assert.equal(res.payload.data.totals.discountAmount, 200);
    assert.equal(res.payload.data.totals.netBillValue, 800);
    assert.equal(res.payload.data.totals.rewardsRedeemed, 0);
    assert.equal(res.payload.data.totals.finalPaid, 800);
    assert.equal(res.payload.data.totals.billAmount, 800);
    assert.equal(res.payload.data.totals.pointsEarned, 0);
    assert.equal(res.payload.data.totals.pointsRedeemed, 0);
  });
});

test("public bill without discount keeps zero discount and existing amounts", async () => {
  const bill = buildBill({
    totalAmount: 700,
    grossAmount: 700,
    discountAmount: 0,
  });
  const transaction = buildTransaction({
    totalAmount: 700,
    grossAmount: 700,
    discountAmount: 0,
    finalPaidAmount: 700,
  });

  await withMockedPublicBillModels({ bill, transaction }, async () => {
    const res = mockRes();
    await billingController.getPublicBillDetails(
      mockReq({ params: { id: BILL_ID }, query: { token: publicBillToken() } }),
      res
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.data.totals.grossAmount, 700);
    assert.equal(res.payload.data.totals.discountAmount, 0);
    assert.equal(res.payload.data.totals.netBillValue, 700);
    assert.equal(res.payload.data.totals.finalPaid, 700);
  });
});

test("public bill with discount and reward redemption uses Transaction final paid", async () => {
  const bill = buildBill({
    totalAmount: 800,
    grossAmount: 1000,
    discountAmount: 200,
    pointsRedeemed: 300,
  });
  const transaction = buildTransaction({
    redeemValue: 300,
    redeemedPoints: 300,
    finalPaidAmount: 500,
  });

  await withMockedPublicBillModels({ bill, transaction }, async () => {
    const res = mockRes();
    await billingController.getPublicBillDetails(
      mockReq({ params: { id: BILL_ID }, query: { token: publicBillToken() } }),
      res
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.data.totals.grossAmount, 1000);
    assert.equal(res.payload.data.totals.discountAmount, 200);
    assert.equal(res.payload.data.totals.netBillValue, 800);
    assert.equal(res.payload.data.totals.rewardsRedeemed, 300);
    assert.equal(res.payload.data.totals.pointsRedeemed, 300);
    assert.equal(res.payload.data.totals.finalPaid, 500);
  });
});

test("public bill without Transaction falls back safely for historical records", async () => {
  const bill = buildBill({
    totalAmount: 900,
    pointsRedeemed: 50,
    grossAmount: undefined,
    discountAmount: undefined,
  });

  await withMockedPublicBillModels({ bill, transaction: null }, async () => {
    const res = mockRes();
    await billingController.getPublicBillDetails(
      mockReq({ params: { id: BILL_ID }, query: { token: publicBillToken() } }),
      res
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.data.totals.grossAmount, 900);
    assert.equal(res.payload.data.totals.discountAmount, 0);
    assert.equal(res.payload.data.totals.netBillValue, 900);
    assert.equal(res.payload.data.totals.rewardsRedeemed, 50);
    assert.equal(res.payload.data.totals.finalPaid, 850);
  });
});

test("short-code public bill link returns the same financial totals", async () => {
  const bill = buildBill();
  const transaction = buildTransaction();

  await withMockedPublicBillModels({ bill, transaction, code: "abc123" }, async () => {
    const res = mockRes();
    await billingController.getPublicBillDetailsByCode(
      mockReq({ params: { code: "abc123" } }),
      res
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.data.totals.grossAmount, 1000);
    assert.equal(res.payload.data.totals.discountAmount, 200);
    assert.equal(res.payload.data.totals.netBillValue, 800);
    assert.equal(res.payload.data.totals.finalPaid, 800);
    assert.equal(res.payload.data.vendor.businessName, "Test Salon");
    assert.equal(res.payload.data.items[0].name, "Hair Cut");
  });
});
