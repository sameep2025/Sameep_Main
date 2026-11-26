const mongoose = require("mongoose");

const WhatsappBillingDeliverySchema = new mongoose.Schema(
  {
    operationId: { type: String, required: true, immutable: true, trim: true },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DummyVendor",
      required: true,
      immutable: true,
      index: true,
    },
    billingSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BillingSession",
      required: true,
      immutable: true,
      index: true,
    },
    purpose: {
      type: String,
      enum: ["AUTOMATIC_COMPLETION", "HISTORICAL_RESEND"],
      required: true,
      immutable: true,
    },
    provider: { type: String, enum: ["ynot_meta"], required: true, immutable: true },
    senderPhoneNumberId: { type: String, required: true, immutable: true, trim: true },
    recipientPhone: { type: String, required: true, immutable: true, trim: true, select: false },
    recipientMasked: { type: String, required: true, immutable: true, trim: true },
    templateName: { type: String, required: true, immutable: true, trim: true },
    templateLanguage: { type: String, required: true, immutable: true, trim: true },
    status: {
      type: String,
      enum: ["SUBMITTING", "ACCEPTED", "SENT", "DELIVERED", "READ", "FAILED", "UNKNOWN"],
      default: "SUBMITTING",
      required: true,
    },
    metaMessageId: { type: String, default: null, trim: true },
    sendAttemptedAt: { type: Date, default: null },
    acceptedAt: { type: Date, default: null },
    lastStatusAt: { type: Date, default: null },
    walletDeductedAt: { type: Date, default: null },
    walletReference: { type: String, default: "", trim: true },
    failureCode: { type: String, default: "", trim: true, maxlength: 80 },
    failureMessage: { type: String, default: "", trim: true, maxlength: 240 },
    httpStatus: { type: Number, default: null },
    metaCode: { type: String, default: "", trim: true, maxlength: 80 },
    metaSubcode: { type: String, default: "", trim: true, maxlength: 80 },
    metaTraceId: { type: String, default: "", trim: true, maxlength: 160 },
  },
  { timestamps: true }
);

WhatsappBillingDeliverySchema.index(
  { operationId: 1 },
  { unique: true, name: "whatsapp_billing_delivery_operation_unique" }
);
WhatsappBillingDeliverySchema.index(
  { metaMessageId: 1 },
  {
    unique: true,
    partialFilterExpression: { metaMessageId: { $type: "string" } },
    name: "whatsapp_billing_delivery_meta_message_unique",
  }
);
WhatsappBillingDeliverySchema.index(
  { vendorId: 1, billingSessionId: 1, createdAt: -1 },
  { name: "whatsapp_billing_delivery_bill_history" }
);

module.exports = mongoose.model("WhatsappBillingDelivery", WhatsappBillingDeliverySchema);
