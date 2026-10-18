const { getMetaWhatsAppConfig } = require("../config/metaWhatsAppConfig");
const { getDefaultWhatsappBusinessConfig } = require("../models/whatsappBusinessConfigSchema");
const {
  getPhoneNumberReadinessWithSystemUserToken,
  validateConnection,
} = require("./metaWhatsAppService");
const { decryptMetaRegistrationPin } = require("./metaTokenStorage");
const { buildMessagingReadiness } = require("./metaWhatsAppReadiness");
const {
  buildActivationEligibility,
  buildBillingActivationState,
  getBillingTemplateInstance,
  normalizeDisplayNameReadiness,
  normalizeTestMessageState,
} = require("./whatsappBillingActivationEligibility");

function normalizeConfig(value) {
  const config = value && typeof value.toObject === "function" ? value.toObject() : value;
  return { ...getDefaultWhatsappBusinessConfig(), ...(config || {}) };
}

function sanitizeMetaFailure(error) {
  return {
    code: String(error?.metaError?.code || error?.code || "meta_status_unavailable"),
    subcode: String(error?.metaError?.subcode || ""),
    httpStatus: error?.metaError?.status || null,
  };
}

function validateStoredPin(config, decryptPin = decryptMetaRegistrationPin) {
  const encryptedPin = String(config?.metaRegistration?.pinEncrypted || "");
  if (!encryptedPin) {
    return { result: "BLOCKED", code: "encrypted_pin_missing" };
  }

  try {
    const pin = String(decryptPin(encryptedPin));
    return /^\d{6}$/.test(pin)
      ? { result: "PASS", code: "stored_pin_valid" }
      : { result: "BLOCKED", code: "stored_pin_format_invalid" };
  } catch (error) {
    return { result: "BLOCKED", code: "stored_pin_decryption_failed" };
  }
}

async function readLiveMetaStatus(
  config,
  {
    getConfig = getMetaWhatsAppConfig,
    validateAsset = validateConnection,
    getReadiness = getPhoneNumberReadinessWithSystemUserToken,
    now = () => new Date(),
  } = {}
) {
  const checkedAt = now();
  const wabaId = String(config?.wabaId || "").trim();
  const phoneNumberId = String(config?.phoneNumberId || "").trim();

  if (config?.provider !== "meta" || !wabaId || !phoneNumberId) {
    return {
      accessible: false,
      code: "meta_connection_identifiers_missing",
      checkedAt,
    };
  }

  const metaConfig = getConfig();
  if (!metaConfig.systemUserAccessToken) {
    return {
      accessible: false,
      code: "meta_system_user_token_missing",
      checkedAt,
    };
  }

  try {
    const validation = await validateAsset({
      accessToken: metaConfig.systemUserAccessToken,
      wabaId,
      phoneNumberId,
    });
    const matchedWabaId = String(validation?.account?.id || "");
    const matchedPhoneNumberId = String(validation?.selectedPhone?.id || "");
    if (
      validation?.isValid !== true ||
      matchedWabaId !== wabaId ||
      matchedPhoneNumberId !== phoneNumberId
    ) {
      return {
        accessible: false,
        code: "meta_asset_identity_mismatch",
        checkedAt,
      };
    }

    const status = await getReadiness({ phoneNumberId });
    if (String(status?.id || "") !== phoneNumberId) {
      return {
        accessible: false,
        code: "meta_phone_identity_mismatch",
        checkedAt,
      };
    }

    return {
      accessible: true,
      checkedAt,
      assetIdentityVerified: true,
      isPinEnabled:
        typeof status?.is_pin_enabled === "boolean" ? status.is_pin_enabled : null,
      phoneStatus: String(status?.status || ""),
      platformType: String(status?.platform_type || ""),
      codeVerificationStatus: String(status?.code_verification_status || ""),
      accountMode: String(status?.account_mode || ""),
      messagingReadiness: buildMessagingReadiness(status?.health_status || null),
      displayNameReadiness: normalizeDisplayNameReadiness({
        rawStatus: String(status?.name_status || ""),
        lastCheckedAt: checkedAt,
      }),
    };
  } catch (error) {
    return {
      accessible: false,
      checkedAt,
      ...sanitizeMetaFailure(error),
    };
  }
}

function buildAdminSnapshot({ vendor, liveMeta }) {
  const config = normalizeConfig(vendor?.whatsappBusiness);
  const messagingReadiness = config.messagingReadiness || buildMessagingReadiness(null);
  const displayNameReadiness = normalizeDisplayNameReadiness(config.displayNameReadiness);
  const testMessage = normalizeTestMessageState(config.testMessage);
  const billingTemplate = getBillingTemplateInstance(config);
  const activationEligibility = buildActivationEligibility(
    { ...config, displayNameReadiness, testMessage },
    messagingReadiness
  );

  return {
    vendor: {
      id: String(vendor?._id || ""),
      businessName: String(vendor?.businessName || ""),
    },
    connection: {
      provider: config.provider === "meta" ? "meta" : "msg91",
      displayPhoneNumber: String(config.displayPhoneNumber || ""),
      wabaId: String(config.wabaId || ""),
      phoneNumberId: String(config.phoneNumberId || ""),
      status: String(config.connectionStatus || "not_connected"),
      connectedAt: config.connectedAt || null,
    },
    registration: {
      status: String(config.phoneRegistrationStatus || "unknown"),
      registeredAt: config.phoneRegisteredAt || null,
    },
    liveMeta,
    messagingReadiness,
    displayNameReadiness,
    billingTemplate: {
      status: String(billingTemplate?.status || config.templateStatus || "not_configured"),
      templateName: String(billingTemplate?.templateName || ""),
      lastCheckedAt: billingTemplate?.lastCheckedAt || null,
    },
    testMessage,
    billingActivation: {
      enabled: Boolean(config.enabled),
      eligibility: activationEligibility,
      state: buildBillingActivationState(config, activationEligibility),
      activatedAt: config.activation?.activatedAt || null,
      deactivatedAt: config.activation?.deactivatedAt || null,
    },
    lastCheckedAt: liveMeta?.checkedAt || null,
  };
}

module.exports = {
  buildAdminSnapshot,
  readLiveMetaStatus,
  validateStoredPin,
};
