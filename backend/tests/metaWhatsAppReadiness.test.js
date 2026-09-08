const assert = require("node:assert/strict");
const test = require("node:test");

const {
  applyPhoneRegistrationReadiness,
  buildMessagingReadiness,
  isMetaPhoneRegistrationReady,
  sanitizeMessagingBlockers,
} = require("../services/metaWhatsAppReadiness");

const readyPhoneStatus = {
  status: "CONNECTED",
  platform_type: "CLOUD_API",
  account_mode: "LIVE",
  is_pin_enabled: true,
  code_verification_status: "VERIFIED",
};

test("phone registration is ready only when all proven Meta fields match", () => {
  assert.equal(isMetaPhoneRegistrationReady(readyPhoneStatus), true);
});

test("VERIFIED alone is not enough for phone registration readiness", () => {
  assert.equal(
    isMetaPhoneRegistrationReady({
      code_verification_status: "VERIFIED",
    }),
    false
  );
});

test("missing PIN state prevents phone registration readiness", () => {
  assert.equal(
    isMetaPhoneRegistrationReady({
      ...readyPhoneStatus,
      is_pin_enabled: false,
    }),
    false
  );
});

test("registration_submitted promotes to active when Meta phone is ready", () => {
  const now = new Date("2026-09-08T01:00:00.000Z");
  const result = applyPhoneRegistrationReadiness({
    config: { phoneRegistrationStatus: "registration_submitted", enabled: false },
    phoneStatus: readyPhoneStatus,
    now,
  });

  assert.equal(result.changed, true);
  assert.equal(result.config.phoneRegistrationStatus, "active");
  assert.equal(result.config.phoneRegisteredAt, now);
});

test("existing active registration remains active", () => {
  const result = applyPhoneRegistrationReadiness({
    config: { phoneRegistrationStatus: "active" },
    phoneStatus: null,
  });

  assert.equal(result.changed, false);
  assert.equal(result.config.phoneRegistrationStatus, "active");
});

test("active registration is not downgraded by temporary Meta read failures", () => {
  const result = applyPhoneRegistrationReadiness({
    config: { phoneRegistrationStatus: "active" },
    phoneStatus: { status: "DISCONNECTED" },
  });

  assert.equal(result.config.phoneRegistrationStatus, "active");
});

test("registration_required does not auto-promote even if Meta phone is ready", () => {
  const result = applyPhoneRegistrationReadiness({
    config: { phoneRegistrationStatus: "registration_required" },
    phoneStatus: readyPhoneStatus,
  });

  assert.equal(result.changed, false);
  assert.equal(result.config.phoneRegistrationStatus, "registration_required");
});

test("readiness transition does not alter whatsappBusiness.enabled", () => {
  const result = applyPhoneRegistrationReadiness({
    config: { phoneRegistrationStatus: "registration_submitted", enabled: false },
    phoneStatus: readyPhoneStatus,
  });

  assert.equal(result.config.enabled, false);
});

test("existing phoneRegisteredAt is preserved during promotion", () => {
  const existing = new Date("2026-09-07T11:39:51.822Z");
  const result = applyPhoneRegistrationReadiness({
    config: {
      phoneRegistrationStatus: "registration_submitted",
      phoneRegisteredAt: existing,
    },
    phoneStatus: readyPhoneStatus,
    now: new Date("2026-09-08T01:00:00.000Z"),
  });

  assert.equal(result.config.phoneRegisteredAt, existing);
});

test("messaging readiness maps AVAILABLE", () => {
  assert.deepEqual(buildMessagingReadiness({ can_send_message: "AVAILABLE" }), {
    status: "available",
    blockers: [],
  });
});

test("messaging readiness maps LIMITED", () => {
  assert.equal(buildMessagingReadiness({ can_send_message: "LIMITED" }).status, "limited");
});

test("messaging readiness maps BLOCKED", () => {
  assert.equal(buildMessagingReadiness({ can_send_message: "BLOCKED" }).status, "blocked");
});

test("messaging readiness maps missing or unrecognized health to unknown", () => {
  assert.equal(buildMessagingReadiness(null).status, "unknown");
  assert.equal(buildMessagingReadiness({ can_send_message: "SOMETHING_NEW" }).status, "unknown");
});

test("payment method blocker 141006 is returned safely", () => {
  const blockers = sanitizeMessagingBlockers({
    entities: [
      {
        entity_type: "WABA",
        can_send_message: "BLOCKED",
        errors: [
          {
            error_code: 141006,
            error_description: "There is an error with the payment method.",
            possible_solution: "Please add a new payment method.",
          },
        ],
      },
    ],
  });

  assert.equal(blockers.length, 1);
  assert.equal(blockers[0].entityType, "WABA");
  assert.equal(blockers[0].errorCode, "141006");
  assert.equal(blockers[0].possibleSolution, "Please add a new payment method.");
});

test("SIP calling warnings are ignored for billing readiness", () => {
  const blockers = sanitizeMessagingBlockers({
    entities: [
      {
        entity_type: "PHONE_NUMBER",
        can_send_message: "LIMITED",
        errors: [
          { error_code: 138024, error_description: "SIP is not enabled." },
          { error_code: 138025, error_description: "SIP server is not configured." },
        ],
      },
    ],
  });

  assert.deepEqual(blockers, []);
});

test("business verification 141010 is surfaced as a messaging limitation only", () => {
  const readiness = buildMessagingReadiness({
    can_send_message: "LIMITED",
    entities: [
      {
        entity_type: "BUSINESS",
        can_send_message: "LIMITED",
        errors: [
          {
            error_code: 141010,
            error_description: "The Business has not passed business verification.",
          },
        ],
      },
    ],
  });

  assert.equal(readiness.status, "limited");
  assert.equal(readiness.blockers[0].errorCode, "141010");
});
