const mongoose = require('mongoose');

const DummySubcategorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  imageUrl: { type: String, default: '' },
  iconUrl: { type: String, default: '' },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'DummyCategory', required: true },
  // optional: allow nesting under another subcategory
  parentSubcategory: { type: mongoose.Schema.Types.ObjectId, ref: 'DummySubcategory', default: null },
  price: { type: Number, default: null },
  pricingStatus: { type: String, enum: ['Active', 'Inactive'], default: 'Inactive' },
  terms: { type: String, default: '' },
  freeText: { type: String, default: '' },
  inventoryLabelName: { type: String, default: '' },
  parentSelectorLabel: { type: String, default: '' },
  visibleToUser: { type: Boolean, default: false },
  visibleToVendor: { type: Boolean, default: false },
  sequence: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

DummySubcategorySchema.index({ category: 1, parentSubcategory: 1, sequence: 1 });

module.exports = mongoose.model('DummySubcategory', DummySubcategorySchema, 'dummysubcategories');