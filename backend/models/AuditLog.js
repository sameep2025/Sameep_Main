const mongoose = require("mongoose");

const AuditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    field: { type: String, required: true },
    oldValue: { type: mongoose.Schema.Types.Mixed, default: null },
    newValue: { type: mongoose.Schema.Types.Mixed, default: null },
    changedBy: {
      type: String,
      enum: ["vendor", "admin", "admin_impersonation", "system"],
      default: "admin",
    },
    vendorId: { type: String, default: null },
    categoryId: { type: String, default: null },
    entityType: { type: String, required: true },
    entityId: { type: String, required: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AuditLog", AuditLogSchema);
