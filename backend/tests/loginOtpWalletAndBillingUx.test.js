const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const VendorWallet = require("../models/VendorWallet");
const VendorWalletLedger = require("../models/VendorWalletLedger");
const { deductOTP } = require("../services/vendorWalletService");
const {
  resolveBillingWhatsappProvider,
} = require("../services/whatsappBillingRouter");

function makeDuplicateKeyError() {
  const error = new Error("E11000 duplicate key error");
  error.code = 11000;
  return error;
}

function createFindOneResult(value) {
  return {
    select() {
      return {
        lean: async () => value,
      };
    },
  };
}

function withMockedWalletModels(fn) {
  return async () => {
    const originals = {
      walletFindOne: VendorWallet.findOne,
      walletFindOneAndUpdate: VendorWallet.findOneAndUpdate,
      ledgerCreate: VendorWalletLedger.create,
      ledgerFindOne: VendorWalletLedger.findOne,
      ledgerDeleteOne: VendorWalletLedger.deleteOne,
      ledgerUpdateOne: VendorWalletLedger.updateOne,
    };

    try {
      await fn();
    } finally {
      VendorWallet.findOne = originals.walletFindOne;
      VendorWallet.findOneAndUpdate = originals.walletFindOneAndUpdate;
      VendorWalletLedger.create = originals.ledgerCreate;
      VendorWalletLedger.findOne = originals.ledgerFindOne;
      VendorWalletLedger.deleteOne = originals.ledgerDeleteOne;
      VendorWalletLedger.updateOne = originals.ledgerUpdateOne;
    }
  };
}

function installWalletMocks({ initialBalance }) {
  const state = {
    otpBalance: initialBalance,
    ledgers: new Map(),
    deletedLocks: 0,
    updateCalls: 0,
  };

  VendorWallet.findOne = () => createFindOneResult({ otpBalance: state.otpBalance });
  VendorWallet.findOneAndUpdate = async (query) => {
    if (String(query.vendorId) !== "vendor-1" || state.otpBalance <= 0) return null;
    state.otpBalance -= 1;
    return { otpBalance: state.otpBalance };
  };

  VendorWalletLedger.create = async (doc) => {
    const key = `${doc.vendorId}:${doc.channel}:${doc.reference || ""}`;
    if (doc.reference && state.ledgers.has(key)) {
      throw makeDuplicateKeyError();
    }

    const ledger = {
      _id: key,
      ...doc,
    };
    state.ledgers.set(key, ledger);
    return ledger;
  };

  VendorWalletLedger.findOne = (query) => ({
    lean: async () => {
      const key = `${query.vendorId}:${query.channel}:${query.reference || ""}`;
      return state.ledgers.get(key) || null;
    },
  });

  VendorWalletLedger.deleteOne = async (query) => {
    state.deletedLocks += 1;
    state.ledgers.delete(query._id);
    return { deletedCount: 1 };
  };

  VendorWalletLedger.updateOne = async (query, update) => {
    const ledger = state.ledgers.get(query._id);
    if (ledger) {
      Object.assign(ledger, update.$set || {});
      state.updateCalls += 1;
    }
    return { modifiedCount: ledger ? 1 : 0 };
  };

  return state;
}

test("otpBalance 0 causes OTP deduction failure and leaves balance unchanged", withMockedWalletModels(async () => {
  const state = installWalletMocks({ initialBalance: 0 });

  await assert.rejects(
    deductOTP("vendor-1", "login-otp:zero"),
    /Insufficient OTP balance/
  );

  assert.equal(state.otpBalance, 0);
  assert.equal(state.deletedLocks, 1);
  assert.equal(state.updateCalls, 0);
}));

test("otpBalance 1 allows one OTP deduction and records final ledger", withMockedWalletModels(async () => {
  const state = installWalletMocks({ initialBalance: 1 });

  const balanceAfter = await deductOTP("vendor-1", "login-otp:one");

  assert.equal(balanceAfter, 0);
  assert.equal(state.otpBalance, 0);
  assert.equal(state.updateCalls, 1);
  assert.equal(state.ledgers.get("vendor-1:OTP:login-otp:one").quantity, -1);
}));

test("same OTP idempotency reference called sequentially deducts only once", withMockedWalletModels(async () => {
  const state = installWalletMocks({ initialBalance: 2 });

  const first = await deductOTP("vendor-1", "login-otp:same");
  const second = await deductOTP("vendor-1", "login-otp:same");

  assert.equal(first, 1);
  assert.equal(second, 1);
  assert.equal(state.otpBalance, 1);
  assert.equal(state.updateCalls, 1);
}));

test("same OTP idempotency reference called concurrently deducts only once", withMockedWalletModels(async () => {
  const state = installWalletMocks({ initialBalance: 2 });

  const results = await Promise.all([
    deductOTP("vendor-1", "login-otp:concurrent"),
    deductOTP("vendor-1", "login-otp:concurrent"),
  ]);

  assert.deepEqual(results, [1, 1]);
  assert.equal(state.otpBalance, 1);
  assert.equal(state.updateCalls, 1);
  assert.equal(state.ledgers.get("vendor-1:OTP:login-otp:concurrent").quantity, -1);
}));

test("different OTP idempotency references can deduct separately", withMockedWalletModels(async () => {
  const state = installWalletMocks({ initialBalance: 2 });

  const first = await deductOTP("vendor-1", "login-otp:new-1");
  const second = await deductOTP("vendor-1", "login-otp:new-2");

  assert.equal(first, 1);
  assert.equal(second, 0);
  assert.equal(state.otpBalance, 0);
  assert.equal(state.updateCalls, 2);
}));

test("OTP idempotency index is scoped to OTP_USAGE rows only", () => {
  const source = fs.readFileSync(path.join(__dirname, "../models/VendorWalletLedger.js"), "utf8");

  assert.match(source, /unique: true/);
  assert.match(source, /channel: "OTP"/);
  assert.match(source, /type: "OTP_USAGE"/);
  assert.match(source, /reference: \{ \$type: "string", \$gt: "" \}/);
  assert.doesNotMatch(source, /type: "PLAN_ALLOCATION"[\s\S]{0,120}unique: true/);
  assert.doesNotMatch(source, /channel: "WHATSAPP"[\s\S]{0,120}unique: true/);
});

test("login OTP route only deducts after MSG91 success and before auth session creation", () => {
  const source = fs.readFileSync(path.join(__dirname, "../routes/customerRoutes.js"), "utf8");
  const verifySection = source.slice(source.indexOf('router.post("/verify-otp"'));
  const successIndex = verifySection.indexOf('verifyResp.data.type === "success"');
  const deductIndex = verifySection.indexOf("deductOTP(vendorId, `login-otp:${loginOtpAttempt.jti}`)");
  const failureIndex = verifySection.indexOf('return res.status(400).json({ message: verifyResp.data.message || "OTP verify failed" })');
  const sessionCreateIndex = verifySection.indexOf("const session = await Session.create");

  assert.notEqual(successIndex, -1);
  assert.notEqual(deductIndex, -1);
  assert.notEqual(failureIndex, -1);
  assert.notEqual(sessionCreateIndex, -1);
  assert.ok(successIndex < deductIndex);
  assert.ok(deductIndex < sessionCreateIndex);
  assert.ok(deductIndex < failureIndex);
});

test("customer login OTP request checks vendor OTP balance before MSG91 send", () => {
  const source = fs.readFileSync(path.join(__dirname, "../routes/customerRoutes.js"), "utf8");
  const balanceCheckIndex = source.indexOf("hasAvailableOTPBalance(vendor._id)");
  const msg91SendIndex = source.indexOf("https://control.msg91.com/api/v5/otp");

  assert.notEqual(balanceCheckIndex, -1);
  assert.notEqual(msg91SendIndex, -1);
  assert.ok(balanceCheckIndex < msg91SendIndex);
  assert.match(source, /Insufficient OTP balance\. Please recharge OTP credits to continue\./);
});

test("billing provider decision resolves ynot_msg91 when global vendor Meta routing is off", () => {
  const decision = resolveBillingWhatsappProvider({
    vendor: {},
    env: { WHATSAPP_VENDOR_META_BILL_ROUTING_ENABLED: "false" },
  });

  assert.equal(decision.provider, "ynot_msg91");
  assert.equal(decision.reason, "global_vendor_meta_routing_disabled");
});

test("billing provider decision resolves vendor_meta for fully eligible Meta vendors", () => {
  const decision = resolveBillingWhatsappProvider({
    env: { WHATSAPP_VENDOR_META_BILL_ROUTING_ENABLED: "true" },
    vendor: {
      whatsappBusiness: {
        provider: "meta",
        enabled: true,
        connectionStatus: "connected",
        phoneRegistrationStatus: "active",
        messagingReadiness: { status: "available" },
        templateInstances: [
          {
            masterTemplateKey: "BILL_STANDARD",
            status: "approved",
          },
        ],
        testMessage: { status: "successful" },
      },
    },
  });

  assert.equal(decision.provider, "vendor_meta");
});

test("billing provider decision falls back to ynot_msg91 for Meta-configured but ineligible vendors", () => {
  const decision = resolveBillingWhatsappProvider({
    env: { WHATSAPP_VENDOR_META_BILL_ROUTING_ENABLED: "true" },
    vendor: {
      whatsappBusiness: {
        provider: "meta",
        enabled: true,
        connectionStatus: "connected",
        phoneRegistrationStatus: "active",
        messagingReadiness: { status: "available" },
        templateInstances: [
          {
            masterTemplateKey: "BILL_STANDARD",
            status: "pending",
          },
        ],
        testMessage: { status: "successful" },
      },
    },
  });

  assert.equal(decision.provider, "ynot_msg91");
});

test("billing completion warning metadata is tied only to ynot_msg91 zero balance", () => {
  const source = fs.readFileSync(path.join(__dirname, "../controllers/billingController.js"), "utf8");

  assert.match(source, /resolveBillingWhatsappProvider\(\{ vendor \}\)/);
  assert.match(source, /decision\.provider !== "ynot_msg91"/);
  assert.match(source, /hasAvailableWhatsAppBalance\(billing\.vendorId\)/);
  assert.match(source, /provider: "ynot_msg91"/);
  assert.match(source, /sendExpected: false/);
  assert.match(source, /reason: "insufficient_balance"/);
});
