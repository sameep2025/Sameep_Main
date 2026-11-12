const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const mongoose = require("mongoose");

const CustomerMembership = require("../models/CustomerMembership");
const Transaction = require("../models/Transaction");
const VendorMenuNode = require("../models/VendorMenuNode");
const VendorPriceNode = require("../models/VendorPriceNode");
const controller = require("../controllers/vendorCustomerMembershipController");

test("customer membership schema snapshots purchased discount plan benefits", () => {
  const constants = CustomerMembership.constants;
  assert.deepEqual(constants.MEMBERSHIP_TYPES, [
    "DISCOUNT",
    "SERVICE_QUOTA",
    "PREPAID_VALUE",
    "PREPAID_SESSIONS",
  ]);
  assert.deepEqual(constants.MEMBERSHIP_STATUSES, [
    "ACTIVE",
    "SCHEDULED",
    "DEPLETED",
    "EXPIRED",
    "CANCELLED",
  ]);
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
  assert.ok(CustomerMembership.schema.path("prepaidSessionsSnapshot.eligibleItemSource"));
  assert.ok(CustomerMembership.schema.path("prepaidValueSnapshot.creditedAmountPaise"));

  const indexes = CustomerMembership.schema.indexes();
  const discountIndex = indexes.find(([, options]) => (
    options?.name === "customer_membership_active_discount_unique"
  ));
  const prepaidIndex = indexes.find(([, options]) => (
    options?.name === "customer_membership_active_prepaid_unique"
  ));
  assert.equal(discountIndex?.[1].unique, true);
  assert.deepEqual(discountIndex?.[1].partialFilterExpression, {
    status: "ACTIVE",
    membershipType: "DISCOUNT",
  });
  assert.equal(prepaidIndex?.[1].unique, true);
  assert.deepEqual(prepaidIndex?.[1].partialFilterExpression, {
    status: "ACTIVE",
    membershipType: { $in: ["PREPAID_VALUE", "PREPAID_SESSIONS"] },
  });
});

test("prepaid renewal availability requires depletion or expiry", () => {
  const { getPrepaidRenewalAvailability } = controller._private;
  const valueWallet = (remainingAmountPaise) => ({ remainingAmountPaise });
  const sessionWallet = (remainingQuantity) => ({ remainingQuantity });

  assert.deepEqual(getPrepaidRenewalAvailability({
    effectiveStatus: "ACTIVE",
    membershipType: "PREPAID_VALUE",
    wallet: valueWallet(125000),
  }), {
    allowed: false,
    code: "prepaid_renewal_balance_remaining",
    reason: "Renewal is available after the current wallet balance is exhausted or the membership expires.",
    remainingBalance: 125000,
  });
  assert.deepEqual(getPrepaidRenewalAvailability({
    effectiveStatus: "ACTIVE",
    membershipType: "PREPAID_VALUE",
    wallet: valueWallet(0),
  }), { allowed: true, remainingBalance: 0 });
  assert.deepEqual(getPrepaidRenewalAvailability({
    effectiveStatus: "DEPLETED",
    membershipType: "PREPAID_SESSIONS",
    wallet: sessionWallet(0),
  }), { allowed: true, remainingBalance: 0 });
  assert.deepEqual(getPrepaidRenewalAvailability({
    effectiveStatus: "DEPLETED",
    membershipType: "PREPAID_SESSIONS",
    wallet: sessionWallet(1),
  }), {
    allowed: false,
    code: "prepaid_renewal_wallet_inconsistent",
    reason: "Prepaid wallet information is unavailable or inconsistent.",
    remainingBalance: 1,
  });
  assert.deepEqual(getPrepaidRenewalAvailability({
    effectiveStatus: "EXPIRED",
    membershipType: "PREPAID_VALUE",
    wallet: valueWallet(50000),
  }), { allowed: true, remainingBalance: 50000 });
  assert.deepEqual(getPrepaidRenewalAvailability({
    effectiveStatus: "DEPLETED",
    membershipType: "PREPAID_VALUE",
    wallet: valueWallet(0),
    competingMembership: {
      _id: new mongoose.Types.ObjectId(),
      status: "ACTIVE",
      membershipType: "PREPAID_VALUE",
    },
  }), {
    allowed: false,
    code: "prepaid_renewal_successor_exists",
    reason: "Renewal is unavailable because a newer active or scheduled prepaid membership already exists.",
  });
});

test("membership renewal and transaction indexes have one permanent unique definition", () => {
  const membershipIndexes = CustomerMembership.schema.indexes();
  const renewalIndexes = membershipIndexes.filter(([fields]) => (
    Object.keys(fields).length === 1 && fields.renewedFromMembershipId === 1
  ));
  assert.equal(renewalIndexes.length, 1);
  assert.equal(renewalIndexes[0][1].unique, true);
  assert.equal(renewalIndexes[0][1].name, "customer_membership_renewal_lineage_unique");
  assert.deepEqual(renewalIndexes[0][1].partialFilterExpression, {
    renewedFromMembershipId: { $exists: true, $type: "objectId" },
  });

  const activeMembershipIndexes = membershipIndexes.filter(([fields, options]) => (
    fields.vendorId === 1 &&
    fields.customerId === 1 &&
    options?.partialFilterExpression?.status === "ACTIVE"
  ));
  assert.deepEqual(
    activeMembershipIndexes.map(([, options]) => options.name).sort(),
    [
      "customer_membership_active_discount_unique",
      "customer_membership_active_prepaid_unique",
    ]
  );

  const enrollmentIndex = membershipIndexes.find(([, options]) => (
    options?.name === "prepaid_membership_enrollment_idempotency_unique"
  ));
  assert.equal(enrollmentIndex?.[1].unique, true);
  assert.deepEqual(enrollmentIndex?.[1].partialFilterExpression, {
    enrollmentIdempotencyKey: { $gt: "" },
  });

  const transactionIndexes = Transaction.schema.indexes();
  const billingSessionIndexes = transactionIndexes.filter(([fields]) => (
    Object.keys(fields).length === 1 && fields.billingSessionId === 1
  ));
  assert.equal(billingSessionIndexes.length, 1);
  assert.equal(billingSessionIndexes[0][1].unique, true);
  assert.equal(billingSessionIndexes[0][1].name, "transaction_billing_session_unique");
  assert.deepEqual(billingSessionIndexes[0][1].partialFilterExpression, {
    billingSessionId: { $exists: true, $type: "objectId" },
  });
});

test("legacy memberships and transactions may omit optional lineage references", async () => {
  const vendorId = new mongoose.Types.ObjectId();
  const customerId = new mongoose.Types.ObjectId();
  const planId = new mongoose.Types.ObjectId();
  const now = new Date("2026-11-06T00:00:00.000Z");

  const membership = new CustomerMembership({
    vendorId,
    customerId,
    customerMobileSnapshot: "919876543210",
    membershipPlanId: planId,
    membershipType: "DISCOUNT",
    planSnapshot: {
      planId,
      name: "Legacy Discount",
      duration: "MONTHLY",
      sellingPrice: 100,
    },
    sellingPriceAtPurchase: 100,
    activatedAt: now,
    expiresAt: new Date("2026-12-06T00:00:00.000Z"),
    status: "ACTIVE",
    payment: { method: "CASH", amount: 100 },
  });
  const transaction = new Transaction({ vendorId, totalAmount: 100 });

  await membership.validate();
  await transaction.validate();
  assert.equal(membership.renewedFromMembershipId, null);
  assert.equal(transaction.billingSessionId, undefined);
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
  assert.match(controllerSource, /membershipType = String\(req\.query\?\.membershipType/);
  assert.match(controllerSource, /prepaid_renewal_successor_exists/);
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
