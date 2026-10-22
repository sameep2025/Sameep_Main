const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  refreshMetaPhoneReadinessForResponse,
  sanitizeWhatsappBusinessConfig,
} = require("../controllers/vendorWhatsappBusinessController");

const MANEA_VENDOR_ID = "69d3a74c7f444571dd02ae3d";
const MANEA_WABA_ID = "4402848216525508";
const MANEA_PHONE_NUMBER_ID = "1335446439659507";

function diagnosticEnv(overrides = {}) {
  return {
    YNOT_RUNTIME_ENVIRONMENT: "production",
    MANEA_WHATSAPP_DIAGNOSTIC_ENABLED: "true",
    MANEA_WHATSAPP_DIAGNOSTIC_VENDOR_ID: MANEA_VENDOR_ID,
    MANEA_WHATSAPP_DIAGNOSTIC_WABA_ID: MANEA_WABA_ID,
    MANEA_WHATSAPP_DIAGNOSTIC_PHONE_NUMBER_ID: MANEA_PHONE_NUMBER_ID,
    ...overrides,
  };
}

function whatsappBusiness(overrides = {}) {
  return {
    provider: "meta",
    enabled: false,
    connectionStatus: "connected",
    phoneRegistrationStatus: "error",
    wabaId: MANEA_WABA_ID,
    phoneNumberId: MANEA_PHONE_NUMBER_ID,
    displayNameReadiness: {
      status: "send_eligible",
      rawStatus: "APPROVED",
      canSend: true,
    },
    templateInstances: [{ masterTemplateKey: "BILL_STANDARD", status: "approved" }],
    testMessage: { status: "successful" },
    ...overrides,
  };
}

function record(config = whatsappBusiness()) {
  const updates = [];
  return {
    updates,
    vendor: { _id: MANEA_VENDOR_ID, whatsappBusiness: config },
    Model: {
      updateOne: async (...args) => {
        updates.push(args);
        return { matchedCount: 1 };
      },
    },
  };
}

function phoneStatus(canSendMessage, overrides = {}) {
  return {
    id: MANEA_PHONE_NUMBER_ID,
    status: "CONNECTED",
    platform_type: "CLOUD_API",
    account_mode: "LIVE",
    is_pin_enabled: false,
    health_status: { can_send_message: canSendMessage },
    ...overrides,
  };
}

const quietLogger = { error() {} };

async function refresh(config, statusOrError) {
  const target = record(config);
  const result = await refreshMetaPhoneReadinessForResponse(target, {
    getPhoneReadiness: async () => {
      if (statusOrError instanceof Error) throw statusOrError;
      return statusOrError;
    },
    logger: quietLogger,
  });
  return { target, result };
}

function activationSnapshot(config, env = diagnosticEnv(), vendorId = MANEA_VENDOR_ID) {
  return sanitizeWhatsappBusinessConfig(config, { vendorId, env });
}

for (const [rawStatus, expectedStatus] of [
  ["LIMITED", "limited"],
  ["AVAILABLE", "available"],
]) {
  test(`registration error uses verified live Meta ${rawStatus} readiness`, async () => {
    const { result, target } = await refresh(whatsappBusiness(), phoneStatus(rawStatus));
    const snapshot = activationSnapshot(result);

    assert.equal(result.messagingReadiness.status, expectedStatus);
    assert.equal(snapshot.activationEligibility.checks.phoneRegistrationReady, true);
    assert.equal(snapshot.activationEligibility.checks.messagingNotBlocked, true);
    assert.equal(snapshot.activationEligibility.eligible, true);
    assert.equal(snapshot.activationState.status, "ready_to_activate");
    assert.equal(target.updates.length, 0);
  });
}

test("Meta lookup failure and timeout fail closed", async () => {
  for (const error of [
    Object.assign(new Error("lookup failed"), { code: "meta_lookup_failed" }),
    Object.assign(new Error("request timeout"), { code: "ETIMEDOUT" }),
  ]) {
    const { result } = await refresh(whatsappBusiness(), error);
    const snapshot = activationSnapshot(result);
    assert.equal(result.messagingReadiness.status, "unknown");
    assert.equal(snapshot.activationEligibility.eligible, false);
    assert.ok(snapshot.activationEligibility.blockers.includes("messaging_unknown"));
  }
});

test("Meta phone identity mismatch fails closed without persistence", async () => {
  const { result, target } = await refresh(
    whatsappBusiness(),
    phoneStatus("LIMITED", { id: "different-phone-number-id" })
  );
  const snapshot = activationSnapshot(result);

  assert.equal(result.messagingReadiness.status, "unknown");
  assert.equal(snapshot.activationEligibility.eligible, false);
  assert.equal(target.updates.length, 0);
});

test("blocked and unrecognized messaging states cannot activate", async () => {
  for (const rawStatus of ["BLOCKED", "UNRECOGNIZED"]) {
    const { result } = await refresh(whatsappBusiness(), phoneStatus(rawStatus));
    const snapshot = activationSnapshot(result);
    assert.equal(snapshot.activationEligibility.eligible, false);
    assert.equal(
      snapshot.activationEligibility.checks.messagingNotBlocked,
      false
    );
  }
});

test("diagnostic disabled leaves registration error ineligible", async () => {
  const { result } = await refresh(whatsappBusiness(), phoneStatus("LIMITED"));
  const snapshot = activationSnapshot(
    result,
    diagnosticEnv({ MANEA_WHATSAPP_DIAGNOSTIC_ENABLED: "false" })
  );

  assert.equal(snapshot.activationEligibility.checks.messagingNotBlocked, true);
  assert.equal(snapshot.activationEligibility.checks.phoneRegistrationReady, false);
  assert.equal(snapshot.activationEligibility.eligible, false);
});

test("existing ready vendors retain normal eligibility without a diagnostic bypass", async () => {
  const otherPhoneId = "1414756031710652";
  const config = whatsappBusiness({
    phoneRegistrationStatus: "active",
    wabaId: "other-waba",
    phoneNumberId: otherPhoneId,
  });
  const { result } = await refresh(
    config,
    phoneStatus("AVAILABLE", {
      id: otherPhoneId,
      is_pin_enabled: true,
    })
  );
  const snapshot = activationSnapshot(result, diagnosticEnv(), "64b000000000000000000001");

  assert.equal(snapshot.activationEligibility.checks.phoneRegistrationReady, true);
  assert.equal(snapshot.activationEligibility.checks.messagingNotBlocked, true);
  assert.equal(snapshot.activationEligibility.eligible, true);
});

test("disconnected registration errors do not perform a Meta lookup", async () => {
  let calls = 0;
  const result = await refreshMetaPhoneReadinessForResponse(
    record(whatsappBusiness({ connectionStatus: "not_connected" })),
    {
      getPhoneReadiness: async () => {
        calls += 1;
        return phoneStatus("LIMITED");
      },
      logger: quietLogger,
    }
  );

  assert.equal(calls, 0);
  assert.equal(result.messagingReadiness, undefined);
});

test("dashboard GET and activation POST use the same verified refresh pipeline", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../controllers/vendorWhatsappBusinessController.js"),
    "utf8"
  );
  assert.match(
    source,
    /async function getWhatsappBusinessConfig[\s\S]*await refreshMetaPhoneReadinessForResponse\(record\)/
  );
  assert.match(
    source,
    /async function activateWhatsappBusinessBilling[\s\S]*await refreshMetaPhoneReadinessForResponse\(record\)[\s\S]*activationEligibility\?\.eligible/
  );
});
