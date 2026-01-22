const mongoose = require("mongoose");

const PriceItemSchema = new mongoose.Schema({
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
  level1: String,
  level2: String,
  level3: String,
  level4: String,
  level5: String,
  price: { type: Number, required: true },
});

const VendorCategoryPriceSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true },
  vendorName: String,
  businessName: String,
  phone: String,
  pricing: [PriceItemSchema], // ✅ all prices stored in one array
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("VendorCategoryPrice", VendorCategoryPriceSchema);
