const mongoose = require("mongoose");

const VendorPriceNodeSchema = new mongoose.Schema(
  {
    // --------------------
    // Vendor reference
    // --------------------
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },

    // --------------------
    // ROOT category (e.g. Sports Academies, Car Spa)
    // --------------------
    rootCategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },

    // --------------------
    // Actual subcategory (Badminton, Self Play, Hourly, etc.)
    // --------------------
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    
    // --------------------
    // Master catalog parent (for hierarchy)
    // --------------------
    parentCategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },

    // --------------------
    // Display name
    // --------------------
    name: {
      type: String,
      required: true
    },

    // --------------------
    // Vendor tree parent
    // --------------------
    parentVendorPriceNodeId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },

    // --------------------
    // Depth in hierarchy
    // --------------------
    level: {
      type: Number,
      required: true
    },

    // --------------------
    // Leaf indicator
    // --------------------
    isLeaf: {
      type: Boolean,
      required: true
    },

    // --------------------
    // Pricing (leaf only)
    // --------------------
    price: {
      type: Number,
      default: null
    },

    pricingStatus: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Inactive"
    },

    terms: {
      type: String,
      default: ""
    },

    // --------------------
    // Visibility flags
    // --------------------
    visibleToUser: {
      type: Boolean,
      default: true
    },

    visibleToVendor: {
      type: Boolean,
      default: true
    },

    // --------------------
    // UI helpers
    // --------------------
    sequence: {
      type: Number,
      default: 0
    },

    imageUrl: {
      type: String,
      default: ""
    },

    iconUrl: {
      type: String,
      default: ""
    },

    // --------------------
    // Source of data
    // --------------------
    source: {
      type: String,
      enum: ["MASTER_SYNC", "VENDOR_EDIT"],
      default: "MASTER_SYNC"
    }
  },
  {
    timestamps: true
  }
);

// --------------------
// Indexes
// --------------------

// Prevent duplicate nodes per vendor + category + root category
VendorPriceNodeSchema.index(
  { vendorId: 1, rootCategoryId: 1, categoryId: 1 },
  { unique: true }
);

// Speed up tree queries
VendorPriceNodeSchema.index(
  { vendorId: 1, rootCategoryId: 1, parentVendorPriceNodeId: 1 }
);

module.exports = mongoose.model("VendorPriceNode", VendorPriceNodeSchema);