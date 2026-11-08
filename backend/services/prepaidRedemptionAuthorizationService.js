const crypto = require("crypto");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");

const ITEM_SOURCES = new Set(["vendor_price_node", "vendor_menu_node", "custom_package"]);
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_SEND_RESERVATION_MS = 30 * 1000;
const MAX_OTP_SENDS = 3;
const MAX_OTP_PROVIDER_SUBMISSIONS = 6;
const MAX_OTP_ATTEMPTS = 5;

function normalizeId(value) {
  return value == null ? "" : String(value).trim();
}

function createPublicError(message, code, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function rupeesToPaise(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  const paise = Math.round(amount * 100);
  return Number.isSafeInteger(paise) ? paise : null;
}

function normalizeCanonicalCart(cartItems) {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    throw createPublicError("Billing cart is empty", "prepaid_cart_empty");
  }

  return cartItems.map((item) => {
    const itemId = normalizeId(item?.itemId);
    const itemSource = String(item?.itemSource || "").trim().toLowerCase();
    const qty = Number(item?.qty);
    const pricePaise = rupeesToPaise(item?.price);
    if (
      !mongoose.Types.ObjectId.isValid(itemId) ||
      !ITEM_SOURCES.has(itemSource) ||
      !Number.isSafeInteger(qty) ||
      qty < 1 ||
      pricePaise === null
    ) {
      throw createPublicError(
        "Billing cart must contain canonical item identity, quantity, and price",
        "prepaid_cart_identity_required"
      );
    }
    return {
      itemId,
      itemSource,
      itemType: String(item?.itemType || "").trim().toUpperCase(),
      name: String(item?.name || "").trim(),
      qty,
      pricePaise,
    };
  });
}

function createCartFingerprint({ vendorId, customerId, billingSessionId, cartItems }) {
  const normalized = normalizeCanonicalCart(cartItems).sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right))
  );
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({
      vendorId: normalizeId(vendorId),
      customerId: normalizeId(customerId),
      billingSessionId: normalizeId(billingSessionId),
      items: normalized,
    }))
    .digest("hex");
}

function getEligibleSessionQuantity(cartItems, eligibleItemSource, eligibleItemId) {
  const source = String(eligibleItemSource || "").trim().toLowerCase();
  const id = normalizeId(eligibleItemId);
  return normalizeCanonicalCart(cartItems)
    .filter((item) => item.itemSource === source && item.itemId === id)
    .reduce((sum, item) => sum + item.qty, 0);
}

function createOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function assertAuthorizationCanResend(authorization, now = new Date()) {
  if (authorization?.status !== "PENDING") {
    throw createPublicError("Authorization cannot be reused", "prepaid_authorization_not_pending", 409);
  }
  if (Number(authorization.sendCount) >= MAX_OTP_SENDS) {
    throw createPublicError("OTP resend limit reached", "prepaid_otp_resend_limit", 429);
  }
  if (Number(authorization.providerSubmissionCount || 0) >= MAX_OTP_PROVIDER_SUBMISSIONS) {
    throw createPublicError(
      "OTP submission limit reached",
      "prepaid_otp_submission_limit",
      429
    );
  }
  if (
    authorization.sendReservationToken &&
    new Date(authorization.sendReservationExpiresAt) > now
  ) {
    throw createPublicError(
      "OTP delivery request is already in progress",
      "prepaid_otp_resend_conflict",
      409
    );
  }
  if (new Date(authorization.resendAvailableAt) > now) {
    throw createPublicError("Please wait before requesting another OTP", "prepaid_otp_resend_cooldown", 429);
  }
}

function assertAuthorizationCanVerify(authorization, now = new Date()) {
  if (authorization?.status !== "PENDING") {
    throw createPublicError("Authorization cannot be reused", "prepaid_authorization_not_pending", 409);
  }
  if (new Date(authorization.otpExpiresAt) <= now) {
    throw createPublicError("OTP has expired", "prepaid_otp_expired", 410);
  }
  if (Number(authorization.failedVerificationAttempts) >= MAX_OTP_ATTEMPTS) {
    throw createPublicError("OTP attempt limit reached", "prepaid_otp_attempt_limit", 429);
  }
}

function otpSecret(otp, env = process.env) {
  const pepper = String(env.PREPAID_OTP_HASH_SECRET || env.JWT_SECRET || "");
  if (!pepper) {
    throw createPublicError(
      "OTP hashing secret is not configured",
      "prepaid_otp_secret_missing",
      500
    );
  }
  return crypto.createHmac("sha256", pepper).update(String(otp || "")).digest("hex");
}

async function hashOtp(otp, env = process.env) {
  return bcrypt.hash(otpSecret(otp, env), 10);
}

async function verifyOtpHash(otp, hash, env = process.env) {
  return bcrypt.compare(otpSecret(otp, env), String(hash || ""));
}

module.exports = {
  ITEM_SOURCES,
  MAX_OTP_ATTEMPTS,
  MAX_OTP_PROVIDER_SUBMISSIONS,
  MAX_OTP_SENDS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_SEND_RESERVATION_MS,
  OTP_TTL_MS,
  assertAuthorizationCanResend,
  assertAuthorizationCanVerify,
  createCartFingerprint,
  createOtp,
  createPublicError,
  getEligibleSessionQuantity,
  hashOtp,
  normalizeCanonicalCart,
  normalizeId,
  rupeesToPaise,
  verifyOtpHash,
};
