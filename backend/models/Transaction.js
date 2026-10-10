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
      enum: ["CASH", "UPI", "CARD", "ONLINE"],
    },

    paymentStatus: {
      type: String,
      default: "OFFLINE_PAID",
    },

    billingSource: {
      type: String,
      default: "POS_OFFLINE",
    },

    status: {
      type: String,
      enum: ["COMPLETED", "CANCELLED", "SUPERSEDED"],
      default: "COMPLETED",
    },

    cancelledAt: {
      type: Date,
      default: null,
    },

    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    cancellationReason: {
      type: String,
      trim: true,
      default: "",
    },

    cancellationNote: {
      type: String,
      trim: true,
      default: "",
    },

    cancellationAuthorizationMethod: {
      type: String,
      enum: ["OTP", "VENDOR_CONFIRM"],
      default: undefined,
    },

    supersededAt: {
      type: Date,
      default: null,
    },

    originalTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      default: null,
    },

    replacementTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      default: null,
    },
  },
  { timestamps: true }
);

TransactionSchema.index({ vendorId: 1, createdAt: -1 });
TransactionSchema.index(
  { billingSessionId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      billingSessionId: { $exists: true, $type: "objectId" },
    },
  }
);

module.exports = mongoose.model("Transaction", TransactionSchema);
