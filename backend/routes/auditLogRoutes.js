const express = require("express");
const AuditLog = require("../models/AuditLog");
const { requireAdminAuth } = require("../utils/adminAuthMiddleware");

const router = express.Router();

// GET /api/audit-logs?vendorId=&categoryId=&entityType=&entityId=
const SENSITIVE_KEY = /(authorization|cookie|credential|password|secret|token)/i;

function sanitizeAuditValue(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((entry) => sanitizeAuditValue(entry, seen));
  if (typeof value !== "object") {
    if (typeof value === "string") {
      const containsCredential =
        /bearer\s+[a-z0-9._~-]+/i.test(value) ||
        /\beyj[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+\b/i.test(value) ||
        /(?:token|secret|password|credential)=([^&\s]+)/i.test(value);
      if (containsCredential) return "[REDACTED]";
    }
    return value;
  }
  if (seen.has(value)) return "[REDACTED]";
  seen.add(value);

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SENSITIVE_KEY.test(key) ? "[REDACTED]" : sanitizeAuditValue(entry, seen),
    ])
  );
}

router.get("/", requireAdminAuth, async (req, res) => {
  try {
    const { vendorId, categoryId, entityType, entityId, rowKey } = req.query;
    const criteria = {};
    if (vendorId) criteria.vendorId = String(vendorId);
    if (categoryId) criteria.categoryId = String(categoryId);
    if (entityType) criteria.entityType = String(entityType);
    if (entityId) criteria.entityId = String(entityId);
    if (rowKey) criteria["meta.rowKey"] = String(rowKey);

    const logs = await AuditLog.find(criteria)
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    res.json({ data: logs.map((log) => sanitizeAuditValue(log)) });
  } catch (err) {
    console.error("GET /api/audit-logs error", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;
module.exports.sanitizeAuditValue = sanitizeAuditValue;
