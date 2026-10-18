const assert = require("node:assert/strict");
const test = require("node:test");
const axios = require("axios");

const { getDefaultWhatsappBusinessConfig } = require("../models/whatsappBusinessConfigSchema");
const {
  registerMetaPhoneNumber,
} = require("../services/metaWhatsAppService");
const {
  PIN_RECOVERY_REQUIRED_CODE,
  applyReconnectRegistrationLifecycle,
  buildDisconnectRegistrationRecovery,
  buildRegistrationRecoveryState,
  isRegistrationPinRecoveryRequired,
} = require("../services/metaWhatsAppRegistrationLifecycle");
const {
  applyMetaPhoneReadinessSnapshot,
  applyPhoneRegistrationReadiness,
} = require("../services/metaWhatsAppReadiness");
const {
  buildActivationEligibility,
  buildBillingActivationState,
} = require("../services/whatsappBillingActivationEligibility");
const {
  ROUTES,
  resolveWhatsAppBillingRoute,
} = require("../services/whatsappBillingRouteResolver");

function connectedConfig(overrides = {}) {
  return {
    ...getDefaultWhatsappBusinessConfig(),
    provider: "meta",
    connectionStatus: "connected",
    wabaId: "waba-local-1",
    phoneNumberId: "phone-local-1",
    ...overrides,
  };
}

function fullyEligibleConfig(overrides = {}) {
  return connectedConfig({
    enabled: true,
    phoneRegistrationStatus: "active",
    displayNameReadiness: { status: "send_eligible", canSend: true },
    messagingReadiness: { status: "available", blockers: [] },
    templateInstances: [
      { masterTemplateKey: "BILL_STANDARD", status: "approved" },
    ],
    testMessage: { status: "successful" },
    ...overrides,
  });
}

function readyPhoneStatus(pinEnabled) {
  return {
    status: "CONNECTED",
    platform_type: "CLOUD_API",
    code_verification_status: "VERIFIED",
    account_mode: "LIVE",
    is_pin_enabled: pinEnabled,
  };
}

test("first-time Meta registration reports only genuine success", async (t) => {
  const originalPost = axios.post;
  t.after(() => {
    axios.post = originalPost;
  });
  axios.post = async () => ({ status: 200, data: { success: true } });

  const result = await registerMetaPhoneNumber({
    phoneNumberId: "phone-local-1",
    accessToken: "local-token-placeholder",
    pin: "123456",
  });

  assert.deepEqual(result, {
    success: true,
    registrationOutcome: "registered",
    httpStatus: 200,
  });
});

test("already-registered Meta response is not synthetic success", async (t) => {
  const originalPost = axios.post;
  t.after(() => {
    axios.post = originalPost;
  });
  axios.post = async () => {
    const error = new Error("Request failed");
    error.response = {
      status: 400,
      data: {
        error: {
          code: 100,
          error_subcode: 2388003,
          message: "The phone number is already registered.",
        },
      },
    };
    throw error;
  };

  await assert.rejects(
    registerMetaPhoneNumber({
      phoneNumberId: "phone-local-1",
      accessToken: "local-token-placeholder",
      pin: "123456",
    }),
    (error) => {
      assert.equal(error.code, "meta_phone_already_registered");
      assert.equal(error.registrationOutcome, "already_registered");
      assert.equal(error.metaError.status, 400);
      assert.equal(error.metaError.code, 100);
      assert.equal(error.metaError.subcode, 2388003);
      return true;
    }
  );
});

test("a success response without success=true is rejected", async (t) => {
  const originalPost = axios.post;
  t.after(() => {
    axios.post = originalPost;
  });
  axios.post = async () => ({ status: 200, data: {} });

  await assert.rejects(
    registerMetaPhoneNumber({
      phoneNumberId: "phone-local-1",
      accessToken: "local-token-placeholder",
      pin: "123456",
    }),
    { code: "meta_phone_registration_unconfirmed" }
  );
});

test("disconnect removes credentials but retains a non-secret recovery marker", () => {
  const current = connectedConfig({
    metaAuth: { accessTokenEncrypted: "encrypted-token-placeholder" },
    metaRegistration: { pinEncrypted: "encrypted-pin-placeholder" },
    phoneRegistrationStatus: "active",
  });
  const disconnected = {
    ...getDefaultWhatsappBusinessConfig(),
    registrationRecovery: buildDisconnectRegistrationRecovery(
      current,
      new Date("2026-10-18T01:00:00.000Z")
    ),
  };

  assert.equal(disconnected.metaAuth.accessTokenEncrypted, "");
  assert.equal(disconnected.metaRegistration.pinEncrypted, "");
  assert.equal(disconnected.registrationRecovery.required, true);
  assert.equal(disconnected.registrationRecovery.wabaId, "waba-local-1");
  assert.equal(disconnected.registrationRecovery.phoneNumberId, "phone-local-1");
});

test("reconnecting the same phone requires PIN recovery and does not invent a PIN", () => {
  const disconnected = {
    ...getDefaultWhatsappBusinessConfig(),
    registrationRecovery: {
      required: true,
      wabaId: "waba-local-1",
      phoneNumberId: "phone-local-1",
      disconnectedAt: new Date("2026-10-18T01:00:00.000Z"),
    },
  };
  const reconnected = applyReconnectRegistrationLifecycle({
    current: disconnected,
    connectedConfig: connectedConfig(),
  });

  assert.equal(isRegistrationPinRecoveryRequired(reconnected), true);
  assert.equal(reconnected.metaRegistration.pinEncrypted, "");
  assert.equal(reconnected.phoneRegistrationStatus, "registration_required");
  assert.equal(reconnected.phoneRegistrationLastError, PIN_RECOVERY_REQUIRED_CODE);
});

test("connecting a different phone clears the old recovery marker", () => {
  const disconnected = {
    ...getDefaultWhatsappBusinessConfig(),
    registrationRecovery: {
      required: true,
      wabaId: "waba-local-1",
      phoneNumberId: "phone-local-1",
      disconnectedAt: new Date("2026-10-18T01:00:00.000Z"),
    },
  };
  const reconnected = applyReconnectRegistrationLifecycle({
    current: disconnected,
    connectedConfig: connectedConfig({
      wabaId: "waba-local-2",
      phoneNumberId: "phone-local-2",
    }),
  });

  assert.equal(reconnected.registrationRecovery.required, false);
  assert.equal(reconnected.phoneRegistrationStatus, "registration_required");
});

test("already-registered recovery state disables activation without discarding an existing PIN", () => {
  const recovery = buildRegistrationRecoveryState(
    connectedConfig({
      enabled: true,
      metaRegistration: { pinEncrypted: "existing-encrypted-pin" },
    })
  );

  assert.equal(recovery.enabled, false);
  assert.equal(recovery.phoneRegistrationStatus, "error");
  assert.equal(recovery.phoneRegistrationLastError, PIN_RECOVERY_REQUIRED_CODE);
  assert.equal(recovery.metaRegistration.pinEncrypted, "existing-encrypted-pin");
  assert.equal(recovery.registrationRecovery.required, true);
  const eligibility = buildActivationEligibility(recovery, recovery.messagingReadiness);
  assert.equal(buildBillingActivationState(recovery, eligibility).status, "not_ready");
  assert.equal(
    resolveWhatsAppBillingRoute({ whatsappBusiness: recovery }).route,
    ROUTES.YNOT_MSG91
  );
});

test("PIN-disabled registration remains ineligible and routes to MSG91", () => {
  const initial = fullyEligibleConfig({
    phoneRegistrationStatus: "registration_submitted",
  });
  const refresh = applyPhoneRegistrationReadiness({
    config: initial,
    phoneStatus: readyPhoneStatus(false),
  });
  const eligibility = buildActivationEligibility(
    refresh.config,
    refresh.config.messagingReadiness
  );

  assert.equal(refresh.config.phoneRegistrationStatus, "registration_submitted");
  assert.equal(eligibility.eligible, false);
  assert.equal(buildBillingActivationState(refresh.config, eligibility).status, "needs_attention");
  assert.equal(
    resolveWhatsAppBillingRoute({ whatsappBusiness: refresh.config }).route,
    ROUTES.YNOT_MSG91
  );
});

test("PIN-enabled registration promotes to active and routes to vendor Meta", () => {
  const initial = fullyEligibleConfig({
    phoneRegistrationStatus: "registration_submitted",
  });
  const refresh = applyPhoneRegistrationReadiness({
    config: initial,
    phoneStatus: readyPhoneStatus(true),
  });
  const eligibility = buildActivationEligibility(
    refresh.config,
    refresh.config.messagingReadiness
  );

  assert.equal(refresh.config.phoneRegistrationStatus, "active");
  assert.equal(eligibility.eligible, true);
  assert.equal(buildBillingActivationState(refresh.config, eligibility).status, "active");
  assert.equal(
    resolveWhatsAppBillingRoute({ whatsappBusiness: refresh.config }).route,
    ROUTES.VENDOR_META
  );
});

test("a conclusive PIN-disabled response invalidates stale active routing", () => {
  const initial = fullyEligibleConfig();
  const refresh = applyPhoneRegistrationReadiness({
    config: initial,
    phoneStatus: readyPhoneStatus(false),
  });
  const eligibility = buildActivationEligibility(
    refresh.config,
    refresh.config.messagingReadiness
  );

  assert.equal(refresh.changed, true);
  assert.equal(refresh.config.phoneRegistrationStatus, "error");
  assert.equal(buildBillingActivationState(refresh.config, eligibility).status, "needs_attention");
  assert.equal(
    resolveWhatsAppBillingRoute({ whatsappBusiness: refresh.config }).route,
    ROUTES.YNOT_MSG91
  );
});

test("temporary readiness failure preserves active registration state", () => {
  const initial = fullyEligibleConfig();
  const refresh = applyPhoneRegistrationReadiness({
    config: initial,
    phoneStatus: null,
  });

  assert.equal(refresh.changed, false);
  assert.equal(refresh.config.phoneRegistrationStatus, "active");
});

test("billing readiness snapshot blocks stale active PIN state immediately", () => {
  const snapshot = applyMetaPhoneReadinessSnapshot({
    config: fullyEligibleConfig(),
    phoneStatus: {
      ...readyPhoneStatus(false),
      health_status: { can_send_message: "AVAILABLE" },
    },
  });

  assert.equal(snapshot.config.phoneRegistrationStatus, "error");
  assert.equal(snapshot.config.messagingReadiness.status, "available");
  assert.equal(
    resolveWhatsAppBillingRoute({ whatsappBusiness: snapshot.config }).route,
    ROUTES.YNOT_MSG91
  );
});
