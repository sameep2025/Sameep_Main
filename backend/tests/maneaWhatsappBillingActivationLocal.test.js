const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildActivationEligibility,
  buildBillingActivationState,
} = require("../services/whatsappBillingActivationEligibility");
const {
  applyPhoneRegistrationReadiness,
} = require("../services/metaWhatsAppReadiness");
const {
  ROUTES,
  resolveWhatsAppBillingRoute,
} = require("../services/whatsappBillingRouteResolver");
const {
  resolveBillingWhatsappProvider,
} = require("../services/whatsappBillingRouter");

const ACTIVE_LABELS = {
  active: "Active",
  needs_attention: "Needs Attention",
  ready_to_activate: "Ready to Activate",
  not_ready: "Not Ready to Activate",
};

function syntheticManeaConfig(overrides = {}) {
  return {
    vendorId: "vendor-local-manea-fixture",
    provider: "meta",
    enabled: false,
    connectionStatus: "connected",
    phoneRegistrationStatus: "registration_submitted",
    phoneNumberId: "100000000000001",
    displayNameReadiness: {
      status: "send_eligible",
      rawStatus: "APPROVED",
      canSend: true,
    },
    messagingReadiness: {
      status: "limited",
      blockers: [],
    },
    templateInstances: [
      {
        masterTemplateKey: "BILL_STANDARD",
        status: "approved",
        metaTemplateName: "local_bill_standard_fixture",
        language: "en",
      },
    ],
    testMessage: {
      status: "successful",
      lastTestedAt: new Date("2026-10-18T00:00:00.000Z"),
      lastSuccessfulAt: new Date("2026-10-18T00:00:00.000Z"),
      lastErrorCode: "",
    },
    metaAuth: {
      accessTokenEncrypted: "LOCAL_FIXTURE_NOT_A_TOKEN",
    },
    metaRegistration: {
      pinEncrypted: "LOCAL_FIXTURE_NOT_A_PIN",
    },
    ...overrides,
  };
}

function projectScenario(config) {
  const eligibility = buildActivationEligibility(config, config.messagingReadiness);
  const activationState = buildBillingActivationState(config, eligibility);
  const decision = resolveWhatsAppBillingRoute({ whatsappBusiness: config });

  return {
    eligible: eligibility.eligible,
    activationStatus: activationState.status,
    dashboardMessage: ACTIVE_LABELS[activationState.status],
    activateVisible: activationState.status === "ready_to_activate",
    deactivateVisible: config.enabled === true,
    route: decision.route,
    blockers: decision.blockers,
  };
}

const scenarios = [
  {
    name: "A - current Manea fixture",
    config: syntheticManeaConfig(),
    expected: {
      eligible: false,
      activationStatus: "not_ready",
      dashboardMessage: "Not Ready to Activate",
      activateVisible: false,
      deactivateVisible: false,
      route: ROUTES.YNOT_MSG91,
      blockers: ["not_explicitly_enabled", "phone_registration_not_ready"],
    },
  },
  {
    name: "B - enabled only",
    config: syntheticManeaConfig({ enabled: true }),
    expected: {
      eligible: false,
      activationStatus: "needs_attention",
      dashboardMessage: "Needs Attention",
      activateVisible: false,
      deactivateVisible: true,
      route: ROUTES.YNOT_MSG91,
      blockers: ["phone_registration_not_ready"],
    },
  },
  {
    name: "C - simulated working configuration",
    config: syntheticManeaConfig({
      enabled: true,
      phoneRegistrationStatus: "active",
    }),
    expected: {
      eligible: true,
      activationStatus: "active",
      dashboardMessage: "Active",
      activateVisible: false,
      deactivateVisible: true,
      route: ROUTES.VENDOR_META,
      blockers: [],
    },
  },
  {
    name: "D - stale active database state",
    config: syntheticManeaConfig({
      enabled: true,
      phoneRegistrationStatus: "active",
    }),
    expected: {
      eligible: true,
      activationStatus: "active",
      dashboardMessage: "Active",
      activateVisible: false,
      deactivateVisible: true,
      route: ROUTES.VENDOR_META,
      blockers: [],
    },
  },
];

for (const scenario of scenarios) {
  test(`${scenario.name} uses the expected activation and routing gates`, () => {
    assert.deepEqual(projectScenario(scenario.config), scenario.expected);
  });
}

test("an eligible but disabled configuration displays Ready to Activate", () => {
  const result = projectScenario(
    syntheticManeaConfig({
      enabled: false,
      phoneRegistrationStatus: "active",
    })
  );

  assert.equal(result.activationStatus, "ready_to_activate");
  assert.equal(result.dashboardMessage, "Ready to Activate");
  assert.equal(result.activateVisible, true);
  assert.equal(result.deactivateVisible, false);
  assert.equal(result.route, ROUTES.YNOT_MSG91);
  assert.deepEqual(result.blockers, ["not_explicitly_enabled"]);
});

test("the global routing flag is required even for a fully ready vendor", () => {
  const vendor = {
    whatsappBusiness: syntheticManeaConfig({
      enabled: true,
      phoneRegistrationStatus: "active",
    }),
  };

  assert.equal(
    resolveBillingWhatsappProvider({
      vendor,
      env: { WHATSAPP_VENDOR_META_BILL_ROUTING_ENABLED: "false" },
    }).provider,
    ROUTES.YNOT_MSG91
  );
  assert.equal(
    resolveBillingWhatsappProvider({
      vendor,
      env: { WHATSAPP_VENDOR_META_BILL_ROUTING_ENABLED: "true" },
    }).provider,
    ROUTES.VENDOR_META
  );
});

test("a false PIN readiness response invalidates an already active database state", () => {
  const staleConfig = syntheticManeaConfig({
    enabled: true,
    phoneRegistrationStatus: "active",
  });
  const refresh = applyPhoneRegistrationReadiness({
    config: staleConfig,
    phoneStatus: {
      id: "100000000000001",
      status: "CONNECTED",
      platform_type: "CLOUD_API",
      code_verification_status: "VERIFIED",
      account_mode: "LIVE",
      is_pin_enabled: false,
    },
  });

  assert.equal(refresh.changed, true);
  assert.equal(refresh.config.phoneRegistrationStatus, "error");
  assert.equal(projectScenario(refresh.config).activationStatus, "needs_attention");
  assert.equal(projectScenario(refresh.config).route, ROUTES.YNOT_MSG91);
});

test("a false PIN readiness response leaves registration_submitted pending", () => {
  const currentConfig = syntheticManeaConfig({ enabled: true });
  const refresh = applyPhoneRegistrationReadiness({
    config: currentConfig,
    phoneStatus: {
      id: "100000000000001",
      status: "CONNECTED",
      platform_type: "CLOUD_API",
      code_verification_status: "VERIFIED",
      account_mode: "LIVE",
      is_pin_enabled: false,
    },
  });

  assert.equal(refresh.changed, false);
  assert.equal(refresh.config.phoneRegistrationStatus, "registration_submitted");
  assert.equal(projectScenario(refresh.config).activationStatus, "needs_attention");
  assert.equal(projectScenario(refresh.config).route, ROUTES.YNOT_MSG91);
});
