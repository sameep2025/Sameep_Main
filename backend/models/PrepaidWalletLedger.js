const mongoose = require("mongoose");

const EVENT_TYPES = ["CREDIT", "REDEMPTION", "CANCELLATION_REVERSAL", "EXPIRY"];
const WALLET_TYPES = ["PREPAID_VALUE", "PREPAID_SESSIONS"];

const immutableObjectId = (ref) => ({
  type: mongoose.Schema.Types.ObjectId,
  ref,
  required: true,
  immutable: true,
});

const PrepaidWalletLedgerSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      immutable: true,
      index: true,
    },
    customerId: { ...immutableObjectId("Customer"), index: true },
    customerMembershipId: immutableObjectId("CustomerMembership"),
    walletId: immutableObjectId("PrepaidMembershipWallet"),
    billingSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BillingSession",
      default: null,
      immutable: true,
    },
    sourceLedgerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PrepaidWalletLedger",
      default: null,
      immutable: true,
    },
    walletType: { type: String, enum: WALLET_TYPES, required: true, immutable: true },
    eventType: { type: String, enum: EVENT_TYPES, required: true, immutable: true },
    amountPaise: { type: Number, min: 0, default: undefined, immutable: true },
    quantity: { type: Number, min: 0, default: undefined, immutable: true },
    occurredAt: { type: Date, required: true, default: Date.now, immutable: true },
    idempotencyKey: { type: String, trim: true, default: "", immutable: true },
    audit: { type: mongoose.Schema.Types.Mixed, default: undefined, immutable: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, minimize: false }
);

PrepaidWalletLedgerSchema.pre("validate", function validateLedgerValue(next) {
  const hasAmount = Number.isSafeInteger(this.amountPaise) && this.amountPaise > 0;
  const hasQuantity = Number.isSafeInteger(this.quantity) && this.quantity > 0;

  if (
    (this.walletType === "PREPAID_VALUE" && (!hasAmount || this.quantity != null)) ||
    (this.walletType === "PREPAID_SESSIONS" && (!hasQuantity || this.amountPaise != null))
  ) {
    this.invalidate(
      this.walletType === "PREPAID_VALUE" ? "amountPaise" : "quantity",
      "ledger value must match the wallet balance dimension"
    );
  }
  if (this.eventType === "REDEMPTION" && !this.billingSessionId) {
    this.invalidate("billingSessionId", "redemption requires a billing session");
  }
  if (this.eventType === "CANCELLATION_REVERSAL" && !this.sourceLedgerId) {
    this.invalidate("sourceLedgerId", "cancellation reversal requires its source debit");
  }
  next();
});

PrepaidWalletLedgerSchema.index(
  { billingSessionId: 1, eventType: 1 },
  {
    unique: true,
    partialFilterExpression: {
      eventType: "REDEMPTION",
      billingSessionId: { $type: "objectId" },
    },
    name: "prepaid_wallet_redemption_once",
  }
);
PrepaidWalletLedgerSchema.index(
  { walletId: 1, sourceLedgerId: 1, eventType: 1 },
  {
    unique: true,
    partialFilterExpression: {
      eventType: "CANCELLATION_REVERSAL",
      sourceLedgerId: { $type: "objectId" },
    },
    name: "prepaid_wallet_reversal_once",
  }
);
PrepaidWalletLedgerSchema.index(
  { walletId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $gt: "" } },
    name: "prepaid_wallet_idempotency_key_unique",
  }
);
PrepaidWalletLedgerSchema.index(
  { vendorId: 1, customerId: 1, occurredAt: -1 },
  { name: "prepaid_wallet_customer_history" }
);

function rejectMutation(next) {
  const error = new Error("Prepaid wallet ledger entries are immutable");
  error.code = "prepaid_wallet_ledger_immutable";
  next(error);
}

["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "deleteOne", "deleteMany", "findOneAndDelete"]
  .forEach((operation) => PrepaidWalletLedgerSchema.pre(operation, rejectMutation));

PrepaidWalletLedgerSchema.statics.constants = { EVENT_TYPES, WALLET_TYPES };

module.exports = mongoose.model("PrepaidWalletLedger", PrepaidWalletLedgerSchema);
