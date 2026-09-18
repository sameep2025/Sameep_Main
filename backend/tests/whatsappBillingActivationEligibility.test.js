const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildActivatedWhatsappBusinessConfig,
  buildActivationEligibility,
  buildBillingActivationState,
  buildDeactivatedWhatsappBusinessConfig,
  buildDisplayNameReadinessFromNameStatus,
  buildDisplayNameReadinessFromSendError,
  buildFailedTestMessageState,
  buildSendEligibleDisplayNameReadiness,
  buildSuccessfulTestMessageState,
  buildTestMessageStateAfterFailure,
  normalizeDisplayNameReadiness,
  normalizeTestMessageState,
} = require("../services/whatsappBillingActivationEligibility");

function eligibleConfig(overrides = {}) {
  return {
    enabled: false,
    provider: "meta",
    connectionStatus: "connected",
    phoneRegistrationStatus: "active",
    templateInstances: [
      {
        masterTemplateKey: "BILL_STANDARD",
        status: "approved",
      },
    ],
    testMessage: {
      status: "successful",
      lastTestedAt: new Date("2026-09-09T01:00:00.000Z"),
      lastSuccessfulAt: new Date("2026-09-09T01:00:00.000Z"),
      lastErrorCode: "",
    },
    ...overrides,
  };
}

test("successful controlled Meta send builds successful tracking", () => {
  const now = new Date("2026-09-09T02:00:00.000Z");
  const state = buildSuccessfulTestMessageState({}, now);

  assert.equal(state.status, "successful");
});

test("successful controlled Meta send sets lastTestedAt", () => {
  const now = new Date("2026-09-09T02:00:00.000Z");
  const state = buildSuccessfulTestMessageState({}, now);

  assert.equal(state.lastTestedAt, now);
});

test("successful controlled Meta send sets lastSuccessfulAt", () => {
  const now = new Date("2026-09-09T02:00:00.000Z");
  const state = buildSuccessfulTestMessageState({}, now);

  assert.equal(state.lastSuccessfulAt, now);
});

test("failed controlled Meta send builds failed tracking", () => {
  const state = buildFailedTestMessageState({}, { code: "meta_test_send_failed" });

  assert.equal(state.status, "failed");
});

test("failed controlled Meta send preserves prior lastSuccessfulAt", () => {
  const priorSuccess = new Date("2026-09-09T01:00:00.000Z");
  const state = buildFailedTestMessageState(
    { lastSuccessfulAt: priorSuccess },
    { code: "meta_test_send_failed" }
  );

  assert.equal(state.lastSuccessfulAt, priorSuccess);
});

test("failed controlled Meta send stores only sanitized error code", () => {
  const state = buildFailedTestMessageState({}, { metaError: { code: 131026 } });

  assert.deepEqual(Object.keys(state).sort(), [
    "lastErrorCode",
    "lastSuccessfulAt",
    "lastTestedAt",
    "status",
  ]);
  assert.equal(state.lastErrorCode, "131026");
});

test("transient failed re-test preserves previous successful validation", () => {
  const priorSuccess = new Date("2026-09-09T01:00:00.000Z");
  const state = buildTestMessageStateAfterFailure(
    {
      status: "successful",
      lastTestedAt: priorSuccess,
      lastSuccessfulAt: priorSuccess,
      lastErrorCode: "",
    },
    { code: "meta_test_send_failed" }
  );

  assert.equal(state.status, "successful");
  assert.equal(state.lastSuccessfulAt, priorSuccess);
  assert.equal(state.lastErrorCode, "");
});

test("first-ever failed test records failed validation", () => {
  const state = buildTestMessageStateAfterFailure(
    {
      status: "not_tested",
      lastTestedAt: null,
      lastSuccessfulAt: null,
      lastErrorCode: "",
    },
    { code: "meta_test_send_failed" }
  );

  assert.equal(state.status, "failed");
  assert.equal(state.lastSuccessfulAt, null);
  assert.equal(state.lastErrorCode, "meta_test_send_failed");
});

test("Meta 131037 records display-name approval pending", () => {
  const readiness = buildDisplayNameReadinessFromSendError(
    {},
    {
      metaError: {
        code: 131037,
        message: "(#131037) WhatsApp provided number needs display name approval before message can be sent.",
      },
    }
  );

  assert.equal(readiness.status, "pending");
  assert.equal(readiness.canSend, false);
  assert.equal(readiness.reason, "display_name_approval_pending");
  assert.equal(readiness.lastErrorCode, "131037");
});

test("successful test marks display-name readiness as send eligible", () => {
  const readiness = buildSendEligibleDisplayNameReadiness({
    status: "pending",
    canSend: false,
    reason: "display_name_approval_pending",
    lastErrorCode: "131037",
  });

  assert.equal(readiness.status, "send_eligible");
  assert.equal(readiness.canSend, true);
  assert.equal(readiness.reason, "");
  assert.equal(readiness.lastErrorCode, "");
});

test("raw display-name status normalization preserves exact known raw status", () => {
  const readiness = normalizeDisplayNameReadiness({
    rawStatus: "AVAILABLE_WITHOUT_REVIEW",
  });

  assert.equal(readiness.status, "send_eligible");
  assert.equal(readiness.rawStatus, "AVAILABLE_WITHOUT_REVIEW");
  assert.equal(readiness.canSend, true);
});

test("test-message tracking does not persist recipient number", () => {
  const state = buildSuccessfulTestMessageState({
    recipientPhoneNumber: "+919381520396",
    recipientMasked: "+91******0396",
  });

  assert.equal("recipientPhoneNumber" in state, false);
  assert.equal("recipientMasked" in state, false);
});

test("all prerequisites plus successful test is eligible", () => {
  assert.equal(
    buildActivationEligibility(eligibleConfig(), { status: "limited" }).eligible,
    true
  );
});

test("missing display-name readiness remains backward compatible", () => {
  const result = buildActivationEligibility(eligibleConfig(), { status: "limited" });

  assert.equal(result.checks.displayNameSendReady, true);
  assert.equal(result.eligible, true);
});

test("approved display-name readiness is send eligible", () => {
  const displayNameReadiness = buildDisplayNameReadinessFromNameStatus("APPROVED");
  const result = buildActivationEligibility(
    eligibleConfig({ displayNameReadiness }),
    { status: "limited" }
  );

  assert.equal(displayNameReadiness.status, "send_eligible");
  assert.equal(result.checks.displayNameSendReady, true);
  assert.equal(result.eligible, true);
});

test("available-without-review display-name readiness is send eligible", () => {
  const displayNameReadiness = buildDisplayNameReadinessFromNameStatus("AVAILABLE_WITHOUT_REVIEW");
  const result = buildActivationEligibility(
    eligibleConfig({ displayNameReadiness }),
    { status: "limited" }
  );

  assert.equal(displayNameReadiness.status, "send_eligible");
  assert.equal(result.checks.displayNameSendReady, true);
  assert.equal(result.eligible, true);
});

test("pending display-name readiness blocks activation eligibility", () => {
  const displayNameReadiness = buildDisplayNameReadinessFromNameStatus("PENDING_REVIEW");
  const result = buildActivationEligibility(
    eligibleConfig({ displayNameReadiness }),
    { status: "limited" }
  );

  assert.equal(displayNameReadiness.status, "pending");
  assert.equal(result.checks.displayNameSendReady, false);
  assert.equal(result.eligible, false);
  assert.ok(result.blockers.includes("display_name_pending"));
});

test("declined display-name readiness blocks activation eligibility", () => {
  const displayNameReadiness = buildDisplayNameReadinessFromNameStatus("DECLINED");
  const result = buildActivationEligibility(
    eligibleConfig({ displayNameReadiness }),
    { status: "limited" }
  );

  assert.equal(displayNameReadiness.status, "rejected");
  assert.equal(result.checks.displayNameSendReady, false);
  assert.equal(result.eligible, false);
});

test("limited messaging plus send-eligible display name remains eligible", () => {
  const displayNameReadiness = buildDisplayNameReadinessFromNameStatus("APPROVED");
  const result = buildActivationEligibility(
    eligibleConfig({ displayNameReadiness }),
    { status: "limited" }
  );

  assert.equal(result.checks.messagingNotBlocked, true);
  assert.equal(result.checks.displayNameSendReady, true);
  assert.equal(result.eligible, true);
});

test("disconnected account is not eligible", () => {
  assert.equal(
    buildActivationEligibility(
      eligibleConfig({ connectionStatus: "not_connected" }),
      { status: "limited" }
    ).eligible,
    false
  );
});

test("inactive phone registration is not eligible", () => {
  assert.equal(
    buildActivationEligibility(
      eligibleConfig({ phoneRegistrationStatus: "registration_submitted" }),
      { status: "limited" }
    ).eligible,
    false
  );
});

test("blocked messaging is not eligible", () => {
  assert.equal(
    buildActivationEligibility(eligibleConfig(), { status: "blocked" }).eligible,
    false
  );
});

test("limited messaging is eligible", () => {
  assert.equal(
    buildActivationEligibility(eligibleConfig(), { status: "limited" }).checks
      .messagingNotBlocked,
    true
  );
});

test("available messaging is eligible", () => {
  assert.equal(
    buildActivationEligibility(eligibleConfig(), { status: "available" }).checks
      .messagingNotBlocked,
    true
  );
});

test("unknown messaging is not eligible", () => {
  assert.equal(
    buildActivationEligibility(eligibleConfig(), { status: "unknown" }).eligible,
    false
  );
});

test("pending billing template is not eligible", () => {
  assert.equal(
    buildActivationEligibility(
      eligibleConfig({ templateInstances: [{ masterTemplateKey: "BILL_STANDARD", status: "pending" }] }),
      { status: "limited" }
    ).eligible,
    false
  );
});

test("rejected billing template is not eligible", () => {
  assert.equal(
    buildActivationEligibility(
      eligibleConfig({ templateInstances: [{ masterTemplateKey: "BILL_STANDARD", status: "rejected" }] }),
      { status: "limited" }
    ).eligible,
    false
  );
});

test("approved billing template passes template check", () => {
  assert.equal(
    buildActivationEligibility(eligibleConfig(), { status: "limited" }).checks
      .billingTemplateApproved,
    true
  );
});

test("missing billing template instance is not eligible even with legacy templateStatus approved", () => {
  assert.equal(
    buildActivationEligibility(
      eligibleConfig({ templateStatus: "approved", templateInstances: [] }),
      { status: "limited" }
    ).eligible,
    false
  );
});

test("not-tested controlled message is not eligible", () => {
  assert.equal(
    buildActivationEligibility(
      eligibleConfig({ testMessage: { status: "not_tested" } }),
      { status: "limited" }
    ).eligible,
    false
  );
});

test("failed controlled message is not eligible", () => {
  assert.equal(
    buildActivationEligibility(
      eligibleConfig({ testMessage: { status: "failed" } }),
      { status: "limited" }
    ).eligible,
    false
  );
});

test("successful controlled message passes test-message check", () => {
  assert.equal(
    buildActivationEligibility(eligibleConfig(), { status: "limited" }).checks
      .testMessageSuccessful,
    true
  );
});

test("enabled=false does not prevent eligibility", () => {
  assert.equal(
    buildActivationEligibility(eligibleConfig({ enabled: false }), { status: "limited" })
      .eligible,
    true
  );
});

test("eligibility evaluator never changes enabled", () => {
  const config = eligibleConfig({ enabled: false });
  buildActivationEligibility(config, { status: "limited" });

  assert.equal(config.enabled, false);
});

test("missing testMessage normalizes to not_tested", () => {
  assert.equal(normalizeTestMessageState(undefined).status, "not_tested");
});

test("legacy MSG91 vendor remains ineligible and unaffected", () => {
  const config = {
    provider: "msg91",
    connectionStatus: "not_connected",
    enabled: false,
  };
  const result = buildActivationEligibility(config, { status: "unknown" });

  assert.equal(result.eligible, false);
  assert.equal(config.enabled, false);
});

test("eligible disabled config can be activated", () => {
  const eligibility = buildActivationEligibility(eligibleConfig({ enabled: false }), {
    status: "limited",
  });

  assert.equal(eligibility.eligible, true);
});

test("activation sets enabled true", () => {
  const config = buildActivatedWhatsappBusinessConfig(eligibleConfig({ enabled: false }));

  assert.equal(config.enabled, true);
});

test("activation sets activatedAt", () => {
  const now = new Date("2026-09-09T03:00:00.000Z");
  const config = buildActivatedWhatsappBusinessConfig(eligibleConfig({ enabled: false }), now);

  assert.equal(config.activation.activatedAt, now);
});

test("activation does not change Meta asset, template, or token data", () => {
  const original = eligibleConfig({
    wabaId: "waba-1",
    phoneNumberId: "phone-1",
    metaAuth: { accessTokenEncrypted: "encrypted", tokenType: "bearer" },
    templateInstances: [{ masterTemplateKey: "BILL_STANDARD", status: "approved" }],
  });
  const activated = buildActivatedWhatsappBusinessConfig(original);

  assert.equal(activated.wabaId, original.wabaId);
  assert.equal(activated.phoneNumberId, original.phoneNumberId);
  assert.deepEqual(activated.metaAuth, original.metaAuth);
  assert.deepEqual(activated.templateInstances, original.templateInstances);
});

test("ineligible disabled config remains not ready", () => {
  const eligibility = buildActivationEligibility(
    eligibleConfig({ enabled: false, phoneRegistrationStatus: "registration_submitted" }),
    { status: "limited" }
  );
  const state = buildBillingActivationState({ enabled: false }, eligibility);

  assert.equal(eligibility.eligible, false);
  assert.equal(state.status, "not_ready");
});

test("already enabled activation config is idempotent", () => {
  const activatedAt = new Date("2026-09-09T02:00:00.000Z");
  const config = buildActivatedWhatsappBusinessConfig(
    eligibleConfig({ enabled: true, activation: { activatedAt } }),
    new Date("2026-09-09T03:00:00.000Z")
  );

  assert.equal(config.enabled, true);
  assert.equal(config.activation.activatedAt, activatedAt);
});

test("enabled true deactivation sets enabled false", () => {
  const config = buildDeactivatedWhatsappBusinessConfig(eligibleConfig({ enabled: true }));

  assert.equal(config.enabled, false);
});

test("deactivation sets deactivatedAt", () => {
  const now = new Date("2026-09-09T04:00:00.000Z");
  const config = buildDeactivatedWhatsappBusinessConfig(eligibleConfig({ enabled: true }), now);

  assert.equal(config.activation.deactivatedAt, now);
});

test("already disabled deactivation is idempotent", () => {
  const config = buildDeactivatedWhatsappBusinessConfig(eligibleConfig({ enabled: false }));

  assert.equal(config.enabled, false);
});

test("deactivation does not disconnect Meta or remove credentials/templates", () => {
  const original = eligibleConfig({
    enabled: true,
    provider: "meta",
    connectionStatus: "connected",
    metaAuth: { accessTokenEncrypted: "encrypted" },
    templateInstances: [{ masterTemplateKey: "BILL_STANDARD", status: "approved" }],
  });
  const deactivated = buildDeactivatedWhatsappBusinessConfig(original);

  assert.equal(deactivated.provider, "meta");
  assert.equal(deactivated.connectionStatus, "connected");
  assert.deepEqual(deactivated.metaAuth, original.metaAuth);
  assert.deepEqual(deactivated.templateInstances, original.templateInstances);
});

test("eligible true and enabled false maps to Ready to Activate", () => {
  const eligibility = buildActivationEligibility(eligibleConfig({ enabled: false }), {
    status: "limited",
  });

  assert.equal(
    buildBillingActivationState({ enabled: false }, eligibility).status,
    "ready_to_activate"
  );
});

test("eligible true and enabled true maps to Active", () => {
  const eligibility = buildActivationEligibility(eligibleConfig({ enabled: true }), {
    status: "limited",
  });

  assert.equal(buildBillingActivationState({ enabled: true }, eligibility).status, "active");
});

test("eligible false and enabled false maps to Not Ready", () => {
  const eligibility = buildActivationEligibility(
    eligibleConfig({ enabled: false, testMessage: { status: "not_tested" } }),
    { status: "limited" }
  );

  assert.equal(buildBillingActivationState({ enabled: false }, eligibility).status, "not_ready");
});

test("eligible false and enabled true maps to Needs Attention", () => {
  const eligibility = buildActivationEligibility(
    eligibleConfig({ enabled: true, testMessage: { status: "failed" } }),
    { status: "limited" }
  );

  assert.equal(
    buildBillingActivationState({ enabled: true }, eligibility).status,
    "needs_attention"
  );
});
