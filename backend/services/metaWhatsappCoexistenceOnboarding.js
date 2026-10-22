const { getMetaWhatsAppConfig } = require("../config/metaWhatsAppConfig");
const {
  exchangeEmbeddedSignupCode,
  subscribeAppToWaba,
  validateCoexistenceConnection,
} = require("./metaWhatsAppService");

const COEXISTENCE_FINISH_EVENT = "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING";

function isCoexistenceOnboardingEnabled(env = process.env) {
  return (
    String(env.META_WHATSAPP_COEXISTENCE_ONBOARDING_ENABLED || "")
      .trim()
      .toLowerCase() === "true"
  );
}

async function completeCoexistenceOnboarding(input = {}, dependencies = {}) {
  const exchangeCode = dependencies.exchangeCode || exchangeEmbeddedSignupCode;
  const validateConnection =
    dependencies.validateConnection || validateCoexistenceConnection;
  const subscribeWaba = dependencies.subscribeWaba || subscribeAppToWaba;
  const now = dependencies.now || (() => new Date());
  const config = dependencies.config || getMetaWhatsAppConfig();
  const code = String(input.code || "").trim();
  const wabaId = String(input.wabaId || "").trim();
  const phoneNumberId = String(input.phoneNumberId || "").trim();
  const eventType = String(input.eventType || "").trim();

  if (!code || !wabaId || eventType !== COEXISTENCE_FINISH_EVENT) {
    const error = new Error("A valid Coexistence completion event is required");
    error.code = "meta_coexistence_completion_payload_invalid";
    throw error;
  }

  const tokenResult = await exchangeCode(code);
  const accessToken = String(tokenResult?.access_token || "").trim();
  if (!accessToken) {
    const error = new Error("Meta authorization did not return a usable access token");
    error.code = "meta_coexistence_token_missing";
    throw error;
  }

  const validation = await validateConnection({
    accessToken,
    wabaId,
    phoneNumberId,
  });
  const selectedPhone = validation?.selectedPhone || {};
  const resolvedWabaId = String(validation?.account?.id || "").trim();
  const resolvedPhoneNumberId = String(selectedPhone?.id || "").trim();

  if (resolvedWabaId !== wabaId || !resolvedPhoneNumberId) {
    const error = new Error("Meta Coexistence identity verification failed");
    error.code = "meta_coexistence_identity_unverified";
    throw error;
  }

  const subscription = await subscribeWaba({
    wabaId: resolvedWabaId,
    accessToken,
    appId: config.appId,
  });
  if (subscription?.verified !== true) {
    const error = new Error("Meta WABA subscription verification failed");
    error.code = "meta_waba_subscription_verification_failed";
    throw error;
  }

  const verifiedAt = now();
  return {
    accessToken,
    tokenType: tokenResult?.token_type || "bearer",
    expiresIn: tokenResult?.expires_in,
    account: validation.account || {},
    phone: selectedPhone,
    evidence: {
      wabaId: resolvedWabaId,
      phoneNumberId: resolvedPhoneNumberId,
      isOnBizApp: true,
      platformType: String(selectedPhone.platform_type || ""),
      verifiedAt,
      signupEventType: eventType,
      appSubscriptionVerified: true,
      appSubscriptionVerifiedAt: verifiedAt,
    },
  };
}

module.exports = {
  COEXISTENCE_FINISH_EVENT,
  completeCoexistenceOnboarding,
  isCoexistenceOnboardingEnabled,
};
