const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  RECOVERY_PERMISSION,
  buildRecoveryCapability,
  createRecoveryChallenge,
  executeRecovery,
  runRecoveryPreflight,
} = require("../services/adminWhatsappRecoveryService");

const admin = {
  _id: "admin-1",
  email: "admin@example.com",
  passwordHash: "hash",
  permissions: [RECOVERY_PERMISSION],
};

const vendor = {
  _id: "vendor-1",
  vendorModel: "DummyVendor",
  businessName: "Example Salon",
  whatsappBusiness: {
    provider: "meta",
    connectionStatus: "connected",
    displayPhoneNumber: "+91 98765 43210",
    wabaId: "waba-1",
    phoneNumberId: "phone-1",
    phoneRegistrationStatus: "registration_submitted",
    enabled: false,
    metaRegistration: { pinEncrypted: "ciphertext-placeholder" },
  },
};

const readyMeta = (pinEnabled = false) => ({
  accessible: true,
  assetIdentityVerified: true,
  phoneStatus: "CONNECTED",
  platformType: "CLOUD_API",
  codeVerificationStatus: "VERIFIED",
  accountMode: "LIVE",
  isPinEnabled: pinEnabled,
});

function adminModel(value = admin) {
  return {
    findById: () => ({
      select: () => ({ lean: async () => value }),
    }),
  };
}

function executionDependencies(overrides = {}) {
  const audits = [];
  let postCalls = 0;
  const dependencies = {
    env: { META_WHATSAPP_REGISTRATION_RECOVERY_ENABLED: "true" },
    AdminModel: adminModel(),
    ChallengeModel: {
      findOneAndUpdate: () => ({
        lean: async () => ({
          vendorId: "vendor-1",
          vendorModel: "DummyVendor",
          wabaId: "waba-1",
          phoneNumberId: "phone-1",
          confirmationText: "RECOVER Example Salon",
        }),
      }),
    },
    LockModel: {
      create: async () => ({}),
      deleteOne: async () => ({}),
    },
    AuditModel: { create: async (entry) => { audits.push(entry); } },
    findVendor: async () => ({ status: "matched", matches: [vendor] }),
    decryptPin: () => "123456",
    readMeta: async () => readyMeta(false),
    setPin: async () => { postCalls += 1; return { success: true, httpStatus: 200 }; },
    ...overrides,
  };
  return { dependencies, audits, getPostCalls: () => postCalls };
}

test("recovery capability is default-disabled and requires dedicated permission", () => {
  assert.deepEqual(buildRecoveryCapability(admin, {}), {
    featureEnabled: false,
    authorized: true,
    enabled: false,
    blockers: ["recovery_feature_disabled"],
  });
  const denied = buildRecoveryCapability(
    { ...admin, permissions: [] },
    { META_WHATSAPP_REGISTRATION_RECOVERY_ENABLED: "true" }
  );
  assert.equal(denied.enabled, false);
  assert.deepEqual(denied.blockers, ["recovery_permission_required"]);
});

test("challenge requires fresh password authorization and stores only a token hash", async () => {
  const stored = [];
  const result = await createRecoveryChallenge(
    { adminId: "admin-1", vendorId: "vendor-1", password: "correct" },
    {
      env: { META_WHATSAPP_REGISTRATION_RECOVERY_ENABLED: "true" },
      AdminModel: adminModel(),
      comparePassword: async (password) => password === "correct",
      findVendor: async () => ({ status: "matched", matches: [vendor] }),
      validatePin: () => ({ result: "PASS", code: "stored_pin_valid" }),
      readMeta: async () => readyMeta(false),
      ChallengeModel: { create: async (entry) => { stored.push(entry); } },
    }
  );
  assert.equal(result.ok, true);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].tokenHash.length, 64);
  assert.equal(stored[0].tokenHash.includes(result.token), false);
  assert.equal(JSON.stringify(result).includes("123456"), false);
  assert.equal(JSON.stringify(result).includes("ciphertext-placeholder"), false);
});

test("unauthorized admin cannot create recovery challenge", async () => {
  const result = await createRecoveryChallenge(
    { adminId: "admin-1", vendorId: "vendor-1", password: "correct" },
    {
      env: { META_WHATSAPP_REGISTRATION_RECOVERY_ENABLED: "true" },
      AdminModel: adminModel({ ...admin, permissions: [] }),
    }
  );
  assert.equal(result.code, "recovery_permission_required");
});

test("preflight blocks missing or invalid PIN and wrong Meta ownership", async () => {
  const missing = await runRecoveryPreflight(vendor, {
    validatePin: () => ({ result: "BLOCKED", code: "encrypted_pin_missing" }),
    readMeta: async () => readyMeta(false),
  });
  assert.equal(missing.eligible, false);
  assert.ok(missing.blockers.includes("encrypted_pin_missing"));

  const invalid = await runRecoveryPreflight(vendor, {
    validatePin: () => ({ result: "BLOCKED", code: "stored_pin_format_invalid" }),
    readMeta: async () => readyMeta(false),
  });
  assert.ok(invalid.blockers.includes("stored_pin_format_invalid"));

  const wrongOwnership = await runRecoveryPreflight(vendor, {
    validatePin: () => ({ result: "PASS", code: "stored_pin_valid" }),
    readMeta: async () => ({ accessible: false, code: "meta_asset_identity_mismatch" }),
  });
  assert.ok(wrongOwnership.blockers.includes("meta_operational_readiness_not_verified"));
});

test("successful recovery performs one POST, verifies readiness and appends audit events", async () => {
  let reads = 0;
  const setup = executionDependencies({
    readMeta: async () => readyMeta(++reads > 1),
  });
  const result = await executeRecovery(
    {
      adminId: "admin-1",
      vendorId: "vendor-1",
      challengeToken: "challenge",
      confirmation: "RECOVER Example Salon",
    },
    setup.dependencies
  );
  assert.equal(result.ok, true);
  assert.equal(result.outcome, "recovered");
  assert.equal(setup.getPostCalls(), 1);
  assert.equal(setup.audits.length, 2);
  assert.deepEqual(setup.audits.map((entry) => entry.event), ["attempt_started", "attempt_completed"]);
  assert.equal(JSON.stringify(setup.audits).includes("123456"), false);
  assert.equal(JSON.stringify(setup.audits).includes("ciphertext-placeholder"), false);
});

test("already enabled Meta PIN skips POST", async () => {
  const setup = executionDependencies({ readMeta: async () => readyMeta(true) });
  const result = await executeRecovery(
    { adminId: "admin-1", vendorId: "vendor-1", challengeToken: "challenge", confirmation: "RECOVER Example Salon" },
    setup.dependencies
  );
  assert.equal(result.outcome, "already_recovered");
  assert.equal(setup.getPostCalls(), 0);
});

test("expired or reused challenge cannot acquire a recovery lock", async () => {
  let lockCalls = 0;
  const setup = executionDependencies({
    ChallengeModel: { findOneAndUpdate: () => ({ lean: async () => null }) },
    LockModel: { create: async () => { lockCalls += 1; } },
  });
  const result = await executeRecovery(
    { adminId: "admin-1", vendorId: "vendor-1", challengeToken: "used", confirmation: "RECOVER Example Salon" },
    setup.dependencies
  );
  assert.equal(result.code, "recovery_challenge_expired_or_used");
  assert.equal(lockCalls, 0);
});

test("concurrent recovery is rejected before Meta POST", async () => {
  const duplicate = new Error("duplicate");
  duplicate.code = 11000;
  const setup = executionDependencies({
    LockModel: {
      create: async () => { throw duplicate; },
      findOneAndUpdate: () => ({ lean: async () => null }),
    },
  });
  const result = await executeRecovery(
    { adminId: "admin-1", vendorId: "vendor-1", challengeToken: "challenge", confirmation: "RECOVER Example Salon" },
    setup.dependencies
  );
  assert.equal(result.code, "recovery_already_in_progress");
  assert.equal(setup.getPostCalls(), 0);
});

test("explicit Meta failure is not retried and is audited", async () => {
  let calls = 0;
  const error = new Error("sanitized");
  error.code = "meta_pin_recovery_failed";
  error.metaError = { status: 400, code: 100, subcode: 33 };
  const setup = executionDependencies({
    setPin: async () => { calls += 1; throw error; },
  });
  const result = await executeRecovery(
    { adminId: "admin-1", vendorId: "vendor-1", challengeToken: "challenge", confirmation: "RECOVER Example Salon" },
    setup.dependencies
  );
  assert.equal(result.code, "meta_pin_recovery_failed");
  assert.equal(calls, 1);
  assert.equal(setup.audits.at(-1).metaRequestOutcome, "explicit_error");
});

test("ambiguous timeout performs GET reconciliation without a second POST", async () => {
  let calls = 0;
  let reads = 0;
  const timeout = new Error("timeout");
  timeout.code = "meta_pin_recovery_failed";
  timeout.ambiguous = true;
  timeout.metaError = { status: null, code: "ECONNABORTED", subcode: "" };
  const setup = executionDependencies({
    setPin: async () => { calls += 1; throw timeout; },
    readMeta: async () => readyMeta(++reads > 1),
  });
  const result = await executeRecovery(
    { adminId: "admin-1", vendorId: "vendor-1", challengeToken: "challenge", confirmation: "RECOVER Example Salon" },
    setup.dependencies
  );
  assert.equal(result.outcome, "timeout_reconciled_success");
  assert.equal(calls, 1);
  assert.equal(reads, 2);
});

test("Phase 2 source does not call register or mutate vendor registration and flag is opt-in", () => {
  const recoverySource = fs.readFileSync(
    path.join(__dirname, "../services/adminWhatsappRecoveryService.js"),
    "utf8"
  );
  const metaSource = fs.readFileSync(
    path.join(__dirname, "../services/metaWhatsAppService.js"),
    "utf8"
  );
  assert.doesNotMatch(recoverySource, /registerPhoneNumber|\/register/);
  assert.doesNotMatch(recoverySource, /phoneRegistrationStatus\s*=|whatsappBusiness\.enabled\s*=/);
  assert.match(recoverySource, /META_WHATSAPP_REGISTRATION_RECOVERY_ENABLED/);
  assert.match(metaSource, /graphUrl\(id\)/);
  assert.match(metaSource, /\{ pin: registrationPin \}/);
});
