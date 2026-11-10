const mongoose = require("mongoose");

const MARKETING_TEMPLATE_PURPOSES = [
  "INACTIVE_CUSTOMER_REMINDER",
  "PROMOTIONAL_OFFER",
  "EXCLUSIVE_OFFER",
  "MEMBERSHIP_REMINDER",
  "GENERAL_MARKETING",
];

const MARKETING_TEMPLATE_STATUSES = [
  "DRAFT",
  "SUBMITTING",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "PAUSED",
  "DISABLED",
];

const marketingImageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
    key: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true, trim: true },
    sizeBytes: { type: Number, required: true, min: 1 },
    originalName: { type: String, default: "", trim: true, maxlength: 180 },
  },
  { _id: false }
);

const marketingMediaSchema = new mongoose.Schema(
  {
    images: {
      type: [marketingImageSchema],
      default: [],
      validate: {
        validator: (value) => Array.isArray(value) && value.length <= 5,
        message: "A marketing template can contain up to 5 images",
      },
    },
    brochure: { type: marketingImageSchema, default: null },
    primary: {
      type: {
        type: String,
        enum: ["NONE", "IMAGE", "DOCUMENT"],
        default: "NONE",
      },
      key: { type: String, default: "", trim: true },
    },
  },
  { _id: false }
);

const marketingSubmissionSnapshotSchema = new mongoose.Schema(
  {
    internalName: { type: String, default: "", trim: true },
    messageBody: { type: String, default: "", trim: true },
    metaBody: { type: String, default: "", trim: true },
    variableOrder: { type: [String], default: [] },
    sampleValues: { type: [String], default: [] },
    language: { type: String, default: "en", trim: true },
    draftVersion: { type: Number, default: 1 },
    primaryMedia: { type: marketingImageSchema, default: null },
    headerType: {
      type: String,
      enum: ["NONE", "IMAGE", "DOCUMENT"],
      default: "NONE",
    },
  },
  { _id: false }
);

const marketingApprovalHistorySchema = new mongoose.Schema(
  {
    status: { type: String, required: true, trim: true },
    metaTemplateId: { type: String, default: "", trim: true },
    metaTemplateName: { type: String, default: "", trim: true },
    reason: { type: String, default: "", trim: true, maxlength: 1000 },
    snapshot: { type: marketingSubmissionSnapshotSchema, default: null },
    recordedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const whatsappMarketingTemplateSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DummyVendor",
      required: true,
      index: true,
    },
    internalName: { type: String, required: true, trim: true, maxlength: 80 },
    normalizedName: { type: String, required: true, trim: true, maxlength: 80 },
    purpose: {
      type: String,
      enum: MARKETING_TEMPLATE_PURPOSES,
      required: true,
    },
    messageBody: { type: String, required: true, trim: true, maxlength: 1024 },
    variables: { type: [String], default: [] },
    // Retained for compatibility with Phase 1 drafts created before the media library.
    image: { type: marketingImageSchema, default: null },
    media: { type: marketingMediaSchema, default: () => ({}) },
    language: { type: String, default: "en", trim: true, maxlength: 10 },
    draftVersion: { type: Number, default: 1, min: 1 },
    status: {
      type: String,
      enum: MARKETING_TEMPLATE_STATUSES,
      default: "DRAFT",
    },
    metaTemplate: {
      templateId: { type: String, default: "", trim: true },
      templateName: { type: String, default: "", trim: true },
      category: { type: String, default: "", trim: true },
      language: { type: String, default: "", trim: true },
      status: { type: String, default: "NOT_SUBMITTED", trim: true },
      submissionAttempt: { type: Number, default: 0, min: 0 },
      submittedAt: { type: Date, default: null },
      lastSyncedAt: { type: Date, default: null },
      reviewedAt: { type: Date, default: null },
      rejectionReason: { type: String, default: "", trim: true },
      lastSubmissionError: { type: String, default: "", trim: true, maxlength: 1000 },
    },
    submittedSnapshot: { type: marketingSubmissionSnapshotSchema, default: null },
    approvalHistory: { type: [marketingApprovalHistorySchema], default: [] },
  },
  { timestamps: true }
);

whatsappMarketingTemplateSchema.index(
  { vendorId: 1, normalizedName: 1 },
  { unique: true, name: "whatsapp_marketing_template_vendor_name_unique" }
);
whatsappMarketingTemplateSchema.index(
  { vendorId: 1, updatedAt: -1, _id: -1 },
  { name: "whatsapp_marketing_template_vendor_updated" }
);

module.exports = mongoose.model("WhatsappMarketingTemplate", whatsappMarketingTemplateSchema);
module.exports.constants = {
  MARKETING_TEMPLATE_PURPOSES,
  MARKETING_TEMPLATE_STATUSES,
};
