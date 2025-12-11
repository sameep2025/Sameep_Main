const mongoose = require("mongoose");

const GoogleUserSchema = new mongoose.Schema({
  googleId: { type: String, required: true, unique: true },
  email: { type: String },
  name: { type: String },
  picture: { type: String },
  rawProfile: { type: Object, default: {} },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

GoogleUserSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model("GoogleUser", GoogleUserSchema);
