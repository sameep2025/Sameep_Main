const mongoose = require('mongoose');

const DummyCategorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  imageUrl: { type: String, default: '' },
  iconUrl: { type: String, default: '' },

  // hierarchy (top-level categories have parent=null)
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'DummyCategory', default: null },

  // pricing/content
  price: { type: Number, default: null },
  freeText: { type: String, default: '' },
  terms: { type: String, default: '' },
  enableFreeText: { type: Boolean, default: false },

  // visibility and ordering
  visibleToUser: { type: Boolean, default: false },
  visibleToVendor: { type: Boolean, default: false },
  sequence: { type: Number, default: 0 },

  // top-level only extras (kept optional for simplicity)
  seoKeywords: { type: String, default: '' },
  categoryType: { type: String, enum: ['Products', 'Services', 'Products & Services'], default: 'Products' },
  availableForCart: { type: Boolean, default: false },
  postRequestsDeals: { type: Boolean, default: false },
  loyaltyPoints: { type: Boolean, default: false },
  linkAttributesPricing: { type: Boolean, default: false },
  freeTexts: { type: [String], default: Array(10).fill('') },
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

  inventoryLabelName: { type: String, default: '' },
  linkedAttributes: { type: Object, default: {} },

  colorSchemes: [
    {
      name: { type: String, required: true },
      primary: { type: String, required: true },
      accent: { type: String, required: true },
      background: { type: String, required: true },
      cardBg: { type: String, required: true },
      text: { type: String, required: true },
    },
  ],

  dropdowns: { type: Object, default: {} },

  createdAt: { type: Date, default: Date.now },
});

DummyCategorySchema.index({ name: 1, parent: 1 }, { unique: true });
DummyCategorySchema.index({ parent: 1, sequence: 1 });

module.exports = mongoose.model('DummyCategory', DummyCategorySchema, 'dummycategories');