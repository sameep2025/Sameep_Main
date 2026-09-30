const jwt = require("jsonwebtoken");
const Session = require("../models/Session");

const CUSTOMER_PORTAL_SESSION_TYPE = "CUSTOMER_PORTAL";
const CUSTOMER_PORTAL_SESSION_DAYS = 30;
const JWT_SECRET = process.env.JWT_SECRET || "dev_jwt_secret_change_me";

function getTokenFromRequest(req) {
  const auth = req.headers?.authorization || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  if (req.headers?.["x-auth-token"]) {
    return String(req.headers["x-auth-token"]).trim();
  }
  if (req.body?.token) {
    return String(req.body.token).trim();
  }
  return null;
}

function getCustomerPortalExpiryDate(now = new Date()) {
  return new Date(now.getTime() + CUSTOMER_PORTAL_SESSION_DAYS * 24 * 60 * 60 * 1000);
}

function signCustomerPortalToken({ customerId, sessionId }) {
  return jwt.sign(
    {
      customerId: String(customerId || ""),
      sessionId: String(sessionId || ""),
      sessionType: CUSTOMER_PORTAL_SESSION_TYPE,
    },
    JWT_SECRET,
    { expiresIn: `${CUSTOMER_PORTAL_SESSION_DAYS}d` }
  );
}

async function validateCustomerPortalSession(token) {
  if (!token) return { ok: false, code: "no_token" };

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return { ok: false, code: "invalid_token" };
  }

  const customerId = decoded.customerId;
  const sessionId = decoded.sessionId;
  const sessionType = decoded.sessionType;

  if (
    !customerId ||
    !sessionId ||
    sessionType !== CUSTOMER_PORTAL_SESSION_TYPE
  ) {
    return { ok: false, code: "invalid_portal_token" };
  }

  const session = await Session.findOne({
    _id: sessionId,
    userId: customerId,
    isActive: true,
    sessionType: CUSTOMER_PORTAL_SESSION_TYPE,
  }).lean();

  if (!session) return { ok: false, code: "no_session" };

  const now = new Date();
  if (!session.expiryTime || new Date(session.expiryTime) <= now) {
    try {
      await Session.updateOne(
        {
          _id: session._id,
          userId: customerId,
          sessionType: CUSTOMER_PORTAL_SESSION_TYPE,
        },
        { $set: { isActive: false } }
      );
    } catch (err) {
      // Best-effort expiry cleanup. Validation still fails.
    }
    return { ok: false, code: "expired" };
  }

  return {
    ok: true,
    customerId: String(customerId),
    sessionId: String(sessionId),
    session,
  };
}

async function requireCustomerPortalSession(req, res, next) {
  try {
    const token = getTokenFromRequest(req);
    const result = await validateCustomerPortalSession(token);

    if (!result.ok) {
      const status = ["no_token", "invalid_token", "invalid_portal_token", "no_session", "expired"].includes(result.code)
        ? 401
        : 401;
      return res.status(status).json({
        success: false,
        message: "Customer portal session invalid or expired",
        code: result.code || "invalid_session",
      });
    }

    req.auth = {
      customerId: result.customerId,
      sessionId: result.sessionId,
      sessionType: CUSTOMER_PORTAL_SESSION_TYPE,
    };

    return next();
  } catch (err) {
    console.error("requireCustomerPortalSession error:", err?.message || err);
    return res.status(500).json({
      success: false,
      message: "Failed to validate customer portal session",
    });
  }
}

module.exports = {
  CUSTOMER_PORTAL_SESSION_DAYS,
  CUSTOMER_PORTAL_SESSION_TYPE,
  getCustomerPortalExpiryDate,
  getTokenFromRequest,
  requireCustomerPortalSession,
  signCustomerPortalToken,
  validateCustomerPortalSession,
};
