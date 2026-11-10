const mongoose = require("mongoose");

const PlanSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  price: { type: Number, required: true },

  billingCycle: {
    type: String,
    enum: ["daily", "monthly", "yearly"],
    default: "yearly",
  },

  features: {
    website: { type: Boolean, default: true },
    digitalMenu: { type: Boolean, default: true },
    basicBilling: { type: Boolean, default: true },
    customerBilling: { type: Boolean, default: false },
    whatsappBilling: { type: Boolean, default: false },
    whatsappMarketing: { type: Boolean, default: false },
    whatsappBundle: { type: Number, default: 0 },
    advancedBilling: { type: Boolean, default: false },
    humanResourceManagement: { type: Boolean, default: false },
    loyaltyModule: { type: Boolean, default: false },
    otpVerification: { type: Boolean, default: false },
    otpBundle: { type: Number, default: 0 },
    analyticsCustomer: { type: Boolean, default: false },
    analyticsResource: { type: Boolean, default: false },
    analyticsReports: { type: Boolean, default: false },
  },

  active: { type: Boolean, default: true },

  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Plan", PlanSchema);
