const mongoose = require('mongoose');

const CategorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  imageUrl: { type: String, default: '' },
  iconUrl: { type: String, default: "" },

  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
  price: { type: Number, default: null },
  freeText: { type: String, default: "" },
  terms: { type: String, default: '' },
  enableFreeText: { type: Boolean, default: false },

  visibleToUser: { type: Boolean, default: false },
  visibleToVendor: { type: Boolean, default: false },
  sequence: { type: Number, default: 0 }, // ordering within siblings
  seoKeywords: String,
  categoryType: {
      type: String,
      enum: ["Products", "Services", "Products & Services"],
      default: "Products",
    },
    availableForCart: { type: Boolean, default: false },
    postRequestsDeals: { type: Boolean, default: false },
  loyaltyPoints: { type: Boolean, default: false },
  linkAttributesPricing: { type: Boolean, default: false },
  freeTexts: { type: [String], default: Array(10).fill("") },
  categoryVisibility: { type: [String], default: [] },
  categoryModel: { type: [String], default: [] },
  categoryPricing: { type: [String], default: [] },
  socialHandle: { type: [String], default: [] },
  displayType: { type: [String], default: [] },

  signupLevels: [
    {
      levelName: { type: String, required: true },
      sequence: { type: Number, default: 0 },
      businessField: { type: [String], default: [] },
    },
  ],

  // Inventory label and linked master attributes for pricing
  inventoryLabelName: { type: String, default: "" },
  linkedAttributes: { type: Object, default: {} },
  // Per-node UI rules (replace legacy uiConfig usage)
  uiRules: {
    type: new mongoose.Schema(
      {
        includeLeafChildren: { type: Boolean, default: true },
      },
      { _id: false }
    ),
    default: () => ({ includeLeafChildren: true }),
  },

  colorSchemes: [
    {
      name: { type: String, required: true }, // e.g. "Pink Sunset", "Ocean Blue"
      primary: { type: String, required: true },
      accent: { type: String, required: true },
      background: { type: String, required: true },
      cardBg: { type: String, required: true },
      text: { type: String, required: true },
    },
  ],
  createdAt: { type: Date, default: Date.now },
});

CategorySchema.index({ name: 1, parent: 1 }, { unique: true });
CategorySchema.index({ parent: 1, sequence: 1 });
module.exports = mongoose.model('Category', CategorySchema);