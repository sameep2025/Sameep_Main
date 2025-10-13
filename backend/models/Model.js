const mongoose = require("mongoose");

const modelSchema = new mongoose.Schema(
  {
    category: { type: String, enum: ["car", "bike"], required: true },
    brand: { type: String, required: true },
    bodyType: { type: String },
    fuelType: { type: String },        // ✅ add this
    transmission: { type: String },    // ✅ add this
    model: { type: String, required: true },
    variant: { type: String },
    seats: { type: Number },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Model", modelSchema);
