const mongoose = require("mongoose");

const VendorCustomerProfileSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    displayName: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
    },
  },
  { timestamps: true }
);

VendorCustomerProfileSchema.index({ vendorId: 1, customerId: 1 }, { unique: true });
VendorCustomerProfileSchema.index({ vendorId: 1, displayName: 1 });

module.exports = mongoose.model("VendorCustomerProfile", VendorCustomerProfileSchema);
