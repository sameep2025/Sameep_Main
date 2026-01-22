const jwt = require("jsonwebtoken");
const Session = require("../models/Session");

const JWT_SECRET = process.env.JWT_SECRET || "dev_jwt_secret_change_me";

// Extract token from Authorization: Bearer <token> or x-auth-token header or body.token
function getTokenFromRequest(req) {
  const auth = req.headers["authorization"] || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  if (req.headers["x-auth-token"]) return String(req.headers["x-auth-token"]).trim();
  if (req.body && req.body.token) return String(req.body.token).trim();
  return null;
}

async function validateCustomerSession(token) {
  if (!token) return { ok: false, code: "no_token" };

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return { ok: false, code: "invalid_token" };
  }

  const customerId = decoded.customerId;
  const vendorId = decoded.vendorId || "";
  const categoryId = decoded.categoryId || "";
  const sessionId = decoded.sessionId || null;

  if (!customerId) return { ok: false, code: "invalid_payload" };

  const now = new Date();
  const filter = { userId: customerId, isActive: true };
  if (vendorId) filter.vendorId = String(vendorId);
  if (categoryId) filter.categoryId = String(categoryId);
  if (sessionId) filter._id = sessionId;

  const session = await Session.findOne(filter).sort({ loginTime: -1 }).lean();
  if (!session) return { ok: false, code: "no_session" };

  if (!session.expiryTime || new Date(session.expiryTime) <= now) {
    try {
      await Session.updateOne({ _id: session._id }, { $set: { isActive: false } });
    } catch (_) {}
    return { ok: false, code: "expired" };
  }

  return {
    ok: true,
    customerId,
    vendorId,
    categoryId,
    sessionId,
    session,
  };
}

async function requireCustomerSession(req, res, next) {
  try {
    const token = getTokenFromRequest(req);
    const result = await validateCustomerSession(token);
    if (!result.ok) {
      const map = {
        no_token: 401,
        invalid_token: 401,
        invalid_payload: 401,
        no_session: 401,
        expired: 401,
      };
      const status = map[result.code] || 401;
      return res.status(status).json({ message: "Session invalid or expired", code: result.code || "invalid" });
    }

    req.auth = {
      customerId: result.customerId,
      vendorId: result.vendorId,
      categoryId: result.categoryId,
      sessionId: result.sessionId,
    };

    return next();
  } catch (err) {
    console.error("requireCustomerSession error:", err.message || err);
    return res.status(500).json({ message: "Failed to validate session" });
  }
}

module.exports = {
  getTokenFromRequest,
  validateCustomerSession,
  requireCustomerSession,
};
