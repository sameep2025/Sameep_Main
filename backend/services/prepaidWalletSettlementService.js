const mongoose = require("mongoose");
const CustomerMembership = require("../models/CustomerMembership");
const PrepaidMembershipWallet = require("../models/PrepaidMembershipWallet");
const PrepaidRedemptionAuthorization = require("../models/PrepaidRedemptionAuthorization");
const PrepaidWalletLedger = require("../models/PrepaidWalletLedger");
const { assertPrepaidWalletRedemptionEnabled } = require("./prepaidMembershipCapability");
const {
  createCartFingerprint,
  createPublicError,
  normalizeCanonicalCart,
  normalizeId,
  rupeesToPaise,
} = require("./prepaidRedemptionAuthorizationService");

const PREPAID_PAYMENT_MODES = new Set(["PREPAID_VALUE", "PREPAID_SESSIONS"]);

function isPrepaidPaymentMode(value) {
  return PREPAID_PAYMENT_MODES.has(String(value || "").trim().toUpperCase());
}

function requireTransactionSession(session) {
  if (!session || typeof session !== "object") {
    throw createPublicError(
      "Prepaid wallet settlement requires a database transaction",
      "prepaid_transaction_required",
      503
    );
  }
}

async function persistInitialPrepaidSettlementSnapshot({
  BillingSessionModel,
  billingId,
  snapshot,
  session,
}) {
  requireTransactionSession(session);
  if (!BillingSessionModel?.collection || !mongoose.isValidObjectId(billingId) || !snapshot) {
    throw createPublicError(
      "Prepaid settlement snapshot is invalid",
      "invalid_prepaid_settlement_snapshot",
      500
    );
  }

  const holder = new BillingSessionModel({ prepaidSettlementSnapshot: snapshot });
  const snapshotDocument = holder.prepaidSettlementSnapshot;
  const validationError = snapshotDocument?.validateSync?.();
  if (!snapshotDocument || validationError) {
    throw createPublicError(
      "Prepaid settlement snapshot is invalid",
      "invalid_prepaid_settlement_snapshot",
      500
    );
  }

  const persistedSnapshot = snapshotDocument.toObject({ depopulate: true, versionKey: false });
  const result = await BillingSessionModel.collection.updateOne(
    {
      _id: new mongoose.Types.ObjectId(String(billingId)),
      status: "COMPLETED",
      prepaidSettlementSnapshot: { $exists: false },
    },
    { $set: { prepaidSettlementSnapshot: persistedSnapshot } },
    { session }
  );
  if (result.modifiedCount !== 1) {
    throw createPublicError(
      "Prepaid settlement snapshot could not be persisted safely",
      "prepaid_settlement_snapshot_conflict",
      409
    );
  }
  return persistedSnapshot;
}

function assertNoPrepaidDiscountsOrRewards({ billing, authoritativeFinancials, paymentMode }) {
  const mode = String(paymentMode || "").trim().toUpperCase();
  const pointsRedeemed = Number(billing?.pointsRedeemed || 0);
  const storedDiscount = Number(billing?.discountAmount || 0);
  const membershipDiscount = Number(authoritativeFinancials?.membershipDiscountAmount || 0);
  const manualDiscount = Number(authoritativeFinancials?.additionalManualDiscountAmount || 0);
  const totalDiscount = Number(authoritativeFinancials?.discountAmount || 0);
  const hasForbiddenBenefit = pointsRedeemed !== 0 || membershipDiscount !== 0 ||
    Boolean(authoritativeFinancials?.membership);
  const hasForbiddenSessionDiscount = mode !== "PREPAID_VALUE" && (
    storedDiscount !== 0 || manualDiscount !== 0 || totalDiscount !== 0
  );
  const hasInconsistentValueDiscount = mode === "PREPAID_VALUE" && (
    Math.abs(storedDiscount - manualDiscount) > 0.001 ||
    Math.abs(totalDiscount - manualDiscount) > 0.001
  );
  if (hasForbiddenBenefit || hasForbiddenSessionDiscount || hasInconsistentValueDiscount) {
    throw createPublicError(
      mode === "PREPAID_VALUE"
        ? "Prepaid wallet bills cannot use Discount Membership benefits or loyalty redemption"
        : "Prepaid Package bills cannot use discounts, Discount Membership benefits, or loyalty redemption",
      "prepaid_discounts_or_rewards_not_allowed"
    );
  }
}

function assertPrepaidRequestContract({ paymentMode, paymentBreakdown, authorizationId }) {
  const mode = String(paymentMode || "").trim().toUpperCase();
  if (!isPrepaidPaymentMode(mode)) {
    throw createPublicError("Valid prepaid wallet payment mode required", "invalid_prepaid_payment_mode");
  }
  if (!mongoose.Types.ObjectId.isValid(normalizeId(authorizationId))) {
    throw createPublicError("Verified prepaid authorization required", "prepaid_authorization_required");
  }
  if (paymentBreakdown != null) {
    const cash = Number(paymentBreakdown?.cashAmountPaise || 0);
    const online = Number(paymentBreakdown?.onlineAmountPaise || 0);
    if (cash !== 0 || online !== 0) {
      throw createPublicError(
        "Wallet payment cannot be combined with Cash or Online payment",
        "mixed_prepaid_payment_not_supported"
      );
    }
  }
  return mode;
}

function assertOnlyEligibleSessionItems(cartItems, authorization) {
  const items = normalizeCanonicalCart(cartItems);
  const eligibleId = String(authorization.eligibleItemId || "");
  const eligibleSource = String(authorization.eligibleItemSource || "");
  if (
    items.some((item) => item.itemId !== eligibleId || item.itemSource !== eligibleSource)
  ) {
    throw createPublicError(
      "Session wallet bills may contain only the authorized Service or Package",
      "prepaid_session_ineligible_item"
    );
  }
  const quantity = items.reduce((sum, item) => sum + item.qty, 0);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity !== authorization.exactQuantity) {
    throw createPublicError("Authorized session quantity changed", "prepaid_authorization_binding_changed", 409);
  }
  return quantity;
}

async function createRedemptionLedger(payload, session) {
  const [ledger] = await PrepaidWalletLedger.create([payload], { session });
  return ledger;
}

async function consumePrepaidAuthorization({
  authorizationId,
  paymentMode,
  billing,
  cartItems,
  finalPayablePaise,
  operationalServiceValuePaise,
  session,
  now = new Date(),
}) {
  assertPrepaidWalletRedemptionEnabled();
  requireTransactionSession(session);
  const mode = assertPrepaidRequestContract({ paymentMode, authorizationId });
  if (!billing?.customerId) {
    throw createPublicError("Prepaid wallet payment requires a customer", "prepaid_customer_required");
  }
  if (!Number.isSafeInteger(finalPayablePaise) || finalPayablePaise < 1) {
    throw createPublicError("Prepaid wallet payable amount is invalid", "invalid_prepaid_amount");
  }
  if (!Number.isSafeInteger(operationalServiceValuePaise) || operationalServiceValuePaise < 0) {
    throw createPublicError("Operational service value is invalid", "invalid_operational_service_value");
  }

  const authorization = await PrepaidRedemptionAuthorization.findOne({
    _id: authorizationId,
    vendorId: billing.vendorId,
    customerId: billing.customerId,
    billingSessionId: billing._id,
    authorizationType: mode,
    status: "VERIFIED",
    verifiedAt: { $ne: null },
    consumedAt: null,
    otpExpiresAt: { $gt: now },
  }).session(session);
  if (!authorization) {
    throw createPublicError(
      "Verified prepaid authorization is missing, expired, or already used",
      "prepaid_authorization_unavailable",
      409
    );
  }

  const fingerprint = createCartFingerprint({
    vendorId: billing.vendorId,
    customerId: billing.customerId,
    billingSessionId: billing._id,
    cartItems,
  });
  if (fingerprint !== authorization.cartFingerprint) {
    throw createPublicError("Billing cart changed after OTP verification", "prepaid_authorization_binding_changed", 409);
  }

  let deduction;
  if (mode === "PREPAID_VALUE") {
    if (authorization.exactAmountPaise !== finalPayablePaise) {
      throw createPublicError("Final payable changed after OTP verification", "prepaid_authorization_binding_changed", 409);
    }
    deduction = { amountPaise: finalPayablePaise };
  } else {
    deduction = { quantity: assertOnlyEligibleSessionItems(cartItems, authorization) };
  }

  const consumedAuthorization = await PrepaidRedemptionAuthorization.findOneAndUpdate(
    {
      _id: authorization._id,
      status: "VERIFIED",
      consumedAt: null,
      otpExpiresAt: { $gt: now },
      cartFingerprint: fingerprint,
    },
    { $set: { status: "CONSUMED", consumedAt: now } },
    { new: true, session }
  );
  if (!consumedAuthorization) {
    throw createPublicError("Prepaid authorization was already consumed", "prepaid_authorization_consumed", 409);
  }

  const balanceField = mode === "PREPAID_VALUE" ? "remainingAmountPaise" : "remainingQuantity";
  const consumedField = mode === "PREPAID_VALUE" ? "consumedAmountPaise" : "consumedQuantity";
  const deductValue = mode === "PREPAID_VALUE" ? deduction.amountPaise : deduction.quantity;
  const wallet = await PrepaidMembershipWallet.findOneAndUpdate(
    {
      _id: authorization.walletId,
      vendorId: billing.vendorId,
      customerId: billing.customerId,
      walletType: mode,
      status: "ACTIVE",
      activatesAt: { $lte: now },
      expiresAt: { $gt: now },
      [balanceField]: { $gte: deductValue },
    },
    {
      $inc: {
        [balanceField]: -deductValue,
        [consumedField]: deductValue,
        version: 1,
      },
    },
    { new: true, session }
  );
  if (!wallet || String(wallet.customerMembershipId) === "") {
    throw createPublicError("Insufficient or unavailable prepaid wallet balance", "prepaid_wallet_insufficient", 409);
  }
  if (Number(wallet[balanceField]) === 0) {
    const walletStatusUpdate = await PrepaidMembershipWallet.updateOne(
      { _id: wallet._id, status: "ACTIVE" },
      { $set: { status: "DEPLETED" } },
      { session }
    );
    const membershipStatusUpdate = await CustomerMembership.updateOne(
      {
        _id: wallet.customerMembershipId,
        vendorId: billing.vendorId,
        customerId: billing.customerId,
        membershipType: mode,
        status: "ACTIVE",
      },
      { $set: { status: "DEPLETED" } },
      { session }
    );
    if (walletStatusUpdate.modifiedCount !== 1 || membershipStatusUpdate.modifiedCount !== 1) {
      throw createPublicError(
        "Prepaid wallet depletion status could not be persisted safely",
        "prepaid_depletion_status_conflict",
        409
      );
    }
  }

  const ledger = await createRedemptionLedger({
    vendorId: billing.vendorId,
    customerId: billing.customerId,
    customerMembershipId: wallet.customerMembershipId,
    walletId: wallet._id,
    billingSessionId: billing._id,
    walletType: mode,
    eventType: "REDEMPTION",
    ...deduction,
    occurredAt: now,
    idempotencyKey: `redemption:${billing._id}`,
    audit: { authorizationId: authorization._id },
  }, session);

  return {
    walletType: mode,
    walletId: wallet._id,
    customerMembershipId: wallet.customerMembershipId,
    ...(mode === "PREPAID_VALUE"
      ? {
          authorizedAmountPaise: deduction.amountPaise,
          remainingAmountPaiseAfterRedemption: Number(wallet.remainingAmountPaise),
        }
      : {
          authorizedQuantity: deduction.quantity,
          remainingQuantityAfterRedemption: Number(wallet.remainingQuantity),
          eligibleItemSource: authorization.eligibleItemSource,
          eligibleItemId: authorization.eligibleItemId,
        }),
    operationalServiceValuePaise,
    freshCashCollectedPaise: 0,
    redemptionLedgerId: ledger._id,
    authorizationId: authorization._id,
  };
}

async function reversePrepaidSettlement({ bill, transaction, session, now = new Date() }) {
  requireTransactionSession(session);
  const snapshot = bill?.prepaidSettlementSnapshot || transaction?.prepaidSettlementSnapshot;
  if (!snapshot) return null;

  const sourceLedger = await PrepaidWalletLedger.findOne({
    _id: snapshot.redemptionLedgerId,
    vendorId: bill.vendorId,
    customerId: bill.customerId,
    walletId: snapshot.walletId,
    billingSessionId: bill._id,
    eventType: "REDEMPTION",
  }).session(session);
  if (!sourceLedger) {
    throw createPublicError("Original prepaid redemption ledger is missing", "prepaid_redemption_ledger_missing", 409);
  }

  const mode = snapshot.walletType;
  const restoreValue = mode === "PREPAID_VALUE"
    ? Number(snapshot.authorizedAmountPaise)
    : Number(snapshot.authorizedQuantity);
  const balanceField = mode === "PREPAID_VALUE" ? "remainingAmountPaise" : "remainingQuantity";
  const consumedField = mode === "PREPAID_VALUE" ? "consumedAmountPaise" : "consumedQuantity";
  if (!Number.isSafeInteger(restoreValue) || restoreValue < 1) {
    throw createPublicError("Stored prepaid settlement is invalid", "invalid_prepaid_settlement", 409);
  }

  const wallet = await PrepaidMembershipWallet.findOneAndUpdate(
    {
      _id: snapshot.walletId,
      vendorId: bill.vendorId,
      customerId: bill.customerId,
      walletType: mode,
      [consumedField]: { $gte: restoreValue },
    },
    {
      $inc: {
        [balanceField]: restoreValue,
        [consumedField]: -restoreValue,
        version: 1,
      },
    },
    { new: true, session }
  );
  if (!wallet) {
    throw createPublicError("Prepaid wallet could not be restored safely", "prepaid_wallet_reversal_failed", 409);
  }

  const expired = new Date(wallet.expiresAt) <= now;
  const restoredStatus = expired
    ? "EXPIRED"
    : wallet.status === "CANCELLED"
      ? "CANCELLED"
      : "ACTIVE";
  await PrepaidMembershipWallet.updateOne(
    { _id: wallet._id },
    { $set: { status: restoredStatus } },
    { session }
  );
  if (wallet.status === "DEPLETED" && ["ACTIVE", "EXPIRED"].includes(restoredStatus)) {
    const membershipUpdate = await CustomerMembership.updateOne(
      {
        _id: snapshot.customerMembershipId,
        vendorId: bill.vendorId,
        customerId: bill.customerId,
        membershipType: mode,
        status: "DEPLETED",
      },
      { $set: { status: restoredStatus } },
      { session }
    );
    if (membershipUpdate.modifiedCount !== 1) {
      throw createPublicError(
        "Prepaid membership could not be restored safely",
        "prepaid_membership_reversal_conflict",
        409
      );
    }
  }

  const [reversal] = await PrepaidWalletLedger.create([{
    vendorId: bill.vendorId,
    customerId: bill.customerId,
    customerMembershipId: snapshot.customerMembershipId,
    walletId: snapshot.walletId,
    billingSessionId: bill._id,
    sourceLedgerId: sourceLedger._id,
    walletType: mode,
    eventType: "CANCELLATION_REVERSAL",
    ...(mode === "PREPAID_VALUE" ? { amountPaise: restoreValue } : { quantity: restoreValue }),
    occurredAt: now,
    idempotencyKey: `cancellation-reversal:${bill._id}`,
  }], { session });
  return reversal;
}

module.exports = {
  PREPAID_PAYMENT_MODES,
  assertNoPrepaidDiscountsOrRewards,
  assertPrepaidRequestContract,
  consumePrepaidAuthorization,
  isPrepaidPaymentMode,
  persistInitialPrepaidSettlementSnapshot,
  requireTransactionSession,
  reversePrepaidSettlement,
};
