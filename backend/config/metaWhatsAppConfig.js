function trimEnv(name) {
  return String(process.env[name] || "").trim();
}

function normalizeGraphApiVersion(value) {
  const version = String(value || "").trim();
  return version || "v26.0";
}

function getMetaWhatsAppConfig() {
  const appId = trimEnv("META_APP_ID") || trimEnv("NEXT_PUBLIC_META_APP_ID");
  const appSecret = trimEnv("META_APP_SECRET");
  const embeddedSignupConfigId =
    trimEnv("META_WHATSAPP_CONFIG_ID") || trimEnv("NEXT_PUBLIC_META_WHATSAPP_CONFIG_ID");
  const coexistenceEmbeddedSignupConfigId =
    trimEnv("META_WHATSAPP_COEXISTENCE_CONFIG_ID") ||
    trimEnv("NEXT_PUBLIC_META_WHATSAPP_COEXISTENCE_CONFIG_ID");
  const isCoexistenceOnboardingEnabled =
    trimEnv("META_WHATSAPP_COEXISTENCE_ONBOARDING_ENABLED").toLowerCase() === "true";
  const graphApiVersion = normalizeGraphApiVersion(
    trimEnv("META_GRAPH_API_VERSION") || trimEnv("NEXT_PUBLIC_META_GRAPH_API_VERSION")
  );
  const redirectUri = trimEnv("META_REDIRECT_URI");
  const tokenEncryptionKey = trimEnv("META_TOKEN_ENCRYPTION_KEY");
  const systemUserAccessToken = trimEnv("META_SYSTEM_USER_ACCESS_TOKEN");
  const webhookVerifyToken = trimEnv("META_WHATSAPP_WEBHOOK_VERIFY_TOKEN");
  const ynotWabaId = trimEnv("YNOT_META_WABA_ID");
  const ynotPhoneNumberId = trimEnv("YNOT_META_PHONE_NUMBER_ID");
  const ynotBillTemplateName =
    trimEnv("YNOT_META_BILL_TEMPLATE_NAME") || "ynot_bill_standard_v1";
  const ynotBillTemplateLanguage =
    trimEnv("YNOT_META_BILL_TEMPLATE_LANGUAGE") || "en";
  const isYnotDefaultBillingEnabled =
    trimEnv("YNOT_META_DEFAULT_BILLING_ENABLED") === "true";

  return {
    appId,
    appSecret,
    embeddedSignupConfigId,
    coexistenceEmbeddedSignupConfigId,
    isCoexistenceOnboardingEnabled,
    graphApiVersion,
    redirectUri,
    tokenEncryptionKey,
    systemUserAccessToken,
    webhookVerifyToken,
    ynotWabaId,
    ynotPhoneNumberId,
    ynotBillTemplateName,
    ynotBillTemplateLanguage,
    isYnotDefaultBillingEnabled,
    isEmbeddedSignupConfigured: Boolean(appId && embeddedSignupConfigId),
    isCoexistenceEmbeddedSignupConfigured: Boolean(
      isCoexistenceOnboardingEnabled && appId && coexistenceEmbeddedSignupConfigId
    ),
    isTokenExchangeConfigured: Boolean(appId && appSecret),
    isTokenStorageConfigured: Boolean(tokenEncryptionKey),
  };
}

function getPublicMetaWhatsAppConfig() {
  const config = getMetaWhatsAppConfig();

  return {
    appId: config.appId,
    embeddedSignupConfigId: config.embeddedSignupConfigId,
    coexistenceEmbeddedSignupConfigId: config.coexistenceEmbeddedSignupConfigId,
    isCoexistenceOnboardingEnabled: config.isCoexistenceOnboardingEnabled,
    graphApiVersion: config.graphApiVersion,
    redirectUri: config.redirectUri,
    isEmbeddedSignupConfigured: config.isEmbeddedSignupConfigured,
    isCoexistenceEmbeddedSignupConfigured:
      config.isCoexistenceEmbeddedSignupConfigured,
    isTokenExchangeConfigured: config.isTokenExchangeConfigured,
    isTokenStorageConfigured: config.isTokenStorageConfigured,
  };
}

module.exports = {
  getMetaWhatsAppConfig,
  getPublicMetaWhatsAppConfig,
};
