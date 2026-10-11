const assert = require("node:assert");
const test = require("node:test");
const mongoose = require("mongoose");

const DummyVendor = require("../models/DummyVendor");
const LoyaltyLedger = require("../models/LoyaltyLedger");
const VendorCustomPackage = require("../models/VendorCustomPackage");
const VendorLoyaltyRule = require("../models/VendorLoyaltyRule");
const VendorMenuNode = require("../models/VendorMenuNode");
const VendorPriceNode = require("../models/VendorPriceNode");
const controller = require("../controllers/publicVendorHighlightsController");

const VENDOR_ID = "692403a24d4d3a1b6a7f0ae5";

function mockReq(vendorId = VENDOR_ID) {
  return { params: { vendorId } };
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

async function withMockedHighlightModels(fn) {
  const originals = {
    dummyFindById: DummyVendor.findById,
    menuFind: VendorMenuNode.find,
    priceFind: VendorPriceNode.find,
    customFind: VendorCustomPackage.find,
    ruleFindOne: VendorLoyaltyRule.findOne,
    ledgerAggregate: LoyaltyLedger.aggregate,
  };

  try {
    DummyVendor.findById = () => ({
      select() {
        return this;
      },
      lean: async () => ({
        _id: new mongoose.Types.ObjectId(VENDOR_ID),
        businessName: "Highlights Salon",
        selectedTemplateKey: "ecommerce",
        subdomain: "highlightssalon",
      }),
    });

    VendorMenuNode.find = () => ({
      lean: async () => [
        {
          _id: new mongoose.Types.ObjectId("692403a24d4d3a1b6a7f0ae6"),
          name: "Offers",
          pricingStatus: "Active",
          visibleToUser: true,
        },
        {
          _id: new mongoose.Types.ObjectId("692403a24d4d3a1b6a7f0ae7"),
          parentNodeId: new mongoose.Types.ObjectId("692403a24d4d3a1b6a7f0ae6"),
          name: "Dushera Offers",
          offerText: "Additional 10% off on all items",
          price: 900,
          mrp: 1000,
          discountPercent: 10,
          imageUrl: "https://cdn.example.com/offer.png",
          pricingStatus: "Active",
          visibleToUser: true,
        },
        {
          _id: new mongoose.Types.ObjectId("692403a24d4d3a1b6a7f0ae8"),
          name: "Regular Product",
          offerText: "A normal product note should not become a popup offer",
          pricingStatus: "Active",
          visibleToUser: true,
        },
        {
          _id: new mongoose.Types.ObjectId("692403a24d4d3a1b6a7f0ae9"),
          parentNodeId: new mongoose.Types.ObjectId("692403a24d4d3a1b6a7f0ae6"),
          name: "Future Offer",
          offerText: "Starts later",
          offerStartDate: new Date("2999-01-01T00:00:00.000Z"),
          pricingStatus: "Active",
          visibleToUser: true,
        },
        {
          _id: new mongoose.Types.ObjectId("692403a24d4d3a1b6a7f0aea"),
          parentNodeId: new mongoose.Types.ObjectId("692403a24d4d3a1b6a7f0ae6"),
          name: "Expired Offer",
          offerText: "Already ended",
          offerEndDate: new Date("2000-01-01T00:00:00.000Z"),
          pricingStatus: "Active",
          visibleToUser: true,
        },
      ],
    });

    VendorPriceNode.find = () => ({ lean: async () => [] });
    VendorCustomPackage.find = () => ({ lean: async () => [] });
    VendorLoyaltyRule.findOne = () => ({
      lean: async () => ({
        isEnabled: true,
        earn: { percentPer100: 5 },
        minBillAmount: 500,
      }),
    });
    LoyaltyLedger.aggregate = async () => [{ earned: 1250, reversed: 200 }];

    await fn();
  } finally {
    DummyVendor.findById = originals.dummyFindById;
    VendorMenuNode.find = originals.menuFind;
    VendorPriceNode.find = originals.priceFind;
    VendorCustomPackage.find = originals.customFind;
    VendorLoyaltyRule.findOne = originals.ruleFindOne;
    LoyaltyLedger.aggregate = originals.ledgerAggregate;
  }
}

test("public vendor highlights returns offers and net issued reward points without private data", async () => {
  await withMockedHighlightModels(async () => {
    const res = mockRes();
    await controller.getPublicVendorHighlights(mockReq(), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.success, true);
    assert.equal(res.payload.data.vendor.businessName, "Highlights Salon");
    assert.equal(res.payload.data.hasHighlights, true);

    assert.equal(res.payload.data.offers.length, 1);
    assert.equal(res.payload.data.offers[0].title, "Dushera Offers");
    assert.equal(res.payload.data.offers[0].description, "Additional 10% off on all items");
    assert.equal(res.payload.data.offers[0].discountPercent, 10);

    assert.equal(res.payload.data.rewards.programEnabled, true);
    assert.equal(res.payload.data.rewards.earnPercent, 5);
    assert.equal(res.payload.data.rewards.minBillAmount, 500);
    assert.equal(res.payload.data.rewards.totalIssuedPoints, 1050);

    const serialized = JSON.stringify(res.payload);
    assert.doesNotMatch(serialized, /customerId|phone|ledger|transactionId|remainingPoints/);
  });
});
