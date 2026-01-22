const express = require("express");
const AuditLog = require("../models/AuditLog");

const router = express.Router();

// GET /api/audit-logs?vendorId=&categoryId=&entityType=&entityId=
router.get("/", async (req, res) => {
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

    res.json({ data: logs });
  } catch (err) {
    console.error("GET /api/audit-logs error", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;
