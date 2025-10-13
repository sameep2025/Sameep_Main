const mongoose = require("mongoose");

// Cache for already created models
const modelsCache = {};

function getCategoryModel(categoryName) {
  const collectionName = `VendorCategoryPrice_${categoryName.replace(/\s+/g, "_")}`;

  if (modelsCache[collectionName]) return modelsCache[collectionName];

  const schema = new mongoose.Schema({
    vendorId: { type: mongoose.Schema.Types.ObjectId, required: true },
    vendorName: String,
    businessName: String,
    phone: String,
    price: { type: Number, required: true },
    updatedAt: { type: Date, default: Date.now }
  }, { strict: false }); // allow dynamic fields if needed

  const model = mongoose.model(collectionName, schema, collectionName);
  modelsCache[collectionName] = model;
  return model;
}

module.exports = getCategoryModel;
