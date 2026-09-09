const mongoose = require("mongoose");

const WHATSAPP_BUSINESS_PROVIDERS = ["msg91", "meta"];

const WHATSAPP_BUSINESS_CONNECTION_STATUSES = [
  "not_connected",
  "connecting",
  "connected",
  "template_pending",
  "ready",
  "error",
];

const WHATSAPP_BUSINESS_TEMPLATE_STATUSES = [
  "not_configured",
  "pending",
  "approved",
  "rejected",
  "error",
];

const WHATSAPP_PHONE_REGISTRATION_STATUSES = [
  "unknown",
  "not_registered",
  "registration_required",
  "registration_submitted",
  "pending",
  "registered",
  "active",
  "error",
];

const whatsappBusinessTemplateInstanceSchema = new mongoose.Schema(
  {
    masterTemplateKey: { type: String, required: true, trim: true },
    metaTemplateName: { type: String, default: "", trim: true },
    metaTemplateId: { type: String, default: "", trim: true },
    metaCategory: { type: String, default: "", trim: true },
    language: { type: String, default: "en", trim: true },
    status: {
      type: String,
      enum: WHATSAPP_BUSINESS_TEMPLATE_STATUSES,
      default: "not_configured",
    },
    submittedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    lastError: { type: String, default: "" },
    isActive: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const whatsappBusinessConfigSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    provider: {
      type: String,
      enum: WHATSAPP_BUSINESS_PROVIDERS,
      default: "msg91",
    },
    connectionStatus: {
      type: String,
      enum: WHATSAPP_BUSINESS_CONNECTION_STATUSES,
      default: "not_connected",
    },
    businessId: { type: String, default: "" },
    wabaId: { type: String, default: "" },
    phoneNumberId: { type: String, default: "" },
    displayPhoneNumber: { type: String, default: "" },
    displayName: { type: String, default: "" },
    templateStatus: { type: String, default: "" },
    templateInstances: {
      type: [whatsappBusinessTemplateInstanceSchema],
      default: [],
    },
    activeTemplatesByPurpose: {
      type: Map,
      of: String,
      default: {},
    },
    connectedAt: { type: Date, default: null },
    lastError: { type: String, default: "" },
    metaAuth: {
      accessTokenEncrypted: { type: String, default: "" },
      tokenType: { type: String, default: "" },
      expiresAt: { type: Date, default: null },
    },
    metaRegistration: {
      pinEncrypted: { type: String, default: "" },
    },
    phoneRegistrationStatus: {
      type: String,
      enum: WHATSAPP_PHONE_REGISTRATION_STATUSES,
      default: "unknown",
    },
    phoneRegisteredAt: { type: Date, default: null },
    phoneRegistrationLastError: { type: String, default: "" },
    testMessage: {
      status: {
        type: String,
        enum: ["not_tested", "successful", "failed"],
        default: "not_tested",
      },
      lastTestedAt: { type: Date, default: null },
      lastSuccessfulAt: { type: Date, default: null },
      lastErrorCode: { type: String, default: "" },
    },
    lastTestSend: {
      templateKey: { type: String, default: "" },
      recipientMasked: { type: String, default: "" },
      sentAt: { type: Date, default: null },
      metaMessageId: { type: String, default: "" },
    },
  },
  { _id: false }
);

function getDefaultWhatsappBusinessConfig() {
  return {
    enabled: false,
    provider: "msg91",
    connectionStatus: "not_connected",
    businessId: "",
    wabaId: "",
    phoneNumberId: "",
    displayPhoneNumber: "",
    displayName: "",
    templateStatus: "",
    templateInstances: [],
    activeTemplatesByPurpose: {},
    connectedAt: null,
    lastError: "",
    metaAuth: {
      accessTokenEncrypted: "",
      tokenType: "",
      expiresAt: null,
    },
    metaRegistration: {
      pinEncrypted: "",
    },
    phoneRegistrationStatus: "unknown",
    phoneRegisteredAt: null,
    phoneRegistrationLastError: "",
    testMessage: {
      status: "not_tested",
      lastTestedAt: null,
      lastSuccessfulAt: null,
      lastErrorCode: "",
    },
    lastTestSend: {
      templateKey: "",
      recipientMasked: "",
      sentAt: null,
      metaMessageId: "",
    },
  };
}

module.exports = {
  WHATSAPP_BUSINESS_CONNECTION_STATUSES,
  WHATSAPP_BUSINESS_TEMPLATE_STATUSES,
  WHATSAPP_PHONE_REGISTRATION_STATUSES,
  WHATSAPP_BUSINESS_PROVIDERS,
  getDefaultWhatsappBusinessConfig,
  whatsappBusinessTemplateInstanceSchema,
  whatsappBusinessConfigSchema,
};
