const mongoose = require("mongoose");

const LoyaltyLedgerSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["EARN", "REDEEM", "EARN_REVERSAL", "REDEEM_REVERSAL"],
      required: true,
    },

    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
      index: true,
    },

    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },

    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      required: true,
      index: true,
    },

    billingSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BillingSession",
      default: null,
      index: true,
    },

    sourceLedgerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoyaltyLedger",
      default: null,
      index: true,
    },

    redemptionAllocations: [
      {
        earnLedgerId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "LoyaltyLedger",
          required: true,
        },
        points: {
          type: Number,
          required: true,
          min: 0,
        },
      },
    ],

    points: {
      type: Number,
      required: true,
    },

    remainingPoints: {
      type: Number,
      default: null,
      index: true,
    },

    expiryDate: {
      type: Date,
      default: null,
      index: true,
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

    cancellationIdempotencyKey: {
      type: String,
      trim: true,
      default: "",
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
    },
  },
  { timestamps: true }
);

LoyaltyLedgerSchema.index({ vendorId: 1, customerId: 1 });
LoyaltyLedgerSchema.index({ transactionId: 1 });
LoyaltyLedgerSchema.index({ customerId: 1, expiryDate: 1 });
LoyaltyLedgerSchema.index(
  { type: 1, sourceLedgerId: 1, billingSessionId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      sourceLedgerId: { $exists: true, $type: "objectId" },
      billingSessionId: { $exists: true, $type: "objectId" },
    },
  }
);

module.exports = mongoose.model("LoyaltyLedger", LoyaltyLedgerSchema);
