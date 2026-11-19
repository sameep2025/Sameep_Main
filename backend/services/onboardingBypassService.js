const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const Session = require("../models/Session");
const { getSessionValidityHours } = require("../utils/sessionConfig");
const { getJwtSecret } = require("../utils/jwtSecrets");
const {
  getAdminPasscodeCredentialVersion,
  verifyAdminPasscode,
} = require("./adminPasscodeService");

const AUTHORIZATION_TTL_MS = 5 * 60 * 1000;
const TOKEN_PREFIX = "onboarding-bypass:";

function normalizeOnboardingMobile(countryCode, phone) {
  const cc = String(countryCode || "").replace(/\D/g, "").replace(/^0+/, "");
  const number = String(phone || "").replace(/\D/g, "").replace(/^0+/, "");
  return cc && number ? `${cc}${number}` : "";
}

function isOnboardingBypassEnabled() {
  return process.env.ONBOARDING_OTP_BYPASS_ENABLED === "true";
}

async function verifyOnboardingBypassPasscode(passcode) {
  if (!isOnboardingBypassEnabled()) return false;
  return verifyAdminPasscode(passcode);
}

function authorizationTokenHash(authorization, mobile, credentialVersion) {
  return crypto
    .createHash("sha256")
    .update(
      `${String(authorization || "").trim()}:${String(mobile || "").trim()}:${String(
        credentialVersion || ""
      )}`
    )
    .digest("hex");
}

async function createOnboardingBypassAuthorization({
  customerId,
  countryCode,
  phone,
  credentialVersion,
  now = new Date(),
}) {
  const mobile = normalizeOnboardingMobile(countryCode, phone);
  if (!customerId || !mobile || !credentialVersion) {
    throw new Error("Valid customer, mobile, and credential are required");
  }

  const authorization = crypto.randomBytes(32).toString("base64url");
  const expiryTime = new Date(now.getTime() + AUTHORIZATION_TTL_MS);
  const session = await Session.create({
    userId: customerId,
    authMethod: "BYPASS",
    token: `${TOKEN_PREFIX}${authorizationTokenHash(authorization, mobile, credentialVersion)}`,
    loginTime: now,
    expiryTime,
    isActive: false,
    deviceInfo: "Authorized onboarding OTP bypass",
  });

  return { authorization, expiresAt: expiryTime, sessionId: session._id };
}

async function consumeOnboardingBypassAuthorization({ authorization, countryCode, phone, now = new Date() }) {
  if (!isOnboardingBypassEnabled()) return null;
  const mobile = normalizeOnboardingMobile(countryCode, phone);
  const code = String(authorization || "").trim();
  if (!code || !mobile) return null;
  const credentialVersion = await getAdminPasscodeCredentialVersion();
  if (!credentialVersion) return null;

  return Session.findOneAndUpdate(
    {
      token: `${TOKEN_PREFIX}${authorizationTokenHash(code, mobile, credentialVersion)}`,
      authMethod: "BYPASS",
      isActive: false,
      expiryTime: { $gt: now },
    },
    {
      $set: {
        token: "",
        isActive: true,
        loginTime: now,
      },
    },
    { new: true }
  );
}

async function finalizeOnboardingBypassSession({ session, vendorId, categoryId, now = new Date() }) {
  if (!session?._id || !session?.userId || !vendorId) {
    throw new Error("Onboarding authorization session is incomplete");
  }

  const hours = await getSessionValidityHours(4);
  const expiryTime = new Date(now.getTime() + hours * 60 * 60 * 1000);
  const token = jwt.sign(
    {
      customerId: String(session.userId),
      vendorId: String(vendorId),
      categoryId: categoryId ? String(categoryId) : "",
      sessionId: String(session._id),
      authMethod: "BYPASS",
    },
    getJwtSecret(),
    { expiresIn: `${hours}h` }
  );

  await Session.updateOne(
    { _id: session._id, authMethod: "BYPASS", isActive: true },
    {
      $set: {
        vendorId: String(vendorId),
        categoryId: categoryId ? String(categoryId) : "",
        token,
        expiryTime,
      },
    }
  );

  return { token, expiryTime };
}

function onboardingMobileFingerprint(countryCode, phone) {
  const mobile = normalizeOnboardingMobile(countryCode, phone);
  return crypto.createHash("sha256").update(mobile || "invalid").digest("hex").slice(0, 20);
}

module.exports = {
  AUTHORIZATION_TTL_MS,
  consumeOnboardingBypassAuthorization,
  createOnboardingBypassAuthorization,
  finalizeOnboardingBypassSession,
  isOnboardingBypassEnabled,
  normalizeOnboardingMobile,
  onboardingMobileFingerprint,
  verifyOnboardingBypassPasscode,
};
