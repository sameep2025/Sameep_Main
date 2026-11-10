const mongoose = require("mongoose");

const whatsappMarketingConsentSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DummyVendor",
      required: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["UNKNOWN", "OPTED_IN", "OPTED_OUT"],
      default: "UNKNOWN",
      required: true,
    },
    source: {
      type: String,
      enum: ["UNKNOWN", "CUSTOMER_PORTAL", "VENDOR_RECORDED", "IMPORT", "META_OPT_OUT"],
      default: "UNKNOWN",
      required: true,
    },
    capturedAt: { type: Date, default: null },
    note: { type: String, default: "", trim: true, maxlength: 240 },
  },
  { timestamps: true }
);

whatsappMarketingConsentSchema.index(
  { vendorId: 1, customerId: 1 },
  { unique: true, name: "whatsapp_marketing_consent_vendor_customer_unique" }
);

module.exports = mongoose.model("WhatsappMarketingConsent", whatsappMarketingConsentSchema);

