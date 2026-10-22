const mongoose = require("mongoose");

const ManeaWhatsappDiagnosticUseSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true,
      immutable: true,
    },
    billingSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      immutable: true,
      index: true,
    },
    wabaId: { type: String, required: true, immutable: true },
    phoneNumberId: { type: String, required: true, immutable: true },
    recipientHash: { type: String, required: true, immutable: true },
    operationId: { type: String, required: true, immutable: true },
    status: {
      type: String,
      enum: [
        "reserved",
        "send_attempted",
        "meta_accepted",
        "meta_failed",
        "failed_before_send",
        "outcome_unknown",
      ],
      required: true,
      default: "reserved",
    },
    claimedAt: { type: Date, required: true, immutable: true },
    sendAttemptedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    safeErrorCode: { type: String, default: "" },
    httpStatus: { type: Number, default: null },
    metaMessageId: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "ManeaWhatsappDiagnosticUse",
  ManeaWhatsappDiagnosticUseSchema
);
