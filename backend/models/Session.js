const mongoose = require("mongoose");

const SessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Customer", // adjust if you use a different user model
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
  },
  { timestamps: true }
);

module.exports = mongoose.model("Session", SessionSchema);
