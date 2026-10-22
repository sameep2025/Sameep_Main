const META_PHONE_READY_STATUS = "CONNECTED";
const META_PHONE_READY_PLATFORM = "CLOUD_API";
const META_PHONE_READY_ACCOUNT_MODE = "LIVE";

const MESSAGING_READINESS_STATUSES = {
  AVAILABLE: "available",
  LIMITED: "limited",
  BLOCKED: "blocked",
};

const IGNORED_BILLING_WARNING_CODES = new Set(["138024", "138025"]);
const COEXISTENCE_CONNECTION_MODE = "coexistence";

function normalizeMetaValue(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeLifecycleStatus(value) {
  const status = String(value || "").trim();
  if (status === "active") return "active";
  if (status === "registration_submitted") return "registration_submitted";
  if (status === "not_registered") return "not_registered";
  if (status === "registration_required") return "registration_required";
  if (status === "error") return "error";
  if (status === "registered") return "registration_required";
  return "registration_required";
}

function isMetaPhoneRegistrationReady(phoneStatus) {
  return (
    normalizeMetaValue(phoneStatus?.status) === META_PHONE_READY_STATUS &&
    normalizeMetaValue(phoneStatus?.platform_type) === META_PHONE_READY_PLATFORM &&
    normalizeMetaValue(phoneStatus?.account_mode) === META_PHONE_READY_ACCOUNT_MODE &&
    phoneStatus?.is_pin_enabled === true
  );
}

function hasConclusiveMetaPhoneRegistrationState(phoneStatus) {
  return (
    Boolean(phoneStatus && typeof phoneStatus === "object") &&
    Boolean(normalizeMetaValue(phoneStatus.status)) &&
    Boolean(normalizeMetaValue(phoneStatus.platform_type)) &&
    Boolean(normalizeMetaValue(phoneStatus.account_mode)) &&
    typeof phoneStatus.is_pin_enabled === "boolean"
  );
}

function getMessagingReadinessStatus(healthStatus) {
  const value = normalizeMetaValue(healthStatus?.can_send_message);
  return MESSAGING_READINESS_STATUSES[value] || "unknown";
}

function normalizeEntityCanSendMessage(value) {
  const normalized = normalizeMetaValue(value);
  return MESSAGING_READINESS_STATUSES[normalized] || "unknown";
}

function sanitizeAdditionalInfo(value) {
  if (!value || typeof value !== "object") return null;
  const sanitized = {};
  for (const [key, detail] of Object.entries(value)) {
    if (typeof detail === "string" || typeof detail === "number" || typeof detail === "boolean") {
      sanitized[key] = detail;
    }
  }
  return Object.keys(sanitized).length ? sanitized : null;
}

function getEntityErrors(entity) {
  if (Array.isArray(entity?.errors)) return entity.errors;
  if (entity?.error_code || entity?.code || entity?.error_description || entity?.message) {
    return [entity];
  }
  return [];
}

function sanitizeMessagingBlockers(healthStatus) {
  const entities = Array.isArray(healthStatus?.entities) ? healthStatus.entities : [];
  const blockers = [];

  for (const entity of entities) {
    const entityType = String(entity?.entity_type || entity?.entityType || "").trim();
    const canSendMessage = normalizeEntityCanSendMessage(entity?.can_send_message);

    for (const error of getEntityErrors(entity)) {
      const errorCode = String(error?.error_code || error?.code || "").trim();
      if (IGNORED_BILLING_WARNING_CODES.has(errorCode)) continue;

      blockers.push({
        entityType,
        canSendMessage,
        errorCode,
        description: String(
          error?.error_description || error?.description || error?.message || ""
        ).trim(),
        possibleSolution: String(
          error?.possible_solution || error?.possibleSolution || ""
        ).trim(),
        additionalInfo: sanitizeAdditionalInfo(
          error?.additional_info || error?.additionalInfo || null
        ),
      });
    }
  }

  return blockers;
}

function buildMessagingReadiness(healthStatus) {
  return {
    status: getMessagingReadinessStatus(healthStatus),
    blockers: sanitizeMessagingBlockers(healthStatus),
  };
}

function toValidTimestamp(value) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function evaluateCoexistenceReadiness({ config, phoneStatus }) {
  const current = config && typeof config === "object" ? config : {};
  const evidence = current.coexistenceEvidence || {};
  const configuredWabaId = String(current.wabaId || "").trim();
  const configuredPhoneNumberId = String(current.phoneNumberId || "").trim();
  const evidenceWabaId = String(evidence.wabaId || "").trim();
  const evidencePhoneNumberId = String(evidence.phoneNumberId || "").trim();
  const livePhoneNumberId = String(phoneStatus?.id || "").trim();
  const verifiedAt = toValidTimestamp(evidence.verifiedAt);
  const subscriptionVerifiedAt = toValidTimestamp(evidence.appSubscriptionVerifiedAt);
  const connectedAt = toValidTimestamp(current.connectedAt);
  const evidenceBelongsToCurrentConnection =
    verifiedAt !== null &&
    subscriptionVerifiedAt !== null &&
    (connectedAt === null ||
      (verifiedAt >= connectedAt && subscriptionVerifiedAt >= connectedAt));

  const checks = {
    connectionMode: current.connectionMode === COEXISTENCE_CONNECTION_MODE,
    configuredIdentityPresent: Boolean(configuredWabaId && configuredPhoneNumberId),
    evidenceIdentityMatches:
      Boolean(evidenceWabaId && evidencePhoneNumberId) &&
      evidenceWabaId === configuredWabaId &&
      evidencePhoneNumberId === configuredPhoneNumberId,
    evidenceCurrent: evidenceBelongsToCurrentConnection,
    businessAppVerified: evidence.isOnBizApp === true,
    evidencePlatformCloudApi: normalizeMetaValue(evidence.platformType) === META_PHONE_READY_PLATFORM,
    appSubscriptionVerified: evidence.appSubscriptionVerified === true,
    liveIdentityMatches:
      Boolean(livePhoneNumberId) && livePhoneNumberId === configuredPhoneNumberId,
    liveBusinessAppVerified: phoneStatus?.is_on_biz_app === true,
    livePhoneConnected: normalizeMetaValue(phoneStatus?.status) === META_PHONE_READY_STATUS,
    livePlatformCloudApi:
      normalizeMetaValue(phoneStatus?.platform_type) === META_PHONE_READY_PLATFORM,
  };

  return {
    ready: Object.values(checks).every(Boolean),
    checkedAt: new Date(),
    checks,
    blockers: Object.entries(checks)
      .filter(([, passed]) => !passed)
      .map(([name]) => name),
  };
}

function applyCoexistencePhoneReadiness({ config, phoneStatus }) {
  const currentConfig = config && typeof config === "object" ? config : {};
  const coexistenceReadiness = evaluateCoexistenceReadiness({
    config: currentConfig,
    phoneStatus,
  });

  return {
    changed: false,
    config: {
      ...currentConfig,
      coexistenceReadiness,
      messagingReadiness: buildMessagingReadiness(phoneStatus?.health_status || null),
    },
  };
}

function applyPhoneRegistrationReadiness({ config, phoneStatus, now = new Date() }) {
  const currentConfig = config && typeof config === "object" ? config : {};
  const currentStatus = normalizeLifecycleStatus(currentConfig.phoneRegistrationStatus);
  const ready = isMetaPhoneRegistrationReady(phoneStatus);
  const conclusive = hasConclusiveMetaPhoneRegistrationState(phoneStatus);

  if (currentStatus === "active") {
    if (conclusive && !ready) {
      return {
        changed: true,
        config: {
          ...currentConfig,
          phoneRegistrationStatus: "error",
          phoneRegistrationLastError: "meta_phone_registration_readiness_failed",
        },
      };
    }

    return {
      changed: false,
      config: {
        ...currentConfig,
        phoneRegistrationStatus: "active",
      },
    };
  }

  if (
    currentStatus === "registration_submitted" &&
    ready
  ) {
    return {
      changed: true,
      config: {
        ...currentConfig,
        phoneRegistrationStatus: "active",
        phoneRegisteredAt: currentConfig.phoneRegisteredAt || now,
        phoneRegistrationLastError: "",
      },
    };
  }

  return {
    changed: false,
    config: {
      ...currentConfig,
      phoneRegistrationStatus: currentStatus,
    },
  };
}

function applyMetaPhoneReadinessSnapshot({ config, phoneStatus, now = new Date() }) {
  if (config?.connectionMode === COEXISTENCE_CONNECTION_MODE) {
    return applyCoexistencePhoneReadiness({ config, phoneStatus });
  }

  const readinessResult = applyPhoneRegistrationReadiness({
    config,
    phoneStatus,
    now,
  });

  return {
    ...readinessResult,
    config: {
      ...readinessResult.config,
      messagingReadiness: buildMessagingReadiness(phoneStatus?.health_status || null),
    },
  };
}

module.exports = {
  applyCoexistencePhoneReadiness,
  applyMetaPhoneReadinessSnapshot,
  buildMessagingReadiness,
  getMessagingReadinessStatus,
  hasConclusiveMetaPhoneRegistrationState,
  isMetaPhoneRegistrationReady,
  evaluateCoexistenceReadiness,
  applyPhoneRegistrationReadiness,
  normalizeLifecycleStatus,
  sanitizeMessagingBlockers,
};
