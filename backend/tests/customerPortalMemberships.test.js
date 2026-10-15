const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const mongoose = require("mongoose");

const CustomerMembership = require("../models/CustomerMembership");
const Vendor = require("../models/DummyVendor");
const VendorMenuNode = require("../models/VendorMenuNode");
const VendorPriceNode = require("../models/VendorPriceNode");
const controller = require("../controllers/customerPortalMembershipsController");

function oid(hex) {
  return new mongoose.Types.ObjectId(hex);
}

function mockReq({ auth = {}, query = {} } = {}) {
  return { auth, query };
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

async function withMockedModels(fn) {
  const originals = {
    membershipFind: CustomerMembership.find,
    vendorFind: Vendor.find,
    menuNodeFind: VendorMenuNode.find,
    priceNodeFind: VendorPriceNode.find,
  };

  try {
    await fn();
  } finally {
    CustomerMembership.find = originals.membershipFind;
    Vendor.find = originals.vendorFind;
    VendorMenuNode.find = originals.menuNodeFind;
    VendorPriceNode.find = originals.priceNodeFind;
  }
}

function installLeanFind(model, rows, stateKey, state = {}) {
  model.find = (query) => {
    state[stateKey] = query;
    return {
      select(selectSpec) {
        state[`${stateKey}Select`] = selectSpec;
        return this;
      },
      sort(sortSpec) {
        state[`${stateKey}Sort`] = sortSpec;
        return this;
      },
      lean: async () => rows,
    };
  };
}

test("customer portal memberships are scoped to authenticated customer and grouped by vendor", async () => {
  await withMockedModels(async () => {
    const state = {};
    const customerId = "692900000000000000000001";
    const otherCustomerId = "692900000000000000000002";
    const vendorOne = oid("692900000000000000000011");
    const vendorTwo = oid("692900000000000000000012");
    const serviceOne = oid("692900000000000000000021");
    const serviceTwo = oid("692900000000000000000022");
    const membershipRows = [
      {
        _id: oid("692900000000000000000031"),
        vendorId: vendorOne,
        customerId: oid(customerId),
        membershipPlanId: oid("692900000000000000000041"),
        membershipType: "DISCOUNT",
        status: "ACTIVE",
        planSnapshot: {
          name: "Silver Plan",
          description: "Silver benefits",
          discountPercentage: 10,
          minimumBillAmount: 500,
          eligibleMenuItemIds: [serviceOne],
          allowAdditionalDiscountOnMembershipItems: false,
          allowRewardsOnMembershipItems: false,
        },
        serviceEligibilityOverride: {
          eligibleMenuItemIds: [serviceOne, serviceTwo],
        },
        benefitRulesOverride: {
          allowAdditionalDiscountOnMembershipItems: true,
          allowRewardsOnMembershipItems: true,
        },
        sellingPriceAtPurchase: 999,
        activatedAt: new Date("2026-10-01T00:00:00.000Z"),
        expiresAt: new Date("2026-11-01T00:00:00.000Z"),
        createdAt: new Date("2026-10-01T00:00:00.000Z"),
      },
      {
        _id: oid("692900000000000000000032"),
        vendorId: vendorTwo,
        customerId: oid(customerId),
        membershipPlanId: oid("692900000000000000000042"),
        membershipType: "DISCOUNT",
        status: "SCHEDULED",
        planSnapshot: {
          name: "Gold Renewal",
          discountPercentage: 15,
          minimumBillAmount: 1000,
          eligibleMenuItemIds: [],
        },
        sellingPriceAtPurchase: 1499,
        activatedAt: new Date("2026-12-01T00:00:00.000Z"),
        expiresAt: new Date("2027-01-01T00:00:00.000Z"),
        renewalRecordedAt: new Date("2026-10-14T00:00:00.000Z"),
        createdAt: new Date("2026-10-14T00:00:00.000Z"),
      },
    ];

    installLeanFind(CustomerMembership, membershipRows, "membershipQuery", state);
    installLeanFind(Vendor, [
      { _id: vendorOne, businessName: "Reelook Beauty Saloon", subdomain: "reelook", logoUrl: "logo1.png" },
      { _id: vendorTwo, businessName: "Hair Affair", subdomain: "hairaffair", logoUrl: "logo2.png" },
    ], "vendorQuery", state);
    installLeanFind(VendorMenuNode, [
      { _id: serviceOne, vendorId: vendorOne, name: "Relax", price: 600, pathNames: ["Hair", "Spa"] },
    ], "menuQuery", state);
    installLeanFind(VendorPriceNode, [
      { _id: serviceTwo, vendorId: vendorOne, name: "Hair Fall Treat", price: 500 },
    ], "priceQuery", state);

    const res = mockRes();
    await controller.getMemberships(mockReq({ auth: { customerId, otherCustomerId } }), res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(state.membershipQuery, {
      customerId,
      membershipType: "DISCOUNT",
      status: { $in: ["ACTIVE", "SCHEDULED", "EXPIRED"] },
    });
    assert.equal(res.payload.data.vendors.length, 2);
    assert.equal(res.payload.data.vendors[0].vendor.businessName, "Reelook Beauty Saloon");
    assert.equal(res.payload.data.vendors[0].memberships[0].planName, "Silver Plan");
    assert.equal(res.payload.data.vendors[0].memberships[0].benefits.eligibleServices.length, 2);
    assert.ok(Array.isArray(state.menuQuery.$or));
    assert.ok(
      state.menuQuery.$or.some((pair) =>
        String(pair.vendorId) === String(vendorOne) &&
        pair._id.$in.some((id) => String(id) === String(serviceOne))
      )
    );
    assert.equal(
      res.payload.data.vendors[0].memberships[0].benefits.additionalManualDiscountOnMembershipItems,
      true
    );
    assert.equal(
      res.payload.data.vendors[0].memberships[0].benefits.loyaltyRewardsOnMembershipItems,
      true
    );
    assert.equal(res.payload.data.vendors[1].memberships[0].status, "SCHEDULED");
  });
});

test("customer portal returns complete large effective eligibility without cross-vendor service names", async () => {
  await withMockedModels(async () => {
    const state = {};
    const customerId = oid("692900000000000000000001");
    const vendorOne = oid("692900000000000000000011");
    const vendorTwo = oid("692900000000000000000012");
    const serviceIds = Array.from({ length: 205 }, (_, index) =>
      oid((BigInt("0x692900000000000000001000") + BigInt(index)).toString(16).padStart(24, "0"))
    );
    const foreignServiceId = oid("692900000000000000009999");
    const membership = {
      _id: oid("692900000000000000000031"),
      vendorId: vendorOne,
      customerId,
      membershipPlanId: oid("692900000000000000000041"),
      membershipType: "DISCOUNT",
      status: "ACTIVE",
      planSnapshot: {
        name: "Large Plan",
        eligibleMenuItemIds: [],
      },
      serviceEligibilityOverride: {
        eligibleMenuItemIds: [...serviceIds, foreignServiceId],
      },
      activatedAt: new Date("2026-10-01T00:00:00.000Z"),
      expiresAt: new Date("2026-11-01T00:00:00.000Z"),
    };

    installLeanFind(CustomerMembership, [membership], "membershipQuery", state);
    installLeanFind(Vendor, [{ _id: vendorOne, businessName: "Large Salon" }], "vendorQuery", state);
    installLeanFind(VendorMenuNode, [
      ...serviceIds.map((id, index) => ({
        _id: id,
        vendorId: vendorOne,
        name: `Service ${index + 1}`,
        pathNames: ["Hash Mens", "Clean Ups"],
      })),
      {
        _id: foreignServiceId,
        vendorId: vendorTwo,
        name: "Other Vendor Secret Service",
        pathNames: ["Private"],
      },
    ], "menuQuery", state);
    installLeanFind(VendorPriceNode, [], "priceQuery", state);

    const res = mockRes();
    await controller.getMemberships(mockReq({ auth: { customerId: String(customerId) } }), res);

    const services = res.payload.data.memberships[0].benefits.eligibleServices;
    assert.equal(services.length, 206);
    assert.equal(services[0].path.join(" / "), "Hash Mens / Clean Ups / Service 1");
    assert.equal(services.some((service) => service.name === "Other Vendor Secret Service"), false);
    assert.equal(services.at(-1).unavailable, true);
  });
});

test("explicit empty eligibility override stays empty instead of using purchased snapshot", () => {
  const membership = {
    _id: oid("692900000000000000000031"),
    vendorId: oid("692900000000000000000011"),
    planSnapshot: {
      eligibleMenuItemIds: [oid("692900000000000000000021")],
    },
    serviceEligibilityOverride: {
      eligibleMenuItemIds: [],
    },
  };

  const serialized = controller.serializeMembership(membership);
  assert.deepEqual(serialized.benefits.eligibleMenuItemIds, []);
  assert.deepEqual(serialized.benefits.eligibleServices, []);
});

test("customer portal memberships returns empty state for customers without memberships", async () => {
  await withMockedModels(async () => {
    const state = {};
    installLeanFind(CustomerMembership, [], "membershipQuery", state);
    installLeanFind(Vendor, [], "vendorQuery", state);
    installLeanFind(VendorMenuNode, [], "menuQuery", state);
    installLeanFind(VendorPriceNode, [], "priceQuery", state);

    const res = mockRes();
    await controller.getMemberships(
      mockReq({ auth: { customerId: "692900000000000000000001" } }),
      res
    );

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.payload.data.memberships, []);
    assert.deepEqual(res.payload.data.vendors, []);
  });
});

test("customer portal membership route uses customer portal auth and exposes no write endpoint", () => {
  const routeSource = fs.readFileSync(
    path.join(__dirname, "../routes/customerPortalRoutes.js"),
    "utf8"
  );
  const controllerSource = fs.readFileSync(
    path.join(__dirname, "../controllers/customerPortalMembershipsController.js"),
    "utf8"
  );

  assert.match(routeSource, /router\.get\("\/memberships", requireCustomerPortalSession/);
  assert.doesNotMatch(routeSource, /post\("\/memberships|patch\("\/memberships|delete\("\/memberships/);
  assert.doesNotMatch(controllerSource, /CustomerMembership\.create|updateOne|findOneAndUpdate|deleteOne/);
  assert.match(controllerSource, /req\.auth\?\.customerId/);
});
