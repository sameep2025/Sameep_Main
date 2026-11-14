const assert = require("node:assert/strict");
const { after, afterEach, before, test } = require("node:test");
const axios = require("axios");
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const request = require("supertest");

const originalEnvironment = {
  jwtSecret: process.env.JWT_SECRET,
  wallets: process.env.PREPAID_MEMBERSHIP_WALLETS_ENABLED,
  redemption: process.env.PREPAID_WALLET_REDEMPTION_ENABLED,
};
process.env.JWT_SECRET = "prepaid-http-integration-secret";
process.env.PREPAID_MEMBERSHIP_WALLETS_ENABLED = "true";
process.env.PREPAID_WALLET_REDEMPTION_ENABLED = "true";

const BillingSession = require("../../models/BillingSession");
const Customer = require("../../models/Customer");
const CustomerMembership = require("../../models/CustomerMembership");
const DummyVendor = require("../../models/DummyVendor");
const PrepaidMembershipWallet = require("../../models/PrepaidMembershipWallet");
const PrepaidRedemptionAuthorization = require("../../models/PrepaidRedemptionAuthorization");
const PrepaidWalletLedger = require("../../models/PrepaidWalletLedger");
const Session = require("../../models/Session");
const Transaction = require("../../models/Transaction");
const VendorMenuNode = require("../../models/VendorMenuNode");
const VendorWallet = require("../../models/VendorWallet");
const VendorWalletLedger = require("../../models/VendorWalletLedger");
const billingRoutes = require("../../routes/billingRoutes");
const prepaidWalletRoutes = require("../../routes/vendorPrepaidWalletRoutes");
const { PrepaidMongoIntegrationHarness } = require("./mongoReplSetHarness");

const harness = new PrepaidMongoIntegrationHarness();
const sentPrepaidOtps = new Map();
const originalAxiosPost = axios.post;
let identity;

const indexedModels = [
  BillingSession,
  Customer,
  CustomerMembership,
  DummyVendor,
  PrepaidMembershipWallet,
  PrepaidRedemptionAuthorization,
  PrepaidWalletLedger,
  Session,
  Transaction,
  VendorMenuNode,
  VendorWalletLedger,
];

function oid() {
  return new mongoose.Types.ObjectId();
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/billing", billingRoutes);
  app.use("/api/vendor/prepaid-wallets", prepaidWalletRoutes);
  return app;
}

const app = createApp();

async function createVendorSession(suffix) {
  const owner = await Customer.create({
    countryCode: "91",
    phone: `70000${suffix.padStart(5, "0")}`,
    fullNumber: `9170000${suffix.padStart(5, "0")}`,
    displayName: `Owner ${suffix}`,
  });
  const vendor = await DummyVendor.create({
    customerId: owner._id,
    phone: owner.fullNumber,
    businessName: `HTTP Integration Vendor ${suffix}`,
    contactName: `Owner ${suffix}`,
    categoryId: oid(),
    subdomain: `prepaid-http-${suffix}`,
    status: "Active",
    billingPreferences: { sendWhatsAppBill: false },
    gstSettings: { enabled: false },
  });
  const session = await Session.create({
    userId: owner._id,
    vendorId: String(vendor._id),
    sessionType: "STANDARD",
    authMethod: "PASSCODE",
    expiryTime: new Date(Date.now() + 60 * 60 * 1000),
    isActive: true,
  });
  const token = jwt.sign(
    { customerId: String(owner._id), vendorId: String(vendor._id), sessionId: String(session._id) },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
  await VendorWallet.create({ vendorId: vendor._id, otpBalance: 50, whatsappBalance: 0 });
  return { owner, vendor, session, token };
}

async function createCustomer(suffix) {
  return Customer.create({
    countryCode: "91",
    phone: `80000${suffix.padStart(5, "0")}`,
    fullNumber: `9180000${suffix.padStart(5, "0")}`,
    displayName: `Wallet Customer ${suffix}`,
  });
}

async function createMenuItem(vendorId, suffix, price = 500) {
  return VendorMenuNode.create({
    vendorId,
    name: `Integration Service ${suffix}`,
    level: 2,
    isLeaf: true,
    price,
    pricingStatus: "Active",
    customType: "service_item",
    sourceType: "manual_upload",
    uploadBatchId: `prepaid-http-${suffix}-${oid()}`,
    datasetStatus: "active",
    pathNames: ["Integration", `Service ${suffix}`],
  });
}

async function createPrepaidFixture({ type = "PREPAID_VALUE", suffix, balance = 120000, quantity = 6 }) {
  const vendorAuth = await createVendorSession(suffix);
  const customer = await createCustomer(suffix);
  const item = await createMenuItem(vendorAuth.vendor._id, suffix);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const membershipId = oid();
  const membership = await CustomerMembership.create({
    _id: membershipId,
    vendorId: vendorAuth.vendor._id,
    customerId: customer._id,
    customerMobileSnapshot: customer.fullNumber,
    membershipPlanId: oid(),
    membershipType: type,
    enrollmentIdempotencyKey: `http-enrollment-${suffix}`,
    planSnapshot: {
      planId: oid(),
      name: type === "PREPAID_VALUE" ? "Value Wallet" : "Sessions Wallet",
      description: "HTTP integration fixture",
      duration: "MONTHLY",
      sellingPrice: type === "PREPAID_VALUE" ? balance / 100 : 2500,
      discountPercentage: 0,
      eligibleMenuItemIds: [],
      minimumBillAmount: 0,
      applyDiscountOnNonMembershipItems: false,
      rewardsOnNonMembershipItems: true,
      allowAdditionalDiscountOnMembershipItems: false,
      allowRewardsOnMembershipItems: false,
      benefitSemanticsVersion: "MEMBERSHIP_ITEM_FLAGS_V1",
    },
    ...(type === "PREPAID_VALUE"
      ? {
          prepaidValueSnapshot: {
            paidAmountPaise: balance,
            creditedAmountPaise: balance,
            bonusAmountPaise: 0,
            enrolledAt: now,
            expiresAt,
          },
        }
      : {
          prepaidSessionsSnapshot: {
            eligibleItemId: item._id,
            eligibleItemSource: "vendor_menu_node",
            eligibleItemKind: "SERVICE",
            itemName: item.name,
            unitPricePaise: 50000,
            categoryPath: ["Integration"],
            packageIncludes: "",
            terms: "",
            paidQuantity: Math.max(quantity - 1, 1),
            creditedQuantity: quantity,
            enrolledAt: now,
            expiresAt,
          },
        }),
    sellingPriceAtPurchase: type === "PREPAID_VALUE" ? balance / 100 : 2500,
    activatedAt: now,
    expiresAt,
    status: "ACTIVE",
    payment: { method: "CASH", amount: type === "PREPAID_VALUE" ? balance / 100 : 2500 },
  });
  const wallet = await PrepaidMembershipWallet.create({
    vendorId: vendorAuth.vendor._id,
    customerId: customer._id,
    customerMembershipId: membership._id,
    walletType: type,
    ...(type === "PREPAID_VALUE"
      ? { creditedAmountPaise: balance, consumedAmountPaise: 0, remainingAmountPaise: balance }
      : { creditedQuantity: quantity, consumedQuantity: 0, remainingQuantity: quantity }),
    activatesAt: now,
    expiresAt,
    status: "ACTIVE",
  });
  await PrepaidWalletLedger.create({
    vendorId: vendorAuth.vendor._id,
    customerId: customer._id,
    customerMembershipId: membership._id,
    walletId: wallet._id,
    walletType: type,
    eventType: "CREDIT",
    ...(type === "PREPAID_VALUE" ? { amountPaise: balance } : { quantity }),
    occurredAt: now,
    idempotencyKey: `initial-credit:${membership._id}`,
  });
  return { ...vendorAuth, customer, item, membership, wallet };
}

async function addDiscountMembership(fixture, discountPercentage = 10) {
  const now = new Date();
  return CustomerMembership.create({
    vendorId: fixture.vendor._id,
    customerId: fixture.customer._id,
    customerMobileSnapshot: fixture.customer.fullNumber,
    membershipPlanId: oid(),
    membershipType: "DISCOUNT",
    planSnapshot: {
      planId: oid(),
      name: "Coexisting Discount Membership",
      description: "HTTP integration fixture",
      duration: "MONTHLY",
      sellingPrice: 500,
      discountPercentage,
      eligibleMenuItemIds: [fixture.item._id],
      minimumBillAmount: 0,
      allowAdditionalDiscountOnMembershipItems: false,
      allowRewardsOnMembershipItems: false,
      benefitSemanticsVersion: "MEMBERSHIP_ITEM_FLAGS_V1",
    },
    sellingPriceAtPurchase: 500,
    activatedAt: now,
    expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    status: "ACTIVE",
    payment: { method: "CASH", amount: 500 },
  });
}

function cartFor(item, { quantity = 1, price = 500 } = {}) {
  return [{
    itemId: item._id,
    itemSource: "vendor_menu_node",
    itemType: "SERVICE",
    name: item.name,
    price,
    qty: quantity,
    total: price * quantity,
    nodePath: ["Integration", item.name],
  }];
}

async function createAndUpdateBill(fixture, options = {}) {
  const cartItems = cartFor(fixture.item, options);
  const grossAmount = cartItems.reduce((sum, item) => sum + item.total, 0);
  const discountAmount = Number(options.discountAmount || 0);
  const created = await request(app)
    .post("/api/billing/create")
    .set(auth(fixture.token))
    .send({ vendorId: fixture.vendor._id, customerId: fixture.customer._id });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const billingId = created.body.data._id;
  const updated = await request(app)
    .post("/api/billing/update")
    .set(auth(fixture.token))
    .send({
      billingId,
      cartItems,
      grossAmount,
      discountAmount,
      manualDiscountMode: discountAmount > 0 ? "amount" : null,
      manualDiscountPercent: 0,
    });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  return { billingId, cartItems, grossAmount };
}

async function authorizeBill(fixture, bill, { amountPaise, quantity } = {}) {
  const prepared = await request(app)
    .post(`/api/vendor/prepaid-wallets/${fixture.vendor._id}/authorizations/prepare`)
    .set(auth(fixture.token))
    .send({
      walletId: fixture.wallet._id,
      billingSessionId: bill.billingId,
      ...(fixture.wallet.walletType === "PREPAID_VALUE" ? { amountPaise } : { quantity }),
    });
  assert.equal(prepared.status, 200, JSON.stringify(prepared.body));
  const authorizationId = prepared.body.authorization.id;
  const otp = sentPrepaidOtps.get(fixture.customer.fullNumber);
  assert.match(otp || "", /^\d{6}$/);
  const verified = await request(app)
    .post(`/api/vendor/prepaid-wallets/${fixture.vendor._id}/authorizations/${authorizationId}/verify`)
    .set(auth(fixture.token))
    .send({ otp });
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  assert.equal(verified.body.authorization.status, "VERIFIED");
  return authorizationId;
}

async function completeBill(fixture, billingId, authorizationId) {
  return request(app)
    .post("/api/billing/complete")
    .set(auth(fixture.token))
    .send({
      billingId,
      paymentMode: fixture.wallet.walletType,
      prepaidAuthorizationId: authorizationId,
    });
}

async function assertSingleSettlement({ fixture, billingId, amountPaise, quantity }) {
  const [bill, transaction, wallet, redemptions] = await Promise.all([
    BillingSession.findById(billingId).lean(),
    Transaction.findOne({ billingSessionId: billingId }).lean(),
    PrepaidMembershipWallet.findById(fixture.wallet._id).lean(),
    PrepaidWalletLedger.find({ billingSessionId: billingId, eventType: "REDEMPTION" }).lean(),
  ]);
  assert.equal(bill.status, "COMPLETED");
  assert.ok(bill.prepaidSettlementSnapshot);
  assert.equal(transaction.paymentStatus, "PREPAID_PAID");
  assert.equal(transaction.billingSource, "PREPAID_WALLET");
  assert.deepEqual(
    JSON.parse(JSON.stringify(bill.prepaidSettlementSnapshot)),
    JSON.parse(JSON.stringify(transaction.prepaidSettlementSnapshot))
  );
  assert.equal(redemptions.length, 1);
  if (amountPaise != null) {
    assert.equal(wallet.consumedAmountPaise, amountPaise);
    assert.equal(
      bill.prepaidSettlementSnapshot.remainingAmountPaiseAfterRedemption,
      wallet.remainingAmountPaise
    );
    assert.equal(redemptions[0].amountPaise, amountPaise);
  } else {
    assert.equal(wallet.consumedQuantity, quantity);
    assert.equal(
      bill.prepaidSettlementSnapshot.remainingQuantityAfterRedemption,
      wallet.remainingQuantity
    );
    assert.equal(redemptions[0].quantity, quantity);
  }
}

before(async () => {
  identity = await harness.start();
  await harness.createSchemaIndexes(indexedModels);
  await VendorWallet.createCollection();
  await VendorWallet.collection.createIndex(
    { vendorId: 1 },
    { unique: true, name: "vendorId_1" }
  );
  axios.post = async (url, data) => {
    if (String(url).endsWith("/verify")) return { status: 200, data: { type: "success" } };
    if (String(url).includes("/api/v5/otp")) {
      if (data?.otp) sentPrepaidOtps.set(String(data.mobile), String(data.otp));
      return { status: 200, data: { type: "success", request_id: `integration-${oid()}` } };
    }
    throw new Error(`Unexpected external HTTP call: ${url}`);
  };
});

afterEach(async () => {
  await new Promise((resolve) => setImmediate(resolve));
  sentPrepaidOtps.clear();
  await harness.clearData();
});

after(async () => {
  axios.post = originalAxiosPost;
  await harness.stop();
  for (const [key, value] of Object.entries(originalEnvironment)) {
    const environmentKey = {
      jwtSecret: "JWT_SECRET",
      wallets: "PREPAID_MEMBERSHIP_WALLETS_ENABLED",
      redemption: "PREPAID_WALLET_REDEMPTION_ENABLED",
    }[key];
    if (value === undefined) delete process.env[environmentKey];
    else process.env[environmentKey] = value;
  }
});

test("HTTP harness uses the verified isolated replica set", () => {
  assert.match(identity.databaseName, /^ynot_prepaid_it_[a-f0-9]{16}$/);
  assert.equal(identity.topology, "ReplicaSetWithPrimary");
  assert.equal(identity.memberCount, 1);
});

test("authenticated Value Wallet flow creates, updates, authorizes, and completes exactly once", async () => {
  const fixture = await createPrepaidFixture({ type: "PREPAID_VALUE", suffix: "101", balance: 120000 });
  const bill = await createAndUpdateBill(fixture);
  const authorizationId = await authorizeBill(fixture, bill, { amountPaise: 50000 });
  const completed = await completeBill(fixture, bill.billingId, authorizationId);
  assert.equal(completed.status, 200, JSON.stringify(completed.body));
  assert.equal(completed.body.transaction.finalPaidAmount, 0);
  await assertSingleSettlement({ fixture, billingId: bill.billingId, amountPaise: 50000 });

  const duplicate = await completeBill(fixture, bill.billingId, authorizationId);
  assert.equal(duplicate.status, 400);
  await assertSingleSettlement({ fixture, billingId: bill.billingId, amountPaise: 50000 });
  const persistedBill = await BillingSession.findById(bill.billingId).lean();
  assert.ok(
    persistedBill.prepaidSettlementSnapshot,
    "completed BillingSession must persist its immutable prepaid settlement snapshot"
  );
});

test("Value Wallet completion applies manual discount before authorization and settlement", async () => {
  const fixture = await createPrepaidFixture({
    type: "PREPAID_VALUE",
    suffix: "113",
    balance: 125000,
  });
  const bill = await createAndUpdateBill(fixture, { price: 1260, discountAmount: 10 });
  const authorizationId = await authorizeBill(fixture, bill, { amountPaise: 125000 });
  const completed = await completeBill(fixture, bill.billingId, authorizationId);
  assert.equal(completed.status, 200, JSON.stringify(completed.body));

  const [storedBill, transaction, wallet, membership, ledger] = await Promise.all([
    BillingSession.findById(bill.billingId).lean(),
    Transaction.findOne({ billingSessionId: bill.billingId }).lean(),
    PrepaidMembershipWallet.findById(fixture.wallet._id).lean(),
    CustomerMembership.findById(fixture.membership._id).lean(),
    PrepaidWalletLedger.findOne({ billingSessionId: bill.billingId, eventType: "REDEMPTION" }).lean(),
  ]);
  assert.equal(storedBill.grossAmount, 1260);
  assert.equal(storedBill.discountAmount, 10);
  assert.equal(storedBill.totalAmount, 1250);
  assert.equal(transaction.discountAmount, 10);
  assert.equal(wallet.remainingAmountPaise, 0);
  assert.equal(wallet.status, "DEPLETED");
  assert.equal(membership.status, "DEPLETED");
  assert.equal(ledger.amountPaise, 125000);
});

test("authenticated Sessions Wallet flow consumes the exact eligible quantity", async () => {
  const fixture = await createPrepaidFixture({ type: "PREPAID_SESSIONS", suffix: "102", quantity: 6 });
  const bill = await createAndUpdateBill(fixture, { quantity: 2 });
  const authorizationId = await authorizeBill(fixture, bill, { quantity: 2 });
  const completed = await completeBill(fixture, bill.billingId, authorizationId);
  assert.equal(completed.status, 200, JSON.stringify(completed.body));
  await assertSingleSettlement({ fixture, billingId: bill.billingId, quantity: 2 });
  const wallet = await PrepaidMembershipWallet.findById(fixture.wallet._id).lean();
  assert.equal(wallet.remainingQuantity, 4);
});

test("prepaid ignores multiple Discounts while standard billing requires exactly one selection", async () => {
  const fixture = await createPrepaidFixture({
    type: "PREPAID_VALUE",
    suffix: "112",
    balance: 100000,
  });
  const discountMembership = await addDiscountMembership(fixture);
  const secondDiscountMembership = await addDiscountMembership(fixture, 20);

  const prepaidBill = await createAndUpdateBill(fixture);
  const authorizationId = await authorizeBill(fixture, prepaidBill, { amountPaise: 50000 });
  const prepaidCompleted = await completeBill(fixture, prepaidBill.billingId, authorizationId);
  assert.equal(prepaidCompleted.status, 200, JSON.stringify(prepaidCompleted.body));
  const storedPrepaidBill = await BillingSession.findById(prepaidBill.billingId).lean();
  assert.equal(storedPrepaidBill.discountAmount, 0);
  assert.equal(storedPrepaidBill.membershipDiscountAmount, 0);
  assert.equal(storedPrepaidBill.membershipBillingSnapshot?.customerMembershipId ?? null, null);
  assert.equal((await CustomerMembership.findById(discountMembership._id).lean()).status, "ACTIVE");
  assert.equal((await CustomerMembership.findById(secondDiscountMembership._id).lean()).status, "ACTIVE");

  const standardBill = await createAndUpdateBill(fixture);
  const selectionRequired = await request(app)
    .post("/api/billing/complete")
    .set(auth(fixture.token))
    .send({ billingId: standardBill.billingId, paymentMode: "CASH" });
  assert.equal(selectionRequired.status, 409, JSON.stringify(selectionRequired.body));
  assert.equal(selectionRequired.body.code, "discount_membership_selection_required");

  const standardCompleted = await request(app)
    .post("/api/billing/complete")
    .set(auth(fixture.token))
    .send({
      billingId: standardBill.billingId,
      paymentMode: "CASH",
      discountMembershipId: discountMembership._id,
    });
  assert.equal(standardCompleted.status, 200, JSON.stringify(standardCompleted.body));
  const storedStandardBill = await BillingSession.findById(standardBill.billingId).lean();
  assert.equal(storedStandardBill.membershipDiscountAmount, 50);
  assert.equal(storedStandardBill.totalAmount, 450);
  assert.equal(String(storedStandardBill.membershipBillingSnapshot.customerMembershipId), String(discountMembership._id));
  assert.equal((await PrepaidMembershipWallet.findById(fixture.wallet._id).lean()).remainingAmountPaise, 50000);
});

test("billing mutations reject missing authentication and cross-vendor ownership", async () => {
  const fixture = await createPrepaidFixture({ type: "PREPAID_VALUE", suffix: "103" });
  const other = await createVendorSession("104");
  const missing = await request(app)
    .post("/api/billing/create")
    .send({ vendorId: fixture.vendor._id, customerId: fixture.customer._id });
  assert.equal(missing.status, 401);

  const bill = await createAndUpdateBill(fixture);
  const crossVendor = await request(app)
    .post("/api/billing/update")
    .set(auth(other.token))
    .send({ billingId: bill.billingId, cartItems: bill.cartItems });
  assert.equal(crossVendor.status, 403);
  const stored = await BillingSession.findById(bill.billingId).lean();
  assert.equal(stored.status, "ACTIVE");
  assert.equal(stored.totalAmount, bill.grossAmount);
});

test("concurrent completion requests against one bill produce one transaction and one debit", async () => {
  const fixture = await createPrepaidFixture({ type: "PREPAID_VALUE", suffix: "105", balance: 100000 });
  const bill = await createAndUpdateBill(fixture);
  const authorizationId = await authorizeBill(fixture, bill, { amountPaise: 50000 });
  const responses = await Promise.all([
    completeBill(fixture, bill.billingId, authorizationId),
    completeBill(fixture, bill.billingId, authorizationId),
  ]);
  assert.equal(responses.filter((response) => response.status === 200).length, 1);
  assert.equal(responses.filter((response) => response.status !== 200).length, 1);
  assert.equal(await Transaction.countDocuments({ billingSessionId: bill.billingId }), 1);
  assert.equal(await PrepaidWalletLedger.countDocuments({ billingSessionId: bill.billingId, eventType: "REDEMPTION" }), 1);
  await assertSingleSettlement({ fixture, billingId: bill.billingId, amountPaise: 50000 });
});

test("competing bills cannot overdraw one Value Wallet", async () => {
  const fixture = await createPrepaidFixture({ type: "PREPAID_VALUE", suffix: "106", balance: 90000 });
  const firstBill = await createAndUpdateBill(fixture, { price: 500 });
  const secondBill = await createAndUpdateBill(fixture, { price: 500 });
  const firstAuthorization = await authorizeBill(fixture, firstBill, { amountPaise: 50000 });
  const secondAuthorization = await authorizeBill(fixture, secondBill, { amountPaise: 50000 });
  const responses = await Promise.all([
    completeBill(fixture, firstBill.billingId, firstAuthorization),
    completeBill(fixture, secondBill.billingId, secondAuthorization),
  ]);
  assert.equal(responses.filter((response) => response.status === 200).length, 1);
  assert.equal(responses.filter((response) => response.status === 409).length, 1);
  const wallet = await PrepaidMembershipWallet.findById(fixture.wallet._id).lean();
  assert.equal(wallet.remainingAmountPaise, 40000);
  assert.equal(wallet.consumedAmountPaise, 50000);
  assert.equal(await Transaction.countDocuments({ vendorId: fixture.vendor._id }), 1);
  assert.equal(await PrepaidWalletLedger.countDocuments({ eventType: "REDEMPTION" }), 1);
});

test("cancellation enforces seven days and restores a prepaid debit exactly once", async () => {
  const fixture = await createPrepaidFixture({ type: "PREPAID_VALUE", suffix: "107", balance: 100000 });
  const bill = await createAndUpdateBill(fixture);
  const authorizationId = await authorizeBill(fixture, bill, { amountPaise: 50000 });
  assert.equal((await completeBill(fixture, bill.billingId, authorizationId)).status, 200);

  const requested = await request(app)
    .post(`/api/billing/${bill.billingId}/cancel/request-otp`)
    .set(auth(fixture.token))
    .send({ reason: "WRONG_SERVICES" });
  assert.equal(requested.status, 200, JSON.stringify(requested.body));
  const cancelled = await request(app)
    .post(`/api/billing/${bill.billingId}/cancel/verify-otp`)
    .set(auth(fixture.token))
    .send({
      otp: "123456",
      cancelOtpAttemptToken: requested.body.data.cancelOtpAttemptToken,
      reason: "WRONG_SERVICES",
    });
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
  const wallet = await PrepaidMembershipWallet.findById(fixture.wallet._id).lean();
  assert.equal(wallet.remainingAmountPaise, 100000);
  assert.equal(wallet.consumedAmountPaise, 0);
  assert.equal(await PrepaidWalletLedger.countDocuments({ eventType: "CANCELLATION_REVERSAL" }), 1);
  const redemption = await PrepaidWalletLedger.findOne({ eventType: "REDEMPTION" }).lean();
  const reversal = await PrepaidWalletLedger.findOne({ eventType: "CANCELLATION_REVERSAL" }).lean();
  assert.equal(String(reversal.sourceLedgerId), String(redemption._id));
  assert.equal(String(reversal.walletId), String(fixture.wallet._id));
  assert.equal((await BillingSession.findById(bill.billingId).lean()).status, "CANCELLED");
  assert.equal((await Transaction.findOne({ billingSessionId: bill.billingId }).lean()).status, "CANCELLED");

  const duplicate = await request(app)
    .post(`/api/billing/${bill.billingId}/cancel/request-otp`)
    .set(auth(fixture.token))
    .send({ reason: "WRONG_SERVICES" });
  assert.equal(duplicate.status, 409);
  assert.equal(await PrepaidWalletLedger.countDocuments({ eventType: "CANCELLATION_REVERSAL" }), 1);
  assert.equal((await completeBill(fixture, bill.billingId, authorizationId)).status, 400);

  const oldFixture = await createPrepaidFixture({ type: "PREPAID_VALUE", suffix: "108", balance: 100000 });
  const oldBill = await createAndUpdateBill(oldFixture);
  const oldAuthorization = await authorizeBill(oldFixture, oldBill, { amountPaise: 50000 });
  assert.equal((await completeBill(oldFixture, oldBill.billingId, oldAuthorization)).status, 200);
  const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
  await BillingSession.updateOne({ _id: oldBill.billingId }, { $set: { completedAt: oldDate } });
  await Transaction.updateOne({ billingSessionId: oldBill.billingId }, { $set: { createdAt: oldDate } });
  const expired = await request(app)
    .post(`/api/billing/${oldBill.billingId}/cancel/request-otp`)
    .set(auth(oldFixture.token))
    .send({ reason: "WRONG_AMOUNT" });
  assert.equal(expired.status, 400);
  assert.match(expired.body.message, /period expired/i);
});

test("an injected ledger failure rolls back authorization, wallet, bill, and transaction", async () => {
  const fixture = await createPrepaidFixture({ type: "PREPAID_VALUE", suffix: "109", balance: 100000 });
  const bill = await createAndUpdateBill(fixture);
  const authorizationId = await authorizeBill(fixture, bill, { amountPaise: 50000 });
  const originalCreate = PrepaidWalletLedger.create;
  PrepaidWalletLedger.create = async function injectedFailure(documents, options) {
    const payload = Array.isArray(documents) ? documents[0] : documents;
    if (payload?.eventType === "REDEMPTION") throw new Error("injected redemption ledger failure");
    return originalCreate.call(this, documents, options);
  };
  let response;
  try {
    response = await completeBill(fixture, bill.billingId, authorizationId);
  } finally {
    PrepaidWalletLedger.create = originalCreate;
  }
  assert.equal(response.status, 500);
  const [storedBill, storedWallet, storedAuthorization] = await Promise.all([
    BillingSession.findById(bill.billingId).lean(),
    PrepaidMembershipWallet.findById(fixture.wallet._id).lean(),
    PrepaidRedemptionAuthorization.findById(authorizationId).lean(),
  ]);
  assert.equal(storedBill.status, "ACTIVE");
  assert.equal(storedBill.prepaidSettlementSnapshot, undefined);
  assert.equal(storedWallet.remainingAmountPaise, 100000);
  assert.equal(storedWallet.consumedAmountPaise, 0);
  assert.equal(storedAuthorization.status, "VERIFIED");
  assert.equal(storedAuthorization.consumedAt, null);
  assert.equal(await Transaction.countDocuments({ billingSessionId: bill.billingId }), 0);
  assert.equal(await PrepaidWalletLedger.countDocuments({ billingSessionId: bill.billingId }), 0);
});

test("a snapshot persistence conflict rolls back the complete prepaid transaction", async () => {
  const fixture = await createPrepaidFixture({ type: "PREPAID_VALUE", suffix: "110", balance: 100000 });
  const bill = await createAndUpdateBill(fixture);
  const authorizationId = await authorizeBill(fixture, bill, { amountPaise: 50000 });
  const originalUpdateOne = BillingSession.collection.updateOne;
  BillingSession.collection.updateOne = async function snapshotConflict(filter, update, options) {
    if (update?.$set?.prepaidSettlementSnapshot) return { acknowledged: true, modifiedCount: 0 };
    return originalUpdateOne.call(this, filter, update, options);
  };
  let response;
  try {
    response = await completeBill(fixture, bill.billingId, authorizationId);
  } finally {
    BillingSession.collection.updateOne = originalUpdateOne;
  }
  assert.equal(response.status, 409);
  const [storedBill, storedWallet, storedAuthorization] = await Promise.all([
    BillingSession.findById(bill.billingId).lean(),
    PrepaidMembershipWallet.findById(fixture.wallet._id).lean(),
    PrepaidRedemptionAuthorization.findById(authorizationId).lean(),
  ]);
  assert.equal(storedBill.status, "ACTIVE");
  assert.equal(storedBill.prepaidSettlementSnapshot, undefined);
  assert.equal(storedWallet.remainingAmountPaise, 100000);
  assert.equal(storedWallet.consumedAmountPaise, 0);
  assert.equal(storedAuthorization.status, "VERIFIED");
  assert.equal(storedAuthorization.consumedAt, null);
  assert.equal(await Transaction.countDocuments({ billingSessionId: bill.billingId }), 0);
  assert.equal(await PrepaidWalletLedger.countDocuments({ billingSessionId: bill.billingId }), 0);
});
