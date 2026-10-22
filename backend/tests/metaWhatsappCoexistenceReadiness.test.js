const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const axios = require("axios");

const {
  applyMetaPhoneReadinessSnapshot,
  evaluateCoexistenceReadiness,
} = require("../services/metaWhatsAppReadiness");
const {
  buildActivationEligibility,
} = require("../services/whatsappBillingActivationEligibility");
const {
  ROUTES,
  resolveWhatsAppBillingRoute,
} = require("../services/whatsappBillingRouteResolver");
const {
  refreshMetaPhoneReadinessForResponse,
} = require("../controllers/vendorWhatsappBusinessController");
const {
  getCoexistencePhoneReadiness,
} = require("../services/metaWhatsAppService");

const controllerSource = fs.readFileSync(
  path.join(__dirname, "../controllers/vendorWhatsappBusinessController.js"),
  "utf8"
);
const senderSource = fs.readFileSync(
  path.join(__dirname, "../services/billingWhatsappSender.js"),
  "utf8"
);

function coexistenceConfig(overrides = {}) {
  const connectedAt = new Date("2026-10-21T08:00:00.000Z");
  return {
    provider: "meta",
    enabled: false,
    connectionMode: "coexistence",
    connectionStatus: "connected",
    wabaId: "waba-1",
    phoneNumberId: "phone-1",
    connectedAt,
    phoneRegistrationStatus: "registered",
    metaAuth: { accessTokenEncrypted: "encrypted-token" },
    coexistenceEvidence: {
      wabaId: "waba-1",
      phoneNumberId: "phone-1",
      isOnBizApp: true,
      platformType: "CLOUD_API",
      verifiedAt: connectedAt,
      signupEventType: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
      appSubscriptionVerified: true,
      appSubscriptionVerifiedAt: connectedAt,
    },
    displayNameReadiness: { status: "send_eligible", canSend: true },
    templateInstances: [
      { masterTemplateKey: "BILL_STANDARD", status: "approved" },
    ],
    testMessage: { status: "successful" },
    ...overrides,
  };
}

function liveCoexistencePhone(overrides = {}) {
  return {
    id: "phone-1",
    is_on_biz_app: true,
    status: "CONNECTED",
    platform_type: "CLOUD_API",
    name_status: "APPROVED",
    health_status: { can_send_message: "LIMITED" },
    ...overrides,
  };
}

function readySnapshot(config = coexistenceConfig(), phone = liveCoexistencePhone()) {
  return applyMetaPhoneReadinessSnapshot({ config, phoneStatus: phone }).config;
}

test("verified Coexistence readiness uses live identity and Business App status without a PIN", () => {
  const config = coexistenceConfig({
    metaRegistration: { pinEncrypted: "" },
  });
  const readiness = evaluateCoexistenceReadiness({
    config,
    phoneStatus: liveCoexistencePhone({ is_pin_enabled: false }),
  });

  assert.equal(readiness.ready, true);
  assert.equal(Object.hasOwn(readiness.checks, "pinEnabled"), false);
});

test("missing or stale Coexistence verification evidence fails closed", () => {
  const missing = evaluateCoexistenceReadiness({
    config: coexistenceConfig({ coexistenceEvidence: {} }),
    phoneStatus: liveCoexistencePhone(),
  });
  assert.equal(missing.ready, false);

  const stale = evaluateCoexistenceReadiness({
    config: coexistenceConfig({
      coexistenceEvidence: {
        ...coexistenceConfig().coexistenceEvidence,
        verifiedAt: new Date("2026-10-20T08:00:00.000Z"),
        appSubscriptionVerifiedAt: new Date("2026-10-20T08:00:00.000Z"),
      },
    }),
    phoneStatus: liveCoexistencePhone(),
  });
  assert.equal(stale.ready, false);
  assert.ok(stale.blockers.includes("evidenceCurrent"));
});

test("incorrect WABA or phone identity and missing subscription fail closed", () => {
  for (const config of [
    coexistenceConfig({
      coexistenceEvidence: {
        ...coexistenceConfig().coexistenceEvidence,
        wabaId: "other-waba",
      },
    }),
    coexistenceConfig({
      coexistenceEvidence: {
        ...coexistenceConfig().coexistenceEvidence,
        appSubscriptionVerified: false,
      },
    }),
  ]) {
    assert.equal(
      evaluateCoexistenceReadiness({ config, phoneStatus: liveCoexistencePhone() }).ready,
      false
    );
  }

  assert.equal(
    evaluateCoexistenceReadiness({
      config: coexistenceConfig(),
      phoneStatus: liveCoexistencePhone({ id: "other-phone" }),
    }).ready,
    false
  );
});

test("live Business App, connection, and platform checks are all mandatory", () => {
  for (const phoneStatus of [
    liveCoexistencePhone({ is_on_biz_app: false }),
    liveCoexistencePhone({ status: "PENDING" }),
    liveCoexistencePhone({ platform_type: "NOT_APPLICABLE" }),
  ]) {
    assert.equal(
      evaluateCoexistenceReadiness({
        config: coexistenceConfig(),
        phoneStatus,
      }).ready,
      false
    );
  }
});

test("dedicated live lookup requests Coexistence evidence without changing standard fields", async (t) => {
  const originalGet = axios.get;
  t.after(() => {
    axios.get = originalGet;
  });
  let request = null;
  axios.get = async (url, options) => {
    request = { url, options };
    return { data: liveCoexistencePhone() };
  };

  const result = await getCoexistencePhoneReadiness({
    phoneNumberId: "phone-1",
    accessToken: "mock-token",
  });

  assert.equal(result.id, "phone-1");
  assert.match(request.url, /\/phone-1$/);
  assert.match(request.options.params.fields, /is_on_biz_app/);
  assert.match(request.options.params.fields, /health_status/);
  assert.doesNotMatch(request.options.params.fields, /is_pin_enabled/);
});

test("verified Coexistence still requires template, test message, messaging, and explicit activation", () => {
  const ready = readySnapshot();
  assert.equal(buildActivationEligibility(ready, ready.messagingReadiness).eligible, true);
  assert.equal(resolveWhatsAppBillingRoute({ whatsappBusiness: ready }).route, ROUTES.YNOT_MSG91);

  const activated = { ...ready, enabled: true };
  assert.equal(
    resolveWhatsAppBillingRoute({ whatsappBusiness: activated }).route,
    ROUTES.VENDOR_META
  );

  for (const config of [
    { ...activated, templateInstances: [] },
    { ...activated, testMessage: { status: "failed" } },
    { ...activated, messagingReadiness: { status: "unknown" } },
  ]) {
    assert.equal(resolveWhatsAppBillingRoute({ whatsappBusiness: config }).route, ROUTES.YNOT_MSG91);
  }
});

test("a failed live lookup removes Coexistence routing eligibility", () => {
  const failed = applyMetaPhoneReadinessSnapshot({
    config: { ...readySnapshot(), enabled: true },
    phoneStatus: null,
  }).config;

  assert.equal(failed.coexistenceReadiness.ready, false);
  assert.equal(resolveWhatsAppBillingRoute({ whatsappBusiness: failed }).route, ROUTES.YNOT_MSG91);
});

test("dashboard and activation refresh use the dedicated verified Coexistence lookup", async () => {
  const writes = [];
  const record = {
    vendor: { _id: "vendor-1", whatsappBusiness: coexistenceConfig() },
    Model: {
      updateOne: async (...args) => {
        writes.push(args);
        return { matchedCount: 1 };
      },
    },
  };
  let standardCalls = 0;
  let coexistenceCalls = 0;
  const result = await refreshMetaPhoneReadinessForResponse(record, {
    getPhoneReadiness: async () => {
      standardCalls += 1;
      throw new Error("standard lookup must not run");
    },
    getCoexistenceReadiness: async ({ phoneNumberId, accessToken }) => {
      coexistenceCalls += 1;
      assert.equal(phoneNumberId, "phone-1");
      assert.equal(accessToken, "decrypted-token");
      return liveCoexistencePhone();
    },
    getMetaAccessToken: () => "decrypted-token",
    logger: { error: () => {} },
  });

  assert.equal(standardCalls, 0);
  assert.equal(coexistenceCalls, 1);
  assert.equal(result.coexistenceReadiness.ready, true);
  assert.equal(result.messagingReadiness.status, "limited");
  assert.equal(writes.length, 1);
  assert.equal(
    Object.hasOwn(writes[0][1].$set, "whatsappBusiness.phoneRegistrationStatus"),
    false
  );
});

test("standard and legacy activation semantics remain PIN-state based", () => {
  for (const connectionMode of ["standard_cloud_api", "legacy_unknown"]) {
    const base = {
      ...coexistenceConfig(),
      connectionMode,
      phoneRegistrationStatus: "active",
      coexistenceReadiness: undefined,
    };
    assert.equal(buildActivationEligibility(base, { status: "limited" }).eligible, true);
    assert.equal(
      buildActivationEligibility(
        { ...base, phoneRegistrationStatus: "registration_required" },
        { status: "limited" }
      ).eligible,
      false
    );
  }
});

test("all Coexistence registration entry points fail closed before /register", () => {
  assert.match(
    controllerSource,
    /function assertStandardPhoneRegistrationAllowed\(config\) \{\s*if \(config\.connectionMode === "coexistence"\)/
  );
  assert.equal(
    (controllerSource.match(/assertStandardPhoneRegistrationAllowed\(config\)/g) || []).length,
    3
  );
});

test("completed-bill readiness uses the dedicated Coexistence lookup", () => {
  assert.match(senderSource, /connectionMode === "coexistence"/);
  assert.match(senderSource, /getCoexistencePhoneReadiness\(\{/);
  assert.match(senderSource, /decryptMetaAccessToken\(/);
  assert.match(senderSource, /applyMetaPhoneReadinessSnapshot\(\{/);
});
