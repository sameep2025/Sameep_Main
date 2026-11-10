const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const mongoose = require("mongoose");

const Customer = require("../models/Customer");
const CustomerMembership = require("../models/CustomerMembership");
const MembershipPlan = require("../models/MembershipPlan");
const PrepaidMembershipWallet = require("../models/PrepaidMembershipWallet");
const PrepaidWalletLedger = require("../models/PrepaidWalletLedger");
const customerController = require("../controllers/vendorCustomerMembershipController");
const planController = require("../controllers/vendorMembershipPlanController");

function id(value) {
  return new mongoose.Types.ObjectId(value);
}

function query(value) {
  return {
    select() { return this; },
    sort() { return this; },
    limit() { return this; },
    session() { return this; },
    lean: async () => value,
  };
}

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

function prepaidValuePlan(overrides = {}) {
  return {
    _id: id("690000000000000000000002"),
    vendorId: id("690000000000000000000001"),
    planType: "PREPAID_VALUE",
    name: "Pay 1000 Get 1200",
    description: "Value wallet",
    duration: "ANNUAL",
    sellingPrice: 1000,
    prepaidValueConfig: { prepaidValue: 1200, bonusValue: 200 },
    status: "ACTIVE",
    ...overrides,
  };
}

async function withPatchedEnrollmentModels(run, options = {}) {
  const originals = {
    startSession: mongoose.startSession,
    planFindOne: MembershipPlan.findOne,
    customerFindOne: Customer.findOne,
    membershipFindOne: CustomerMembership.findOne,
    membershipFind: CustomerMembership.find,
    membershipUpdateMany: CustomerMembership.updateMany,
    membershipCreate: CustomerMembership.create,
    walletFindOne: PrepaidMembershipWallet.findOne,
    walletUpdateMany: PrepaidMembershipWallet.updateMany,
    walletCreate: PrepaidMembershipWallet.create,
    ledgerCreate: PrepaidWalletLedger.create,
  };
  const calls = { membershipCreates: [], walletCreates: [], ledgerCreates: [], transactions: 0 };
  const session = { id: "transaction-session" };
  session.withTransaction = async (work) => {
    calls.transactions += 1;
    return work();
  };
  session.endSession = async () => {};
  mongoose.startSession = async () => session;
  MembershipPlan.findOne = () => query(options.plan || prepaidValuePlan());
  Customer.findOne = () => ({ session: async () => ({ _id: id("690000000000000000000003") }) });

  let membershipFindCount = 0;
  CustomerMembership.findOne = () => {
    membershipFindCount += 1;
    if (membershipFindCount === 1 && options.replayMembership) return query(options.replayMembership);
    return query(null);
  };
  CustomerMembership.find = () => query([]);
  CustomerMembership.updateMany = async () => ({ modifiedCount: 0 });
  PrepaidMembershipWallet.updateMany = async () => ({ modifiedCount: 0 });
  CustomerMembership.create = async (documents, createOptions) => {
    calls.membershipCreates.push({ documents, createOptions });
    return [{ _id: id("690000000000000000000004"), ...documents[0], toObject() { return { ...this }; } }];
  };
  PrepaidMembershipWallet.findOne = () => query(options.replayWallet || null);
  PrepaidMembershipWallet.create = async (documents, createOptions) => {
    calls.walletCreates.push({ documents, createOptions });
    return [{ _id: id("690000000000000000000005"), ...documents[0], toObject() { return { ...this }; } }];
  };
  PrepaidWalletLedger.create = async (documents, createOptions) => {
    calls.ledgerCreates.push({ documents, createOptions });
    if (options.ledgerError) throw options.ledgerError;
    return [{ _id: id("690000000000000000000006"), ...documents[0] }];
  };

  const previousFlag = process.env.PREPAID_MEMBERSHIP_WALLETS_ENABLED;
  process.env.PREPAID_MEMBERSHIP_WALLETS_ENABLED = options.featureEnabled === false ? "false" : "true";
  try {
    await run({ calls, session });
  } finally {
    mongoose.startSession = originals.startSession;
    MembershipPlan.findOne = originals.planFindOne;
    Customer.findOne = originals.customerFindOne;
    CustomerMembership.findOne = originals.membershipFindOne;
    CustomerMembership.find = originals.membershipFind;
    CustomerMembership.updateMany = originals.membershipUpdateMany;
    CustomerMembership.create = originals.membershipCreate;
    PrepaidMembershipWallet.findOne = originals.walletFindOne;
    PrepaidMembershipWallet.updateMany = originals.walletUpdateMany;
    PrepaidMembershipWallet.create = originals.walletCreate;
    PrepaidWalletLedger.create = originals.ledgerCreate;
    if (previousFlag === undefined) delete process.env.PREPAID_MEMBERSHIP_WALLETS_ENABLED;
    else process.env.PREPAID_MEMBERSHIP_WALLETS_ENABLED = previousFlag;
  }
}

test("prepaid plan validation calculates value bonus and validates session quantities", () => {
  const value = planController._private.validatePrepaidPayload({
    planType: "PREPAID_VALUE",
    name: "Value plan",
    duration: "ANNUAL",
    sellingPrice: 1000,
    prepaidValueConfig: { prepaidValue: 1200, bonusValue: 200 },
  });
  assert.deepEqual(value.errors, []);
  assert.deepEqual(value.payload.prepaidValueConfig, { prepaidValue: 1200, bonusValue: 200 });

  const invalidBonus = planController._private.validatePrepaidPayload({
    planType: "PREPAID_VALUE",
    name: "Value plan",
    duration: "ANNUAL",
    sellingPrice: 1000,
    prepaidValueConfig: { prepaidValue: 1200, bonusValue: 150 },
  });
  assert.match(invalidBonus.errors.join(" "), /Bonus value/);

  const sessions = planController._private.validatePrepaidPayload({
    planType: "PREPAID_SESSIONS",
    name: "Six services",
    duration: "ANNUAL",
    sellingPrice: 25000,
    prepaidSessionsConfig: {
      eligibleItemId: id("690000000000000000000010"),
      eligibleItemSource: "vendor_menu_node",
      paidQuantity: 5,
      creditedQuantity: 6,
    },
  });
  assert.deepEqual(sessions.errors, []);
  assert.equal(sessions.payload.prepaidSessionsConfig.creditedQuantity, 6);
  assert.equal(MembershipPlan.schema.path("planType").options.immutable, true);
});

test("Phase 2C read contracts expose safe wallet history fields and server capability", () => {
  const ledger = customerController._private.serializeWalletLedger({
    _id: id("690000000000000000000011"),
    walletId: id("690000000000000000000005"),
    eventType: "CREDIT",
    walletType: "PREPAID_VALUE",
    amountPaise: 120000,
    occurredAt: new Date("2026-11-05T00:00:00.000Z"),
    audit: { secret: "not serialized" },
  });
  assert.equal(ledger.amountPaise, 120000);
  assert.equal(ledger.audit, undefined);

  const controllerSource = fs.readFileSync(
    path.join(__dirname, "../controllers/vendorMembershipPlanController.js"),
    "utf8"
  );
  assert.match(controllerSource, /prepaidMembershipWallets:\s*isPrepaidMembershipWalletEnabled\(\)/);
  assert.match(controllerSource, /prepaidEligibleItems/);
  assert.match(controllerSource, /item\.sourceType === "vendor_menu" \? "vendor_menu_node"/);
});

test("prepaid value plan model rejects inconsistent bonus values", async () => {
  await new MembershipPlan({
    vendorId: id("690000000000000000000001"),
    planType: "PREPAID_VALUE",
    name: "Valid value plan",
    duration: "ANNUAL",
    sellingPrice: 1000,
    prepaidValueConfig: { prepaidValue: 1200, bonusValue: 200 },
  }).validate();

  await assert.rejects(new MembershipPlan({
    vendorId: id("690000000000000000000001"),
    planType: "PREPAID_VALUE",
    name: "Invalid value plan",
    duration: "ANNUAL",
    sellingPrice: 1000,
    prepaidValueConfig: { prepaidValue: 1200, bonusValue: 150 },
  }).validate(), /exact calculated bonus/);
});

test("prepaid value enrollment creates membership, wallet and one CREDIT in one transaction", async () => {
  await withPatchedEnrollmentModels(async ({ calls, session }) => {
    const res = response();
    await customerController.activateMembership({
      params: { vendorId: "690000000000000000000001" },
      vendorWriteAuth: { vendorId: "690000000000000000000001", authType: "vendor" },
      body: {
        membershipPlanId: "690000000000000000000002",
        customerMobile: "9876543210",
        paymentMethod: "UPI",
        paymentAmount: 1000,
        paymentReference: "txn-123",
        idempotencyKey: "enroll-value-1",
      },
    }, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.payload.data.membershipType, "PREPAID_VALUE");
    assert.equal(res.payload.data.prepaidValueSnapshot.creditedAmountPaise, 120000);
    assert.equal(res.payload.wallet.remainingAmountPaise, 120000);
    assert.equal(calls.transactions, 1);
    assert.equal(calls.membershipCreates.length, 1);
    assert.equal(calls.walletCreates.length, 1);
    assert.equal(calls.ledgerCreates.length, 1);
    assert.equal(calls.ledgerCreates[0].documents[0].eventType, "CREDIT");
    assert.equal(calls.ledgerCreates[0].documents[0].amountPaise, 120000);
    assert.equal(calls.membershipCreates[0].createOptions.session, session);
    assert.equal(calls.walletCreates[0].createOptions.session, session);
    assert.equal(calls.ledgerCreates[0].createOptions.session, session);
  });
});

test("prepaid enrollment retries are idempotent and do not create a second credit", async () => {
  const plan = prepaidValuePlan();
  const payment = { method: "UPI", amount: 1000, reference: "txn-123" };
  const fingerprint = customerController._private.buildEnrollmentFingerprint({
    vendorId: plan.vendorId,
    membershipPlanId: plan._id,
    mobile: "919876543210",
    payment,
  });
  const replayMembership = {
    _id: id("690000000000000000000004"),
    vendorId: plan.vendorId,
    customerId: id("690000000000000000000003"),
    membershipPlanId: plan._id,
    membershipType: "PREPAID_VALUE",
    enrollmentRequestFingerprint: fingerprint,
    planSnapshot: { planId: plan._id, name: plan.name, eligibleMenuItemIds: [] },
    prepaidValueSnapshot: { paidAmountPaise: 100000, creditedAmountPaise: 120000, bonusAmountPaise: 20000 },
    status: "ACTIVE",
    activatedAt: new Date(),
    expiresAt: new Date(Date.now() + 86400000),
    payment,
  };
  const replayWallet = {
    _id: id("690000000000000000000005"),
    customerMembershipId: replayMembership._id,
    walletType: "PREPAID_VALUE",
    remainingAmountPaise: 120000,
    status: "ACTIVE",
  };

  await withPatchedEnrollmentModels(async ({ calls }) => {
    const res = response();
    await customerController.activateMembership({
      params: { vendorId: String(plan.vendorId) },
      vendorWriteAuth: { vendorId: String(plan.vendorId) },
      body: {
        membershipPlanId: String(plan._id),
        customerMobile: "9876543210",
        paymentMethod: "UPI",
        paymentAmount: 1000,
        paymentReference: "txn-123",
        idempotencyKey: "enroll-value-1",
      },
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.replayed, true);
    assert.equal(calls.membershipCreates.length, 0);
    assert.equal(calls.walletCreates.length, 0);
    assert.equal(calls.ledgerCreates.length, 0);
  }, { plan, replayMembership, replayWallet });
});

test("prepaid enrollment fails closed when feature gate is disabled", async () => {
  await withPatchedEnrollmentModels(async ({ calls }) => {
    const res = response();
    await customerController.activateMembership({
      params: { vendorId: "690000000000000000000001" },
      vendorWriteAuth: { vendorId: "690000000000000000000001" },
      body: {
        membershipPlanId: "690000000000000000000002",
        customerMobile: "9876543210",
        paymentMethod: "CASH",
        paymentAmount: 1000,
        idempotencyKey: "disabled-1",
      },
    }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.payload.code, "prepaid_membership_wallets_disabled");
    assert.equal(calls.membershipCreates.length, 0);
    assert.equal(calls.walletCreates.length, 0);
    assert.equal(calls.ledgerCreates.length, 0);
  }, { featureEnabled: false });
});

test("initial credit failure propagates from the transaction without a success response", async () => {
  await withPatchedEnrollmentModels(async ({ calls }) => {
    const res = response();
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      await customerController.activateMembership({
        params: { vendorId: "690000000000000000000001" },
        vendorWriteAuth: { vendorId: "690000000000000000000001" },
        body: {
          membershipPlanId: "690000000000000000000002",
          customerMobile: "9876543210",
          paymentMethod: "CASH",
          paymentAmount: 1000,
          idempotencyKey: "rollback-1",
        },
      }, res);
    } finally {
      console.error = originalConsoleError;
    }
    assert.equal(res.statusCode, 500);
    assert.equal(res.payload.success, false);
    assert.equal(calls.transactions, 1);
    assert.equal(calls.ledgerCreates.length, 1);
  }, { ledgerError: new Error("ledger write failed") });
});

test("exhausted prepaid renewal depletes the old wallet and activates independent credit immediately", async () => {
  const originals = {
    startSession: mongoose.startSession,
    planFindOne: MembershipPlan.findOne,
    membershipFindOne: CustomerMembership.findOne,
    membershipFind: CustomerMembership.find,
    membershipUpdateMany: CustomerMembership.updateMany,
    membershipUpdateOne: CustomerMembership.updateOne,
    membershipCreate: CustomerMembership.create,
    walletFindOne: PrepaidMembershipWallet.findOne,
    walletUpdateMany: PrepaidMembershipWallet.updateMany,
    walletUpdateOne: PrepaidMembershipWallet.updateOne,
    walletCreate: PrepaidMembershipWallet.create,
    ledgerCreate: PrepaidWalletLedger.create,
  };
  const vendorId = id("690000000000000000000001");
  const plan = prepaidValuePlan({ vendorId });
  const existing = {
    _id: id("690000000000000000000020"),
    vendorId,
    customerId: id("690000000000000000000003"),
    customerMobileSnapshot: "919876543210",
    membershipPlanId: plan._id,
    membershipType: "PREPAID_VALUE",
    status: "ACTIVE",
    activatedAt: new Date(Date.now() - 86400000),
    expiresAt: new Date(Date.now() + 86400000),
  };
  const creates = { memberships: [], wallets: [], ledgers: [] };
  const session = {
    withTransaction: async (work) => work(),
    endSession: async () => {},
  };
  mongoose.startSession = async () => session;
  let membershipFindCount = 0;
  CustomerMembership.findOne = () => {
    membershipFindCount += 1;
    return query(membershipFindCount <= 2 ? existing : null);
  };
  CustomerMembership.find = () => query([]);
  CustomerMembership.updateMany = async () => ({ modifiedCount: 0 });
  CustomerMembership.updateOne = async () => ({ modifiedCount: 1 });
  PrepaidMembershipWallet.updateMany = async () => ({ modifiedCount: 0 });
  PrepaidMembershipWallet.updateOne = async () => ({ modifiedCount: 1 });
  PrepaidMembershipWallet.findOne = () => query({
    _id: id("690000000000000000000023"),
    vendorId,
    customerId: existing.customerId,
    customerMembershipId: existing._id,
    walletType: "PREPAID_VALUE",
    status: "ACTIVE",
    remainingAmountPaise: 0,
  });
  MembershipPlan.findOne = () => query(plan);
  CustomerMembership.create = async (documents, options) => {
    creates.memberships.push({ documents, options });
    return [{ _id: id("690000000000000000000021"), ...documents[0], toObject() { return { ...this }; } }];
  };
  PrepaidMembershipWallet.create = async (documents, options) => {
    creates.wallets.push({ documents, options });
    return [{ _id: id("690000000000000000000022"), ...documents[0], toObject() { return { ...this }; } }];
  };
  PrepaidWalletLedger.create = async (documents, options) => {
    creates.ledgers.push({ documents, options });
    return documents;
  };
  const previousFlag = process.env.PREPAID_MEMBERSHIP_WALLETS_ENABLED;
  process.env.PREPAID_MEMBERSHIP_WALLETS_ENABLED = "true";

  try {
    const res = response();
    await customerController.renewMembership({
      params: { vendorId: String(vendorId), membershipId: String(existing._id) },
      vendorWriteAuth: { vendorId: String(vendorId) },
      body: {
        paymentMethod: "CASH",
        paymentAmount: 1000,
        idempotencyKey: "renew-value-1",
      },
    }, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.payload.data.status, "ACTIVE");
    assert.equal(creates.memberships.length, 1);
    assert.equal(String(creates.memberships[0].documents[0].renewedFromMembershipId), String(existing._id));
    assert.equal(creates.wallets.length, 1);
    assert.equal(creates.wallets[0].documents[0].status, "ACTIVE");
    assert.ok(
      new Date(creates.wallets[0].documents[0].activatesAt).getTime() < existing.expiresAt.getTime()
    );
    assert.equal(creates.ledgers.length, 1);
    assert.equal(creates.ledgers[0].documents[0].eventType, "CREDIT");
    assert.notEqual(
      String(creates.wallets[0].documents[0].customerMembershipId),
      String(existing._id)
    );
  } finally {
    mongoose.startSession = originals.startSession;
    MembershipPlan.findOne = originals.planFindOne;
    CustomerMembership.findOne = originals.membershipFindOne;
    CustomerMembership.find = originals.membershipFind;
    CustomerMembership.updateMany = originals.membershipUpdateMany;
    CustomerMembership.updateOne = originals.membershipUpdateOne;
    CustomerMembership.create = originals.membershipCreate;
    PrepaidMembershipWallet.findOne = originals.walletFindOne;
    PrepaidMembershipWallet.updateMany = originals.walletUpdateMany;
    PrepaidMembershipWallet.updateOne = originals.walletUpdateOne;
    PrepaidMembershipWallet.create = originals.walletCreate;
    PrepaidWalletLedger.create = originals.ledgerCreate;
    if (previousFlag === undefined) delete process.env.PREPAID_MEMBERSHIP_WALLETS_ENABLED;
    else process.env.PREPAID_MEMBERSHIP_WALLETS_ENABLED = previousFlag;
  }
});

test("prepaid renewals create separate wallets and preserve discount branches", () => {
  assert.deepEqual(PrepaidMembershipWallet.constants.WALLET_STATUSES, [
    "ACTIVE", "SCHEDULED", "DEPLETED", "EXPIRED", "CANCELLED",
  ]);
  assert.ok(PrepaidMembershipWallet.schema.path("activatesAt"));
  assert.ok(CustomerMembership.schema.indexes().some(([, options]) => (
    options.name === "prepaid_membership_enrollment_idempotency_unique" && options.unique
  )));

  const source = fs.readFileSync(
    path.join(__dirname, "../controllers/vendorCustomerMembershipController.js"),
    "utf8"
  );
  assert.match(source, /status: renewalStatus/);
  assert.match(source, /activatesAt: renewalStartsAt/);
  assert.match(source, /audit: \{ source: "MEMBERSHIP_RENEWAL"/);
  assert.match(source, /plan\.planType === "DISCOUNT"/);
});
