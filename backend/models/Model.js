const mongoose = require("mongoose");

const modelSchema = new mongoose.Schema(
  {
    category: { type: String, enum: ["car", "bike"], required: true },
    brand: { type: String, required: true },
    bodyType: { type: String },
    model: { type: String, required: true },
    variant: { type: String },
    seats: { type: Number },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Model", modelSchema);