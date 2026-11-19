const { validateAdminTokenFromRequest } = require("./adminAuthMiddleware");
const { getTokenFromRequest, validateCustomerSession } = require("./authMiddleware");

function normalizeId(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function requireCustomerSelfOrAdmin(paramName = "id") {
  return async (req, res, next) => {
    try {
      const customerId = normalizeId(req.params?.[paramName]);
      if (!customerId) {
        return res.status(400).json({ message: "Customer ID is required" });
      }

      const adminResult = validateAdminTokenFromRequest(req);
      if (adminResult.ok) {
        req.customerRecordAuth = { authType: "admin", customerId, admin: adminResult.admin };
        return next();
      }

      const sessionResult = await validateCustomerSession(getTokenFromRequest(req));
      if (!sessionResult.ok) {
        return res.status(401).json({
          message: "Customer session invalid or expired",
          code: sessionResult.code || "invalid_session",
        });
      }

      if (normalizeId(sessionResult.customerId) !== customerId) {
        return res.status(403).json({
          message: "Customer record access denied",
          code: "customer_mismatch",
        });
      }

      req.customerRecordAuth = {
        authType: "customer",
        customerId,
        sessionId: sessionResult.sessionId,
      };
      return next();
    } catch (error) {
      console.error("Customer record auth error:", error?.message || error);
      return res.status(500).json({ message: "Failed to validate customer record access" });
    }
  };
}

module.exports = { requireCustomerSelfOrAdmin };
