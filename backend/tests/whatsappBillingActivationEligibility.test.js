const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildActivationEligibility,
  buildFailedTestMessageState,
  buildSuccessfulTestMessageState,
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
