const mongoose = require("mongoose");

const whatsappMarketingTestSendSchema = new mongoose.Schema(
  {
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "DummyVendor", required: true, index: true },
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: "WhatsappMarketingTemplate", required: true },
    metaTemplateId: { type: String, required: true, trim: true },
    metaTemplateName: { type: String, required: true, trim: true },
    recipientHash: { type: String, required: true, immutable: true, select: false },
    recipientMasked: { type: String, required: true, trim: true },
    personalization: {
      customer_name: { type: String, default: "", trim: true },
      salon_name: { type: String, default: "", trim: true },
      offer_details: { type: String, default: "", trim: true },
    },
    headerType: { type: String, enum: ["NONE", "IMAGE", "DOCUMENT"], default: "NONE" },
    status: {
      type: String,
      enum: ["SUBMITTING", "ACCEPTED", "SENT", "DELIVERED", "READ", "FAILED"],
      default: "SUBMITTING",
      required: true,
    },
    metaMessageId: { type: String, default: null, trim: true },
    acceptedAt: { type: Date, default: null },
    lastStatusAt: { type: Date, default: null },
    failureCode: { type: String, default: "", trim: true, maxlength: 80 },
    failureMessage: { type: String, default: "", trim: true, maxlength: 240 },
  },
  { timestamps: true }
);

whatsappMarketingTestSendSchema.index(
  { metaMessageId: 1 },
  {
    unique: true,
    partialFilterExpression: { metaMessageId: { $type: "string" } },
    name: "whatsapp_marketing_test_send_meta_message_unique",
  }
);
whatsappMarketingTestSendSchema.index(
  { vendorId: 1, createdAt: -1 },
  { name: "whatsapp_marketing_test_send_vendor_created" }
);

module.exports = mongoose.model("WhatsappMarketingTestSend", whatsappMarketingTestSendSchema);

