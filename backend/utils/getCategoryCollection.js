const mongoose = require("mongoose");

const modelsCache = {};

function getCategoryCollection(categoryName) {
  // Collection name: VendorCategoryPrice_<categoryName>
  const collectionName = `VendorCategoryPrice_${categoryName.replace(/\s+/g, "_")}`;

  if (modelsCache[collectionName]) return modelsCache[collectionName];

  const schema = new mongoose.Schema({
    vendorName: String,
    businessName: String,
    phone: String,
    level1: String,
    level2: String,
    level3: String,
    level4: String,
    level5: String,
    price: { type: Number, required: true },
    updatedAt: { type: Date, default: Date.now }
  }, { strict: false }); // allow dynamic levels

  const model = mongoose.model(collectionName, schema, collectionName);
  modelsCache[collectionName] = model;
  return model;
}

module.exports = getCategoryCollection;
