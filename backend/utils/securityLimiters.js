const {
  createRateLimiter,
  ipAndFieldsKey,
  positiveInteger,
} = require("./securityRateLimit");

const MINUTE = 60 * 1000;

const adminLoginLimiter = createRateLimiter({
  name: "admin-login",
  windowMs: positiveInteger(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * MINUTE),
  max: positiveInteger(process.env.AUTH_RATE_LIMIT_MAX, 20),
  keyGenerator: ipAndFieldsKey((req) => req.body?.email),
});

const oauthStartLimiter = createRateLimiter({
  name: "oauth-start",
  windowMs: MINUTE,
  max: 30,
});

const otpRequestLimiter = createRateLimiter({
  name: "otp-request",
  windowMs: positiveInteger(process.env.OTP_RATE_LIMIT_WINDOW_MS, 10 * MINUTE),
  max: positiveInteger(process.env.OTP_REQUEST_RATE_LIMIT_MAX, 8),
  keyGenerator: ipAndFieldsKey(
    (req) => req.body?.countryCode,
    (req) => req.body?.phone,
    (req) => req.body?.vendorId || req.params?.vendorId
  ),
});

const otpVerifyLimiter = createRateLimiter({
  name: "otp-verify",
  windowMs: positiveInteger(process.env.OTP_RATE_LIMIT_WINDOW_MS, 10 * MINUTE),
  max: positiveInteger(process.env.OTP_VERIFY_RATE_LIMIT_MAX, 20),
  keyGenerator: ipAndFieldsKey(
    (req) => req.body?.countryCode,
    (req) => req.body?.phone,
    (req) => req.body?.billingId || req.params?.authorizationId || req.params?.billingSessionId
  ),
});

const onboardingBypassLimiter = createRateLimiter({
  name: "onboarding-otp-bypass",
  windowMs: positiveInteger(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * MINUTE),
  max: positiveInteger(process.env.ONBOARDING_BYPASS_RATE_LIMIT_MAX, 5),
  keyGenerator: ipAndFieldsKey(
    (req) => req.body?.countryCode,
    (req) => req.body?.phone
  ),
});

const publicEnquiryLimiter = createRateLimiter({
  name: "public-enquiry",
  windowMs: positiveInteger(process.env.PUBLIC_WRITE_RATE_LIMIT_WINDOW_MS, 10 * MINUTE),
  max: positiveInteger(process.env.PUBLIC_ENQUIRY_RATE_LIMIT_MAX, 20),
  keyGenerator: ipAndFieldsKey((req) => req.body?.vendorId),
});

const analyticsIngestionLimiter = createRateLimiter({
  name: "analytics-ingestion",
  windowMs: MINUTE,
  max: positiveInteger(process.env.ANALYTICS_RATE_LIMIT_MAX, 120),
  keyGenerator: ipAndFieldsKey((req) => req.body?.vendorId || req.body?.pageType),
});

module.exports = {
  adminLoginLimiter,
  analyticsIngestionLimiter,
  oauthStartLimiter,
  onboardingBypassLimiter,
  otpRequestLimiter,
  otpVerifyLimiter,
  publicEnquiryLimiter,
};
