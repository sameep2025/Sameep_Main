const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  buildAdminSnapshot,
  buildStoredPinValidationOutcome,
  readLiveMetaStatus,
  validateStoredPin,
} = require("../services/adminWhatsappIntegrationService");

function config(overrides = {}) {
  return {
    provider: "meta",
    connectionStatus: "connected",
    displayPhoneNumber: "+91 9XXXX 21117",
    wabaId: "waba-1",
    phoneNumberId: "phone-1",
    phoneRegistrationStatus: "registration_submitted",
    metaRegistration: { pinEncrypted: "encrypted-placeholder" },
    messagingReadiness: { status: "limited", blockers: [] },
    displayNameReadiness: { status: "send_eligible", canSend: true },
    templateInstances: [{ masterTemplateKey: "BILL_STANDARD", status: "approved" }],
    testMessage: { status: "successful" },
    enabled: false,
    ...overrides,
  };
}

test("stored PIN preflight returns PASS without exposing PIN or ciphertext", () => {
  const result = validateStoredPin(config(), () => "123456");
  assert.deepEqual(result, { result: "PASS", code: "stored_pin_valid" });
  assert.equal(JSON.stringify(result).includes("123456"), false);
  assert.equal(JSON.stringify(result).includes("encrypted-placeholder"), false);
});

test("stored PIN preflight blocks missing, invalid and undecryptable values", () => {
  assert.equal(validateStoredPin(config({ metaRegistration: {} })).code, "encrypted_pin_missing");
  assert.equal(validateStoredPin(config(), () => "12x456").code, "stored_pin_format_invalid");
  assert.equal(
    validateStoredPin(config(), () => { throw new Error("secret failure"); }).code,
    "stored_pin_decryption_failed"
  );
});

test("stored PIN outcomes distinguish valid, invalid and each missing-PIN Meta state", () => {
  const valid = buildStoredPinValidationOutcome({ code: "stored_pin_valid" });
  assert.equal(valid.status, "valid");
  assert.equal(valid.result, "PASS");
  assert.equal(valid.title, "Stored PIN Valid");

  const invalidFormat = buildStoredPinValidationOutcome({
    code: "stored_pin_format_invalid",
  });
  assert.equal(invalidFormat.status, "invalid");
  assert.match(invalidFormat.message, /not six digits/i);

  const decryptionFailure = buildStoredPinValidationOutcome({
    code: "stored_pin_decryption_failed",
  });
  assert.equal(decryptionFailure.status, "invalid");
  assert.match(decryptionFailure.message, /unable to decrypt/i);

  const missingButReady = buildStoredPinValidationOutcome(
    { code: "encrypted_pin_missing" },
    { accessible: true, isPinEnabled: true }
  );
  assert.equal(missingButReady.status, "missing");
  assert.equal(missingButReady.severity, "info");
  assert.equal(missingButReady.metaPinEnabled, true);
  assert.match(missingButReady.message, /no pin recovery is required/i);

  const missingAndDisabled = buildStoredPinValidationOutcome(
    { code: "encrypted_pin_missing" },
    { accessible: true, isPinEnabled: false }
  );
  assert.equal(missingAndDisabled.status, "missing");
  assert.equal(missingAndDisabled.metaPinEnabled, false);
  assert.match(missingAndDisabled.message, /cannot use an existing stored pin/i);

  const missingAndUnverified = buildStoredPinValidationOutcome(
    { code: "encrypted_pin_missing" },
    { accessible: false, code: "meta_status_unavailable" }
  );
  assert.equal(missingAndUnverified.status, "missing");
  assert.equal(missingAndUnverified.metaPinEnabled, null);
  assert.match(missingAndUnverified.message, /could not be verified/i);
});

test("live status verifies exact WABA and phone identity", async () => {
  const checkedAt = new Date("2026-10-18T12:00:00.000Z");
  const result = await readLiveMetaStatus(config(), {
    getConfig: () => ({ systemUserAccessToken: "token-placeholder" }),
    validateAsset: async () => ({
      isValid: true,
      account: { id: "waba-1" },
      selectedPhone: { id: "phone-1" },
    }),
    getReadiness: async () => ({
      id: "phone-1",
      status: "CONNECTED",
      platform_type: "CLOUD_API",
      code_verification_status: "VERIFIED",
      account_mode: "LIVE",
      is_pin_enabled: false,
      name_status: "APPROVED",
      health_status: { can_send_message: "LIMITED" },
    }),
    now: () => checkedAt,
  });
  assert.equal(result.accessible, true);
  assert.equal(result.assetIdentityVerified, true);
  assert.equal(result.isPinEnabled, false);
  assert.equal(result.checkedAt, checkedAt);
  assert.equal(JSON.stringify(result).includes("token-placeholder"), false);
});

test("live status blocks mismatched Meta assets before readiness lookup", async () => {
  let readinessCalls = 0;
  const result = await readLiveMetaStatus(config(), {
    getConfig: () => ({ systemUserAccessToken: "token-placeholder" }),
    validateAsset: async () => ({
      isValid: true,
      account: { id: "another-waba" },
      selectedPhone: { id: "phone-1" },
    }),
    getReadiness: async () => { readinessCalls += 1; return {}; },
  });
  assert.equal(result.code, "meta_asset_identity_mismatch");
  assert.equal(readinessCalls, 0);
});

test("admin snapshot contains operational statuses but no stored secrets", () => {
  const snapshot = buildAdminSnapshot({
    vendor: { _id: "vendor-1", businessName: "Salon", whatsappBusiness: config() },
    liveMeta: { accessible: true, isPinEnabled: false, checkedAt: new Date() },
  });
  assert.equal(snapshot.billingTemplate.status, "approved");
  assert.equal(snapshot.testMessage.status, "successful");
  assert.equal(snapshot.billingActivation.enabled, false);
  const serialized = JSON.stringify(snapshot);
  assert.equal(serialized.includes("encrypted-placeholder"), false);
  assert.equal(serialized.includes("pinEncrypted"), false);
  assert.equal(serialized.includes("accessToken"), false);
});

test("Phase 1 routes require admin auth and expose no recovery endpoint", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../routes/adminWhatsappIntegrationRoutes.js"),
    "utf8"
  );
  assert.match(source, /router\.use\(requireAdminAuth\)/);
  assert.match(source, /whatsapp-integration\/pin-preflight/);
  assert.doesNotMatch(source, /recover|history/i);
});

test("Phase 1 PIN validation contains no database writes or Meta POST requests", () => {
  const controllerSource = fs.readFileSync(
    path.join(__dirname, "../controllers/adminWhatsappIntegrationController.js"),
    "utf8"
  );
  const serviceSource = fs.readFileSync(
    path.join(__dirname, "../services/adminWhatsappIntegrationService.js"),
    "utf8"
  );
  const source = `${controllerSource}\n${serviceSource}`;
  assert.doesNotMatch(source, /axios\.post|fetch\([^)]*method\s*:\s*["']POST/i);
  assert.doesNotMatch(source, /\.save\s*\(|updateOne|findOneAndUpdate|findByIdAndUpdate/);
});
