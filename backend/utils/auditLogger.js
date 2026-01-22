const AuditLog = require("../models/AuditLog");

function getActorFromRequest(req) {
  try {
    const hdr = (req.headers["x-actor-role"] || req.headers["x-actor"] || "").toString().trim();
    if (!hdr) return "admin"; // admin panel default
    if (hdr === "vendor" || hdr === "admin" || hdr === "admin_impersonation") return hdr;
    return "admin";
  } catch {
    return "admin";
  }
}

async function logAudit(req, payload) {
  try {
    if (!payload || !payload.action || !payload.field || !payload.entityType || !payload.entityId) {
      return;
    }
    const changedBy = payload.changedBy || getActorFromRequest(req);
    const vendorId =
      payload.vendorId ||
      (req.headers && (req.headers["x-vendor-id"] || req.headers["x-vendor"])) ||
      null;
    const categoryId =
      payload.categoryId ||
      (req.headers && (req.headers["x-root-category-id"] || req.headers["x-category-id"])) ||
      null;

    const doc = new AuditLog({
      action: payload.action,
      field: payload.field,
      oldValue: payload.oldValue,
      newValue: payload.newValue,
      changedBy,
      vendorId: vendorId ? String(vendorId) : null,
      categoryId: categoryId ? String(categoryId) : null,
      entityType: payload.entityType,
      entityId: String(payload.entityId),
      meta: payload.meta || null,
    });
    await doc.save();
  } catch (err) {
    console.error("audit log error", err && err.message ? err.message : err);
  }
}

module.exports = { logAudit };
