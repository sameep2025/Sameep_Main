const mongoose = require("mongoose");

const masterSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, required: true }, // "brand", "fuelType", "transmissionType", "bodyType"
  sequence: { type: Number, default: 0 },
  imageUrl: { type: String },              // optional file/image
  fieldType: { type: String },             // "text", "number", "select", etc.
  options: [{ type: String }],             // for select/radio/checkbox
  value: mongoose.Schema.Types.Mixed,      // actual value
  autoCalc: { type: Boolean, default: false },
}, { timestamps: true });

// Ensure uniqueness inside each dataset (type + name)
masterSchema.index({ type: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("Master", masterSchema);
