const mongoose = require("mongoose");

const SessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Customer", // adjust if you use a different user model
    },
    vendorId: {
      type: String,
      default: "",
    },
    categoryId: {
      type: String,
      default: "",
    },
    token: {
      type: String,
      default: "",
    },
    loginTime: {
      type: Date,
      required: true,
      default: Date.now,
    },
    expiryTime: {
      type: Date,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    deviceInfo: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Session", SessionSchema);
