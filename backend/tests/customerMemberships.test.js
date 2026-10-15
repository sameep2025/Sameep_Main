const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const mongoose = require("mongoose");

const CustomerMembership = require("../models/CustomerMembership");
const VendorMenuNode = require("../models/VendorMenuNode");
const VendorPriceNode = require("../models/VendorPriceNode");
const controller = require("../controllers/vendorCustomerMembershipController");

test("customer membership schema snapshots purchased discount plan benefits", () => {
  const constants = CustomerMembership.constants;
  assert.deepEqual(constants.MEMBERSHIP_TYPES, ["DISCOUNT", "SERVICE_QUOTA", "PREPAID_VALUE"]);
  assert.deepEqual(constants.MEMBERSHIP_STATUSES, ["ACTIVE", "SCHEDULED", "EXPIRED", "CANCELLED"]);
  assert.deepEqual(constants.PAYMENT_METHODS, ["CASH", "UPI", "CARD", "ONLINE"]);

  assert.ok(CustomerMembership.schema.path("vendorId"));
  assert.ok(CustomerMembership.schema.path("customerId"));
  assert.ok(CustomerMembership.schema.path("customerMobileSnapshot"));
  assert.ok(CustomerMembership.schema.path("renewedFromMembershipId"));
  assert.ok(CustomerMembership.schema.path("renewalRecordedAt"));
  assert.ok(CustomerMembership.schema.path("planSnapshot.discountPercentage"));
  assert.ok(CustomerMembership.schema.path("planSnapshot.eligibleMenuItemIds"));
  assert.ok(CustomerMembership.schema.path("planSnapshot.allowAdditionalDiscountOnMembershipItems"));
  assert.ok(CustomerMembership.schema.path("planSnapshot.allowRewardsOnMembershipItems"));
  assert.ok(CustomerMembership.schema.path("planSnapshot.benefitSemanticsVersion"));
  assert.ok(CustomerMembership.schema.path("serviceEligibilityOverride.eligibleMenuItemIds"));
  assert.ok(CustomerMembership.schema.path("serviceEligibilityOverride.revisionId"));
  assert.ok(CustomerMembership.schema.path("benefitRulesOverride.allowAdditionalDiscountOnMembershipItems"));
  assert.ok(CustomerMembership.schema.path("benefitRulesOverride.allowRewardsOnMembershipItems"));
  assert.ok(CustomerMembership.schema.path("benefitRulesOverride.benefitSemanticsVersion"));
  assert.ok(CustomerMembership.schema.path("benefitRulesOverride.revisionId"));
  assert.ok(CustomerMembership.schema.path("payment.method"));

  const indexes = CustomerMembership.schema.indexes();
  assert.ok(
    indexes.some(([fields, options]) => (
      fields.vendorId === 1 &&
      fields.customerId === 1 &&
      options?.unique === true &&
      options?.partialFilterExpression?.status === "ACTIVE"
    )),
    "active membership uniqueness index should prevent duplicate active memberships"
  );
});

test("membership lifecycle status is derived from effective timestamps", () => {
  const { getEffectiveMembershipStatus } = controller._private;
  const now = new Date("2026-10-13T10:00:00.000Z");

  assert.equal(
    getEffectiveMembershipStatus({
      status: "ACTIVE",
      activatedAt: new Date("2026-10-01T10:00:00.000Z"),
      expiresAt: new Date("2026-11-01T10:00:00.000Z"),
    }, now),
    "ACTIVE"
  );
  assert.equal(
    getEffectiveMembershipStatus({
      status: "SCHEDULED",
      activatedAt: new Date("2026-11-01T10:00:00.000Z"),
      expiresAt: new Date("2026-12-01T10:00:00.000Z"),
    }, now),
    "SCHEDULED"
  );
  assert.equal(
    getEffectiveMembershipStatus({
      status: "ACTIVE",
      activatedAt: new Date("2026-09-01T10:00:00.000Z"),
      expiresAt: new Date("2026-10-01T10:00:00.000Z"),
    }, now),
    "EXPIRED"
  );
});

test("membership expiry uses exclusive calendar month arithmetic", () => {
  const { calculateExpiry } = controller._private;

  assert.equal(
    calculateExpiry(new Date("2026-01-31T10:00:00.000Z"), "MONTHLY").toISOString(),
    "2026-02-28T10:00:00.000Z"
  );
  assert.equal(
    calculateExpiry(new Date("2024-01-31T10:00:00.000Z"), "MONTHLY").toISOString(),
    "2024-02-29T10:00:00.000Z"
  );
  assert.equal(
    calculateExpiry(new Date("2026-10-13T08:30:00.000Z"), "QUARTERLY").toISOString(),
    "2027-01-13T08:30:00.000Z"
  );
  assert.equal(
    calculateExpiry(new Date("2026-10-13T08:30:00.000Z"), "HALF_YEARLY").toISOString(),
    "2027-04-13T08:30:00.000Z"
  );
  assert.equal(
    calculateExpiry(new Date("2024-02-29T08:30:00.000Z"), "ANNUAL").toISOString(),
    "2025-02-28T08:30:00.000Z"
  );
});

test("membership activation helper normalizes mobile and validates payment details", () => {
  const { normalizeMobileInput, validatePaymentInput } = controller._private;

  assert.equal(normalizeMobileInput("98765 43210"), "919876543210");
  assert.equal(normalizeMobileInput("+91 98765 43210"), "919876543210");
  assert.equal(normalizeMobileInput("12345"), "");

  assert.equal(
    validatePaymentInput({ paymentMethod: "CASH", paymentAmount: 500 }, 500).ok,
    true
  );
  assert.equal(
    validatePaymentInput({ paymentMethod: "UPI", paymentAmount: 500, paymentReference: "upi-ref" }, 500).ok,
    true
  );
  assert.equal(
    validatePaymentInput({ paymentMethod: "UPI", paymentAmount: 500 }, 500).ok,
    false
  );
  assert.equal(
    validatePaymentInput({ paymentMethod: "CASH", paymentAmount: 499 }, 500).ok,
    false
  );
});

test("plan snapshot preserves immutable membership discount configuration", () => {
  const { buildPlanSnapshot } = controller._private;
  const planId = new mongoose.Types.ObjectId();
  const serviceId = new mongoose.Types.ObjectId();
  const snapshot = buildPlanSnapshot({
    _id: planId,
    name: "Gold",
    description: "Gold plan",
    duration: "MONTHLY",
    sellingPrice: 999,
    discountPercentage: 15,
    eligibleMenuItemIds: [serviceId],
    minimumBillAmount: 500,
    allowAdditionalDiscountOnMembershipItems: false,
    allowRewardsOnMembershipItems: false,
    benefitSemanticsVersion: "MEMBERSHIP_ITEM_FLAGS_V1",
    serviceQuotaConfig: { benefits: [] },
    prepaidValueConfig: { prepaidValue: 0, bonusValue: 0 },
  });

  assert.equal(String(snapshot.planId), String(planId));
  assert.equal(snapshot.sellingPrice, 999);
  assert.equal(snapshot.discountPercentage, 15);
  assert.deepEqual(snapshot.eligibleMenuItemIds.map(String), [String(serviceId)]);
  assert.equal(snapshot.allowAdditionalDiscountOnMembershipItems, false);
  assert.equal(snapshot.allowRewardsOnMembershipItems, false);
  assert.equal(snapshot.benefitSemanticsVersion, "MEMBERSHIP_ITEM_FLAGS_V1");
});

test("service eligibility override is separate from immutable purchased snapshot", () => {
  const serviceId = new mongoose.Types.ObjectId();
  const overrideServiceId = new mongoose.Types.ObjectId();
  const revisionId = new mongoose.Types.ObjectId();
  const membership = new CustomerMembership({
    vendorId: new mongoose.Types.ObjectId(),
    customerId: new mongoose.Types.ObjectId(),
    customerMobileSnapshot: "919876543210",
    membershipPlanId: new mongoose.Types.ObjectId(),
    membershipType: "DISCOUNT",
    planSnapshot: {
      planId: new mongoose.Types.ObjectId(),
      name: "Gold",
      duration: "MONTHLY",
      sellingPrice: 999,
      discountPercentage: 15,
      eligibleMenuItemIds: [serviceId],
      minimumBillAmount: 500,
    },
    serviceEligibilityOverride: {
      eligibleMenuItemIds: [overrideServiceId],
      revisionId,
      appliedAt: new Date("2026-10-13T00:00:00.000Z"),
      source: "PLAN_SERVICE_ELIGIBILITY_UPDATE",
    },
    sellingPriceAtPurchase: 999,
    activatedAt: new Date("2026-10-01T00:00:00.000Z"),
    expiresAt: new Date("2026-11-01T00:00:00.000Z"),
    status: "ACTIVE",
    payment: { method: "CASH", amount: 999 },
  });

  assert.deepEqual(membership.planSnapshot.eligibleMenuItemIds.map(String), [String(serviceId)]);
  assert.deepEqual(
    membership.serviceEligibilityOverride.eligibleMenuItemIds.map(String),
    [String(overrideServiceId)]
  );
  assert.equal(String(membership.serviceEligibilityOverride.revisionId), String(revisionId));
});

test("benefit rules override is separate from immutable purchased snapshot", () => {
  const membership = new CustomerMembership({
    vendorId: new mongoose.Types.ObjectId(),
    customerId: new mongoose.Types.ObjectId(),
    customerMobileSnapshot: "919876543210",
    membershipPlanId: new mongoose.Types.ObjectId(),
    membershipType: "DISCOUNT",
    planSnapshot: {
      planId: new mongoose.Types.ObjectId(),
      name: "Gold",
      duration: "MONTHLY",
      sellingPrice: 999,
      discountPercentage: 15,
      eligibleMenuItemIds: [new mongoose.Types.ObjectId()],
      minimumBillAmount: 500,
      allowAdditionalDiscountOnMembershipItems: false,
      allowRewardsOnMembershipItems: false,
      benefitSemanticsVersion: "MEMBERSHIP_ITEM_FLAGS_V1",
    },
    benefitRulesOverride: {
      allowAdditionalDiscountOnMembershipItems: true,
      allowRewardsOnMembershipItems: true,
      benefitSemanticsVersion: "MEMBERSHIP_ITEM_FLAGS_V1",
      revisionId: new mongoose.Types.ObjectId(),
      updatedAt: new Date("2026-10-13T00:00:00.000Z"),
      source: "PLAN_BENEFIT_RULES_UPDATE",
    },
    sellingPriceAtPurchase: 999,
    activatedAt: new Date("2026-10-01T00:00:00.000Z"),
    expiresAt: new Date("2026-11-01T00:00:00.000Z"),
    status: "ACTIVE",
    payment: { method: "CASH", amount: 999 },
  });

  assert.equal(membership.planSnapshot.allowAdditionalDiscountOnMembershipItems, false);
  assert.equal(membership.planSnapshot.allowRewardsOnMembershipItems, false);
  assert.equal(membership.benefitRulesOverride.allowAdditionalDiscountOnMembershipItems, true);
  assert.equal(membership.benefitRulesOverride.allowRewardsOnMembershipItems, true);
});

test("customer membership listing supports server-side filters, sorting, and pagination", () => {
  const { getMembershipSort } = controller._private;
  const controllerSource = fs.readFileSync(
    path.join(__dirname, "../controllers/vendorCustomerMembershipController.js"),
    "utf8"
  );

  assert.deepEqual(getMembershipSort("newest"), { createdAt: -1, _id: -1 });
  assert.deepEqual(getMembershipSort("activation_date"), { activatedAt: -1, _id: -1 });
  assert.deepEqual(getMembershipSort("expiry_date"), { expiresAt: 1, _id: -1 });
  assert.match(controllerSource, /customerMobileSnapshot/);
  assert.match(controllerSource, /planSnapshot\.name/);
  assert.match(controllerSource, /countDocuments\(query\)/);
  assert.match(controllerSource, /\.skip\(skip\)/);
  assert.match(controllerSource, /hasMore/);
  assert.match(controllerSource, /status === "EXPIRED"/);
});

test("vendor membership detail returns effective override services and keeps history", async () => {
  const originals = {
    membershipFindOne: CustomerMembership.findOne,
    membershipFind: CustomerMembership.find,
    menuFind: VendorMenuNode.find,
    priceFind: VendorPriceNode.find,
  };
  const vendorId = new mongoose.Types.ObjectId("692900000000000000000011");
  const customerId = new mongoose.Types.ObjectId("692900000000000000000001");
  const membershipId = new mongoose.Types.ObjectId("692900000000000000000031");
  const snapshotServiceId = new mongoose.Types.ObjectId("692900000000000000000021");
  const overrideServiceId = new mongoose.Types.ObjectId("692900000000000000000022");
  const membership = {
    _id: membershipId,
    vendorId,
    customerId,
    membershipPlanId: new mongoose.Types.ObjectId("692900000000000000000041"),
    membershipType: "DISCOUNT",
    status: "ACTIVE",
    planSnapshot: {
      name: "Silver Plan",
      eligibleMenuItemIds: [snapshotServiceId],
    },
    serviceEligibilityOverride: {
      eligibleMenuItemIds: [overrideServiceId],
    },
    activatedAt: new Date("2026-10-01T00:00:00.000Z"),
    expiresAt: new Date("2026-11-01T00:00:00.000Z"),
  };

  CustomerMembership.findOne = () => ({ lean: async () => membership });
  CustomerMembership.find = () => ({
    sort() {
      return this;
    },
    lean: async () => [membership],
  });
  VendorMenuNode.find = () => ({
    select() {
      return this;
    },
    lean: async () => [{
      _id: overrideServiceId,
      vendorId,
      name: "Diamond Clean Up",
      pathNames: ["Hash Mens", "Clean Ups"],
    }],
  });
  VendorPriceNode.find = () => ({
    select() {
      return this;
    },
    lean: async () => [],
  });

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
    await controller.getMembership(
      {
        params: { vendorId: String(vendorId), membershipId: String(membershipId) },
        vendorWriteAuth: { vendorId: String(vendorId) },
      },
      res
    );

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.payload.data.planSnapshot.eligibleMenuItemIds, [String(snapshotServiceId)]);
    assert.deepEqual(res.payload.data.effectiveEligibleMenuItemIds, [String(overrideServiceId)]);
    assert.equal(res.payload.data.eligibleServices.length, 1);
    assert.equal(res.payload.data.eligibleServices[0].name, "Diamond Clean Up");
    assert.equal(
      res.payload.data.eligibleServices[0].path.join(" / "),
      "Hash Mens / Clean Ups / Diamond Clean Up"
    );
    assert.equal(res.payload.history.length, 1);
  } finally {
    CustomerMembership.findOne = originals.membershipFindOne;
    CustomerMembership.find = originals.membershipFind;
    VendorMenuNode.find = originals.menuFind;
    VendorPriceNode.find = originals.priceFind;
  }
});

test("customer membership routes are vendor-authenticated and isolated from billing", () => {
  const routeSource = fs.readFileSync(
    path.join(__dirname, "../routes/vendorCustomerMembershipRoutes.js"),
    "utf8"
  );
  const serverSource = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  const controllerSource = fs.readFileSync(
    path.join(__dirname, "../controllers/vendorCustomerMembershipController.js"),
    "utf8"
  );
  const billingSource = fs.readFileSync(path.join(__dirname, "../controllers/billingController.js"), "utf8");

  assert.match(routeSource, /requireVendorAccessFromExistingAuth/);
  assert.match(routeSource, /customer-lookup/);
  assert.match(routeSource, /activate/);
  assert.match(routeSource, /renew/);
  assert.match(serverSource, /\/api\/vendor\/customer-memberships/);
  assert.match(controllerSource, /startSession/);
  assert.match(controllerSource, /withTransaction/);
  assert.match(controllerSource, /renewedFromMembershipId/);
  assert.match(controllerSource, /scheduled renewal already exists/i);
  assert.doesNotMatch(controllerSource, /require\(["']\.\.\/models\/Transaction["']\)/);
  assert.doesNotMatch(controllerSource, /require\(["']\.\.\/models\/LoyaltyLedger["']\)/);
  assert.doesNotMatch(controllerSource, /require\(["'].*Whatsapp|require\(["'].*WhatsApp|MSG91/);
  assert.match(billingSource, /CustomerMembership/);
  assert.match(billingSource, /findEffectiveCustomerMembership/);
});
