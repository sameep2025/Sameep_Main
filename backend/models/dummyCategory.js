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
  webMenu: { type: [String], default: [] },
  homePopup: {
    tagline: { type: String, default: '' },
    description: { type: String, default: '' },
    button1Label: { type: String, default: '' },
    button1IconUrl: { type: String, default: '' },
    button2Label: { type: String, default: '' },
    button2IconUrl: { type: String, default: '' },
  },
  whyUs: {
    heading: { type: String, default: '' },
    subHeading: { type: String, default: '' },
    cards: {
      type: [
        {
          title: { type: String, default: '' },
          description: { type: String, default: '' },
          iconUrl: { type: String, default: '' },
        },
      ],
      default: Array(6).fill({}).map(() => ({ title: '', description: '', iconUrl: '' })),
    },
  },
  about: {
    heading: { type: String, default: '' },
    mainText: { type: String, default: '' },
    mission: { type: String, default: '' },
    vision: { type: String, default: '' },
    card: {
      title: { type: String, default: '' },
      description: { type: String, default: '' },
      buttonLabel: { type: String, default: '' },
      iconUrl: { type: String, default: '' },
    },
  },
  contact: {
    heading: { type: String, default: '' },
    description: { type: String, default: '' },
    footerHeading: { type: String, default: '' },
    footerDescription: { type: String, default: '' },
    footerHeading1: { type: String, default: '' },
    footerHeading2: { type: String, default: '' },
    footerHeading3: { type: String, default: '' },
    footerHeading4: { type: String, default: '' },
  },

  signupLevels: [
    {
      levelName: { type: String, required: true },
      sequence: { type: Number, default: 0 },
      businessField: { type: [String], default: [] },
    },
  ],

  inventoryLabelName: { type: String, default: '' },
  attributesHeading: { type: String, default: '' },
  parentSelectorLabel: { type: String, default: '' },
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