// models/VendorLocation.js
const mongoose = require("mongoose");

const vendorLocationSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  address: { type: String },
  area: { type: String }, // suburb / neighborhood
  city: { type: String }, // city / town / village
  nearbyLocations: { type: [String], default: [] },
  // nearbyLocations: { type: [String], default: [] }, // new
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("VendorLocation", vendorLocationSchema);
