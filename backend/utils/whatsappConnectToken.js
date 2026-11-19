const jwt = require("jsonwebtoken");
const { getJwtSecret } = require("./jwtSecrets");
const TOKEN_EXPIRES_IN = "15m";

function createWhatsappConnectToken({ vendorId, customerId, returnUrl }) {
  return jwt.sign(
    {
      purpose: "whatsapp_business_connect",
      vendorId: String(vendorId || ""),
      customerId: String(customerId || ""),
      returnUrl: String(returnUrl || ""),
    },
    getJwtSecret(),
    { expiresIn: TOKEN_EXPIRES_IN }
  );
}

function verifyWhatsappConnectToken(token) {
  const cleanToken = String(token || "").trim();
  if (!cleanToken) {
    return { ok: false, code: "missing_connect_token" };
  }

  try {
    const decoded = jwt.verify(cleanToken, getJwtSecret());
    if (decoded?.purpose !== "whatsapp_business_connect" || !decoded?.vendorId) {
      return { ok: false, code: "invalid_connect_token" };
    }

    return {
      ok: true,
      vendorId: String(decoded.vendorId),
      customerId: decoded.customerId ? String(decoded.customerId) : "",
      returnUrl: decoded.returnUrl ? String(decoded.returnUrl) : "",
    };
  } catch (error) {
    return {
      ok: false,
      code: error?.code === "jwt_secret_missing"
        ? "jwt_secret_missing"
        : "invalid_or_expired_connect_token",
    };
  }
}

module.exports = {
  createWhatsappConnectToken,
  verifyWhatsappConnectToken,
};
