const mongoose = require("mongoose");

const TransactionSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
      index: true,
    },

    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: false,
      default: null,
      index: true,
    },

    billingSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BillingSession",
      index: true,
    },

    totalAmount: Number,

    grossAmount: {
      type: Number,
      min: 0,
      default: undefined,
    },

    discountAmount: {
      type: Number,
      min: 0,
      default: undefined,
    },

    redeemedPoints: Number,
    redeemValue: Number,

    finalPaidAmount: Number,

    paymentMode: {
      type: String,
      enum: ["CASH", "UPI", "CARD"],
    },

    paymentStatus: {
      type: String,
      default: "OFFLINE_PAID",
    },

    billingSource: {
      type: String,
      default: "POS_OFFLINE",
    },
  },
  { timestamps: true }
);

TransactionSchema.index({ vendorId: 1, createdAt: -1 });
TransactionSchema.index({ billingSessionId: 1 });

module.exports = mongoose.model("Transaction", TransactionSchema);
