const assert = require("node:assert/strict");
const { after, afterEach, before, test } = require("node:test");
const axios = require("axios");
const mongoose = require("mongoose");

const BillingSession = require("../../models/BillingSession");
const Customer = require("../../models/Customer");
const CustomerMembership = require("../../models/CustomerMembership");
const MembershipPlan = require("../../models/MembershipPlan");
const PrepaidMembershipWallet = require("../../models/PrepaidMembershipWallet");
const PrepaidRedemptionAuthorization = require("../../models/PrepaidRedemptionAuthorization");
const PrepaidWalletLedger = require("../../models/PrepaidWalletLedger");
const Transaction = require("../../models/Transaction");
const VendorMenuNode = require("../../models/VendorMenuNode");
const membershipController = require("../../controllers/vendorCustomerMembershipController");
const prepaidWalletController = require("../../controllers/vendorPrepaidWalletController");
const {
  createCartFingerprint,
} = require("../../services/prepaidRedemptionAuthorizationService");
const {
  consumePrepaidAuthorization,
  reversePrepaidSettlement,
} = require("../../services/prepaidWalletSettlementService");
const { PrepaidMongoIntegrationHarness } = require("./mongoReplSetHarness");

const harness = new PrepaidMongoIntegrationHarness();
const originalFlags = {
  wallets: process.env.PREPAID_MEMBERSHIP_WALLETS_ENABLED,
  redemption: process.env.PREPAID_WALLET_REDEMPTION_ENABLED,
};
const originalAxios = {
  get: axios.get,
  post: axios.post,
  request: axios.request,
};

const indexedModels = [
  BillingSession,
  Customer,
  CustomerMembership,
  MembershipPlan,
  PrepaidMembershipWallet,
  PrepaidRedemptionAuthorization,
  PrepaidWalletLedger,
  Transaction,
  VendorMenuNode,
];

function oid() {
  return new mongoose.Types.ObjectId();
}

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

function duplicateKey(error) {
  return Number(error?.code) === 11000;
}

async function expectDuplicate(operation) {
  await assert.rejects(operation, duplicateKey);
}

async function createValuePlan(vendorId, suffix = "") {
  return MembershipPlan.create({
    vendorId,
    planType: "PREPAID_VALUE",
    name: `Value Wallet ${suffix}`.trim(),
    description: "Integration fixture",
    duration: "ANNUAL",
    sellingPrice: 1000,
    prepaidValueConfig: { prepaidValue: 1200, bonusValue: 200 },
    status: "ACTIVE",
  });
}

async function createDiscountPlan(vendorId, suffix = "") {
  return MembershipPlan.create({
    vendorId,
    planType: "DISCOUNT",
    name: `Discount Membership ${suffix}`.trim(),
    description: "Integration fixture",
    duration: "ANNUAL",
    sellingPrice: 500,
    discountPercentage: 10,
    minimumBillAmount: 0,
    eligibleMenuItemIds: [],
    status: "ACTIVE",
  });
}

async function createSessionsPlan(vendorId) {
  const item = await VendorMenuNode.create({
    vendorId,
    name: "Keratin Treatment",
    level: 2,
    isLeaf: true,
    price: 5000,
    pricingStatus: "Active",
    customType: "service_item",
    sourceType: "manual_upload",
    uploadBatchId: `integration-${oid()}`,
    datasetStatus: "active",
    pathNames: ["Hair", "Keratin Treatment"],
  });
  const plan = await MembershipPlan.create({
    vendorId,
    planType: "PREPAID_SESSIONS",
    name: "Pay 5 Get 6 Keratin",
    description: "Integration fixture",
    duration: "ANNUAL",
    sellingPrice: 25000,
    prepaidSessionsConfig: {
      eligibleItemId: item._id,
      eligibleItemSource: "vendor_menu_node",
      eligibleItemKind: "SERVICE",
      paidQuantity: 5,
      creditedQuantity: 6,
    },
    status: "ACTIVE",
  });
  return { item, plan };
}

async function enroll({ vendorId, plan, mobile, key }) {
  const res = response();
  await membershipController.activateMembership({
    params: { vendorId: String(vendorId) },
    vendorWriteAuth: { vendorId: String(vendorId), authType: "vendor" },
    body: {
      membershipPlanId: String(plan._id),
      customerMobile: mobile,
      paymentMethod: "CASH",
      paymentAmount: plan.sellingPrice,
      idempotencyKey: key,
    },
  }, res);
  return res;
}

async function renew({ vendorId, membershipId, key, paymentAmount = 1000 }) {
  const res = response();
  await membershipController.renewMembership({
    params: { vendorId: String(vendorId), membershipId: String(membershipId) },
    vendorWriteAuth: { vendorId: String(vendorId), authType: "vendor" },
    body: {
      paymentMethod: "CASH",
      paymentAmount,
      idempotencyKey: key,
    },
  }, res);
  return res;
}

function canonicalCart(itemId, quantity = 1, price = 500) {
  return [{
    itemId,
    itemSource: "vendor_menu_node",
    itemType: "SERVICE",
    name: "Integration Service",
    price,
    qty: quantity,
    total: price * quantity,
  }];
}

async function createVerifiedAuthorization({
  billing,
  wallet,
  amountPaise,
  quantity,
  itemId,
  now = new Date(),
}) {
  const authorizationType = wallet.walletType;
  return PrepaidRedemptionAuthorization.create({
    vendorId: billing.vendorId,
    customerId: billing.customerId,
    walletId: wallet._id,
    billingSessionId: billing._id,
    authorizationType,
    ...(authorizationType === "PREPAID_VALUE"
      ? { exactAmountPaise: amountPaise }
      : {
          exactQuantity: quantity,
          eligibleItemId: itemId,
          eligibleItemSource: "vendor_menu_node",
        }),
    cartFingerprint: createCartFingerprint({
      vendorId: billing.vendorId,
      customerId: billing.customerId,
      billingSessionId: billing._id,
      cartItems: billing.cartItems,
    }),
    otpHash: "integration-otp-hash-that-is-never-sent-000000000000000000",
    otpExpiresAt: new Date(now.getTime() + 10 * 60 * 1000),
    verifiedAt: now,
    status: "VERIFIED",
    lastSentAt: now,
    resendAvailableAt: now,
  });
}

async function completeWithPrepaid({ billingId, authorizationId, paymentMode, finalPayablePaise, now }) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const billing = await BillingSession.findOne({ _id: billingId, status: "ACTIVE" }).session(session);
      if (!billing) {
        const error = new Error("Billing already completed or locked");
        error.code = "billing_completion_conflict";
        throw error;
      }
      const snapshot = await consumePrepaidAuthorization({
        authorizationId,
        paymentMode,
        billing,
        cartItems: billing.cartItems,
        finalPayablePaise,
        operationalServiceValuePaise: finalPayablePaise,
        session,
        now,
      });
      const closed = await BillingSession.findOneAndUpdate(
        { _id: billing._id, status: "ACTIVE" },
        {
          $set: {
            status: "COMPLETED",
            completedAt: now,
            paymentMode,
            prepaidSettlementSnapshot: snapshot,
          },
        },
        { new: true, session }
      );
      if (!closed) throw new Error("Billing completion compare-and-set failed");
      const [transaction] = await Transaction.create([{
        vendorId: billing.vendorId,
        customerId: billing.customerId,
        billingSessionId: billing._id,
        totalAmount: finalPayablePaise / 100,
        finalPaidAmount: 0,
        paymentMode,
        prepaidSettlementSnapshot: snapshot,
        status: "COMPLETED",
      }], { session });
      result = { billing: closed, transaction, snapshot };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function reverseInTransaction({ billId, now, failAfterReversal = false }) {
  const session = await mongoose.startSession();
  try {
    let reversal;
    await session.withTransaction(async () => {
      const bill = await BillingSession.findById(billId).session(session);
      const transaction = await Transaction.findOne({ billingSessionId: billId }).session(session);
      reversal = await reversePrepaidSettlement({ bill, transaction, session, now });
      if (failAfterReversal) throw new Error("injected reversal failure");
      await BillingSession.updateOne(
        { _id: billId, status: "COMPLETED" },
        { $set: { status: "CANCELLED", cancelledAt: now } },
        { session }
      );
      await Transaction.updateOne(
        { _id: transaction._id, status: "COMPLETED" },
        { $set: { status: "CANCELLED", cancelledAt: now } },
        { session }
      );
    });
    return reversal;
  } finally {
    await session.endSession();
  }
}

before(async () => {
  process.env.PREPAID_MEMBERSHIP_WALLETS_ENABLED = "true";
  process.env.PREPAID_WALLET_REDEMPTION_ENABLED = "true";
  await harness.start();
  console.log(
    `[Prepaid Integration] MongoDB ${harness.identity.mongoVersion}; ` +
    `${harness.identity.topology}; members=${harness.identity.memberCount}`
  );
  await harness.createSchemaIndexes(indexedModels);
  const rejectExternalRequest = async () => {
    throw new Error("External HTTP is disabled in prepaid integration tests");
  };
  axios.get = rejectExternalRequest;
  axios.post = rejectExternalRequest;
  axios.request = rejectExternalRequest;
});

afterEach(async () => {
  await harness.clearData();
});

after(async () => {
  axios.get = originalAxios.get;
  axios.post = originalAxios.post;
  axios.request = originalAxios.request;
  if (originalFlags.wallets === undefined) delete process.env.PREPAID_MEMBERSHIP_WALLETS_ENABLED;
  else process.env.PREPAID_MEMBERSHIP_WALLETS_ENABLED = originalFlags.wallets;
  if (originalFlags.redemption === undefined) delete process.env.PREPAID_WALLET_REDEMPTION_ENABLED;
  else process.env.PREPAID_WALLET_REDEMPTION_ENABLED = originalFlags.redemption;
  await harness.stop();
});

test("harness is an isolated replica set with commit and abort support", () => {
  assert.match(harness.identity.databaseName, /^ynot_prepaid_it_[a-f0-9]{16}$/);
  assert.equal(harness.identity.topology, "ReplicaSetWithPrimary");
  assert.equal(harness.identity.memberCount, 1);
  assert.match(harness.identity.mongoVersion, /^\d+\.\d+\.\d+/);
});

test("actual prepaid indexes reject duplicates and permit absent optional references", async () => {
  const membershipIndexes = await CustomerMembership.collection.indexes();
  const walletIndexes = await PrepaidMembershipWallet.collection.indexes();
  const ledgerIndexes = await PrepaidWalletLedger.collection.indexes();
  const authorizationIndexes = await PrepaidRedemptionAuthorization.collection.indexes();
  const transactionIndexes = await Transaction.collection.indexes();
  const allIndexes = [
    ...membershipIndexes,
    ...walletIndexes,
    ...ledgerIndexes,
    ...authorizationIndexes,
    ...transactionIndexes,
  ];
  for (const name of [
    "customer_membership_active_discount_unique",
    "customer_membership_active_prepaid_unique",
    "customer_membership_renewal_lineage_unique",
    "prepaid_membership_enrollment_idempotency_unique",
    "prepaid_wallet_membership_unique",
    "prepaid_wallet_redemption_once",
    "prepaid_wallet_reversal_once",
    "prepaid_wallet_idempotency_key_unique",
    "prepaid_authorization_bill_unique",
    "transaction_billing_session_unique",
  ]) {
    assert.equal(allIndexes.find((index) => index.name === name)?.unique, true, `${name} must exist`);
  }
  assert.deepEqual(
    membershipIndexes
      .filter((index) => index.unique && index.key.vendorId === 1 && index.key.customerId === 1)
      .map((index) => index.name)
      .sort(),
    [
      "customer_membership_active_discount_unique",
      "customer_membership_active_prepaid_unique",
    ]
  );

  const memberships = CustomerMembership.collection;
  const vendorId = oid();
  const sourceId = oid();
  await memberships.insertOne({ vendorId, customerId: oid(), status: "EXPIRED", renewedFromMembershipId: sourceId });
  await expectDuplicate(memberships.insertOne({ vendorId, customerId: oid(), status: "ACTIVE", renewedFromMembershipId: sourceId }));
  await memberships.insertMany([
    { vendorId, customerId: oid(), status: "EXPIRED" },
    { vendorId, customerId: oid(), status: "EXPIRED", renewedFromMembershipId: null },
  ]);

  const activeCustomer = oid();
  await memberships.insertOne({
    vendorId,
    customerId: activeCustomer,
    status: "ACTIVE",
    membershipType: "DISCOUNT",
  });
  await memberships.insertOne({
    vendorId,
    customerId: activeCustomer,
    status: "ACTIVE",
    membershipType: "PREPAID_VALUE",
  });
  await expectDuplicate(memberships.insertOne({
    vendorId,
    customerId: activeCustomer,
    status: "ACTIVE",
    membershipType: "DISCOUNT",
  }));
  await expectDuplicate(memberships.insertOne({
    vendorId,
    customerId: activeCustomer,
    status: "ACTIVE",
    membershipType: "PREPAID_SESSIONS",
  }));
  await memberships.insertOne({ vendorId, customerId: oid(), status: "EXPIRED", enrollmentIdempotencyKey: "idem-1" });
  await expectDuplicate(memberships.insertOne({ vendorId, customerId: oid(), status: "EXPIRED", enrollmentIdempotencyKey: "idem-1" }));

  const membershipId = oid();
  await PrepaidMembershipWallet.collection.insertOne({ customerMembershipId: membershipId });
  await expectDuplicate(PrepaidMembershipWallet.collection.insertOne({ customerMembershipId: membershipId }));

  const walletId = oid();
  const billingId = oid();
  const sourceLedgerId = oid();
  await PrepaidWalletLedger.collection.insertOne({ walletId, billingSessionId: billingId, eventType: "REDEMPTION", idempotencyKey: "redeem-1" });
  await expectDuplicate(PrepaidWalletLedger.collection.insertOne({ walletId: oid(), billingSessionId: billingId, eventType: "REDEMPTION" }));
  await PrepaidWalletLedger.collection.insertOne({ walletId, sourceLedgerId, eventType: "CANCELLATION_REVERSAL", idempotencyKey: "reverse-1" });
  await expectDuplicate(PrepaidWalletLedger.collection.insertOne({ walletId, sourceLedgerId, eventType: "CANCELLATION_REVERSAL" }));
  await expectDuplicate(PrepaidWalletLedger.collection.insertOne({ walletId, eventType: "CREDIT", idempotencyKey: "redeem-1" }));

  await PrepaidRedemptionAuthorization.collection.insertOne({ billingSessionId: billingId });
  await expectDuplicate(PrepaidRedemptionAuthorization.collection.insertOne({ billingSessionId: billingId }));

  await Transaction.collection.insertOne({ billingSessionId: billingId });
  await expectDuplicate(Transaction.collection.insertOne({ billingSessionId: billingId }));
  await Transaction.collection.insertMany([{ marker: 1 }, { marker: 2 }]);
});

test("value and sessions enrollment persist one wallet and initial CREDIT atomically", async () => {
  const vendorId = oid();
  const valuePlan = await createValuePlan(vendorId);
  const sessions = await createSessionsPlan(vendorId);

  const valueResponse = await enroll({
    vendorId,
    plan: valuePlan,
    mobile: "9876500001",
    key: "integration-value-enrollment",
  });
  const sessionsResponse = await enroll({
    vendorId,
    plan: sessions.plan,
    mobile: "9876500002",
    key: "integration-sessions-enrollment",
  });

  assert.equal(valueResponse.statusCode, 201);
  assert.equal(sessionsResponse.statusCode, 201);
  const valueMembership = await CustomerMembership.findById(valueResponse.payload.data.id).lean();
  const sessionsMembership = await CustomerMembership.findById(sessionsResponse.payload.data.id).lean();
  const valueWallet = await PrepaidMembershipWallet.findOne({ customerMembershipId: valueMembership._id }).lean();
  const sessionsWallet = await PrepaidMembershipWallet.findOne({ customerMembershipId: sessionsMembership._id }).lean();
  assert.equal(valueWallet.remainingAmountPaise, 120000);
  assert.equal(sessionsWallet.remainingQuantity, 6);
  assert.equal(await PrepaidWalletLedger.countDocuments({ customerMembershipId: valueMembership._id, eventType: "CREDIT" }), 1);
  assert.equal(await PrepaidWalletLedger.countDocuments({ customerMembershipId: sessionsMembership._id, eventType: "CREDIT" }), 1);
});

test("Discount and Prepaid enrollment coexist in either order while each entitlement remains unique", async () => {
  const vendorId = oid();
  const discountPlan = await createDiscountPlan(vendorId);
  const valuePlan = await createValuePlan(vendorId);
  const { plan: sessionsPlan } = await createSessionsPlan(vendorId);

  const discountFirst = await enroll({
    vendorId,
    plan: discountPlan,
    mobile: "9876500031",
    key: "discount-first",
  });
  const prepaidSecond = await enroll({
    vendorId,
    plan: valuePlan,
    mobile: "9876500031",
    key: "prepaid-second",
  });
  assert.equal(discountFirst.statusCode, 201);
  assert.equal(prepaidSecond.statusCode, 201);

  const prepaidFirst = await enroll({
    vendorId,
    plan: sessionsPlan,
    mobile: "9876500032",
    key: "prepaid-first",
  });
  const discountSecond = await enroll({
    vendorId,
    plan: discountPlan,
    mobile: "9876500032",
    key: "discount-second",
  });
  assert.equal(prepaidFirst.statusCode, 201);
  assert.equal(discountSecond.statusCode, 201);

  const duplicateDiscount = await enroll({
    vendorId,
    plan: discountPlan,
    mobile: "9876500031",
    key: "duplicate-discount",
  });
  const duplicatePrepaid = await enroll({
    vendorId,
    plan: sessionsPlan,
    mobile: "9876500031",
    key: "duplicate-prepaid",
  });
  assert.equal(duplicateDiscount.statusCode, 409);
  assert.equal(duplicatePrepaid.statusCode, 409);

  const customer = await Customer.findOne({ fullNumber: "919876500031" }).lean();
  const active = await CustomerMembership.find({
    vendorId,
    customerId: customer._id,
    status: "ACTIVE",
  }).lean();
  assert.deepEqual(
    active.map((membership) => membership.membershipType).sort(),
    ["DISCOUNT", "PREPAID_VALUE"]
  );
});

test("concurrent enrollment and renewal preserve one financial record per request/source", async () => {
  const vendorId = oid();
  const plan = await createValuePlan(vendorId);
  const enrollmentResults = await Promise.all([
    enroll({ vendorId, plan, mobile: "9876500010", key: "same-enrollment" }),
    enroll({ vendorId, plan, mobile: "9876500010", key: "same-enrollment" }),
  ]);
  assert.ok(enrollmentResults.every((res) => [200, 201].includes(res.statusCode)));
  const original = await CustomerMembership.findOne({ vendorId, enrollmentIdempotencyKey: "same-enrollment" });
  assert.equal(await CustomerMembership.countDocuments({ vendorId, enrollmentIdempotencyKey: "same-enrollment" }), 1);
  assert.equal(await PrepaidMembershipWallet.countDocuments({ customerMembershipId: original._id }), 1);
  assert.equal(await PrepaidWalletLedger.countDocuments({ customerMembershipId: original._id, eventType: "CREDIT" }), 1);

  const originalWallet = await PrepaidMembershipWallet.findOne({ customerMembershipId: original._id });
  await PrepaidMembershipWallet.updateOne(
    { _id: originalWallet._id },
    {
      $set: {
        remainingAmountPaise: 0,
        consumedAmountPaise: originalWallet.creditedAmountPaise,
      },
    }
  );

  const renewalResults = await Promise.all([
    renew({ vendorId, membershipId: original._id, key: "renew-race-a" }),
    renew({ vendorId, membershipId: original._id, key: "renew-race-b" }),
  ]);
  assert.equal(renewalResults.filter((res) => res.statusCode === 201).length, 1);
  assert.equal(renewalResults.filter((res) => res.statusCode === 409).length, 1);
  const children = await CustomerMembership.find({ renewedFromMembershipId: original._id }).lean();
  assert.equal(children.length, 1);
  assert.equal(await PrepaidMembershipWallet.countDocuments({ customerMembershipId: children[0]._id }), 1);
  assert.equal(await PrepaidWalletLedger.countDocuments({ customerMembershipId: children[0]._id, eventType: "CREDIT" }), 1);
});

test("concurrent activation-boundary lookups promote membership and wallet together", async () => {
  const vendorId = oid();
  const { plan } = await createSessionsPlan(vendorId);
  const enrolled = await enroll({ vendorId, plan, mobile: "9876500020", key: "activation-parent" });
  const parent = await CustomerMembership.findById(enrolled.payload.data.id);
  const boundary = new Date("2030-01-01T00:00:00.000Z");
  const expiry = new Date("2031-01-01T00:00:00.000Z");
  const parentWallet = await PrepaidMembershipWallet.findOne({ customerMembershipId: parent._id }).lean();
  const childData = parent.toObject();
  delete childData._id;
  delete childData.createdAt;
  delete childData.updatedAt;
  childData.status = "SCHEDULED";
  childData.activatedAt = boundary;
  childData.expiresAt = expiry;
  childData.renewedFromMembershipId = parent._id;
  childData.enrollmentIdempotencyKey = "activation-child";
  childData.enrollmentRequestFingerprint = "activation-child-fixture";
  const child = await CustomerMembership.create(childData);
  const childWalletData = { ...parentWallet };
  delete childWalletData._id;
  delete childWalletData.createdAt;
  delete childWalletData.updatedAt;
  childWalletData.customerMembershipId = child._id;
  childWalletData.status = "SCHEDULED";
  childWalletData.activatesAt = boundary;
  childWalletData.expiresAt = expiry;
  childWalletData.idempotencyKey = "activation-child-wallet";
  const childWallet = await PrepaidMembershipWallet.create(childWalletData);
  await PrepaidWalletLedger.create({
    vendorId,
    customerId: parent.customerId,
    customerMembershipId: child._id,
    walletId: childWallet._id,
    walletType: "PREPAID_SESSIONS",
    eventType: "CREDIT",
    quantity: childWallet.creditedQuantity,
    occurredAt: new Date(boundary.getTime() - 1),
    idempotencyKey: "activation-child-credit",
  });
  await CustomerMembership.collection.updateOne({ _id: parent._id }, { $set: { expiresAt: boundary, status: "ACTIVE" } });
  await PrepaidMembershipWallet.collection.updateOne({ customerMembershipId: parent._id }, { $set: { expiresAt: boundary, status: "ACTIVE" } });
  await CustomerMembership.collection.updateOne({ _id: child._id }, { $set: { activatedAt: boundary, expiresAt: expiry, status: "SCHEDULED" } });
  await PrepaidMembershipWallet.collection.updateOne({ customerMembershipId: child._id }, { $set: { activatesAt: boundary, expiresAt: expiry, status: "SCHEDULED" } });
  const discountMembershipId = oid();
  await CustomerMembership.collection.insertOne({
    _id: discountMembershipId,
    vendorId,
    customerId: parent.customerId,
    membershipType: "DISCOUNT",
    status: "ACTIVE",
    activatedAt: new Date(boundary.getTime() - 24 * 60 * 60 * 1000),
    expiresAt: expiry,
  });

  const results = await Promise.all([
    prepaidWalletController._private.loadAvailableWallet(vendorId, parent.customerId, null, boundary),
    prepaidWalletController._private.loadAvailableWallet(vendorId, parent.customerId, null, boundary),
  ]);
  assert.ok(results.every((result) => String(result.wallet.customerMembershipId) === String(child._id)));
  const [storedParent, storedChild, storedChildWallet, storedDiscount] = await Promise.all([
    CustomerMembership.findById(parent._id).lean(),
    CustomerMembership.findById(child._id).lean(),
    PrepaidMembershipWallet.findOne({ customerMembershipId: child._id }).lean(),
    CustomerMembership.findById(discountMembershipId).lean(),
  ]);
  assert.equal(storedParent.status, "EXPIRED");
  assert.equal(storedChild.status, "ACTIVE");
  assert.equal(storedChildWallet.status, "ACTIVE");
  assert.equal(storedDiscount.status, "ACTIVE");
  assert.equal(await PrepaidWalletLedger.countDocuments({ customerMembershipId: child._id, eventType: "CREDIT" }), 1);
});

test("value and sessions settlement persist exact deductions and reject insufficient balances", async () => {
  const vendorId = oid();
  const valuePlan = await createValuePlan(vendorId);
  const sessions = await createSessionsPlan(vendorId);
  const valueEnrollment = await enroll({ vendorId, plan: valuePlan, mobile: "9876500030", key: "settle-value" });
  const sessionsEnrollment = await enroll({ vendorId, plan: sessions.plan, mobile: "9876500031", key: "settle-sessions" });
  const valueMembership = await CustomerMembership.findById(valueEnrollment.payload.data.id);
  const sessionsMembership = await CustomerMembership.findById(sessionsEnrollment.payload.data.id);
  const valueWallet = await PrepaidMembershipWallet.findOne({ customerMembershipId: valueMembership._id });
  const sessionsWallet = await PrepaidMembershipWallet.findOne({ customerMembershipId: sessionsMembership._id });
  const now = new Date();

  const valueBill = await BillingSession.create({
    vendorId,
    customerId: valueMembership.customerId,
    cartItems: canonicalCart(oid(), 1, 500),
    totalAmount: 500,
    status: "ACTIVE",
  });
  const valueAuthorization = await createVerifiedAuthorization({
    billing: valueBill,
    wallet: valueWallet,
    amountPaise: 50000,
    now,
  });
  await completeWithPrepaid({
    billingId: valueBill._id,
    authorizationId: valueAuthorization._id,
    paymentMode: "PREPAID_VALUE",
    finalPayablePaise: 50000,
    now,
  });

  const sessionBill = await BillingSession.create({
    vendorId,
    customerId: sessionsMembership.customerId,
    cartItems: canonicalCart(sessions.item._id, 2, 5000),
    totalAmount: 10000,
    status: "ACTIVE",
  });
  const sessionAuthorization = await createVerifiedAuthorization({
    billing: sessionBill,
    wallet: sessionsWallet,
    quantity: 2,
    itemId: sessions.item._id,
    now,
  });
  await completeWithPrepaid({
    billingId: sessionBill._id,
    authorizationId: sessionAuthorization._id,
    paymentMode: "PREPAID_SESSIONS",
    finalPayablePaise: 1000000,
    now,
  });

  assert.equal((await PrepaidMembershipWallet.findById(valueWallet._id)).remainingAmountPaise, 70000);
  assert.equal((await PrepaidMembershipWallet.findById(sessionsWallet._id)).remainingQuantity, 4);
  assert.equal(await PrepaidWalletLedger.countDocuments({ eventType: "REDEMPTION" }), 2);

  const insufficientBill = await BillingSession.create({
    vendorId,
    customerId: valueMembership.customerId,
    cartItems: canonicalCart(oid(), 1, 800),
    totalAmount: 800,
    status: "ACTIVE",
  });
  const insufficientAuthorization = await createVerifiedAuthorization({
    billing: insufficientBill,
    wallet: valueWallet,
    amountPaise: 80000,
    now,
  });
  await assert.rejects(completeWithPrepaid({
    billingId: insufficientBill._id,
    authorizationId: insufficientAuthorization._id,
    paymentMode: "PREPAID_VALUE",
    finalPayablePaise: 80000,
    now,
  }), (error) => error.code === "prepaid_wallet_insufficient");
  assert.equal((await PrepaidRedemptionAuthorization.findById(insufficientAuthorization._id)).status, "VERIFIED");
  assert.equal((await BillingSession.findById(insufficientBill._id)).status, "ACTIVE");
});

test("concurrent bill completion and competing bills preserve wallet and transaction invariants", async () => {
  const vendorId = oid();
  const plan = await createValuePlan(vendorId);
  const enrollment = await enroll({ vendorId, plan, mobile: "9876500040", key: "completion-race" });
  const membership = await CustomerMembership.findById(enrollment.payload.data.id);
  const wallet = await PrepaidMembershipWallet.findOne({ customerMembershipId: membership._id });
  const now = new Date();
  const bill = await BillingSession.create({
    vendorId,
    customerId: membership.customerId,
    cartItems: canonicalCart(oid(), 1, 400),
    totalAmount: 400,
    status: "ACTIVE",
  });
  const authorization = await createVerifiedAuthorization({ billing: bill, wallet, amountPaise: 40000, now });
  const duplicateResults = await Promise.allSettled([
    completeWithPrepaid({ billingId: bill._id, authorizationId: authorization._id, paymentMode: "PREPAID_VALUE", finalPayablePaise: 40000, now }),
    completeWithPrepaid({ billingId: bill._id, authorizationId: authorization._id, paymentMode: "PREPAID_VALUE", finalPayablePaise: 40000, now }),
  ]);
  assert.equal(duplicateResults.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(await Transaction.countDocuments({ billingSessionId: bill._id }), 1);
  assert.equal(await PrepaidWalletLedger.countDocuments({ billingSessionId: bill._id, eventType: "REDEMPTION" }), 1);

  const competingBills = await Promise.all([1, 2].map((number) => BillingSession.create({
    vendorId,
    customerId: membership.customerId,
    cartItems: canonicalCart(oid(), 1, 500),
    totalAmount: 500,
    status: "ACTIVE",
    customerNameSnapshot: `Competing ${number}`,
  })));
  const competingAuthorizations = await Promise.all(competingBills.map((entry) => createVerifiedAuthorization({
    billing: entry,
    wallet,
    amountPaise: 50000,
    now,
  })));
  const competition = await Promise.allSettled(competingBills.map((entry, index) => completeWithPrepaid({
    billingId: entry._id,
    authorizationId: competingAuthorizations[index]._id,
    paymentMode: "PREPAID_VALUE",
    finalPayablePaise: 50000,
    now,
  })));
  assert.equal(competition.filter((result) => result.status === "fulfilled").length, 1);
  const finalWallet = await PrepaidMembershipWallet.findById(wallet._id);
  assert.equal(finalWallet.remainingAmountPaise, 30000);
  assert.equal(finalWallet.consumedAmountPaise, 90000);
});

test("settlement and reversal failures roll back, while concurrent reversal restores once", async () => {
  const vendorId = oid();
  const plan = await createValuePlan(vendorId);
  const enrollment = await enroll({ vendorId, plan, mobile: "9876500050", key: "rollback-fixture" });
  const membership = await CustomerMembership.findById(enrollment.payload.data.id);
  const wallet = await PrepaidMembershipWallet.findOne({ customerMembershipId: membership._id });
  const now = new Date();
  const rollbackBill = await BillingSession.create({
    vendorId,
    customerId: membership.customerId,
    cartItems: canonicalCart(oid(), 1, 200),
    totalAmount: 200,
    status: "ACTIVE",
  });
  const rollbackAuthorization = await createVerifiedAuthorization({ billing: rollbackBill, wallet, amountPaise: 20000, now });
  const rollbackSession = await mongoose.startSession();
  await assert.rejects(rollbackSession.withTransaction(async () => {
    await consumePrepaidAuthorization({
      authorizationId: rollbackAuthorization._id,
      paymentMode: "PREPAID_VALUE",
      billing: rollbackBill,
      cartItems: rollbackBill.cartItems,
      finalPayablePaise: 20000,
      operationalServiceValuePaise: 20000,
      session: rollbackSession,
      now,
    });
    throw new Error("injected settlement failure");
  }), /injected settlement failure/);
  await rollbackSession.endSession();
  assert.equal((await PrepaidMembershipWallet.findById(wallet._id)).remainingAmountPaise, 120000);
  assert.equal((await PrepaidRedemptionAuthorization.findById(rollbackAuthorization._id)).status, "VERIFIED");
  assert.equal(await PrepaidWalletLedger.countDocuments({ billingSessionId: rollbackBill._id }), 0);

  const bill = await BillingSession.create({
    vendorId,
    customerId: membership.customerId,
    cartItems: canonicalCart(oid(), 1, 300),
    totalAmount: 300,
    status: "ACTIVE",
  });
  const authorization = await createVerifiedAuthorization({ billing: bill, wallet, amountPaise: 30000, now });
  await completeWithPrepaid({ billingId: bill._id, authorizationId: authorization._id, paymentMode: "PREPAID_VALUE", finalPayablePaise: 30000, now });

  await assert.rejects(reverseInTransaction({ billId: bill._id, now: new Date(now.getTime() + 1000), failAfterReversal: true }), /injected reversal failure/);
  assert.equal((await PrepaidMembershipWallet.findById(wallet._id)).remainingAmountPaise, 90000);
  assert.equal(await PrepaidWalletLedger.countDocuments({ billingSessionId: bill._id, eventType: "CANCELLATION_REVERSAL" }), 0);

  const reversals = await Promise.allSettled([
    reverseInTransaction({ billId: bill._id, now: new Date(now.getTime() + 2000) }),
    reverseInTransaction({ billId: bill._id, now: new Date(now.getTime() + 2000) }),
  ]);
  assert.equal(reversals.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal((await PrepaidMembershipWallet.findById(wallet._id)).remainingAmountPaise, 120000);
  assert.equal(await PrepaidWalletLedger.countDocuments({ billingSessionId: bill._id, eventType: "CANCELLATION_REVERSAL" }), 1);
  assert.equal((await BillingSession.findById(bill._id)).status, "CANCELLED");
});

test("concurrent OTP resend reservations and resend-versus-verification preserve one OTP generation", async () => {
  const vendorId = oid();
  const customerId = oid();
  const walletId = oid();
  const billId = oid();
  const now = new Date();
  const authorization = await PrepaidRedemptionAuthorization.create({
    vendorId,
    customerId,
    walletId,
    billingSessionId: billId,
    authorizationType: "PREPAID_VALUE",
    exactAmountPaise: 10000,
    cartFingerprint: "integration-fingerprint",
    otpHash: "old-integration-otp-hash-000000000000000000000000000000",
    otpExpiresAt: new Date(now.getTime() + 600000),
    status: "PENDING",
    sendCount: 1,
    otpGeneration: 1,
    providerSubmissionCount: 1,
    lastSentAt: new Date(now.getTime() - 60000),
    resendAvailableAt: new Date(now.getTime() - 1000),
  });
  const loaded = await PrepaidRedemptionAuthorization.findById(authorization._id).select("+otpHash +sendReservationToken");
  const reservations = await Promise.all([
    prepaidWalletController._private.reserveExistingAuthorization(loaded, "reservation-a", now, new Date(now.getTime() + 30000)),
    prepaidWalletController._private.reserveExistingAuthorization(loaded, "reservation-b", now, new Date(now.getTime() + 30000)),
  ]);
  assert.equal(reservations.filter(Boolean).length, 1);
  let stored = await PrepaidRedemptionAuthorization.findById(authorization._id).select("+otpHash +sendReservationToken");
  assert.equal(stored.providerSubmissionCount, 2);
  assert.equal(stored.sendCount, 1);
  assert.equal(stored.otpGeneration, 1);
  assert.equal(stored.otpHash, authorization.otpHash);

  await PrepaidRedemptionAuthorization.collection.updateOne(
    { _id: authorization._id },
    { $unset: { sendReservationToken: 1, sendReservationExpiresAt: 1 }, $set: { resendAvailableAt: new Date(now.getTime() - 1000) } }
  );
  stored = await PrepaidRedemptionAuthorization.findById(authorization._id).select("+otpHash +sendReservationToken");
  const [, verified] = await Promise.all([
    prepaidWalletController._private.reserveExistingAuthorization(stored, "reservation-c", now, new Date(now.getTime() + 30000)),
    PrepaidRedemptionAuthorization.findOneAndUpdate(
      { _id: authorization._id, status: "PENDING", otpHash: stored.otpHash, otpGeneration: 1 },
      { $set: { status: "VERIFIED", verifiedAt: now } },
      { new: true }
    ),
  ]);
  assert.ok(verified);
  const finalization = await prepaidWalletController._private.finalizeAcceptedReservation(
    authorization._id,
    "reservation-c",
    {
      otpHash: "replacement-hash-that-must-not-win-000000000000000000000",
      otpExpiresAt: new Date(now.getTime() + 600000),
      now,
      resendAvailableAt: new Date(now.getTime() + 30000),
    }
  );
  assert.equal(finalization, null);
  const final = await PrepaidRedemptionAuthorization.findById(authorization._id).select("+otpHash");
  assert.equal(final.status, "VERIFIED");
  assert.equal(final.otpGeneration, 1);
  assert.equal(final.otpHash, authorization.otpHash);
});
