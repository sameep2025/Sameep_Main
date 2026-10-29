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

    customerNameSnapshot: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
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

    membershipDiscountAmount: {
      type: Number,
      min: 0,
      default: undefined,
    },

    additionalManualDiscountAmount: {
      type: Number,
      min: 0,
      default: undefined,
    },

    membershipBillingSnapshot: {
      customerMembershipId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "CustomerMembership",
        default: null,
      },
      membershipPlanId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "MembershipPlan",
        default: null,
      },
      planName: {
        type: String,
        trim: true,
        default: "",
      },
      discountPercentage: {
        type: Number,
        min: 0,
        default: undefined,
      },
      minimumBillAmount: {
        type: Number,
        min: 0,
        default: undefined,
      },
      allowAdditionalDiscountOnMembershipItems: {
        type: Boolean,
        default: undefined,
      },
      allowRewardsOnMembershipItems: {
        type: Boolean,
        default: undefined,
      },
      benefitSemanticsVersion: {
        type: String,
        trim: true,
        default: "",
      },
      benefitRulesSource: {
        type: String,
        trim: true,
        default: "",
      },
      eligibilitySource: {
        type: String,
        trim: true,
        default: "",
      },
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

    recordMode: {
      type: String,
      enum: ["NORMAL", "GST_TEST"],
      default: "NORMAL",
      index: true,
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
