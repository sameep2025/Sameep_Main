const mongoose = require("mongoose");

const VendorWalletLedgerSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "DummyVendor",
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: ["PLAN_ALLOCATION", "BILL_MESSAGE", "ENQUIRY_MESSAGE", "OTP_USAGE", "RECHARGE"],
    required: true,
  },
  channel: {
    type: String,
    enum: ["WHATSAPP", "OTP"],
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
  },
  reference: {
    type: String,
    default: "",
  },
  balanceAfter: {
    type: Number,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

VendorWalletLedgerSchema.index({ vendorId: 1 });
VendorWalletLedgerSchema.index({ createdAt: 1 });
VendorWalletLedgerSchema.index(
  { vendorId: 1, channel: 1, reference: 1 },
  {
    unique: true,
    partialFilterExpression: {
      channel: "OTP",
      type: "OTP_USAGE",
      reference: { $type: "string", $gt: "" },
    },
  }
);

module.exports = mongoose.model("VendorWalletLedger", VendorWalletLedgerSchema);
