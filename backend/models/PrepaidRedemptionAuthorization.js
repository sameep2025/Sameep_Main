const mongoose = require("mongoose");

const AUTHORIZATION_TYPES = ["PREPAID_VALUE", "PREPAID_SESSIONS"];
const AUTHORIZATION_STATUSES = ["PENDING", "VERIFIED", "CONSUMED", "EXPIRED"];
const ITEM_SOURCES = ["vendor_price_node", "vendor_menu_node", "custom_package"];

const PrepaidRedemptionAuthorizationSchema = new mongoose.Schema(
  {
    vendorId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true, immutable: true },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
      immutable: true,
    },
    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PrepaidMembershipWallet",
      required: true,
      immutable: true,
    },
    billingSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BillingSession",
      required: true,
      immutable: true,
    },
    authorizationType: {
      type: String,
      enum: AUTHORIZATION_TYPES,
      required: true,
      immutable: true,
    },
    eligibleItemId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    eligibleItemSource: {
      type: String,
      enum: ITEM_SOURCES,
      default: undefined,
      immutable: true,
    },
    exactQuantity: { type: Number, min: 1, default: undefined, immutable: true },
    exactAmountPaise: { type: Number, min: 1, default: undefined, immutable: true },
    cartFingerprint: { type: String, required: true, trim: true, maxlength: 128, immutable: true },
    otpHash: {
      type: String,
      required: true,
      select: false,
      minlength: 32,
      maxlength: 256,
    },
    otpExpiresAt: { type: Date, required: true, index: true },
    verifiedAt: { type: Date, default: null },
    consumedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: AUTHORIZATION_STATUSES,
      default: "PENDING",
      required: true,
      index: true,
    },
    failedVerificationAttempts: { type: Number, min: 0, default: 0 },
    sendCount: { type: Number, min: 0, default: 1 },
    otpGeneration: { type: Number, min: 0, default: 1 },
    providerSubmissionCount: { type: Number, min: 0, default: 0 },
    sendReservationToken: {
      type: String,
      default: null,
      select: false,
      maxlength: 128,
    },
    sendReservationExpiresAt: { type: Date, default: null },
    lastSentAt: { type: Date, required: true, default: Date.now },
    resendAvailableAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true, minimize: false }
);

PrepaidRedemptionAuthorizationSchema.pre("validate", function validateAuthorizationBinding(next) {
  const hasQuantity = Number.isSafeInteger(this.exactQuantity) && this.exactQuantity > 0;
  const hasAmount = Number.isSafeInteger(this.exactAmountPaise) && this.exactAmountPaise > 0;

  if (
    this.authorizationType === "PREPAID_SESSIONS" &&
    (!this.eligibleItemId || !ITEM_SOURCES.includes(this.eligibleItemSource) || !hasQuantity || this.exactAmountPaise != null)
  ) {
    this.invalidate(
      "exactQuantity",
      "session authorization must bind one item source and an exact integer quantity"
    );
  }
  if (
    this.authorizationType === "PREPAID_VALUE" &&
    (!hasAmount || this.exactQuantity != null || this.eligibleItemId || this.eligibleItemSource)
  ) {
    this.invalidate(
      "exactAmountPaise",
      "value authorization must bind an exact integer amount in paise"
    );
  }
  if (this.consumedAt && !this.verifiedAt) {
    this.invalidate("consumedAt", "authorization cannot be consumed before verification");
  }
  next();
});

PrepaidRedemptionAuthorizationSchema.index(
  { billingSessionId: 1 },
  { unique: true, name: "prepaid_authorization_bill_unique" }
);
PrepaidRedemptionAuthorizationSchema.index(
  { vendorId: 1, customerId: 1, status: 1, otpExpiresAt: 1 },
  { name: "prepaid_authorization_customer_status" }
);

PrepaidRedemptionAuthorizationSchema.statics.constants = {
  AUTHORIZATION_TYPES,
  AUTHORIZATION_STATUSES,
  ITEM_SOURCES,
};

module.exports = mongoose.model(
  "PrepaidRedemptionAuthorization",
  PrepaidRedemptionAuthorizationSchema
);
