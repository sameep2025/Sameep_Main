const mongoose = require("mongoose");

const SERVICE_SOURCES = Object.freeze([
  "vendor_price_node",
  "vendor_menu_node",
  "custom_package",
]);
const ITEM_TYPES = Object.freeze(["SERVICE", "PRODUCT"]);

const vendorServiceTaxOverrideSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DummyVendor",
      required: true,
    },
    serviceSource: {
      type: String,
      enum: SERVICE_SOURCES,
      required: true,
    },
    serviceId: {
      type: String,
      trim: true,
      maxlength: 200,
      required: true,
    },
    itemType: {
      type: String,
      enum: ITEM_TYPES,
      default: "SERVICE",
      required: true,
    },
    gstRateBps: {
      type: Number,
      min: 0,
      max: 10000,
      default: null,
      validate: {
        validator: (value) => value === null || Number.isInteger(value),
        message: "gstRateBps must be an integer",
      },
    },
    sac: {
      type: String,
      trim: true,
      maxlength: 8,
      default: "",
      validate: {
        validator: (value) => value === "" || /^\d{4,8}$/.test(value),
        message: "sac must contain 4 to 8 digits",
      },
    },
    hsn: {
      type: String,
      trim: true,
      maxlength: 8,
      default: "",
      validate: {
        validator: (value) => value === "" || /^\d{4}(?:\d{2}){0,2}$/.test(value),
        message: "hsn must contain 4, 6, or 8 digits",
      },
    },
  },
  { timestamps: true }
);

vendorServiceTaxOverrideSchema.index(
  { vendorId: 1, serviceSource: 1, serviceId: 1 },
  { unique: true, name: "vendor_service_tax_override_unique" }
);
vendorServiceTaxOverrideSchema.index(
  { vendorId: 1, updatedAt: -1 },
  { name: "vendor_service_tax_override_updated" }
);

module.exports = mongoose.model("VendorServiceTaxOverride", vendorServiceTaxOverrideSchema);
module.exports.SERVICE_SOURCES = SERVICE_SOURCES;
module.exports.ITEM_SOURCES = SERVICE_SOURCES;
module.exports.ITEM_TYPES = ITEM_TYPES;
