const META_PHONE_READY_STATUS = "CONNECTED";
const META_PHONE_READY_PLATFORM = "CLOUD_API";
const META_PHONE_READY_ACCOUNT_MODE = "LIVE";

const MESSAGING_READINESS_STATUSES = {
  AVAILABLE: "available",
  LIMITED: "limited",
  BLOCKED: "blocked",
};

const IGNORED_BILLING_WARNING_CODES = new Set(["138024", "138025"]);

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

function applyPhoneRegistrationReadiness({ config, phoneStatus, now = new Date() }) {
  const currentConfig = config && typeof config === "object" ? config : {};
  const currentStatus = normalizeLifecycleStatus(currentConfig.phoneRegistrationStatus);

  if (currentStatus === "active") {
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
    isMetaPhoneRegistrationReady(phoneStatus)
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

module.exports = {
  buildMessagingReadiness,
  getMessagingReadinessStatus,
  isMetaPhoneRegistrationReady,
  applyPhoneRegistrationReadiness,
  normalizeLifecycleStatus,
  sanitizeMessagingBlockers,
};
