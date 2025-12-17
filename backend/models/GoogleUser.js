const mongoose = require("mongoose");

const GoogleUserSchema = new mongoose.Schema({
  googleId: { type: String, required: true, unique: true },
  email: { type: String },
  name: { type: String },
  picture: { type: String },
  rawProfile: { type: Object, default: {} },

  // Optional linkage to a specific vendor/category in this system when
  // Google login is used from a preview page.
  vendorId: { type: String, default: null },
  categoryId: { type: String, default: null },

  // Tokens and metadata when user has granted Business Profile access.
  accessToken: { type: String, default: null },
  refreshToken: { type: String, default: null },
  tokenExpiry: { type: Date, default: null },
  tokenScope: { type: String, default: null },
  businessConnected: { type: Boolean, default: false },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

GoogleUserSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model("GoogleUser", GoogleUserSchema);
