const mongoose = require('mongoose');

const VendorCustomPackageSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DummyVendor',
      required: true,
      index: true,
    },

    // Top-level category under which this custom package tree lives, e.g. Salon & Spa.
    rootCategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DummyCategory',
      required: true,
      index: true,
    },

    // Immediate parent placement. This allows custom packages under the root category,
    // under a copied standard category/subcategory, or under another custom package node.
    parentNodeId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    parentNodeType: {
      type: String,
      enum: ['root', 'standard_category', 'standard_subcategory', 'custom_package'],
      default: 'root',
    },

    level: { type: Number, default: 1, min: 1 },
    nodeType: {
      type: String,
      enum: ['package_group', 'package_item'],
      default: 'package_item',
    },
    isLeaf: { type: Boolean, default: true },

    name: { type: String, required: true, trim: true },
    imageUrl: { type: String, default: '' },
    iconUrl: { type: String, default: '' },

    description: { type: String, default: '' },
    terms: { type: String, default: '' },
    packagesIncludes: { type: String, default: '' },
    freeText: { type: String, default: '' },
    enableFreeText: { type: Boolean, default: false },
    offerText: { type: String, default: '' },
    offerStartDate: { type: Date, default: null },
    offerEndDate: { type: Date, default: null },
    inventoryLabelName: { type: String, default: '' },
    parentSelectorLabel: { type: String, default: '' },

    // Price is expected at the billable leaf level. Parent package/group nodes may keep this null.
    price: { type: Number, default: null, min: 0 },
    pricingStatus: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Inactive',
    },

    visibleToUser: { type: Boolean, default: true },
    visibleToVendor: { type: Boolean, default: true },
    sequence: { type: Number, default: 0 },

    sourceType: {
      type: String,
      enum: ['custom'],
      default: 'custom',
    },
    customType: {
      type: String,
      enum: ['', 'package', 'service_item', 'offer'],
      default: '',
    },
    variantMode: {
      type: String,
      enum: ['', 'single', 'nested'],
      default: '',
    },
    createdByVendor: { type: Boolean, default: true },

    ancestorNodeIds: {
      type: [mongoose.Schema.Types.ObjectId],
      default: [],
    },
    ancestorNodeTypes: {
      type: [String],
      default: [],
    },
    pathLabels: {
      type: [String],
      default: [],
    },

    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

VendorCustomPackageSchema.index(
  { vendorId: 1, rootCategoryId: 1, parentNodeType: 1, parentNodeId: 1, sequence: 1 },
  { name: 'vendor_custom_package_tree_idx' }
);
VendorCustomPackageSchema.index(
  { vendorId: 1, rootCategoryId: 1, isDeleted: 1, pricingStatus: 1 },
  { name: 'vendor_custom_package_state_idx' }
);

module.exports = mongoose.model(
  'VendorCustomPackage',
  VendorCustomPackageSchema,
  'vendorcustompackages'
);
