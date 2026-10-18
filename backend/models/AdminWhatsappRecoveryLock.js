const mongoose = require("mongoose");

const AdminWhatsappRecoveryLockSchema = new mongoose.Schema(
  {
    lockKey: { type: String, required: true, unique: true },
    lockTokenHash: { type: String, required: true },
    adminId: { type: mongoose.Schema.Types.ObjectId, required: true },
    vendorId: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

AdminWhatsappRecoveryLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("AdminWhatsappRecoveryLock", AdminWhatsappRecoveryLockSchema);
