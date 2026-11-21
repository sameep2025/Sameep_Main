const mongoose = require("mongoose");

const personalizationSchema = new mongoose.Schema(
  {
    customer_name: { type: String, default: "", trim: true },
    salon_name: { type: String, default: "", trim: true },
    offer_details: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const whatsappMarketingCampaignRecipientSchema = new mongoose.Schema(
  {
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "DummyVendor", required: true, index: true },
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WhatsappMarketingCampaign",
      required: true,
      index: true,
    },
    runId: { type: String, required: true, trim: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
    normalizedPhone: { type: String, required: true, trim: true },
    displayName: { type: String, default: "", trim: true, maxlength: 100 },
    personalization: { type: personalizationSchema, default: () => ({}) },
    status: {
      type: String,
      enum: ["QUEUED", "PROCESSING", "ACCEPTED", "SENT", "DELIVERED", "READ", "FAILED", "CANCELLED"],
      default: "QUEUED",
      required: true,
    },
    attemptCount: { type: Number, default: 0, min: 0 },
    nextAttemptAt: { type: Date, default: Date.now },
    leaseToken: { type: String, default: "", trim: true, select: false },
    leaseExpiresAt: { type: Date, default: null },
    metaMessageId: { type: String, default: null, trim: true },
    acceptedAt: { type: Date, default: null },
    lastStatusAt: { type: Date, default: null },
    failureCode: { type: String, default: "", trim: true, maxlength: 80 },
    failureMessage: { type: String, default: "", trim: true, maxlength: 240 },
    ambiguousFailure: { type: Boolean, default: false },
  },
  { timestamps: true }
);

whatsappMarketingCampaignRecipientSchema.index(
  { campaignId: 1, customerId: 1 },
  { unique: true, name: "whatsapp_marketing_campaign_recipient_customer_unique" }
);
whatsappMarketingCampaignRecipientSchema.index(
  { campaignId: 1, normalizedPhone: 1 },
  { unique: true, name: "whatsapp_marketing_campaign_recipient_phone_unique" }
);
whatsappMarketingCampaignRecipientSchema.index(
  { metaMessageId: 1 },
  {
    unique: true,
    partialFilterExpression: { metaMessageId: { $type: "string" } },
    name: "whatsapp_marketing_campaign_recipient_meta_message_unique",
  }
);
whatsappMarketingCampaignRecipientSchema.index(
  { status: 1, nextAttemptAt: 1, leaseExpiresAt: 1, createdAt: 1 },
  { name: "whatsapp_marketing_campaign_recipient_worker_claim" }
);

module.exports = mongoose.model(
  "WhatsappMarketingCampaignRecipient",
  whatsappMarketingCampaignRecipientSchema
);
