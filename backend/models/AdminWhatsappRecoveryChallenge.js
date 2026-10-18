const mongoose = require("mongoose");

const AdminWhatsappRecoveryChallengeSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    adminId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    vendorId: { type: String, required: true, index: true },
    vendorModel: { type: String, enum: ["Vendor", "DummyVendor"], required: true },
    wabaId: { type: String, required: true },
    phoneNumberId: { type: String, required: true },
    confirmationText: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

AdminWhatsappRecoveryChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model(
  "AdminWhatsappRecoveryChallenge",
  AdminWhatsappRecoveryChallengeSchema
);
