const mongoose = require("mongoose");

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

    billingMode: {
      type: String,
      enum: ["LOYALTY", "WALK_IN"],
      default: "WALK_IN",
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
  },
  { timestamps: true }
);

BillingSessionSchema.index({ vendorId: 1, createdAt: -1 });
BillingSessionSchema.index({ customerId: 1 });
BillingSessionSchema.index({ publicAccessCode: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("BillingSession", BillingSessionSchema);
