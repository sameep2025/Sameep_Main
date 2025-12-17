const mongoose = require("mongoose");

const SetupProgressSchema = new mongoose.Schema({
  googleId: { type: String, required: true },
  categoryId: { type: String, required: true },
  placeId: { type: String, required: true },

  currentStep: { type: String, default: "" },
  generatedDummyVendorId: { type: String, default: "" },
  payload: { type: Object, default: {} },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

SetupProgressSchema.index({ googleId: 1, categoryId: 1, placeId: 1 }, { unique: true });

SetupProgressSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model("SetupProgress", SetupProgressSchema);
