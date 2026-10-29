const mongoose = require("mongoose");

const GST_PRICING_MODES = Object.freeze(["inclusive", "exclusive"]);

function getDefaultGstSettings() {
  return {
    enabled: false,
    gstin: "",
    legalBusinessName: "",
    registeredAddress: "",
    registeredStateCode: "",
    defaultGstRateBps: 0,
    defaultSac: "",
    pricingMode: "inclusive",
    updatedAt: null,
  };
}

const gstSettingsSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    gstin: { type: String, trim: true, uppercase: true, default: "" },
    legalBusinessName: { type: String, trim: true, maxlength: 150, default: "" },
    registeredAddress: { type: String, trim: true, maxlength: 500, default: "" },
    registeredStateCode: { type: String, trim: true, maxlength: 2, default: "" },
    defaultGstRateBps: {
      type: Number,
      min: 0,
      max: 10000,
      default: 0,
      validate: {
        validator: Number.isInteger,
        message: "defaultGstRateBps must be an integer",
      },
    },
    defaultSac: { type: String, trim: true, maxlength: 8, default: "" },
    pricingMode: { type: String, enum: GST_PRICING_MODES, default: "inclusive" },
    updatedAt: { type: Date, default: null },
  },
  { _id: false }
);

module.exports = {
  GST_PRICING_MODES,
  getDefaultGstSettings,
  gstSettingsSchema,
};
