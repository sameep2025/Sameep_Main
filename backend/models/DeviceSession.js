const mongoose = require("mongoose");

const DeviceSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Customer",
    },
    vendorId: {
      type: String,
      default: "",
    },
    categoryId: {
      type: String,
      default: "",
    },
    refreshTokenHash: {
      type: String,
      required: true,
    },
    userAgent: {
      type: String,
      default: "",
    },
    ip: {
      type: String,
      default: "",
    },
    expiresAt: {
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

DeviceSessionSchema.index({ userId: 1 });
DeviceSessionSchema.index({ refreshTokenHash: 1 }, { unique: true });
DeviceSessionSchema.index({ expiresAt: 1 });

module.exports = mongoose.model("DeviceSession", DeviceSessionSchema);
