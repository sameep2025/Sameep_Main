const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const mongoose = require("mongoose");

const BillingSession = require("../models/BillingSession");
const Customer = require("../models/Customer");
const CustomerMembership = require("../models/CustomerMembership");
const PrepaidMembershipWallet = require("../models/PrepaidMembershipWallet");
const PrepaidRedemptionAuthorization = require("../models/PrepaidRedemptionAuthorization");
const Transaction = require("../models/Transaction");
const billingController = require("../controllers/billingController");
const prepaidController = require("../controllers/vendorPrepaidWalletController");
const {
  assertPrepaidWalletRedemptionEnabled,
  isPrepaidWalletRedemptionEnabled,
} = require("../services/prepaidMembershipCapability");
const {
  MAX_OTP_ATTEMPTS,
  MAX_OTP_PROVIDER_SUBMISSIONS,
  MAX_OTP_SENDS,
  assertAuthorizationCanResend,
  assertAuthorizationCanVerify,
  createCartFingerprint,
  getEligibleSessionQuantity,
  hashOtp,
  verifyOtpHash,
} = require("../services/prepaidRedemptionAuthorizationService");

function id(value) {
  return new mongoose.Types.ObjectId(value);
}

function query(value) {
  return {
    select() { return this; },
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

const ids = {
  vendor: "690000000000000000000001",
  customer: "690000000000000000000002",
  membership: "690000000000000000000003",
  wallet: "690000000000000000000004",
  bill: "690000000000000000000005",
  item: "690000000000000000000006",
  authorization: "690000000000000000000007",
  ledger: "690000000000000000000008",
};

function cart(overrides = {}) {
  return [{
    itemId: id(ids.item),
    itemSource: "vendor_menu_node",
    itemType: "SERVICE",
    name: "Keratin Treatment",
    qty: 1,
    price: 5000,
    ...overrides,
  }];
}

test("redemption feature gate is independently disabled by default", () => {
  assert.equal(isPrepaidWalletRedemptionEnabled({}), false);
  assert.throws(
    () => assertPrepaidWalletRedemptionEnabled({ PREPAID_MEMBERSHIP_WALLETS_ENABLED: "true" }),
    (error) => error.code === "prepaid_wallet_redemption_disabled"
  );
  assert.doesNotThrow(() => assertPrepaidWalletRedemptionEnabled({
    PREPAID_MEMBERSHIP_WALLETS_ENABLED: "true",
    PREPAID_WALLET_REDEMPTION_ENABLED: "true",
  }));
});

test("capability response exposes both gates without enabling either", async () => {
  const originalWallets = process.env.PREPAID_MEMBERSHIP_WALLETS_ENABLED;
  const originalRedemption = process.env.PREPAID_WALLET_REDEMPTION_ENABLED;
  try {
    delete process.env.PREPAID_MEMBERSHIP_WALLETS_ENABLED;
    delete process.env.PREPAID_WALLET_REDEMPTION_ENABLED;
    const disabled = response();
    await prepaidController.getCapabilities({}, disabled);
    assert.deepEqual(disabled.payload.capabilities, {
      prepaidMembershipWallets: false,
      prepaidWalletRedemption: false,
      walletPaymentAvailable: false,
    });

    process.env.PREPAID_MEMBERSHIP_WALLETS_ENABLED = "true";
    process.env.PREPAID_WALLET_REDEMPTION_ENABLED = "true";
    const enabled = response();
    await prepaidController.getCapabilities({}, enabled);
    assert.equal(enabled.payload.capabilities.walletPaymentAvailable, true);
  } finally {
    if (originalWallets === undefined) delete process.env.PREPAID_MEMBERSHIP_WALLETS_ENABLED;
    else process.env.PREPAID_MEMBERSHIP_WALLETS_ENABLED = originalWallets;
    if (originalRedemption === undefined) delete process.env.PREPAID_WALLET_REDEMPTION_ENABLED;
    else process.env.PREPAID_WALLET_REDEMPTION_ENABLED = originalRedemption;
  }
});

test("OTP metadata masks the enrolled mobile", () => {
  assert.equal(prepaidController._private.maskMobile("919876543210"), "********3210");
  assert.equal(prepaidController._private.maskMobile("12"), "");
});

test("MSG91 delivery requires documented success type and request id", async () => {
  const { OTP_DELIVERY_OUTCOMES, classifyMsg91Response, sendPrepaidOtp } = prepaidController._private;
  assert.equal(
    classifyMsg91Response({ data: { type: "success", request_id: "provider-request" } }),
    OTP_DELIVERY_OUTCOMES.ACCEPTED
  );
  assert.equal(
    classifyMsg91Response({ data: { type: "error", message: "invalid template" } }),
    OTP_DELIVERY_OUTCOMES.REJECTED
  );
  assert.equal(
    classifyMsg91Response({ data: { type: "success" } }),
    OTP_DELIVERY_OUTCOMES.UNCERTAIN
  );
  assert.equal(
    classifyMsg91Response({ data: {} }),
    OTP_DELIVERY_OUTCOMES.UNCERTAIN
  );
  assert.equal(
    await sendPrepaidOtp("919876543210", "123456", async () => ({
      data: { type: "success", request_id: "provider-request" },
    })),
    OTP_DELIVERY_OUTCOMES.ACCEPTED
  );
  assert.equal(
    await sendPrepaidOtp("919876543210", "123456", async () => {
      const error = new Error("rejected");
      error.response = { status: 400, data: { type: "error" } };
      throw error;
    }),
    OTP_DELIVERY_OUTCOMES.REJECTED
  );
  assert.equal(
    await sendPrepaidOtp("919876543210", "123456", async () => {
      const error = new Error("timeout");
      error.code = "ECONNABORTED";
      throw error;
    }),
    OTP_DELIVERY_OUTCOMES.UNCERTAIN
  );
  assert.equal(
    await sendPrepaidOtp("919876543210", "123456", async () => {
      const error = new Error("provider unavailable");
      error.response = { status: 503, data: {} };
      throw error;
    }),
    OTP_DELIVERY_OUTCOMES.UNCERTAIN
  );
});

test("resend reservation and outcome updates preserve the previous OTP until acceptance", async () => {
  const calls = [];
  const model = {
    findOneAndUpdate(filter, update, options) {
      calls.push({ method: "findOneAndUpdate", filter, update, options });
      return Promise.resolve({ _id: id(ids.authorization) });
    },
    updateOne(filter, update) {
      calls.push({ method: "updateOne", filter, update });
      return Promise.resolve({ modifiedCount: 1 });
    },
    deleteOne(filter) {
      calls.push({ method: "deleteOne", filter });
      return Promise.resolve({ deletedCount: 1 });
    },
  };
  const now = new Date("2026-11-06T12:00:00.000Z");
  const reservationExpiresAt = new Date(now.getTime() + 30000);
  const resendAvailableAt = new Date(now.getTime() + 60000);
  const authorization = {
    _id: id(ids.authorization),
    status: "PENDING",
    sendCount: 1,
    otpHash: "previous-hash",
    failedVerificationAttempts: 2,
  };

  await prepaidController._private.reserveExistingAuthorization(
    authorization,
    "reservation-one",
    now,
    reservationExpiresAt,
    model
  );
  const reserve = calls.pop();
  assert.deepEqual(reserve.update.$inc, { providerSubmissionCount: 1 });
  assert.equal(reserve.update.$set.sendReservationToken, "reservation-one");
  assert.equal(reserve.update.$set.otpHash, undefined);
  assert.equal(reserve.update.$inc.sendCount, undefined);
  assert.ok(reserve.filter.$and[1].$or.some((entry) => entry.sendReservationExpiresAt));

  await prepaidController._private.releaseRejectedReservation(
    authorization,
    "reservation-one",
    true,
    model
  );
  const rejected = calls.pop();
  assert.equal(rejected.filter.sendReservationToken, "reservation-one");
  assert.deepEqual(rejected.update, {
    $unset: { sendReservationToken: 1, sendReservationExpiresAt: 1 },
  });

  await prepaidController._private.finalizeUncertainReservation(
    authorization._id,
    "reservation-two",
    resendAvailableAt,
    model
  );
  const uncertain = calls.pop();
  assert.equal(uncertain.filter.sendReservationToken, "reservation-two");
  assert.deepEqual(uncertain.update.$set, { resendAvailableAt });
  assert.equal(uncertain.update.$set.otpHash, undefined);
  assert.equal(uncertain.update.$inc, undefined);

  await prepaidController._private.finalizeAcceptedReservation(
    authorization._id,
    "reservation-three",
    {
      otpHash: "replacement-hash",
      otpExpiresAt: reservationExpiresAt,
      now,
      resendAvailableAt,
    },
    model
  );
  const accepted = calls.pop();
  assert.equal(accepted.filter.status, "PENDING");
  assert.equal(accepted.filter.sendReservationToken, "reservation-three");
  assert.equal(accepted.update.$set.otpHash, "replacement-hash");
  assert.equal(accepted.update.$set.failedVerificationAttempts, 0);
  assert.deepEqual(accepted.update.$inc, { sendCount: 1, otpGeneration: 1 });
});

test("authorization preparation leaves final GST payable validation to atomic completion", () => {
  const controller = fs.readFileSync(
    path.join(__dirname, "../controllers/vendorPrepaidWalletController.js"),
    "utf8"
  );
  assert.doesNotMatch(controller, /amount\s*>\s*payablePaise/);
  assert.match(controller, /amount\s*>\s*wallet\.remainingAmountPaise/);
  assert.match(controller, /remainingVerificationAttempts/);
});

test("cart fingerprint binds canonical identity, price and quantity but not item order", () => {
  const shared = { vendorId: ids.vendor, customerId: ids.customer, billingSessionId: ids.bill };
  const second = {
    itemId: id("690000000000000000000009"),
    itemSource: "custom_package",
    itemType: "PACKAGE",
    name: "Bridal Combo",
    qty: 2,
    price: 3000,
  };
  const first = createCartFingerprint({ ...shared, cartItems: [...cart(), second] });
  const reordered = createCartFingerprint({ ...shared, cartItems: [second, ...cart()] });
  assert.equal(first, reordered);
  assert.notEqual(first, createCartFingerprint({ ...shared, cartItems: [...cart({ qty: 2 }), second] }));
  assert.notEqual(first, createCartFingerprint({ ...shared, cartItems: [...cart({ price: 4900 }), second] }));
  assert.throws(
    () => createCartFingerprint({ ...shared, cartItems: cart({ itemSource: undefined }) }),
    (error) => error.code === "prepaid_cart_identity_required"
  );
});

test("session quantity counts only the exact eligible source and item", () => {
  const items = [
    ...cart({ qty: 2 }),
    ...cart({ itemSource: "vendor_price_node", qty: 7 }),
    ...cart({ itemId: id("690000000000000000000010"), qty: 4 }),
  ];
  assert.equal(getEligibleSessionQuantity(items, "vendor_menu_node", ids.item), 2);
});

test("OTP hashes are one-way and verify only the exact code", async () => {
  const env = { PREPAID_OTP_HASH_SECRET: "test-only-secret" };
  const hash = await hashOtp("123456", env);
  assert.equal(hash.includes("123456"), false);
  assert.equal(await verifyOtpHash("123456", hash, env), true);
  assert.equal(await verifyOtpHash("654321", hash, env), false);
});

test("OTP state rules enforce expiry, retries, resend cooldown, limits and reuse rejection", () => {
  const now = new Date("2026-11-05T12:00:00.000Z");
  assert.throws(() => assertAuthorizationCanResend({
    status: "PENDING",
    sendCount: 1,
    resendAvailableAt: new Date(now.getTime() + 1000),
  }, now), (error) => error.code === "prepaid_otp_resend_cooldown");
  assert.throws(() => assertAuthorizationCanResend({
    status: "PENDING",
    sendCount: MAX_OTP_SENDS,
    resendAvailableAt: now,
  }, now), (error) => error.code === "prepaid_otp_resend_limit");
  assert.throws(() => assertAuthorizationCanResend({
    status: "PENDING",
    sendCount: 1,
    providerSubmissionCount: MAX_OTP_PROVIDER_SUBMISSIONS,
    resendAvailableAt: now,
  }, now), (error) => error.code === "prepaid_otp_submission_limit");
  assert.throws(() => assertAuthorizationCanResend({
    status: "PENDING",
    sendCount: 1,
    providerSubmissionCount: 1,
    sendReservationToken: "active-reservation",
    sendReservationExpiresAt: new Date(now.getTime() + 1000),
    resendAvailableAt: now,
  }, now), (error) => error.code === "prepaid_otp_resend_conflict");
  assert.doesNotThrow(() => assertAuthorizationCanResend({
    status: "PENDING",
    sendCount: 1,
    providerSubmissionCount: 1,
    sendReservationToken: "expired-reservation",
    sendReservationExpiresAt: new Date(now.getTime() - 1),
    resendAvailableAt: now,
  }, now));
  assert.throws(() => assertAuthorizationCanVerify({
    status: "PENDING",
    otpExpiresAt: new Date(now.getTime() - 1),
    failedVerificationAttempts: 0,
  }, now), (error) => error.code === "prepaid_otp_expired");
  assert.throws(() => assertAuthorizationCanVerify({
    status: "PENDING",
    otpExpiresAt: new Date(now.getTime() + 1000),
    failedVerificationAttempts: MAX_OTP_ATTEMPTS,
  }, now), (error) => error.code === "prepaid_otp_attempt_limit");
  assert.throws(() => assertAuthorizationCanVerify({
    status: "VERIFIED",
    otpExpiresAt: new Date(now.getTime() + 1000),
    failedVerificationAttempts: 0,
  }, now), (error) => error.code === "prepaid_authorization_not_pending");
});

test("authorization schema binds exactly one wallet dimension and stores no plaintext OTP", async () => {
  const common = {
    vendorId: id(ids.vendor),
    customerId: id(ids.customer),
    walletId: id(ids.wallet),
    billingSessionId: id(ids.bill),
    cartFingerprint: "a".repeat(64),
    otpHash: "$2b$10$" + "x".repeat(53),
    otpExpiresAt: new Date(Date.now() + 600000),
    resendAvailableAt: new Date(),
  };
  await new PrepaidRedemptionAuthorization({
    ...common,
    authorizationType: "PREPAID_VALUE",
    exactAmountPaise: 10000,
  }).validate();
  await new PrepaidRedemptionAuthorization({
    ...common,
    billingSessionId: id("690000000000000000000011"),
    authorizationType: "PREPAID_SESSIONS",
    eligibleItemId: id(ids.item),
    eligibleItemSource: "vendor_menu_node",
    exactQuantity: 1,
  }).validate();
  await assert.rejects(new PrepaidRedemptionAuthorization({
    ...common,
    authorizationType: "PREPAID_VALUE",
    exactAmountPaise: 10000,
    exactQuantity: 1,
  }).validate(), /value authorization/);
  assert.equal(PrepaidRedemptionAuthorization.schema.path("otp"), undefined);
  assert.equal(PrepaidRedemptionAuthorization.schema.path("otpHash").options.select, false);
  assert.equal(PrepaidRedemptionAuthorization.schema.path("sendReservationToken").options.select, false);
  assert.equal(PrepaidRedemptionAuthorization.schema.path("otpGeneration").options.min, 0);
  assert.equal(PrepaidRedemptionAuthorization.schema.path("providerSubmissionCount").options.min, 0);
});

test("verification finalization is generation-bound and no response exposes OTP state", () => {
  const controller = fs.readFileSync(
    path.join(__dirname, "../controllers/vendorPrepaidWalletController.js"),
    "utf8"
  );
  const verify = controller.slice(controller.indexOf("exports.verifyAuthorization"));
  assert.match(verify, /\.\.\.otpGenerationFilter\(authorization\)/);
  assert.match(verify, /otpHash:\s*authorization\.otpHash/);
  assert.doesNotMatch(verify, /json\([^)]*otpHash/);
  assert.doesNotMatch(verify, /json\([^)]*reservationToken/);
  assert.deepEqual(prepaidController._private.otpGenerationFilter({ otpGeneration: 0 }), {
    otpGeneration: 0,
  });
  assert.deepEqual(prepaidController._private.otpGenerationFilter({ otpGeneration: 1 }), {
    $or: [
      { otpGeneration: 1 },
      { otpGeneration: { $exists: false } },
    ],
  });
});

test("wallet lookup returns minimum value and session response shapes", async () => {
  const originals = {
    customer: Customer.findById,
    membership: CustomerMembership.findOne,
    wallet: PrepaidMembershipWallet.findOne,
  };
  const now = new Date();
  Customer.findById = () => query({ _id: id(ids.customer), fullNumber: "919876543210" });
  const membership = {
    _id: id(ids.membership),
    vendorId: id(ids.vendor),
    customerId: id(ids.customer),
    membershipType: "PREPAID_VALUE",
    customerMobileSnapshot: "919876543210",
    prepaidSessionsSnapshot: null,
  };
  CustomerMembership.findOne = () => query(membership);
  PrepaidMembershipWallet.findOne = () => query({
    _id: id(ids.wallet),
    customerMembershipId: id(ids.membership),
    walletType: "PREPAID_VALUE",
    remainingAmountPaise: 125000,
    expiresAt: new Date(now.getTime() + 86400000),
  });
  try {
    const value = await prepaidController._private.loadAvailableWallet(
      ids.vendor,
      ids.customer,
      "",
      now,
      { reconcileLifecycle: async () => ({ promoted: false }) }
    );
    assert.deepEqual(prepaidController._private.serializeWallet(value.wallet, value.membership), {
      id: ids.wallet,
      customerMembershipId: ids.membership,
      walletType: "PREPAID_VALUE",
      expiresAt: value.wallet.expiresAt,
      remainingAmountPaise: 125000,
    });

    membership.membershipType = "PREPAID_SESSIONS";
    membership.prepaidSessionsSnapshot = {
      eligibleItemId: id(ids.item),
      eligibleItemSource: "vendor_menu_node",
      eligibleItemKind: "SERVICE",
      itemName: "Keratin Treatment",
    };
    PrepaidMembershipWallet.findOne = () => query({
      _id: id(ids.wallet),
      customerMembershipId: id(ids.membership),
      walletType: "PREPAID_SESSIONS",
      remainingQuantity: 4,
      expiresAt: new Date(now.getTime() + 86400000),
    });
    const sessions = await prepaidController._private.loadAvailableWallet(
      ids.vendor,
      ids.customer,
      "",
      now,
      { reconcileLifecycle: async () => ({ promoted: false }) }
    );
    const output = prepaidController._private.serializeWallet(sessions.wallet, sessions.membership);
    assert.equal(output.remainingQuantity, 4);
    assert.deepEqual(output.eligibleItem, {
      itemId: ids.item,
      itemSource: "vendor_menu_node",
      itemType: "SERVICE",
      itemName: "Keratin Treatment",
    });
    assert.equal(output.otpHash, undefined);
  } finally {
    Customer.findById = originals.customer;
    CustomerMembership.findOne = originals.membership;
    PrepaidMembershipWallet.findOne = originals.wallet;
  }
});

test("wallet lookup rejects cross-customer, inactive, expired, and empty wallets", async () => {
  const originals = { customer: Customer.findById, membership: CustomerMembership.findOne };
  Customer.findById = () => query({ _id: id(ids.customer), fullNumber: "919876543210" });
  CustomerMembership.findOne = () => query(null);
  try {
    await assert.rejects(
      prepaidController._private.loadAvailableWallet(
        ids.vendor,
        ids.customer,
        "",
        new Date(),
        { reconcileLifecycle: async () => ({ promoted: false }) }
      ),
      (error) => error.code === "prepaid_membership_unavailable"
    );
  } finally {
    Customer.findById = originals.customer;
    CustomerMembership.findOne = originals.membership;
  }
});

test("billing cart persistence retains canonical item identity but historical carts remain valid", async () => {
  const original = BillingSession.findByIdAndUpdate;
  let captured;
  BillingSession.findByIdAndUpdate = async (billingId, update) => {
    captured = update;
    return { _id: billingId, ...update };
  };
  try {
    const res = response();
    await billingController.updateBillingCart({
      body: { billingId: ids.bill, cartItems: cart() },
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(captured.cartItems[0].itemSource, "vendor_menu_node");
    assert.equal(captured.cartItems[0].itemType, "SERVICE");
    assert.equal(captured.cartItems[0].qty, 1);

    const historical = new BillingSession({
      vendorId: id(ids.vendor),
      customerId: id(ids.customer),
      cartItems: [{ itemId: id(ids.item), name: "Legacy Service", price: 100, qty: 1, total: 100 }],
    });
    await historical.validate();
    assert.equal(historical.cartItems[0].itemSource, undefined);
  } finally {
    BillingSession.findByIdAndUpdate = original;
  }
});

test("future prepaid settlement snapshot validates dimensions on bills and transactions", async () => {
  const common = {
    walletType: "PREPAID_SESSIONS",
    walletId: id(ids.wallet),
    customerMembershipId: id(ids.membership),
    authorizedQuantity: 2,
    eligibleItemSource: "vendor_menu_node",
    eligibleItemId: id(ids.item),
    operationalServiceValuePaise: 1000000,
    freshCashCollectedPaise: 0,
    redemptionLedgerId: id(ids.ledger),
    authorizationId: id(ids.authorization),
  };
  const bill = new BillingSession({ vendorId: id(ids.vendor), prepaidSettlementSnapshot: common });
  await bill.validate();
  const transaction = new Transaction({
    vendorId: id(ids.vendor),
    totalAmount: 10000,
    prepaidSettlementSnapshot: common,
  });
  await transaction.validate();
  assert.equal(BillingSession.schema.path("prepaidSettlementSnapshot").options.immutable, true);
  assert.equal(Transaction.schema.path("prepaidSettlementSnapshot").options.immutable, true);

  const invalid = new BillingSession({
    vendorId: id(ids.vendor),
    prepaidSettlementSnapshot: { ...common, authorizedAmountPaise: 1000 },
  });
  await assert.rejects(invalid.validate(), /session settlement/);
});

test("prepaid routes are vendor-authenticated and completion uses the isolated settlement service", () => {
  const routes = fs.readFileSync(path.join(__dirname, "../routes/vendorPrepaidWalletRoutes.js"), "utf8");
  const completion = fs.readFileSync(path.join(__dirname, "../controllers/billingController.js"), "utf8");
  assert.match(routes, /requireVendorAccessFromExistingAuth/);
  assert.match(routes, /:vendorId\/capabilities/);
  assert.match(routes, /authorizations\/prepare/);
  assert.match(routes, /authorizations\/:authorizationId\/verify/);
  assert.match(completion, /consumePrepaidAuthorization/);
  assert.doesNotMatch(completion, /require\("\.\.\/models\/PrepaidMembershipWallet"\)|require\("\.\.\/models\/PrepaidWalletLedger"\)/);
});
