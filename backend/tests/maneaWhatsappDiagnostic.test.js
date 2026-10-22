const assert = require("node:assert/strict");
const test = require("node:test");

const {
  getDiagnosticConfiguration,
  getDiagnosticUseId,
  getManeaActivationDiagnosticAuthorization,
  prepareManeaDiagnosticSend,
} = require("../services/maneaWhatsappDiagnostic");
const {
  applyMetaPhoneReadinessSnapshot,
} = require("../services/metaWhatsAppReadiness");
const {
  ROUTES,
} = require("../services/whatsappBillingRouteResolver");
const {
  buildActivationEligibility,
} = require("../services/whatsappBillingActivationEligibility");
const {
  resolveBillingWhatsappProvider,
  sendRoutedWhatsAppBillingMessage,
} = require("../services/whatsappBillingRouter");

const MANEA_VENDOR_ID = "69d3a74c7f444571dd02ae3d";
const MANEA_WABA_ID = "4402848216525508";
const MANEA_PHONE_NUMBER_ID = "1335446439659507";
const BILL_ID_A = "64b000000000000000000002";
const BILL_ID_B = "64b000000000000000000003";

function diagnosticEnv(overrides = {}) {
  return {
    YNOT_RUNTIME_ENVIRONMENT: "production",
    WHATSAPP_VENDOR_META_BILL_ROUTING_ENABLED: "true",
    MANEA_WHATSAPP_DIAGNOSTIC_ENABLED: "true",
    MANEA_WHATSAPP_DIAGNOSTIC_VENDOR_ID: MANEA_VENDOR_ID,
    MANEA_WHATSAPP_DIAGNOSTIC_WABA_ID: MANEA_WABA_ID,
    MANEA_WHATSAPP_DIAGNOSTIC_PHONE_NUMBER_ID: MANEA_PHONE_NUMBER_ID,
    ...overrides,
  };
}

function readyWhatsappBusiness(overrides = {}) {
  return {
    provider: "meta",
    enabled: true,
    connectionStatus: "connected",
    phoneRegistrationStatus: "active",
    wabaId: "other-waba",
    phoneNumberId: "other-phone",
    messagingReadiness: { status: "limited" },
    displayNameReadiness: { status: "send_eligible", canSend: true },
    templateInstances: [{ masterTemplateKey: "BILL_STANDARD", status: "approved" }],
    testMessage: { status: "successful" },
    ...overrides,
  };
}

function maneaWhatsappBusiness(overrides = {}) {
  return readyWhatsappBusiness({
    phoneRegistrationStatus: "error",
    wabaId: MANEA_WABA_ID,
    phoneNumberId: MANEA_PHONE_NUMBER_ID,
    ...overrides,
  });
}

function createLegacyUseModel({ existingBillIds = [], failOnAccess = false } = {}) {
  const documents = new Map(
    existingBillIds.map((billId) => [getDiagnosticUseId(billId), { _id: getDiagnosticUseId(billId) }])
  );
  const calls = { findById: 0 };
  return {
    calls,
    Model: {
      findById(id) {
        calls.findById += 1;
        if (failOnAccess) {
          throw Object.assign(new Error("database unavailable"), { code: "db_unavailable" });
        }
        return { lean: async () => documents.get(id) || null };
      },
    },
  };
}

function sendHarness({
  vendor,
  vendorId = vendor._id,
  billId = BILL_ID_A,
  recipient = "919999999999",
  env = diagnosticEnv(),
  legacyStore = createLegacyUseModel(),
  sendVendorMeta,
} = {}) {
  const calls = { meta: 0, msg91: 0 };
  return {
    calls,
    legacyStore,
    run: () => sendRoutedWhatsAppBillingMessage(
      {
        vendor,
        vendorId,
        billId,
        msg91Payload: { mobile: recipient },
        metaPayload: { vendor, recipientPhoneNumber: recipient },
      },
      {
        env,
        logger: { log() {}, error() {} },
        hasMsg91Balance: async () => true,
        sendMsg91: async () => {
          calls.msg91 += 1;
          return { success: true };
        },
        sendVendorMeta: async (payload) => {
          calls.meta += 1;
          if (sendVendorMeta) return sendVendorMeta(payload);
          return { metaMessageId: "wamid.diagnostic" };
        },
        prepareDiagnosticSend: (args) => prepareManeaDiagnosticSend({
          ...args,
          UseModel: legacyStore.Model,
        }),
      }
    ),
  };
}

test("diagnostic requires only the exact production Manea identity and enabled flag", () => {
  assert.equal(getDiagnosticConfiguration(diagnosticEnv()).valid, true);
  assert.equal(getDiagnosticConfiguration({}).valid, false);
  assert.equal(
    getDiagnosticConfiguration(diagnosticEnv({ MANEA_WHATSAPP_DIAGNOSTIC_ENABLED: "false" })).valid,
    false
  );
  assert.equal(
    getDiagnosticConfiguration(diagnosticEnv({ YNOT_RUNTIME_ENVIRONMENT: "test" })).valid,
    false
  );
  assert.equal(
    getDiagnosticConfiguration(diagnosticEnv({ MANEA_WHATSAPP_DIAGNOSTIC_VENDOR_ID: BILL_ID_A })).valid,
    false
  );
  assert.equal(
    Object.hasOwn(getDiagnosticConfiguration(diagnosticEnv()), "billingSessionId"),
    false
  );
  assert.equal(Object.hasOwn(getDiagnosticConfiguration(diagnosticEnv()), "recipient"), false);
});

test("Manea activation with registration error bypasses only registration readiness", () => {
  const config = maneaWhatsappBusiness({ enabled: false });
  const authorization = getManeaActivationDiagnosticAuthorization({
    env: diagnosticEnv(),
    vendorId: MANEA_VENDOR_ID,
    whatsappBusiness: config,
  });
  const eligibility = buildActivationEligibility(config, config.messagingReadiness, {
    phoneRegistrationReadyOverride: authorization.allowed,
  });

  assert.equal(authorization.allowed, true);
  assert.equal(eligibility.eligible, true);
  assert.equal(eligibility.checks.phoneRegistrationReady, true);
  assert.equal(eligibility.diagnostic.phoneRegistrationBypassApplied, true);

  const unknown = buildActivationEligibility(
    config,
    { status: "unknown" },
    { phoneRegistrationReadyOverride: authorization.allowed }
  );
  assert.equal(unknown.eligible, false);
  assert.ok(unknown.blockers.includes("messaging_unknown"));
});

test("Manea diagnostic cannot authorize another environment or Meta identity", () => {
  const cases = [
    { env: diagnosticEnv({ YNOT_RUNTIME_ENVIRONMENT: "test" }) },
    { env: diagnosticEnv({ YNOT_RUNTIME_ENVIRONMENT: "preprod" }) },
    { vendorId: BILL_ID_A },
    { whatsappBusiness: maneaWhatsappBusiness({ wabaId: "wrong" }) },
    { whatsappBusiness: maneaWhatsappBusiness({ phoneNumberId: "wrong" }) },
  ];

  for (const overrides of cases) {
    const authorization = getManeaActivationDiagnosticAuthorization({
      env: overrides.env || diagnosticEnv(),
      vendorId: overrides.vendorId || MANEA_VENDOR_ID,
      whatsappBusiness: overrides.whatsappBusiness || maneaWhatsappBusiness(),
    });
    assert.equal(authorization.allowed, false);
  }
});

test("Manea normal bills allow arbitrary session IDs and recipients through Meta", async () => {
  const readiness = applyMetaPhoneReadinessSnapshot({
    config: maneaWhatsappBusiness(),
    phoneStatus: {
      status: "CONNECTED",
      platform_type: "CLOUD_API",
      account_mode: "LIVE",
      is_pin_enabled: false,
      health_status: { can_send_message: "LIMITED" },
    },
  });
  const vendor = { _id: MANEA_VENDOR_ID, whatsappBusiness: readiness.config };

  for (const [billId, recipient] of [
    [BILL_ID_A, "919999999999"],
    [BILL_ID_B, "918888888888"],
  ]) {
    const harness = sendHarness({ vendor, billId, recipient });
    const result = await harness.run();
    assert.equal(result.route, ROUTES.VENDOR_META);
    assert.equal(result.reason, "manea_registration_readiness_diagnostic");
    assert.equal(harness.calls.meta, 1);
    assert.equal(harness.calls.msg91, 0);
  }
});

test("completion provider estimate matches the Manea diagnostic route", () => {
  const vendor = { _id: MANEA_VENDOR_ID, whatsappBusiness: maneaWhatsappBusiness() };
  assert.equal(
    resolveBillingWhatsappProvider({ vendor, env: diagnosticEnv() }).route,
    ROUTES.VENDOR_META
  );
  assert.equal(
    resolveBillingWhatsappProvider({
      vendor,
      env: diagnosticEnv({ MANEA_WHATSAPP_DIAGNOSTIC_ENABLED: "false" }),
    }).route,
    ROUTES.YNOT_MSG91
  );
});

test("Manea deactivation always restores MSG91 routing", async () => {
  const vendor = {
    _id: MANEA_VENDOR_ID,
    whatsappBusiness: maneaWhatsappBusiness({ enabled: false }),
  };
  const harness = sendHarness({ vendor });
  const result = await harness.run();
  assert.equal(result.route, ROUTES.YNOT_MSG91);
  assert.equal(harness.calls.meta, 0);
  assert.equal(harness.calls.msg91, 1);
});

test("diagnostic flag off restores normal registration validation for Manea", async () => {
  const vendor = { _id: MANEA_VENDOR_ID, whatsappBusiness: maneaWhatsappBusiness() };
  const harness = sendHarness({
    vendor,
    env: diagnosticEnv({ MANEA_WHATSAPP_DIAGNOSTIC_ENABLED: "false" }),
  });
  const result = await harness.run();
  assert.equal(result.route, ROUTES.YNOT_MSG91);
  assert.equal(harness.calls.meta, 0);
  assert.equal(harness.calls.msg91, 1);
});

test("all non-registration eligibility checks remain enforced for Manea", async () => {
  const cases = [
    { connectionStatus: "not_connected" },
    { messagingReadiness: { status: "blocked" } },
    { messagingReadiness: { status: "unknown" } },
    { displayNameReadiness: { status: "pending", canSend: false } },
    { templateInstances: [{ masterTemplateKey: "BILL_STANDARD", status: "pending" }] },
    { testMessage: { status: "failed" } },
  ];

  for (const override of cases) {
    const vendor = {
      _id: MANEA_VENDOR_ID,
      whatsappBusiness: maneaWhatsappBusiness(override),
    };
    const harness = sendHarness({ vendor });
    const result = await harness.run();
    assert.equal(result.route, ROUTES.YNOT_MSG91);
    assert.equal(harness.calls.meta, 0);
    assert.equal(harness.calls.msg91, 1);
  }
});

test("existing own-number and MSG91 vendors retain their routes without legacy DB access", async () => {
  const metaVendor = { _id: BILL_ID_A, whatsappBusiness: readyWhatsappBusiness() };
  const msg91Vendor = {
    _id: BILL_ID_B,
    whatsappBusiness: readyWhatsappBusiness({ enabled: false }),
  };
  const failingStore = createLegacyUseModel({ failOnAccess: true });
  const metaHarness = sendHarness({ vendor: metaVendor, legacyStore: failingStore });
  const msg91Harness = sendHarness({ vendor: msg91Vendor, legacyStore: failingStore });

  assert.equal((await metaHarness.run()).route, ROUTES.VENDOR_META);
  assert.equal((await msg91Harness.run()).route, ROUTES.YNOT_MSG91);
  assert.equal(failingStore.calls.findById, 0);
});

test("global Meta routing switch still overrides the Manea diagnostic", async () => {
  const vendor = { _id: MANEA_VENDOR_ID, whatsappBusiness: maneaWhatsappBusiness() };
  const harness = sendHarness({
    vendor,
    env: diagnosticEnv({ WHATSAPP_VENDOR_META_BILL_ROUTING_ENABLED: "false" }),
  });
  const result = await harness.run();
  assert.equal(result.route, ROUTES.YNOT_MSG91);
  assert.equal(harness.calls.meta, 0);
  assert.equal(harness.calls.msg91, 1);
});

test("Meta rejection and timeout never fall back to MSG91", async () => {
  const vendor = { _id: MANEA_VENDOR_ID, whatsappBusiness: maneaWhatsappBusiness() };
  const rejection = Object.assign(new Error("Meta rejected"), {
    code: "meta_send_failed",
    response: { status: 400 },
  });
  const rejected = sendHarness({ vendor, sendVendorMeta: async () => { throw rejection; } });
  const rejectedResult = await rejected.run();
  assert.equal(rejectedResult.status, "failed");
  assert.equal(rejected.calls.meta, 1);
  assert.equal(rejected.calls.msg91, 0);

  const timeout = Object.assign(new Error("request timeout"), { code: "ETIMEDOUT" });
  const uncertain = sendHarness({ vendor, sendVendorMeta: async () => { throw timeout; } });
  const uncertainResult = await uncertain.run();
  assert.equal(uncertainResult.status, "uncertain");
  assert.equal(uncertain.calls.meta, 1);
  assert.equal(uncertain.calls.msg91, 0);
});

test("each route invocation attempts at most one provider", async () => {
  const vendor = { _id: MANEA_VENDOR_ID, whatsappBusiness: maneaWhatsappBusiness() };
  const harness = sendHarness({ vendor });
  const result = await harness.run();
  assert.equal(result.status, "accepted");
  assert.equal(harness.calls.meta + harness.calls.msg91, 1);
});

test("legacy one-session claim remains authoritative for retries and historical resends", async () => {
  const vendor = { _id: MANEA_VENDOR_ID, whatsappBusiness: maneaWhatsappBusiness() };
  const legacyStore = createLegacyUseModel({ existingBillIds: [BILL_ID_A] });
  const harness = sendHarness({ vendor, legacyStore });
  const result = await harness.run();
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "legacy_diagnostic_claim_exists");
  assert.equal(harness.calls.meta, 0);
  assert.equal(harness.calls.msg91, 0);
});

test("legacy claim DB failure blocks Manea only and leaves other vendors unaffected", async () => {
  const failingStore = createLegacyUseModel({ failOnAccess: true });
  const manea = sendHarness({
    vendor: { _id: MANEA_VENDOR_ID, whatsappBusiness: maneaWhatsappBusiness() },
    legacyStore: failingStore,
  });
  const maneaResult = await manea.run();
  assert.equal(maneaResult.status, "skipped");
  assert.equal(maneaResult.reason, "diagnostic_claim_lookup_failed");
  assert.equal(manea.calls.meta, 0);
  assert.equal(manea.calls.msg91, 0);

  const otherStore = createLegacyUseModel({ failOnAccess: true });
  const other = sendHarness({
    vendor: { _id: BILL_ID_B, whatsappBusiness: readyWhatsappBusiness({ enabled: false }) },
    legacyStore: otherStore,
  });
  assert.equal((await other.run()).route, ROUTES.YNOT_MSG91);
  assert.equal(otherStore.calls.findById, 0);
});

test("completed-bill and historical resend paths continue using the shared sender", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const sender = fs.readFileSync(
    path.join(__dirname, "../services/billingWhatsappSender.js"),
    "utf8"
  );
  const controller = fs.readFileSync(
    path.join(__dirname, "../controllers/billingController.js"),
    "utf8"
  );
  assert.match(sender, /prepareManeaDiagnosticSend\(\{/);
  assert.match(sender, /sendRoutedWhatsAppBillingMessage\(\{/);
  assert.match(
    controller,
    /resendHistoricalBillWhatsapp[\s\S]*sendCompletedBillWhatsApp\(\{[\s\S]*billing: bill/
  );
});
