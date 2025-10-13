const mongoose = require("mongoose");

const vendorPriceSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
  price: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model("VendorPrice", vendorPriceSchema);