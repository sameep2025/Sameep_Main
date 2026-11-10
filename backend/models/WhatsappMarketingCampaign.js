const mongoose = require("mongoose");

const mediaSnapshotSchema = new mongoose.Schema(
  {
    url: { type: String, default: "", trim: true },
    key: { type: String, default: "", trim: true },
    mimeType: { type: String, default: "", trim: true },
    originalName: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const campaignRecipientSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
    normalizedPhone: { type: String, required: true, trim: true },
    displayName: { type: String, default: "", trim: true, maxlength: 100 },
    consentStatus: {
      type: String,
      enum: ["UNKNOWN", "OPTED_IN", "OPTED_OUT"],
      default: "UNKNOWN",
    },
    consentSource: { type: String, default: "UNKNOWN", trim: true },
    eligible: { type: Boolean, default: false },
    exclusionReasons: { type: [String], default: [] },
    personalization: {
      customer_name: { type: String, default: "", trim: true },
      salon_name: { type: String, default: "", trim: true },
      offer_details: { type: String, default: "", trim: true },
    },
  },
  { _id: false }
);

const whatsappMarketingCampaignSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DummyVendor",
      required: true,
      index: true,
    },
    campaignName: { type: String, required: true, trim: true, maxlength: 100 },
    status: { type: String, enum: ["DRAFT"], default: "DRAFT", required: true },
    sourceSegment: {
      segment: {
        type: String,
        enum: ["top_spenders", "repeat", "inactive", "threshold"],
        required: true,
      },
      filters: {
        inactiveDays: { type: Number, default: null },
        spendingThreshold: { type: Number, default: null },
      },
    },
    selection: {
      mode: { type: String, enum: ["EXPLICIT", "ALL_MATCHING"], required: true },
      selectedCustomerIds: {
        type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Customer" }],
        default: [],
      },
      excludedCustomerIds: {
        type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Customer" }],
        default: [],
      },
    },
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WhatsappMarketingTemplate",
      default: null,
    },
    templateSnapshot: {
      metaTemplateId: { type: String, default: "", trim: true },
      metaTemplateName: { type: String, default: "", trim: true },
      language: { type: String, default: "", trim: true },
      draftVersion: { type: Number, default: null },
      messageBody: { type: String, default: "", trim: true },
      metaBody: { type: String, default: "", trim: true },
      variableOrder: { type: [String], default: [] },
      headerType: { type: String, enum: ["NONE", "IMAGE", "DOCUMENT"], default: "NONE" },
      primaryMedia: { type: mediaSnapshotSchema, default: null },
    },
    offerDetails: { type: String, default: "", trim: true, maxlength: 240 },
    recipients: {
      type: [campaignRecipientSchema],
      default: [],
      validate: {
        validator: (value) => Array.isArray(value) && value.length <= 500,
        message: "A campaign draft can contain up to 500 recipients",
      },
    },
    counts: {
      selected: { type: Number, default: 0, min: 0 },
      eligible: { type: Number, default: 0, min: 0 },
      ineligible: { type: Number, default: 0, min: 0 },
      excluded: { type: Number, default: 0, min: 0 },
    },
    wabaSnapshot: {
      wabaId: { type: String, default: "", trim: true },
      verifiedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

whatsappMarketingCampaignSchema.index(
  { vendorId: 1, updatedAt: -1, _id: -1 },
  { name: "whatsapp_marketing_campaign_vendor_updated" }
);

module.exports = mongoose.model("WhatsappMarketingCampaign", whatsappMarketingCampaignSchema);

