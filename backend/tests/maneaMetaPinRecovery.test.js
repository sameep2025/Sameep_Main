const assert = require("node:assert/strict");
const test = require("node:test");

const {
  RECOVERY_AUTHORIZATION,
  TARGET,
  createMetaClient,
  runPreflight,
  runRecovery,
} = require("../scripts/lib/maneaMetaPinRecovery");

function vendor(overrides = {}) {
  return {
    collection: "dummyvendors",
    vendor: {
      businessName: TARGET.vendorName,
      whatsappBusiness: {
        provider: "meta",
        connectionStatus: "connected",
        enabled: false,
        wabaId: TARGET.wabaId,
        phoneNumberId: TARGET.phoneNumberId,
        phoneRegistrationStatus: "registration_submitted",
        metaRegistration: { pinEncrypted: "ciphertext-placeholder" },
        ...overrides,
      },
    },
  };
}

function readyStatus(overrides = {}) {
  return {
    id: TARGET.phoneNumberId,
    status: "CONNECTED",
    platform_type: "CLOUD_API",
    code_verification_status: "VERIFIED",
    account_mode: "LIVE",
    is_pin_enabled: true,
    ...overrides,
  };
}

function dependencies(overrides = {}) {
  return {
    findMatches: async () => [vendor()],
    decryptPin: async () => "123456",
    verifyOwnership: async () => ({ matchCount: 1 }),
    setPin: async () => ({ success: true, httpStatus: 200 }),
    getReadiness: async () => readyStatus({ is_pin_enabled: false }),
    ...overrides,
  };
}

test("preflight accepts one matching vendor with a valid encrypted PIN", async () => {
  const result = await runPreflight(dependencies());
  assert.equal(result.result, "PASS");
  assert.equal(result.diagnostics.pinFormatValid, true);
  assert.equal(JSON.stringify(result).includes("123456"), false);
  assert.equal(JSON.stringify(result).includes("ciphertext-placeholder"), false);
});

test("preflight blocks a missing encrypted PIN", async () => {
  const result = await runPreflight(
    dependencies({
      findMatches: async () => [vendor({ metaRegistration: { pinEncrypted: "" } })],
    })
  );
  assert.equal(result.code, "encrypted_pin_missing");
});

test("preflight blocks PIN decryption failure", async () => {
  const result = await runPreflight(
    dependencies({ decryptPin: async () => { throw new Error("decrypt failed"); } })
  );
  assert.equal(result.code, "pin_decryption_failed");
  assert.equal(JSON.stringify(result).includes("decrypt failed"), false);
});

test("preflight blocks an invalid decrypted PIN format", async () => {
  const result = await runPreflight(dependencies({ decryptPin: async () => "12345x" }));
  assert.equal(result.code, "pin_format_invalid");
});

test("preflight requires exactly one matching vendor", async () => {
  const result = await runPreflight(dependencies({ findMatches: async () => [vendor(), vendor()] }));
  assert.equal(result.code, "vendor_match_count_invalid");
  assert.equal(result.diagnostics.matchCount, 2);
});

test("recovery makes one PIN POST and verifies Meta readiness", async () => {
  let postCount = 0;
  let readinessCount = 0;
  const result = await runRecovery(
    dependencies({
      setPin: async ({ phoneNumberId, pin }) => {
        postCount += 1;
        assert.equal(phoneNumberId, TARGET.phoneNumberId);
        assert.equal(pin, "123456");
        return { success: true, httpStatus: 200 };
      },
      getReadiness: async () => {
        readinessCount += 1;
        return readyStatus({ is_pin_enabled: readinessCount > 1 });
      },
    }),
    { authorization: RECOVERY_AUTHORIZATION }
  );
  assert.equal(result.result, "PASS");
  assert.equal(result.code, "meta_pin_update_verified");
  assert.equal(postCount, 1);
  assert.equal(JSON.stringify(result).includes("123456"), false);
});

test("recovery reports a sanitized Meta API error without retrying", async () => {
  let postCount = 0;
  const error = new Error("response contained sensitive details");
  error.response = {
    status: 400,
    data: { error: { code: 100, error_subcode: 2388003, type: "OAuthException" } },
  };
  const result = await runRecovery(
    dependencies({
      setPin: async () => {
        postCount += 1;
        throw error;
      },
    }),
    { authorization: RECOVERY_AUTHORIZATION }
  );
  assert.equal(result.code, "meta_pin_update_failed");
  assert.equal(postCount, 1);
  assert.deepEqual(result.diagnostics, {
    httpStatus: 400,
    code: 100,
    subcode: 2388003,
    type: "OAuthException",
  });
});

test("ambiguous timeout checks readiness and never retries the POST", async () => {
  let postCount = 0;
  let getCount = 0;
  const timeout = Object.assign(new Error("timeout"), { code: "ECONNABORTED" });
  const result = await runRecovery(
    dependencies({
      setPin: async () => {
        postCount += 1;
        throw timeout;
      },
      getReadiness: async () => {
        getCount += 1;
        return readyStatus({ is_pin_enabled: getCount > 1 });
      },
    }),
    { authorization: RECOVERY_AUTHORIZATION }
  );
  assert.equal(result.code, "meta_pin_update_verified_after_timeout");
  assert.equal(postCount, 1);
  assert.equal(getCount, 2);
});

test("recovery blocks before POST when Meta ownership does not match", async () => {
  let postCount = 0;
  const result = await runRecovery(
    dependencies({
      verifyOwnership: async () => ({ matchCount: 0 }),
      setPin: async () => {
        postCount += 1;
        return { success: true, httpStatus: 200 };
      },
    }),
    { authorization: RECOVERY_AUTHORIZATION }
  );
  assert.equal(result.code, "meta_asset_ownership_unverified");
  assert.equal(postCount, 0);
});

test("recovery skips POST when Meta already reports full readiness", async () => {
  let postCount = 0;
  const result = await runRecovery(
    dependencies({
      getReadiness: async () => readyStatus(),
      setPin: async () => {
        postCount += 1;
        return { success: true, httpStatus: 200 };
      },
    }),
    { authorization: RECOVERY_AUTHORIZATION }
  );
  assert.equal(result.code, "meta_pin_already_ready");
  assert.equal(postCount, 0);
});

test("Meta client uses the PIN endpoint, not register, and passes no secret in output", async () => {
  const postCalls = [];
  const getCalls = [];
  const client = createMetaClient({
    axiosClient: {
      post: async (...args) => {
        postCalls.push(args);
        return { status: 200, data: { success: true } };
      },
      get: async (...args) => {
        getCalls.push(args);
        return { data: { data: [{ id: TARGET.phoneNumberId }] } };
      },
    },
    accessToken: "token-placeholder",
    graphApiVersion: "v26.0",
  });
  const result = await client.setPin({ phoneNumberId: TARGET.phoneNumberId, pin: "123456" });
  assert.equal(result.success, true);
  assert.equal(postCalls.length, 1);
  assert.match(postCalls[0][0], /v26\.0\/1335446439659507$/);
  assert.doesNotMatch(postCalls[0][0], /register/);
  assert.deepEqual(postCalls[0][1], { pin: "123456" });

  const ownership = await client.verifyOwnership(TARGET);
  assert.equal(ownership.matchCount, 1);
  assert.match(getCalls[0][0], /4402848216525508\/phone_numbers$/);
});
