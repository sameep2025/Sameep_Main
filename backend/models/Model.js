const mongoose = require("mongoose");

const modelSchema = new mongoose.Schema(
  {
    category: { type: String, required: true }, // removed enum to avoid hardcoding
    brand: { type: String, required: true },
    bodyType: { type: String },
    fuelType: { type: String },
    transmission: { type: String },
    model: { type: String, required: true },
    variant: { type: String },
    seats: { type: Number },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Model", modelSchema);