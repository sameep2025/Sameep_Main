const mongoose = require("mongoose");

const AdminWhatsappRecoveryAuditSchema = new mongoose.Schema(
  {
    operationId: { type: String, required: true, index: true },
    event: {
      type: String,
      enum: ["attempt_started", "attempt_completed"],
      required: true,
    },
    adminId: { type: String, required: true, index: true },
    adminEmail: { type: String, default: "" },
    vendorId: { type: String, required: true, index: true },
    vendorModel: { type: String, enum: ["Vendor", "DummyVendor"], required: true },
    wabaId: { type: String, required: true },
    phoneNumberId: { type: String, required: true },
    preflightOutcome: { type: String, required: true },
    metaRequestOutcome: { type: String, default: "not_attempted" },
    httpStatus: { type: Number, default: null },
    errorCode: { type: String, default: "" },
    errorSubcode: { type: String, default: "" },
    finalReadiness: {
      verified: { type: Boolean, default: false },
      phoneStatus: { type: String, default: "" },
      platformType: { type: String, default: "" },
      codeVerificationStatus: { type: String, default: "" },
      accountMode: { type: String, default: "" },
      isPinEnabled: { type: Boolean, default: null },
    },
  },
  { timestamps: true }
);

AdminWhatsappRecoveryAuditSchema.index({ vendorId: 1, createdAt: -1 });

module.exports = mongoose.model(
  "AdminWhatsappRecoveryAudit",
  AdminWhatsappRecoveryAuditSchema
);
