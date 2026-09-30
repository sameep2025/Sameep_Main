const mongoose = require("mongoose");

const CustomerRewardRevealSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
      index: true,
    },
    rewardLedgerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoyaltyLedger",
      required: true,
      index: true,
    },
    revealedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  { timestamps: true }
);

CustomerRewardRevealSchema.index(
  { customerId: 1, rewardLedgerId: 1 },
  { unique: true }
);

module.exports = mongoose.model("CustomerRewardReveal", CustomerRewardRevealSchema);
