const axios = require("axios");
const { getMetaWhatsAppConfig } = require("../config/metaWhatsAppConfig");

function graphUrl(path) {
  const { graphApiVersion } = getMetaWhatsAppConfig();
  return `https://graph.facebook.com/${graphApiVersion}/${path.replace(/^\//, "")}`;
}

function getErrorMessage(error) {
  return (
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    error?.message ||
    "Meta request failed"
  );
}

function getSafeMetaError(error) {
  const metaError = error?.response?.data?.error || {};
  return {
    code: metaError.code || error?.code || "",
    type: metaError.type || "",
    message: metaError.message || error?.message || "Meta request failed",
  };
}

function getSafeMetaErrorDetails(error) {
  const metaError = error?.response?.data?.error || {};
  return {
    status: error?.response?.status || null,
    type: metaError.type || "",
    code: metaError.code || "",
    subcode: metaError.error_subcode || "",
    message: metaError.message || error?.message || "Meta request failed",
    errorUserTitle: metaError.error_user_title || "",
    errorUserMessage: metaError.error_user_msg || "",
    fbtraceId: metaError.fbtrace_id || "",
    hasErrorData: Boolean(metaError.error_data),
  };
}

function getMetaOAuthExchangeErrorDetails(error) {
  const metaError = error?.response?.data?.error || {};

  return {
    status: error?.response?.status || null,
    type: metaError.type || "",
    code: metaError.code || "",
    subcode: metaError.error_subcode || "",
    message: metaError.message || error?.message || "Meta request failed",
    errorUserTitle: metaError.error_user_title || "",
    errorUserMessage: metaError.error_user_msg || "",
    fbtraceId: metaError.fbtrace_id || "",
  };
}

function ensureTokenExchangeConfig() {
  const config = getMetaWhatsAppConfig();
  if (!config.isTokenExchangeConfigured) {
    const error = new Error("Meta Embedded Signup is not configured");
    error.code = "meta_not_configured";
    throw error;
  }

  return config;
}

async function exchangeEmbeddedSignupCode(code) {
  const config = ensureTokenExchangeConfig();
  const authorizationCode = String(code || "").trim();

  if (!authorizationCode) {
    const error = new Error("Meta authorization code is required");
    error.code = "meta_code_required";
    throw error;
  }

  try {
    const exchangeEndpoint = graphUrl("/oauth/access_token");
    const params = {
      client_id: config.appId,
      client_secret: config.appSecret,
      code: authorizationCode,
    };

    console.log("[Meta OAuth Exchange Diagnostic]", {
      appId: config.appId,
      graphVersion: config.graphApiVersion,
      redirectUri: config.redirectUri || "",
      redirectUriConfigured: Boolean(config.redirectUri),
      redirectUriSentToMeta: false,
      exchangeEndpoint,
    });

    const response = await axios.get(exchangeEndpoint, { params });
    return response.data || {};
  } catch (error) {
    console.error("Meta authorization code exchange failed:", getErrorMessage(error));
    console.error("[Meta OAuth Exchange Error]", getMetaOAuthExchangeErrorDetails(error));
    const wrapped = new Error("Unable to complete Meta authorization");
    wrapped.code = "meta_code_exchange_failed";
    throw wrapped;
  }
}

async function getAuthorizedBusinesses(accessToken) {
  if (!accessToken) return [];

  try {
    const response = await axios.get(graphUrl("/me/businesses"), {
      params: {
        fields: "id,name",
        access_token: accessToken,
      },
    });

    return Array.isArray(response.data?.data) ? response.data.data : [];
  } catch (error) {
    console.error("Meta businesses lookup failed:", getErrorMessage(error));
    return [];
  }
}

async function getWhatsAppBusinessAccount(wabaId, accessToken) {
  const id = String(wabaId || "").trim();
  if (!id || !accessToken) return null;

  try {
    const response = await axios.get(graphUrl(id), {
      params: {
        fields: "id,name,message_template_namespace",
        access_token: accessToken,
      },
    });

    return response.data || null;
  } catch (error) {
    console.error("Meta WABA lookup failed:", getErrorMessage(error));
    return null;
  }
}

async function getPhoneNumbers(wabaId, accessToken) {
  const id = String(wabaId || "").trim();
  if (!id || !accessToken) return [];

  try {
    const response = await axios.get(graphUrl(`${id}/phone_numbers`), {
      params: {
        fields: "id,display_phone_number,verified_name",
        access_token: accessToken,
      },
    });

    return Array.isArray(response.data?.data) ? response.data.data : [];
  } catch (error) {
    console.error("Meta phone numbers lookup failed:", getErrorMessage(error));
    return [];
  }
}

async function validateConnection({ accessToken, wabaId, phoneNumberId }) {
  const account = await getWhatsAppBusinessAccount(wabaId, accessToken);
  const phoneNumbers = await getPhoneNumbers(wabaId, accessToken);
  const selectedPhone =
    phoneNumbers.find((phone) => String(phone.id) === String(phoneNumberId)) ||
    phoneNumbers[0] ||
    null;

  return {
    account,
    phoneNumbers,
    selectedPhone,
    isValid: Boolean(account?.id && selectedPhone?.id),
  };
}

async function runMetaConfigurationDiagnostics() {
  const config = getMetaWhatsAppConfig();
  const result = {
    configured: Boolean(
      config.appId &&
        config.appSecret &&
        config.embeddedSignupConfigId &&
        config.systemUserAccessToken &&
        config.graphApiVersion &&
        config.webhookVerifyToken
    ),
    config: {
      appId: Boolean(config.appId),
      appSecret: Boolean(config.appSecret),
      configId: Boolean(config.embeddedSignupConfigId),
      systemUserToken: Boolean(config.systemUserAccessToken),
      graphApiVersion: config.graphApiVersion,
      webhookVerifyToken: Boolean(config.webhookVerifyToken),
    },
    metaApiReachable: false,
    systemUserTokenValid: false,
    appMatchesExpected: false,
    metaError: null,
  };

  if (!config.systemUserAccessToken) {
    result.metaError = {
      code: "missing_system_user_token",
      message: "META_SYSTEM_USER_ACCESS_TOKEN is not configured",
    };
    return result;
  }

  try {
    const response = await axios.get(graphUrl("/me"), {
      params: {
        fields: "id,name",
        access_token: config.systemUserAccessToken,
      },
    });

    result.metaApiReachable = true;
    result.systemUserTokenValid = Boolean(response.data?.id);
  } catch (error) {
    if (error.response) {
      result.metaApiReachable = true;
    }
    result.metaError = getSafeMetaError(error);
  }

  if (config.appId && config.appSecret) {
    try {
      const response = await axios.get(graphUrl(config.appId), {
        params: {
          fields: "id,name",
          access_token: `${config.appId}|${config.appSecret}`,
        },
      });
      result.appMatchesExpected = String(response.data?.id || "") === String(config.appId);
    } catch (error) {
      result.appValidationError = getSafeMetaError(error);
    }
  }

  return result;
}

function getSanitizedSystemUserMetaError(error) {
  const metaError = getSafeMetaErrorDetails(error);
  return {
    status: metaError.status,
    type: metaError.type,
    code: metaError.code,
    subcode: metaError.subcode,
    message: metaError.message,
    fbtraceId: metaError.fbtraceId,
  };
}

async function readGraphAssetWithSystemUserToken({ path, fields, accessToken }) {
  try {
    const response = await axios.get(graphUrl(path), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      params: { fields },
    });

    return {
      accessible: true,
      data: response.data || {},
    };
  } catch (error) {
    return {
      accessible: false,
      meta: getSanitizedSystemUserMetaError(error),
    };
  }
}

async function runMetaSystemUserAssetDiagnostics() {
  const config = getMetaWhatsAppConfig();
  const accessToken = config.systemUserAccessToken;

  if (!accessToken) {
    return {
      success: false,
      code: "meta_system_user_token_missing",
    };
  }

  const wabaResult = await readGraphAssetWithSystemUserToken({
    path: "1074343041678320",
    fields: "id,name",
    accessToken,
  });
  const phoneResult = await readGraphAssetWithSystemUserToken({
    path: "1336796569515966",
    fields:
      "id,display_phone_number,verified_name,code_verification_status,quality_rating,platform_type,throughput",
    accessToken,
  });

  return {
    success: true,
    systemUserTokenPresent: true,
    waba: wabaResult.accessible
      ? {
          accessible: true,
          id: String(wabaResult.data?.id || ""),
          name: String(wabaResult.data?.name || ""),
        }
      : {
          accessible: false,
          meta: wabaResult.meta,
        },
    phone: phoneResult.accessible
      ? {
          accessible: true,
          id: String(phoneResult.data?.id || ""),
          displayPhoneNumber: String(phoneResult.data?.display_phone_number || ""),
          verifiedName: String(phoneResult.data?.verified_name || ""),
          codeVerificationStatus: String(phoneResult.data?.code_verification_status || ""),
          qualityRating: String(phoneResult.data?.quality_rating || ""),
          platformType: String(phoneResult.data?.platform_type || ""),
          throughput: phoneResult.data?.throughput || null,
        }
      : {
          accessible: false,
          meta: phoneResult.meta,
        },
  };
}

const META_PHONE_READINESS_DIAGNOSTIC_FIELDS = [
  "id",
  "display_phone_number",
  "verified_name",
  "code_verification_status",
  "quality_rating",
  "platform_type",
  "throughput",
  "status",
  "health_status",
  "account_mode",
  "is_pin_enabled",
  "messaging_limit_tier",
  "last_onboarded_time",
  "name_status",
].join(",");

function sanitizePhoneReadinessData(data) {
  return {
    accessible: true,
    id: String(data?.id || ""),
    displayPhoneNumber: String(data?.display_phone_number || ""),
    verifiedName: String(data?.verified_name || ""),
    codeVerificationStatus: String(data?.code_verification_status || ""),
    qualityRating: String(data?.quality_rating || ""),
    platformType: String(data?.platform_type || ""),
    throughput: data?.throughput || null,
    status: String(data?.status || ""),
    healthStatus: data?.health_status || null,
    accountMode: String(data?.account_mode || ""),
    isPinEnabled: typeof data?.is_pin_enabled === "boolean" ? data.is_pin_enabled : null,
    messagingLimitTier: String(data?.messaging_limit_tier || ""),
    lastOnboardedTime: data?.last_onboarded_time || null,
    nameStatus: String(data?.name_status || ""),
  };
}

async function runMetaPhoneReadinessComparisonDiagnostics() {
  const config = getMetaWhatsAppConfig();
  const accessToken = config.systemUserAccessToken;

  if (!accessToken) {
    return {
      success: false,
      code: "meta_system_user_token_missing",
    };
  }

  const phones = [
    {
      key: "reelook",
      businessName: "Reelook Beauty Saloon",
      wabaId: "1074343041678320",
      phoneNumberId: "1336796569515966",
      expectedDisplayPhoneNumber: "+1 555-357-9403",
      knownOperational: true,
    },
    {
      key: "mona",
      businessName: "Mona Makeover",
      wabaId: "1403286735277350",
      phoneNumberId: "1388988260959449",
      expectedDisplayPhoneNumber: "+1 555-490-8059",
      knownOperational: false,
    },
  ];

  const results = {};
  for (const phone of phones) {
    const result = await readGraphAssetWithSystemUserToken({
      path: phone.phoneNumberId,
      fields: META_PHONE_READINESS_DIAGNOSTIC_FIELDS,
      accessToken,
    });

    results[phone.key] = {
      businessName: phone.businessName,
      wabaId: phone.wabaId,
      phoneNumberId: phone.phoneNumberId,
      expectedDisplayPhoneNumber: phone.expectedDisplayPhoneNumber,
      knownOperational: phone.knownOperational,
      ...(result.accessible
        ? sanitizePhoneReadinessData(result.data)
        : {
            accessible: false,
            meta: result.meta,
          }),
    };
  }

  return {
    success: true,
    systemUserTokenPresent: true,
    graphApiVersion: config.graphApiVersion,
    requestedFields: META_PHONE_READINESS_DIAGNOSTIC_FIELDS.split(","),
    phones: results,
  };
}

async function getPhoneNumberReadinessWithSystemUserToken({ phoneNumberId }) {
  const config = getMetaWhatsAppConfig();
  const accessToken = config.systemUserAccessToken;
  const id = String(phoneNumberId || "").trim();

  if (!accessToken) {
    const error = new Error("META_SYSTEM_USER_ACCESS_TOKEN is not configured");
    error.code = "meta_system_user_token_missing";
    throw error;
  }

  if (!id) {
    const error = new Error("Meta phone number ID is required");
    error.code = "meta_phone_number_id_required";
    throw error;
  }

  const result = await readGraphAssetWithSystemUserToken({
    path: id,
    fields: META_PHONE_READINESS_DIAGNOSTIC_FIELDS,
    accessToken,
  });

  if (!result.accessible) {
    const error = new Error("Unable to read Meta phone readiness");
    error.code = "meta_phone_readiness_lookup_failed";
    error.metaError = result.meta;
    throw error;
  }

  return result.data || {};
}

async function disconnectAuthorization() {
  // Keep external Meta assets intact. Revocation can be wired here later if YNOT
  // receives a token model where revocation is required and safe.
  return { revoked: false, reason: "not_implemented" };
}

async function subscribeAppToWaba() {
  throw new Error("subscribeAppToWaba is reserved for the Meta onboarding phase that requires it.");
}

async function sendTemplateMessage(args) {
  return sendMetaTemplateMessage(args);
}

function normalizeTemplateName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildMetaTemplatePayload({ name, template }) {
  if (!template?.key) {
    const error = new Error("Template definition is required");
    error.code = "meta_template_definition_required";
    throw error;
  }

  return {
    name: normalizeTemplateName(name),
    language: template.language,
    category: template.metaCategory,
    components: template.components,
  };
}

async function createTemplate({ wabaId, accessToken, payload }) {
  const id = String(wabaId || "").trim();
  if (!id || !accessToken || !payload?.name) {
    const error = new Error("WABA ID, access token, and template payload are required");
    error.code = "meta_template_submission_payload_invalid";
    throw error;
  }

  try {
    const response = await axios.post(graphUrl(`${id}/message_templates`), payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    return response.data || {};
  } catch (error) {
    console.error("[Meta Template Create Error]", getSafeMetaErrorDetails(error));
    const wrapped = new Error("Unable to submit WhatsApp template to Meta");
    wrapped.code = "meta_template_submission_failed";
    wrapped.metaError = getSafeMetaError(error);
    throw wrapped;
  }
}

async function findTemplateByName({ wabaId, accessToken, name }) {
  const id = String(wabaId || "").trim();
  const templateName = normalizeTemplateName(name);
  if (!id || !accessToken || !templateName) return null;

  try {
    const response = await axios.get(graphUrl(`${id}/message_templates`), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      params: {
        name: templateName,
        fields: "id,name,status,category,language,rejected_reason",
      },
    });

    const templates = Array.isArray(response.data?.data) ? response.data.data : [];
    return templates.find((template) => template.name === templateName) || templates[0] || null;
  } catch (error) {
    console.error("[Meta Template Lookup Error]", getSafeMetaErrorDetails(error));
    const wrapped = new Error("Unable to read WhatsApp template status from Meta");
    wrapped.code = "meta_template_lookup_failed";
    wrapped.metaError = getSafeMetaError(error);
    throw wrapped;
  }
}

async function getTemplateStatus({ wabaId, accessToken, name }) {
  return findTemplateByName({ wabaId, accessToken, name });
}

async function getPhoneNumberStatus({ phoneNumberId, accessToken }) {
  const id = String(phoneNumberId || "").trim();
  if (!id || !accessToken) return null;

  try {
    const response = await axios.get(graphUrl(id), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      params: {
        fields: META_PHONE_READINESS_DIAGNOSTIC_FIELDS,
      },
    });

    return response.data || null;
  } catch (error) {
    const metaError = getSafeMetaErrorDetails(error);
    console.error("[Meta Phone Status Error]", metaError);
    const wrapped = new Error("Unable to read WhatsApp phone number status from Meta");
    wrapped.code = "meta_phone_status_failed";
    wrapped.metaError = metaError;
    throw wrapped;
  }
}

async function getPhoneNumberStatusWithSystemUserToken({ phoneNumberId }) {
  const { systemUserAccessToken } = getMetaWhatsAppConfig();

  if (!systemUserAccessToken) {
    const error = new Error("Meta system-user access token is not configured");
    error.code = "meta_system_user_token_missing";
    throw error;
  }

  return getPhoneNumberStatus({
    phoneNumberId,
    accessToken: systemUserAccessToken,
  });
}

async function registerMetaPhoneNumber({ phoneNumberId, accessToken, pin }) {
  const id = String(phoneNumberId || "").trim();
  const registrationPin = String(pin || "").trim();

  if (!id || !accessToken || !/^\d{6}$/.test(registrationPin)) {
    const error = new Error("Phone number ID, access token, and a 6-digit PIN are required");
    error.code = "meta_phone_registration_payload_invalid";
    throw error;
  }

  try {
    const response = await axios.post(
      graphUrl(`${id}/register`),
      {
        messaging_product: "whatsapp",
        pin: registrationPin,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data || {};
  } catch (error) {
    const metaError = getSafeMetaErrorDetails(error);
    const message = String(metaError.message || "").toLowerCase();
    if (message.includes("already") && message.includes("register")) {
      return {
        success: true,
        alreadyRegistered: true,
        metaError,
      };
    }

    const wrapped = new Error("Unable to register WhatsApp phone number with Meta");
    wrapped.code = "meta_phone_registration_failed";
    wrapped.metaError = metaError;
    throw wrapped;
  }
}

async function registerPhoneNumber(args) {
  return registerMetaPhoneNumber(args);
}

async function registerPhoneNumberWithSystemUserToken({ phoneNumberId, pin }) {
  const { systemUserAccessToken } = getMetaWhatsAppConfig();

  if (!systemUserAccessToken) {
    const error = new Error("Meta system-user access token is not configured");
    error.code = "meta_system_user_token_missing";
    throw error;
  }

  return registerMetaPhoneNumber({
    phoneNumberId,
    accessToken: systemUserAccessToken,
    pin,
  });
}

async function sendMetaTemplateMessage({
  phoneNumberId,
  accessToken,
  recipientPhoneNumber,
  templateName,
  languageCode = "en",
  bodyParameters = [],
}) {
  const id = String(phoneNumberId || "").trim();
  const recipient = String(recipientPhoneNumber || "").trim();
  const name = normalizeTemplateName(templateName);

  if (!id || !accessToken || !recipient || !name) {
    const error = new Error("Phone number ID, access token, recipient, and template name are required");
    error.code = "meta_test_send_payload_invalid";
    throw error;
  }

  const payload = {
    messaging_product: "whatsapp",
    to: recipient.replace(/^\+/, ""),
    type: "template",
    template: {
      name,
      language: {
        code: languageCode || "en",
      },
      components: [
        {
          type: "body",
          parameters: bodyParameters.map((text) => ({
            type: "text",
            text: String(text ?? ""),
          })),
        },
      ],
    },
  };

  try {
    const response = await axios.post(graphUrl(`${id}/messages`), payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    return response.data || {};
  } catch (error) {
    const metaError = getSafeMetaErrorDetails(error);
    console.error("[Meta Test Send Error]", metaError);
    const wrapped = new Error("Unable to send WhatsApp test message through Meta");
    wrapped.code = "meta_test_send_failed";
    wrapped.metaError = metaError;
    throw wrapped;
  }
}

module.exports = {
  buildMetaTemplatePayload,
  createTemplate,
  disconnectAuthorization,
  findTemplateByName,
  getAuthorizedBusinesses,
  getPhoneNumbers,
  getPhoneNumberStatus,
  getPhoneNumberStatusWithSystemUserToken,
  getPhoneNumberReadinessWithSystemUserToken,
  getTemplateStatus,
  getWhatsAppBusinessAccount,
  registerPhoneNumber,
  registerMetaPhoneNumber,
  registerPhoneNumberWithSystemUserToken,
  runMetaConfigurationDiagnostics,
  runMetaPhoneReadinessComparisonDiagnostics,
  runMetaSystemUserAssetDiagnostics,
  sendMetaTemplateMessage,
  sendTemplateMessage,
  subscribeAppToWaba,
  validateConnection,
  exchangeEmbeddedSignupCode,
};
