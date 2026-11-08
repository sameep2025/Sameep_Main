const mongoose = require("mongoose");

const WALLET_TYPES = ["PREPAID_VALUE", "PREPAID_SESSIONS"];
const WALLET_STATUSES = ["ACTIVE", "SCHEDULED", "DEPLETED", "EXPIRED", "CANCELLED"];

const PrepaidMembershipWalletSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
      immutable: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
      immutable: true,
    },
    customerMembershipId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CustomerMembership",
      required: true,
      immutable: true,
    },
    walletType: {
      type: String,
      enum: WALLET_TYPES,
      required: true,
      immutable: true,
    },
    creditedAmountPaise: { type: Number, min: 0, default: undefined },
    consumedAmountPaise: { type: Number, min: 0, default: undefined },
    remainingAmountPaise: { type: Number, min: 0, default: undefined },
    creditedQuantity: { type: Number, min: 0, default: undefined },
    consumedQuantity: { type: Number, min: 0, default: undefined },
    remainingQuantity: { type: Number, min: 0, default: undefined },
    activatesAt: { type: Date, required: true, index: true, immutable: true },
    expiresAt: { type: Date, required: true, index: true, immutable: true },
    status: {
      type: String,
      enum: WALLET_STATUSES,
      default: "ACTIVE",
      required: true,
      index: true,
    },
    version: {
      type: Number,
      min: 0,
      default: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: "wallet version must be a safe integer",
      },
    },
  },
  { timestamps: true, minimize: false }
);

function isNonnegativeSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

PrepaidMembershipWalletSchema.pre("validate", function validateBalanceDimensions(next) {
  const amountFields = [
    this.creditedAmountPaise,
    this.consumedAmountPaise,
    this.remainingAmountPaise,
  ];
  const quantityFields = [
    this.creditedQuantity,
    this.consumedQuantity,
    this.remainingQuantity,
  ];

  if (this.walletType === "PREPAID_VALUE") {
    const validAmounts = amountFields.every(isNonnegativeSafeInteger);
    const noQuantities = quantityFields.every((value) => value === undefined || value === null);
    if (
      !validAmounts ||
      !noQuantities ||
      this.creditedAmountPaise !== this.consumedAmountPaise + this.remainingAmountPaise
    ) {
      this.invalidate(
        "remainingAmountPaise",
        "PREPAID_VALUE balances must be integer paise and reconcile exactly"
      );
    }
  }

  if (this.walletType === "PREPAID_SESSIONS") {
    const validQuantities = quantityFields.every(isNonnegativeSafeInteger);
    const noAmounts = amountFields.every((value) => value === undefined || value === null);
    if (
      !validQuantities ||
      !noAmounts ||
      this.creditedQuantity !== this.consumedQuantity + this.remainingQuantity
    ) {
      this.invalidate(
        "remainingQuantity",
        "PREPAID_SESSIONS balances must be integer quantities and reconcile exactly"
      );
    }
  }
  next();
});

PrepaidMembershipWalletSchema.index(
  { customerMembershipId: 1 },
  { unique: true, name: "prepaid_wallet_membership_unique" }
);
PrepaidMembershipWalletSchema.index(
  { vendorId: 1, customerId: 1, status: 1, expiresAt: 1 },
  { name: "prepaid_wallet_customer_status" }
);

PrepaidMembershipWalletSchema.statics.constants = {
  WALLET_TYPES,
  WALLET_STATUSES,
};

module.exports = mongoose.model("PrepaidMembershipWallet", PrepaidMembershipWalletSchema);
