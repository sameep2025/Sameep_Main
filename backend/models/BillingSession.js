const mongoose = require("mongoose");
const GstInvoiceSnapshotSchema = require("./gstInvoiceSnapshotSchema");

const BillingItemSchema = new mongoose.Schema(
  {
    itemId: mongoose.Schema.Types.ObjectId,
    name: String,
    price: Number,
    qty: Number,
    total: Number,

    // ⭐ NEW — hierarchy fields for analytics
    categoryId: mongoose.Schema.Types.ObjectId,
    parentCategoryId: mongoose.Schema.Types.ObjectId,
    rootCategoryId: mongoose.Schema.Types.ObjectId,
    nodePath: [String],
    categoryPathIds: [mongoose.Schema.Types.ObjectId],

    // ⭐ Resource assignment
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VendorResource",
      default: null,
    },
    resourceName: {
      type: String,
      default: "",
    },

    membershipEligible: {
      type: Boolean,
      default: undefined,
    },
    membershipDiscountApplied: {
      type: Boolean,
      default: undefined,
    },
    membershipDiscountAmount: {
      type: Number,
      min: 0,
      default: undefined,
    },
    manualDiscountEligible: {
      type: Boolean,
      default: undefined,
    },
    manualDiscountAmount: {
      type: Number,
      min: 0,
      default: undefined,
    },
    finalLineAmount: {
      type: Number,
      min: 0,
      default: undefined,
    },
    rewardsEligible: {
      type: Boolean,
      default: undefined,
    },
  },
  { _id: false }
);


const BillingSessionSchema = new mongoose.Schema(
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
    },

    customerPhoneSnapshot: {
      type: String,
      trim: true,
      default: "",
    },

    customerNameSnapshot: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
    },

    billingMode: {
      type: String,
      enum: ["LOYALTY", "WALK_IN"],
      default: "WALK_IN",
    },

    gstInvoiceMode: {
      type: String,
      enum: ["NONE", "TEST", "LIVE"],
      default: "NONE",
      immutable: true,
    },

    cartItems: [BillingItemSchema],

    totalAmount: {
      type: Number,
      default: 0,
    },

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

    manualDiscountMode: {
      type: String,
      enum: ["amount", "percent", null],
      default: undefined,
    },

    manualDiscountPercent: {
      type: Number,
      min: 0,
      max: 100,
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

    pointsEarned: {
      type: Number,
      default: 0,
    },

    pointsRedeemed: {
      type: Number,
      default: 0,
    },

    paymentMode: {
      type: String,
      enum: ["ONLINE", "CASH"],
      default: undefined,
    },

    otpVerified: {
      type: Boolean,
      default: false,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "COMPLETED", "CANCELLED", "SUPERSEDED"],
      default: "ACTIVE",
    },

    completedAt: {
      type: Date,
      default: null,
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

    cancellationOtpPhoneSnapshot: {
      type: String,
      trim: true,
      default: "",
    },

    cancellationOtpVerifiedAt: {
      type: Date,
      default: null,
    },

    cancellationAuthorizationMethod: {
      type: String,
      enum: ["OTP", "VENDOR_CONFIRM"],
      default: undefined,
    },

    cancellationIdempotencyKey: {
      type: String,
      trim: true,
      default: "",
    },

    supersededAt: {
      type: Date,
      default: null,
    },

    supersededBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    supersededByBillingSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BillingSession",
      default: null,
    },

    originalBillingSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BillingSession",
      default: null,
    },

    replacementBillingSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BillingSession",
      default: null,
    },

    publicAccessCode: {
      type: String,
      trim: true,
    },

    publicAccessExpiresAt: {
      type: Date,
      default: null,
    },

    gstInvoiceSnapshot: {
      type: GstInvoiceSnapshotSchema,
      default: undefined,
      immutable: true,
    },
  },
  { timestamps: true }
);

BillingSessionSchema.index({ vendorId: 1, createdAt: -1 });
BillingSessionSchema.index({ customerId: 1 });
BillingSessionSchema.index({ publicAccessCode: 1 }, { unique: true, sparse: true });
BillingSessionSchema.index(
  { vendorId: 1, "gstInvoiceSnapshot.invoiceNumber": 1 },
  {
    unique: true,
    partialFilterExpression: { "gstInvoiceSnapshot.invoiceNumber": { $type: "string" } },
    name: "gst_invoice_number_per_vendor_unique",
  }
);

module.exports = mongoose.model("BillingSession", BillingSessionSchema);
