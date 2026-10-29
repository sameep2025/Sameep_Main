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

function buildGstSnapshot(documentMode = "TEST") {
  const nonTax = documentMode === "NON_TAX_INVOICE";
  return {
    schemaVersion: 1,
    documentMode,
    invoiceNumber: nonTax ? "NTI/dac53725ac82" : "GST/26-27/00001",
    financialYear: "26-27",
    invoiceIssueDate: new Date("2026-10-29T06:23:33.373Z"),
    supplier: {
      gstin: "36ABCDE1234F1Z5",
      legalName: "Test Salon Legal Name",
      registeredAddress: "Hyderabad, Telangana",
      registeredStateCode: "36",
    },
    placeOfSupply: { stateCode: "36", supplyType: "intrastate" },
    pricingMode: "inclusive",
    complianceWarnings: nonTax ? [{
      code: "classification_missing",
      message: "Add a valid SAC before issuing a GST tax invoice.",
      itemName: "Boy Hair Cut",
      classificationType: "SAC",
    }] : [],
    items: [{
      name: "Boy Hair Cut",
      quantity: 1,
      itemType: "SERVICE",
      sac: nonTax ? "" : "999723",
      hsn: "",
      gstRateBps: 500,
      unitPricePaise: 10000,
      grossAmountPaise: 10000,
      membershipDiscountPaise: 0,
      manualDiscountPaise: 0,
      totalDiscountPaise: 0,
      taxableValuePaise: 9524,
      cgstPaise: 238,
      sgstPaise: 238,
      utgstPaise: 0,
      igstPaise: 0,
      totalGstPaise: 476,
      invoiceTotalPaise: 10000,
    }],
    totals: {
      grossAmountPaise: 10000,
      membershipDiscountPaise: 0,
      manualDiscountPaise: 0,
      totalDiscountPaise: 0,
      taxableValuePaise: 9524,
      cgstPaise: 238,
      sgstPaise: 238,
      utgstPaise: 0,
      igstPaise: 0,
      totalGstPaise: 476,
      invoiceTotalPaise: 10000,
      loyaltyRedemptionPaise: 0,
      customerPayablePaise: 10000,
    },
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

test("public bill exposes persisted membership and line discount breakdown", async () => {
  const bill = buildBill({
    totalAmount: 988,
    grossAmount: 1100,
    discountAmount: 112,
    membershipDiscountAmount: 60,
    additionalManualDiscountAmount: 52,
    manualDiscountMode: "percent",
    manualDiscountPercent: 5,
    pointsEarned: 49,
    cartItems: [
      {
        itemId: new mongoose.Types.ObjectId(),
        name: "Relax",
        qty: 1,
        price: 600,
        total: 600,
        finalLineAmount: 513,
        membershipEligible: true,
        membershipDiscountApplied: true,
        membershipDiscountAmount: 60,
        manualDiscountEligible: true,
        manualDiscountAmount: 27,
        resourceName: "Stylist A",
        nodePath: ["Services", "Hair"],
      },
      {
        itemId: new mongoose.Types.ObjectId(),
        name: "Hair Fall Treat (Omega)",
        qty: 1,
        price: 500,
        total: 500,
        finalLineAmount: 475,
        membershipEligible: false,
        membershipDiscountApplied: false,
        membershipDiscountAmount: 0,
        manualDiscountEligible: true,
        manualDiscountAmount: 25,
        resourceName: "Stylist B",
      },
    ],
    membershipBillingSnapshot: {
      planName: "Silver Plan",
      discountPercentage: 10,
      membershipPlanId: new mongoose.Types.ObjectId(),
      customerMembershipId: new mongoose.Types.ObjectId(),
    },
  });
  const transaction = buildTransaction({
    totalAmount: 988,
    grossAmount: 1100,
    discountAmount: 112,
    membershipDiscountAmount: 60,
    additionalManualDiscountAmount: 52,
    redeemValue: 0,
    redeemedPoints: 0,
    finalPaidAmount: 988,
    membershipBillingSnapshot: bill.membershipBillingSnapshot,
  });

  await withMockedPublicBillModels({ bill, transaction }, async () => {
    const res = mockRes();
    await billingController.getPublicBillDetails(
      mockReq({ params: { id: BILL_ID }, query: { token: publicBillToken() } }),
      res
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.data.totals.grossAmount, 1100);
    assert.equal(res.payload.data.totals.membershipDiscountAmount, 60);
    assert.equal(res.payload.data.totals.additionalManualDiscountAmount, 52);
    assert.equal(res.payload.data.totals.manualDiscountPercent, 5);
    assert.equal(res.payload.data.totals.totalSavings, 112);
    assert.equal(res.payload.data.totals.netBillValue, 988);
    assert.equal(res.payload.data.totals.finalPaid, 988);
    assert.equal(res.payload.data.totals.pointsEarned, 49);
    assert.equal(res.payload.data.membership.planName, "Silver Plan");
    assert.equal(res.payload.data.membership.discountPercentage, 10);
    assert.equal(res.payload.data.items[0].membershipDiscountAmount, 60);
    assert.equal(res.payload.data.items[0].manualDiscountAmount, 27);
    assert.equal(res.payload.data.items[0].finalLineAmount, 513);
    assert.equal(res.payload.data.items[1].manualDiscountAmount, 25);
    assert.equal(res.payload.data.items[1].finalLineAmount, 475);
  });
});

test("public bill derives membership breakdown from persisted item allocations when top-level fields are absent", async () => {
  const membershipBillingSnapshot = {
    planName: "Silver Plan",
    discountPercentage: 10,
    membershipPlanId: new mongoose.Types.ObjectId(),
    customerMembershipId: new mongoose.Types.ObjectId(),
  };
  const bill = buildBill({
    totalAmount: 988,
    grossAmount: 1100,
    discountAmount: 112,
    pointsEarned: 49,
    manualDiscountMode: "percent",
    manualDiscountPercent: 5,
    membershipBillingSnapshot,
    cartItems: [
      {
        name: "Relax",
        qty: 1,
        price: 600,
        total: 600,
        finalLineAmount: 513,
        membershipDiscountAmount: 60,
        manualDiscountAmount: 27,
      },
      {
        name: "Hair Fall Treat (Omega)",
        qty: 1,
        price: 500,
        total: 500,
        finalLineAmount: 475,
        membershipDiscountAmount: 0,
        manualDiscountAmount: 25,
      },
    ],
  });
  const transaction = buildTransaction({
    totalAmount: 988,
    grossAmount: 1100,
    discountAmount: 112,
    membershipBillingSnapshot,
    finalPaidAmount: 988,
  });
  delete transaction.membershipDiscountAmount;
  delete transaction.additionalManualDiscountAmount;
  delete bill.membershipDiscountAmount;
  delete bill.additionalManualDiscountAmount;

  await withMockedPublicBillModels({ bill, transaction }, async () => {
    const res = mockRes();
    await billingController.getPublicBillDetails(
      mockReq({ params: { id: BILL_ID }, query: { token: publicBillToken() } }),
      res
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.data.totals.discountAmount, 112);
    assert.equal(res.payload.data.totals.membershipDiscountAmount, 60);
    assert.equal(res.payload.data.totals.additionalManualDiscountAmount, 52);
    assert.equal(res.payload.data.totals.finalPaid, 988);
    assert.equal(res.payload.data.membership.planName, "Silver Plan");
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

test("token and short-code public links expose the same immutable GST snapshot", async () => {
  for (const documentMode of ["TEST", "TAX_INVOICE", "NON_TAX_INVOICE"]) {
    const bill = buildBill({
      totalAmount: 100,
      grossAmount: 100,
      discountAmount: 0,
      pointsEarned: 5,
      gstInvoiceSnapshot: buildGstSnapshot(documentMode),
    });
    const transaction = buildTransaction({
      totalAmount: 100,
      grossAmount: 100,
      discountAmount: 0,
      finalPaidAmount: 100,
    });
    await withMockedPublicBillModels({ bill, transaction, code: "gst123" }, async () => {
      const tokenResponse = mockRes();
      await billingController.getPublicBillDetails(
        mockReq({ params: { id: BILL_ID }, query: { token: publicBillToken() } }),
        tokenResponse
      );
      const codeResponse = mockRes();
      await billingController.getPublicBillDetailsByCode(
        mockReq({ params: { code: "gst123" } }),
        codeResponse
      );
      for (const response of [tokenResponse, codeResponse]) {
        assert.equal(response.statusCode, 200);
        assert.equal(response.payload.data.gstInvoice.documentMode, documentMode);
        assert.equal(response.payload.data.gstInvoice.totals.taxableValuePaise, 9524);
        assert.equal(response.payload.data.gstInvoice.totals.cgstPaise, 238);
        assert.equal(response.payload.data.gstInvoice.totals.sgstPaise, 238);
        assert.equal(response.payload.data.gstInvoice.totals.totalGstPaise, 476);
        assert.equal(response.payload.data.gstInvoice.totals.customerPayablePaise, 10000);
      }
    });
  }
});
