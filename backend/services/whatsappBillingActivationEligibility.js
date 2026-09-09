const BILLING_TEMPLATE_KEY = "BILL_STANDARD";
const CONNECTED_STATUSES = new Set(["connected", "template_pending", "ready"]);
const TEST_MESSAGE_STATUSES = new Set(["not_tested", "successful", "failed"]);

function normalizeTestMessageStatus(value) {
  const status = String(value || "").trim();
  return TEST_MESSAGE_STATUSES.has(status) ? status : "not_tested";
}

function normalizeTestMessageState(testMessage) {
  const source = testMessage && typeof testMessage === "object" ? testMessage : {};
  return {
    status: normalizeTestMessageStatus(source.status),
    lastTestedAt: source.lastTestedAt || null,
    lastSuccessfulAt: source.lastSuccessfulAt || null,
    lastErrorCode: source.lastErrorCode || "",
  };
}

function getSanitizedErrorCode(error) {
  return String(
    error?.metaError?.code ||
      error?.metaError?.errorCode ||
      error?.code ||
      "meta_test_send_failed"
  ).trim();
}

function buildSuccessfulTestMessageState(previous, now = new Date()) {
  return {
    ...normalizeTestMessageState(previous),
    status: "successful",
    lastTestedAt: now,
    lastSuccessfulAt: now,
    lastErrorCode: "",
  };
}

function buildFailedTestMessageState(previous, error, now = new Date()) {
  const normalized = normalizeTestMessageState(previous);
  return {
    ...normalized,
    status: "failed",
    lastTestedAt: now,
    lastSuccessfulAt: normalized.lastSuccessfulAt || null,
    lastErrorCode: getSanitizedErrorCode(error),
  };
}

function getBillingTemplateInstance(config) {
  const instances = Array.isArray(config?.templateInstances) ? config.templateInstances : [];
  return (
    instances.find((instance) => instance?.masterTemplateKey === BILLING_TEMPLATE_KEY) ||
    null
  );
}

function isBillingTemplateApproved(config) {
  const instance = getBillingTemplateInstance(config);
  return instance?.status === "approved";
}

function buildActivationEligibility(config, messagingReadiness = {}) {
  const current = config && typeof config === "object" ? config : {};
  const messagingStatus = String(messagingReadiness?.status || "unknown").trim();
  const testMessage = normalizeTestMessageState(current.testMessage);
  const checks = {
    accountConnected:
      current.provider === "meta" && CONNECTED_STATUSES.has(current.connectionStatus),
    phoneRegistrationReady: current.phoneRegistrationStatus === "active",
    messagingNotBlocked: messagingStatus === "available" || messagingStatus === "limited",
    billingTemplateApproved: isBillingTemplateApproved(current),
    testMessageSuccessful: testMessage.status === "successful",
  };
  const blockers = [];

  if (!checks.accountConnected) blockers.push("account_not_connected");
  if (!checks.phoneRegistrationReady) blockers.push("phone_registration_not_ready");
  if (!checks.messagingNotBlocked) {
    blockers.push(messagingStatus === "blocked" ? "messaging_blocked" : "messaging_unknown");
  }
  if (!checks.billingTemplateApproved) blockers.push("billing_template_not_approved");
  if (!checks.testMessageSuccessful) blockers.push(`test_message_${testMessage.status}`);

  return {
    eligible: Object.values(checks).every(Boolean),
    checks,
    blockers,
  };
}

function buildBillingActivationState(config, activationEligibility) {
  const enabled = Boolean(config?.enabled);
  const eligible = Boolean(activationEligibility?.eligible);

  if (enabled && eligible) {
    return {
      status: "active",
      label: "Active",
    };
  }

  if (enabled && !eligible) {
    return {
      status: "needs_attention",
      label: "Needs Attention",
    };
  }

  if (!enabled && eligible) {
    return {
      status: "ready_to_activate",
      label: "Ready to Activate",
    };
  }

  return {
    status: "not_ready",
    label: "Not Ready to Activate",
  };
}

function buildActivatedWhatsappBusinessConfig(config, now = new Date()) {
  const current = config && typeof config === "object" ? config : {};
  const activation = current.activation && typeof current.activation === "object"
    ? current.activation
    : {};

  return {
    ...current,
    enabled: true,
    activation: {
      ...activation,
      activatedAt: activation.activatedAt || now,
      deactivatedAt: activation.deactivatedAt || null,
    },
  };
}

function buildDeactivatedWhatsappBusinessConfig(config, now = new Date()) {
  const current = config && typeof config === "object" ? config : {};
  const activation = current.activation && typeof current.activation === "object"
    ? current.activation
    : {};

  return {
    ...current,
    enabled: false,
    activation: {
      ...activation,
      activatedAt: activation.activatedAt || null,
      deactivatedAt: now,
    },
  };
}

module.exports = {
  BILLING_TEMPLATE_KEY,
  buildActivatedWhatsappBusinessConfig,
  buildActivationEligibility,
  buildBillingActivationState,
  buildDeactivatedWhatsappBusinessConfig,
  buildFailedTestMessageState,
  buildSuccessfulTestMessageState,
  getBillingTemplateInstance,
  isBillingTemplateApproved,
  normalizeTestMessageState,
};
