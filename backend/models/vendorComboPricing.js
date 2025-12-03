const mongoose = require("mongoose");

const VendorComboPricingSchema = new mongoose.Schema(
  {
    // Store as plain strings to support both real and dummy vendor / combo IDs
    vendorId: { type: String, required: true },
    comboId: { type: String, required: true },
    // "default" means combo with no explicit size
    sizeKey: { type: String, default: "default" },
    price: { type: Number, default: null },
    status: { type: String, enum: ["Active", "Inactive"], default: "Inactive" },
  },
  { timestamps: true }
);

VendorComboPricingSchema.index({ vendorId: 1, comboId: 1, sizeKey: 1 }, { unique: true });

module.exports = mongoose.model("VendorComboPricing", VendorComboPricingSchema);
