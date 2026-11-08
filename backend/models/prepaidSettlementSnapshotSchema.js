const mongoose = require("mongoose");

const ITEM_SOURCES = ["vendor_price_node", "vendor_menu_node", "custom_package"];
const WALLET_TYPES = ["PREPAID_VALUE", "PREPAID_SESSIONS"];

const integerPaise = {
  type: Number,
  min: 0,
  validate: {
    validator: (value) => value == null || Number.isSafeInteger(value),
    message: "settlement amount must be integer paise",
  },
};

const PrepaidSettlementSnapshotSchema = new mongoose.Schema(
  {
    walletType: { type: String, enum: WALLET_TYPES, required: true },
    walletId: { type: mongoose.Schema.Types.ObjectId, ref: "PrepaidMembershipWallet", required: true },
    customerMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: "CustomerMembership", required: true },
    authorizedAmountPaise: { ...integerPaise, default: undefined },
    authorizedQuantity: {
      type: Number,
      min: 1,
      default: undefined,
      validate: {
        validator: (value) => value == null || Number.isSafeInteger(value),
        message: "authorized quantity must be an integer",
      },
    },
    eligibleItemSource: { type: String, enum: ITEM_SOURCES, default: undefined },
    eligibleItemId: { type: mongoose.Schema.Types.ObjectId, default: null },
    operationalServiceValuePaise: { ...integerPaise, required: true },
    freshCashCollectedPaise: { ...integerPaise, required: true },
    redemptionLedgerId: { type: mongoose.Schema.Types.ObjectId, ref: "PrepaidWalletLedger", default: null },
    authorizationId: { type: mongoose.Schema.Types.ObjectId, ref: "PrepaidRedemptionAuthorization", required: true },
  },
  { _id: false, minimize: false }
);

PrepaidSettlementSnapshotSchema.pre("validate", function validateSettlementDimension(next) {
  const hasAmount = Number.isSafeInteger(this.authorizedAmountPaise) && this.authorizedAmountPaise > 0;
  const hasQuantity = Number.isSafeInteger(this.authorizedQuantity) && this.authorizedQuantity > 0;
  if (this.walletType === "PREPAID_VALUE" && (!hasAmount || hasQuantity)) {
    this.invalidate("authorizedAmountPaise", "value settlement requires only an authorized amount");
  }
  if (
    this.walletType === "PREPAID_SESSIONS" &&
    (!hasQuantity || hasAmount || !this.eligibleItemId || !ITEM_SOURCES.includes(this.eligibleItemSource))
  ) {
    this.invalidate("authorizedQuantity", "session settlement requires item identity and quantity");
  }
  next();
});

module.exports = PrepaidSettlementSnapshotSchema;
