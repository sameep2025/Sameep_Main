const axios = require("axios");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const BillingSession = require("../models/BillingSession");
const Transaction = require("../models/Transaction");
const VendorLoyaltyRule = require("../models/VendorLoyaltyRule");
const LoyaltyLedger = require("../models/LoyaltyLedger");
const Customer = require("../models/Customer");
const CustomerRewardReveal = require("../models/CustomerRewardReveal");
const Vendor = require("../models/DummyVendor");
const {
  calculateCustomerBalance,
  calculateRewardBalance,
  findConsumableRewardBuckets,
  getRewardCreditCap,
  getRewardCreditRemaining,
} = require("../services/loyaltyService");
const {
  deductOTP,
  hasAvailableOTPBalance,
  hasAvailableWhatsAppBalance,
} = require("../services/vendorWalletService");
const {
  isProviderDecisionPendingMetaReadiness,
  resolveBillingWhatsappProvider,
} = require("../services/whatsappBillingRouter");
const {
  isSendWhatsAppBillEnabled,
} = require("../services/vendorBillingPreferences");
const {
  sendCompletedBillWhatsApp,
} = require("../services/billingWhatsappSender");
const {
  buildPublicBillPath,
  buildPublicBillUrl,
  createBillAccessToken,
  findBillingIdByCode,
  verifyBillAccessToken,
} = require("../utils/billLink");

const JWT_SECRET = process.env.JWT_SECRET || "dev_jwt_secret_change_me";
const CANCEL_BILL_OTP_SCOPE = "CANCEL_BILL";
const CANCEL_BILL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const CANCELLATION_REASONS = new Set([
  "DUPLICATE_BILL",
  "WRONG_CUSTOMER",
  "WRONG_AMOUNT",
  "WRONG_SERVICES",
  "PAYMENT_CANCELLED",
  "OTHER",
]);

function parseOptionalMoney(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return null;
  }

  return number;
}

function getCartRoundingTolerance(cartItems = []) {
  const totalQuantity = cartItems.reduce((sum, item) => {
    return sum + Math.max(Number(item?.qty) || 0, 0);
  }, 0);

  return Math.max(1, totalQuantity);
}

function normalizeBillingPaymentMode(value) {
  if (value === undefined || value === null || value === "") {
    return "ONLINE";
  }

  if (typeof value !== "string") {
    return null;
  }

  return ["ONLINE", "CASH"].includes(value) ? value : null;
}

function normalizeRedeemPoints(value) {
  const points = Number(value || 0);
  if (!Number.isFinite(points) || points <= 0) return 0;
  return points;
}

function normalizeCancellationReason(value) {
  const reason = String(value || "").trim().toUpperCase();
  return CANCELLATION_REASONS.has(reason) ? reason : "";
}

function normalizeCancellationNote(value) {
  return String(value || "").trim().slice(0, 500);
}

function normalizeOtpMobile(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return digits;
}

function isMsg91OtpVerifySuccess(response) {
  return response?.data?.type === "success";
}

function getEffectiveCompletedAt(bill, transaction = null) {
  const candidates = [
    bill?.completedAt,
    transaction?.createdAt,
    bill?.createdAt,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const date = new Date(candidate);
    if (!Number.isNaN(date.getTime())) return date;
  }

  return null;
}

function getCancellationDeadline(effectiveCompletedAt) {
  if (!effectiveCompletedAt) return null;
  return new Date(effectiveCompletedAt.getTime() + CANCEL_BILL_WINDOW_MS);
}

function isBillWithinCancellationWindow(effectiveCompletedAt, now = new Date()) {
  const deadline = getCancellationDeadline(effectiveCompletedAt);
  return Boolean(deadline && now <= deadline);
}

function isCancellableTransactionStatus(transaction) {
  return transaction?.status === "COMPLETED" || transaction?.status == null;
}

function buildCancellableTransactionStatusMatch() {
  return {
    $or: [
      { status: "COMPLETED" },
      { status: null },
    ],
  };
}

function buildCancelOtpAttemptToken({
  vendorId,
  billingSessionId,
  customerId,
  mobile,
  reason,
  note,
}) {
  const jti = crypto.randomUUID();
  return jwt.sign(
    {
      scope: CANCEL_BILL_OTP_SCOPE,
      vendorId: String(vendorId || ""),
      billingSessionId: String(billingSessionId || ""),
      customerId: String(customerId || ""),
      mobile: String(mobile || ""),
      reason: String(reason || ""),
      note: String(note || ""),
      jti,
    },
    JWT_SECRET,
    { expiresIn: "10m" }
  );
}

function verifyCancelOtpAttemptToken({
  token,
  vendorId,
  billingSessionId,
  customerId,
  mobile,
  reason,
  note,
}) {
  const decoded = jwt.verify(String(token || ""), JWT_SECRET);

  if (
    decoded?.scope !== CANCEL_BILL_OTP_SCOPE ||
    String(decoded.vendorId || "") !== String(vendorId || "") ||
    String(decoded.billingSessionId || "") !== String(billingSessionId || "") ||
    String(decoded.customerId || "") !== String(customerId || "") ||
    String(decoded.mobile || "") !== String(mobile || "") ||
    String(decoded.reason || "") !== String(reason || "") ||
    String(decoded.note || "") !== String(note || "") ||
    !decoded.jti
  ) {
    const error = new Error("Invalid cancellation OTP attempt");
    error.code = "invalid_cancel_otp_attempt";
    throw error;
  }

  return decoded;
}

function getCancellationActorId(req) {
  const candidate =
    req.vendorWriteAuth?.customerId ||
    req.vendorWriteAuth?.admin?._id ||
    req.vendorWriteAuth?.admin?.id ||
    null;

  return mongoose.Types.ObjectId.isValid(candidate) ? new mongoose.Types.ObjectId(candidate) : null;
}

function isDuplicateCompletionError(error) {
  return (
    error?.code === 11000 ||
    error?.code === 112 ||
    error?.message?.includes("Billing already completed or locked")
  );
}

async function runBillingCompletionAtomically(work) {
  if (mongoose.connection.readyState !== 1) {
    return work(null);
  }

  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function findBillingSessionById(billingId, session) {
  const query = BillingSession.findById(billingId);
  return session ? query.session(session) : query;
}

async function findCustomerById(customerId, session) {
  if (!customerId) return null;
  const query = Customer.findById(customerId);
  if (session) query.session(session);
  return query.lean();
}

async function findLoyaltyRule(vendorId, session) {
  const query = VendorLoyaltyRule.findOne({
    vendorId,
    isEnabled: true,
  });

  return session ? query.session(session) : query;
}

async function findTransactionByBillingId(billingSessionId, session) {
  const query = Transaction.findOne({ billingSessionId });
  return session ? query.session(session) : query;
}

async function resolveCancellationBillContext({ billingSessionId, authorizedVendorId }) {
  if (!mongoose.Types.ObjectId.isValid(billingSessionId)) {
    const error = new Error("Invalid bill ID");
    error.statusCode = 400;
    error.publicMessage = "Invalid bill ID";
    throw error;
  }

  const bill = await BillingSession.findById(billingSessionId).lean();
  if (!bill) {
    const error = new Error("Bill not found");
    error.statusCode = 404;
    error.publicMessage = "Bill not found";
    throw error;
  }

  if (String(bill.vendorId || "") !== String(authorizedVendorId || "")) {
    const error = new Error("Bill does not belong to this vendor");
    error.statusCode = 403;
    error.publicMessage = "Bill does not belong to this vendor";
    throw error;
  }

  if (bill.status !== "COMPLETED") {
    const error = new Error("Only completed bills can be cancelled");
    error.statusCode = bill.status === "CANCELLED" ? 409 : 400;
    error.publicMessage =
      bill.status === "CANCELLED"
        ? "Bill is already cancelled"
        : "Only completed bills can be cancelled";
    throw error;
  }

  if (!bill.customerId) {
    const error = new Error("Walk-in bills cannot be cancelled with customer OTP");
    error.statusCode = 400;
    error.publicMessage = "Customer OTP is required, but this bill has no customer.";
    throw error;
  }

  const [transaction, customer] = await Promise.all([
    Transaction.findOne({ billingSessionId: bill._id }).lean(),
    Customer.findById(bill.customerId).lean(),
  ]);

  if (!transaction) {
    const error = new Error("Bill transaction not found");
    error.statusCode = 409;
    error.publicMessage = "This bill cannot be cancelled safely because its transaction is missing.";
    throw error;
  }

  if (!isCancellableTransactionStatus(transaction)) {
    const error = new Error("Only completed transactions can be cancelled");
    error.statusCode = 409;
    error.publicMessage = "This bill transaction is not cancellable.";
    throw error;
  }

  if (!customer) {
    const error = new Error("Customer not found");
    error.statusCode = 400;
    error.publicMessage = "Customer not found for this bill.";
    throw error;
  }

  const mobile = normalizeOtpMobile(
    bill.customerPhoneSnapshot ||
    customer.fullNumber ||
    customer.phone ||
    ""
  );

  if (!mobile || mobile.length < 10) {
    const error = new Error("Original bill customer phone not found");
    error.statusCode = 400;
    error.publicMessage = "Original bill customer phone could not be found.";
    throw error;
  }

  const effectiveCompletedAt = getEffectiveCompletedAt(bill, transaction);
  if (!isBillWithinCancellationWindow(effectiveCompletedAt)) {
    const error = new Error("Cancellation period expired");
    error.statusCode = 400;
    error.publicMessage = "Cancellation period expired";
    throw error;
  }

  return {
    bill,
    transaction,
    customer,
    mobile,
    effectiveCompletedAt,
    cancellationDeadline: getCancellationDeadline(effectiveCompletedAt),
  };
}

async function hasCustomerLinkedBillLoyaltyActivity({ bill, transaction }) {
  if (!bill?._id) return true;

  const filters = [{ billingSessionId: bill._id }];
  if (transaction?._id) {
    filters.push({ transactionId: transaction._id });
  }

  const ledger = await LoyaltyLedger.exists({
    $or: filters,
    type: { $in: ["EARN", "REDEEM", "EARN_REVERSAL", "REDEEM_REVERSAL"] },
    customerId: { $ne: null },
  });

  return Boolean(ledger);
}

async function resolvePhoneLessWalkInCancellationContext({ billingSessionId, authorizedVendorId }) {
  if (!mongoose.Types.ObjectId.isValid(billingSessionId)) {
    const error = new Error("Invalid bill ID");
    error.statusCode = 400;
    error.publicMessage = "Invalid bill ID";
    throw error;
  }

  const bill = await BillingSession.findById(billingSessionId).lean();
  if (!bill) {
    const error = new Error("Bill not found");
    error.statusCode = 404;
    error.publicMessage = "Bill not found";
    throw error;
  }

  if (String(bill.vendorId || "") !== String(authorizedVendorId || "")) {
    const error = new Error("Bill does not belong to this vendor");
    error.statusCode = 403;
    error.publicMessage = "Bill does not belong to this vendor";
    throw error;
  }

  if (bill.status !== "COMPLETED") {
    const error = new Error("Only completed bills can be cancelled");
    error.statusCode = bill.status === "CANCELLED" ? 409 : 400;
    error.publicMessage =
      bill.status === "CANCELLED"
        ? "Bill is already cancelled"
        : "Only completed bills can be cancelled";
    throw error;
  }

  if (bill.billingMode !== "WALK_IN") {
    const error = new Error("Bill is not a verified walk-in bill");
    error.statusCode = 400;
    error.publicMessage = "This bill cannot be cancelled without customer OTP.";
    throw error;
  }

  if (bill.customerId || String(bill.customerPhoneSnapshot || "").trim()) {
    const error = new Error("Customer-linked bill requires OTP cancellation");
    error.statusCode = 400;
    error.publicMessage = "Customer-linked bills require customer OTP cancellation.";
    throw error;
  }

  const transaction = await Transaction.findOne({ billingSessionId: bill._id }).lean();
  if (!transaction) {
    const error = new Error("Bill transaction not found");
    error.statusCode = 409;
    error.publicMessage = "This bill cannot be cancelled safely because its transaction is missing.";
    throw error;
  }

  if (!isCancellableTransactionStatus(transaction)) {
    const error = new Error("Only completed transactions can be cancelled");
    error.statusCode = 409;
    error.publicMessage = "This bill transaction is not cancellable.";
    throw error;
  }

  if (transaction.customerId || Number(transaction.redeemedPoints || 0) > 0 || Number(transaction.redeemValue || 0) > 0) {
    const error = new Error("Transaction is customer-linked");
    error.statusCode = 400;
    error.publicMessage = "Customer-linked bills require customer OTP cancellation.";
    throw error;
  }

  if (Number(bill.pointsRedeemed || 0) > 0 || Number(bill.pointsEarned || 0) > 0) {
    const error = new Error("Bill has customer loyalty activity");
    error.statusCode = 400;
    error.publicMessage = "Bills with loyalty activity require customer OTP cancellation.";
    throw error;
  }

  if (await hasCustomerLinkedBillLoyaltyActivity({ bill, transaction })) {
    const error = new Error("Bill has customer-linked loyalty ledger activity");
    error.statusCode = 400;
    error.publicMessage = "Bills with loyalty activity require customer OTP cancellation.";
    throw error;
  }

  const effectiveCompletedAt = getEffectiveCompletedAt(bill, transaction);
  if (!isBillWithinCancellationWindow(effectiveCompletedAt)) {
    const error = new Error("Cancellation period expired");
    error.statusCode = 400;
    error.publicMessage = "Cancellation period expired";
    throw error;
  }

  return {
    bill,
    transaction,
    effectiveCompletedAt,
    cancellationDeadline: getCancellationDeadline(effectiveCompletedAt),
  };
}

async function createTransaction(payload, session) {
  if (!session) {
    return Transaction.create(payload);
  }

  const [transaction] = await Transaction.create([payload], { session });
  return transaction;
}

async function createLoyaltyLedger(payload, session) {
  if (!session) {
    return LoyaltyLedger.create(payload);
  }

  const [ledger] = await LoyaltyLedger.create([payload], { session });
  return ledger;
}

async function createCancellationLedger(payload, session) {
  return createLoyaltyLedger(payload, session);
}

async function restoreRewardCreditBucket({ creditLedgerId, points, session }) {
  const restorePoints = Number(points || 0);
  if (!creditLedgerId || !Number.isFinite(restorePoints) || restorePoints <= 0) return null;

  const query = LoyaltyLedger.findOne({
    _id: creditLedgerId,
    type: { $in: ["EARN", "REDEEM_REVERSAL"] },
  });
  if (session) query.session(session);

  const credit = await query;
  if (!credit) return null;

  const currentRemaining = getRewardCreditRemaining(credit);
  const cap = getRewardCreditCap(credit);
  credit.remainingPoints = Math.min(currentRemaining + restorePoints, cap);
  await credit.save(session ? { session } : undefined);

  return credit;
}

async function applyRewardCancellationEffects({
  bill,
  transaction,
  reason,
  note,
  cancellationKey,
  cancelledAt,
  legacyRestorationExpiryDate,
  session,
}) {
  if (!bill?.customerId || !transaction?._id) return;

  const ledgerRows = await LoyaltyLedger.find({
    transactionId: transaction._id,
    type: { $in: ["EARN", "REDEEM"] },
  }).session(session);

  const earnedLedgerIds = [];

  for (const ledger of ledgerRows) {
    const points = Number(ledger.points || 0);

    if (ledger.type === "EARN" && points > 0) {
      earnedLedgerIds.push(ledger._id);
      await createCancellationLedger({
        type: "EARN_REVERSAL",
        vendorId: bill.vendorId,
        customerId: bill.customerId,
        transactionId: transaction._id,
        billingSessionId: bill._id,
        sourceLedgerId: ledger._id,
        points: -Math.abs(points),
        remainingPoints: null,
        expiryDate: ledger.expiryDate || null,
        cancellationReason: reason,
        cancellationNote: note,
        cancellationIdempotencyKey: cancellationKey,
        metadata: {
          purpose: "BILL_CANCELLATION",
          cancelledAt,
        },
      }, session);
      continue;
    }

    if (ledger.type === "REDEEM" && points < 0) {
      const restoredPoints = Math.abs(points);
      const allocations = Array.isArray(ledger.redemptionAllocations)
        ? ledger.redemptionAllocations
            .map((allocation) => ({
              earnLedgerId: allocation.earnLedgerId,
              points: Number(allocation.points || 0),
            }))
            .filter((allocation) => allocation.earnLedgerId && allocation.points > 0)
        : [];

      if (allocations.length) {
        for (const allocation of allocations) {
          await restoreRewardCreditBucket({
            creditLedgerId: allocation.earnLedgerId,
            points: allocation.points,
            session,
          });
        }
      }

      await createCancellationLedger({
        type: "REDEEM_REVERSAL",
        vendorId: bill.vendorId,
        customerId: bill.customerId,
        transactionId: transaction._id,
        billingSessionId: bill._id,
        sourceLedgerId: ledger._id,
        points: restoredPoints,
        remainingPoints: allocations.length ? null : restoredPoints,
        expiryDate: allocations.length ? null : legacyRestorationExpiryDate || null,
        cancellationReason: reason,
        cancellationNote: note,
        cancellationIdempotencyKey: cancellationKey,
        metadata: {
          purpose: "BILL_CANCELLATION",
          cancelledAt,
          legacyNoAllocationRestoration: allocations.length === 0,
          restoredAllocations: allocations.map((allocation) => ({
            earnLedgerId: allocation.earnLedgerId,
            points: allocation.points,
          })),
        },
      }, session);
    }
  }

  if (earnedLedgerIds.length) {
    await CustomerRewardReveal.updateMany(
      {
        customerId: bill.customerId,
        rewardLedgerId: { $in: earnedLedgerIds },
        invalidatedAt: null,
      },
      {
        $set: {
          invalidatedAt: cancelledAt,
          invalidatedReason: "BILL_CANCELLED",
          invalidatedByBillingSessionId: bill._id,
        },
      },
      { session }
    );
  }
}

async function cancelCompletedBillAtomically({
  billingSessionId,
  vendorId,
  actorId,
  reason,
  note,
  mobile,
  otpVerifiedAt,
  cancellationKey,
  authorizationMethod = "OTP",
}) {
  return runBillingCompletionAtomically(async (session) => {
    const bill = await findBillingSessionById(billingSessionId, session);

    if (!bill || String(bill.vendorId || "") !== String(vendorId || "")) {
      const error = new Error("Bill not found");
      error.statusCode = 404;
      error.publicMessage = "Bill not found";
      throw error;
    }

    const transaction = await findTransactionByBillingId(bill._id, session);
    if (!transaction) {
      const error = new Error("Bill transaction not found");
      error.statusCode = 409;
      error.publicMessage = "This bill cannot be cancelled safely because its transaction is missing.";
      throw error;
    }

    if (bill.status === "CANCELLED") {
      return { alreadyCancelled: true, bill, transaction };
    }

    if (bill.status !== "COMPLETED" || !isCancellableTransactionStatus(transaction)) {
      const error = new Error("Bill is not cancellable");
      error.statusCode = 409;
      error.publicMessage = "Bill is not cancellable";
      throw error;
    }

    const effectiveCompletedAt = getEffectiveCompletedAt(bill, transaction);
    const cancellationDeadline = getCancellationDeadline(effectiveCompletedAt);
    if (!isBillWithinCancellationWindow(effectiveCompletedAt)) {
      const error = new Error("Cancellation period expired");
      error.statusCode = 400;
      error.publicMessage = "Cancellation period expired";
      throw error;
    }

    const cancelledAt = new Date();
    const isOtpCancellation = authorizationMethod === "OTP";
    const closed = await BillingSession.findOneAndUpdate(
      { _id: bill._id, status: "COMPLETED" },
      {
        $set: {
          status: "CANCELLED",
          cancelledAt,
          cancelledBy: actorId,
          cancellationReason: reason,
          cancellationNote: note,
          cancellationOtpPhoneSnapshot: isOtpCancellation ? mobile : "",
          cancellationOtpVerifiedAt: isOtpCancellation ? otpVerifiedAt : null,
          cancellationAuthorizationMethod: authorizationMethod,
          cancellationIdempotencyKey: cancellationKey,
        },
      },
      { new: true, session }
    );

    if (!closed) {
      return { alreadyCancelled: true, bill, transaction };
    }

    const transactionUpdate = await Transaction.updateOne(
      { _id: transaction._id, ...buildCancellableTransactionStatusMatch() },
      {
        $set: {
          status: "CANCELLED",
          cancelledAt,
          cancelledBy: actorId,
          cancellationReason: reason,
          cancellationNote: note,
          cancellationAuthorizationMethod: authorizationMethod,
        },
      },
      { session }
    );

    if (transactionUpdate.modifiedCount !== 1) {
      const error = new Error("Unable to cancel bill transaction");
      error.statusCode = 409;
      error.publicMessage = "Unable to cancel bill safely. Please refresh and try again.";
      throw error;
    }

    await applyRewardCancellationEffects({
      bill,
      transaction,
      reason,
      note,
      cancellationKey,
      cancelledAt,
      legacyRestorationExpiryDate: cancellationDeadline,
      session,
    });

    return {
      alreadyCancelled: false,
      bill: closed,
      transaction,
    };
  });
}

async function buildPublicBillResponse(bill) {
  const [customer, vendor] = await Promise.all([
    bill.customerId ? Customer.findById(bill.customerId).lean() : null,
    Vendor.findById(bill.vendorId).lean(),
  ]);
  const previewRoot =
    process.env.VENDOR_PREVIEW_ROOT_URL ||
    process.env.NEXT_PUBLIC_VENDOR_PREVIEW_ROOT_URL ||
    process.env.REACT_APP_VENDOR_PREVIEW_ROOT_URL ||
    process.env.PUBLIC_VENDOR_SITE_ROOT_URL ||
    process.env.NEXT_PUBLIC_HARISH_PREVIEW_BASE_URL ||
    process.env.PREVIEW_BASE_URL ||
    process.env.REACT_APP_PREVIEW_BASE_URL ||
    process.env.NEXT_PUBLIC_PREVIEW_BASE_URL ||
    "";

  const websiteFromSocial = String(vendor?.socialLinks?.website || "").trim();
  let websiteUrl = "";

  if (!websiteUrl && vendor?.subdomain && previewRoot) {
    try {
      websiteUrl = String(previewRoot)
        .trim()
        .replace(/\/$/, "")
        .replace("://", `://${String(vendor.subdomain).trim().toLowerCase()}.`);
    } catch (err) {
      websiteUrl = "";
    }
  }

  if (!websiteUrl) {
    websiteUrl = websiteFromSocial;
  }

  let balance = 0;
  if (bill.customerId) {
    try {
      balance = await calculateCustomerBalance(bill.customerId, bill.vendorId);
    } catch (err) {
      balance = 0;
    }
  }

  const items = Array.isArray(bill.cartItems) ? bill.cartItems : [];

  return {
    billId: String(bill._id),
    createdAt: bill.createdAt,
    billingMode: bill.billingMode,
    status: bill.status,
    vendor: vendor
      ? {
          id: String(vendor._id),
          businessName: vendor.businessName || "Vendor",
          phone: vendor.phone || "",
          secondaryPhones: Array.isArray(vendor.secondaryPhones) ? vendor.secondaryPhones : [],
          logoUrl: vendor.logoUrl || "",
          address: vendor.location?.address || "",
          websiteUrl,
        }
      : null,
    customer: customer
      ? {
          id: String(customer._id),
          name: customer.name || "Customer",
          phone: customer.phone || customer.fullNumber || "",
        }
      : null,
    items: items.map((item) => ({
      itemId: item.itemId ? String(item.itemId) : "",
      name: item.name || "Item",
      qty: Number(item.qty || 0),
      price: Number(item.price || 0),
      total: Number(item.total || 0),
      resourceName: item.resourceName || "",
      hierarchy: Array.isArray(item.nodePath)
        ? item.nodePath.filter(Boolean).join(" / ")
        : "",
    })),
    totals: {
      billAmount: Number(bill.totalAmount || 0),
      pointsEarned: Number(bill.pointsEarned || 0),
      pointsRedeemed: Number(bill.pointsRedeemed || 0),
      finalPaid: Number(bill.totalAmount || 0) - Number(bill.pointsRedeemed || 0),
      balance: Number(balance || 0),
    },
  };
}

function toSafeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function buildHistoricalBillFinancials(bill = {}, transaction = null) {
  const netBillValue = toSafeNumber(bill.totalAmount);
  const billValue = Number.isFinite(Number(bill.grossAmount))
    ? toSafeNumber(bill.grossAmount)
    : netBillValue;
  const discountAmount = Number.isFinite(Number(bill.discountAmount))
    ? toSafeNumber(bill.discountAmount)
    : 0;
  const rewardsRedeemed = transaction
    ? toSafeNumber(transaction.redeemValue)
    : toSafeNumber(bill.pointsRedeemed);
  const netCollected = transaction
    ? toSafeNumber(transaction.finalPaidAmount)
    : Math.max(netBillValue - rewardsRedeemed, 0);

  return {
    billValue,
    grossAmount: billValue,
    discountAmount,
    rewardsRedeemed,
    netCollected: Math.max(netCollected, 0),
    netBillValue,
  };
}

async function buildVendorHistoricalBillResponse(bill) {
  const [transaction, customer, vendor] = await Promise.all([
    Transaction.findOne({ billingSessionId: bill._id }).lean(),
    bill.customerId ? Customer.findById(bill.customerId).lean() : null,
    Vendor.findById(bill.vendorId).lean(),
  ]);
  const financials = buildHistoricalBillFinancials(bill, transaction);
  const effectiveCompletedAt = getEffectiveCompletedAt(bill, transaction);
  const cancellationDeadline = getCancellationDeadline(effectiveCompletedAt);
  const customerPhone = String(
    bill.customerPhoneSnapshot ||
    customer?.fullNumber ||
    customer?.phone ||
    ""
  ).trim();

  return {
    billId: String(bill._id),
    billingSessionId: String(bill._id),
    status: bill.status,
    createdAt: bill.createdAt || null,
    completedAt: effectiveCompletedAt || bill.completedAt || bill.createdAt || null,
    cancellation: {
      reason: bill.cancellationReason || "",
      note: bill.cancellationNote || "",
      cancelledAt: bill.cancelledAt || null,
      canCancel: bill.status === "COMPLETED" && isBillWithinCancellationWindow(effectiveCompletedAt),
      cancellationDeadline,
      authorizationMethod: bill.cancellationAuthorizationMethod || "",
    },
    billingMode: bill.billingMode,
    vendor: {
      id: String(bill.vendorId || ""),
      businessName: vendor?.businessName || "Vendor",
      phone: vendor?.phone || "",
      address: vendor?.location?.address || "",
      logoUrl: vendor?.logoUrl || "",
    },
    customer: {
      id: bill.customerId ? String(bill.customerId) : "",
      phone: customerPhone,
      label: customerPhone ? `+${customerPhone}` : "Walk-in",
    },
    items: (bill.cartItems || []).map((item) => ({
      itemId: item.itemId ? String(item.itemId) : "",
      name: item.name || "Item",
      qty: toSafeNumber(item.qty),
      price: toSafeNumber(item.price),
      total: toSafeNumber(item.total),
      resourceName: item.resourceName || "",
      nodePath: Array.isArray(item.nodePath) ? item.nodePath : [],
    })),
    totals: {
      ...financials,
      pointsEarned: toSafeNumber(bill.pointsEarned),
      pointsRedeemed: toSafeNumber(bill.pointsRedeemed),
    },
    paymentMode: ["ONLINE", "CASH"].includes(bill.paymentMode || transaction?.paymentMode)
      ? (bill.paymentMode || transaction?.paymentMode)
      : "",
  };
}

function buildVendorBillListItem({ bill, transaction = null, customerPhone = "" }) {
  const financials = buildHistoricalBillFinancials(bill, transaction);
  const effectiveCompletedAt = getEffectiveCompletedAt(bill, transaction);
  const canCancel =
    bill.status === "COMPLETED" &&
    isBillWithinCancellationWindow(effectiveCompletedAt) &&
    (!transaction || isCancellableTransactionStatus(transaction));

  return {
    billId: String(bill._id),
    billingSessionId: String(bill._id),
    status: bill.status,
    createdAt: bill.createdAt || null,
    completedAt: effectiveCompletedAt || bill.completedAt || bill.createdAt || null,
    billingMode: bill.billingMode || "",
    phone: customerPhone || "Walk-in",
    total: financials.netCollected,
    amount: financials.netCollected,
    totalAmount: financials.netCollected,
    earned: toSafeNumber(bill.pointsEarned),
    pointsEarned: toSafeNumber(bill.pointsEarned),
    redeemed: toSafeNumber(transaction?.redeemValue ?? bill.pointsRedeemed),
    canCancel,
    cancellationMethod:
      bill.billingMode === "WALK_IN" && !bill.customerId && !String(bill.customerPhoneSnapshot || "").trim()
        ? "VENDOR_CONFIRM"
        : "OTP",
    requiresOtp:
      !(bill.billingMode === "WALK_IN" && !bill.customerId && !String(bill.customerPhoneSnapshot || "").trim()),
    cancellationDeadline: getCancellationDeadline(effectiveCompletedAt),
    cancellationReason: bill.cancellationReason || "",
    cancellationNote: bill.cancellationNote || "",
    cancelledAt: bill.cancelledAt || null,
    paymentMode: ["ONLINE", "CASH"].includes(bill.paymentMode || transaction?.paymentMode)
      ? (bill.paymentMode || transaction?.paymentMode)
      : "",
    items: (bill.cartItems || []).map((item) => ({
      itemId: item.itemId ? String(item.itemId) : "",
      name: item.name || "Item",
      qty: toSafeNumber(item.qty),
      price: toSafeNumber(item.price),
      total: toSafeNumber(item.total),
      resourceName: item.resourceName || "",
      nodePath: Array.isArray(item.nodePath) ? item.nodePath : [],
    })),
  };
}

async function buildWhatsAppCompletionStatus(billing) {
  if (!billing?.customerId) return null;

  const vendor = await Vendor.findById(billing.vendorId)
    .select("billingPreferences whatsappBusiness")
    .lean();
  if (!isSendWhatsAppBillEnabled(vendor)) {
    return {
      provider: "disabled",
      sendExpected: false,
      reason: "vendor_disabled",
    };
  }

  const decision = resolveBillingWhatsappProvider({ vendor });
  if (decision.provider !== "ynot_msg91") return null;
  if (isProviderDecisionPendingMetaReadiness({ vendor, decision })) return null;

  const hasMsg91Balance = await hasAvailableWhatsAppBalance(billing.vendorId);
  if (hasMsg91Balance) return null;

  return {
    provider: "ynot_msg91",
    sendExpected: false,
    reason: "insufficient_balance",
  };
}


// ✅ Create Billing Session
exports.createBillingSession = async (req, res) => {
  try {
    const { vendorId, customerId } = req.body;

    if (!vendorId) {
      return res.status(400).json({
        success: false,
        message: "Vendor ID required",
      });
    }

    const billing = await BillingSession.create({
      vendorId,
      customerId: customerId || null,
      billingMode: customerId ? "LOYALTY" : "WALK_IN",
      cartItems: [],
      totalAmount: 0,
    });

    res.status(200).json({
      success: true,
      data: billing,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to create billing session" });
  }
};


// ✅ Update Cart
exports.updateBillingCart = async (req, res) => {
  try {
    const { billingId, cartItems, grossAmount, discountAmount } = req.body;

    let totalAmount = 0;

    cartItems.forEach((item) => {
      item.total = item.price * item.qty;
      totalAmount += item.total;
    });

    const hasFinancialSnapshot =
      grossAmount !== undefined || discountAmount !== undefined;
    const update = {
      cartItems,
      totalAmount,
    };

    if (hasFinancialSnapshot) {
      const sanitizedGrossAmount = parseOptionalMoney(grossAmount);
      const sanitizedDiscountAmount = parseOptionalMoney(discountAmount);

      if (sanitizedGrossAmount === null || sanitizedDiscountAmount === null) {
        return res.status(400).json({
          success: false,
          message: "Invalid billing financial snapshot",
        });
      }

      const expectedTotal = sanitizedGrossAmount - sanitizedDiscountAmount;
      const tolerance = getCartRoundingTolerance(cartItems);

      if (
        expectedTotal < 0 ||
        Math.abs(expectedTotal - totalAmount) > tolerance
      ) {
        return res.status(400).json({
          success: false,
          message: "Billing financial snapshot does not match cart total",
        });
      }

      update.grossAmount = sanitizedGrossAmount;
      update.discountAmount = sanitizedDiscountAmount;
    }

    const updated = await BillingSession.findByIdAndUpdate(
      billingId,
      update,
      { new: true }
    );

    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to update cart" });
  }
};


// ✅ Get Billing Session
exports.getBillingSession = async (req, res) => {
  try {
    const { id } = req.params;

    const billing = await BillingSession.findById(id);

    res.status(200).json({
      success: true,
      data: billing,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch billing session" });
  }
};

exports.getPublicBillDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const token = String(req.query.token || "").trim();

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Bill token required",
      });
    }

    let decoded;
    try {
      decoded = verifyBillAccessToken(token);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired bill link",
      });
    }

    if (decoded?.scope !== "bill_link" || String(decoded?.billingId || "") !== String(id)) {
      return res.status(403).json({
        success: false,
        message: "Bill link does not match this bill",
      });
    }

    const bill = await BillingSession.findById(id).lean();
    if (!bill || bill.status !== "COMPLETED") {
      return res.status(404).json({
        success: false,
        message: "Bill not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: await buildPublicBillResponse(bill),
    });
  } catch (err) {
    console.error("getPublicBillDetails error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to load bill details",
    });
  }
};

exports.getPublicBillDetailsByCode = async (req, res) => {
  try {
    const code = String(req.params.code || "").trim();

    if (!code) {
      return res.status(400).json({
        success: false,
        message: "Bill code required",
      });
    }

    const billingId = await findBillingIdByCode(code);
    if (!billingId) {
      return res.status(404).json({
        success: false,
        message: "Invalid or expired bill link",
      });
    }

    const bill = await BillingSession.findById(billingId).lean();
    if (!bill || bill.status !== "COMPLETED") {
      return res.status(404).json({
        success: false,
        message: "Bill not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: await buildPublicBillResponse(bill),
    });
  } catch (err) {
    console.error("getPublicBillDetailsByCode error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to load bill details",
    });
  }
};

exports.getVendorHistoricalBillDetails = async (req, res) => {
  try {
    const { billingSessionId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(billingSessionId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid bill ID",
      });
    }

    const bill = await BillingSession.findById(billingSessionId).lean();
    if (!bill || !["COMPLETED", "CANCELLED"].includes(bill.status)) {
      return res.status(404).json({
        success: false,
        message: "Historical bill not found",
      });
    }

    const authorizedVendorId = String(req.vendorWriteAuth?.vendorId || "");
    if (String(bill.vendorId || "") !== authorizedVendorId) {
      return res.status(403).json({
        success: false,
        message: "Bill does not belong to this vendor",
      });
    }

    return res.status(200).json({
      success: true,
      data: await buildVendorHistoricalBillResponse(bill),
    });
  } catch (err) {
    console.error("getVendorHistoricalBillDetails error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to load historical bill",
    });
  }
};

exports.getRecentPhoneLessWalkInBills = async (req, res) => {
  try {
    const authorizedVendorId = String(req.vendorWriteAuth?.vendorId || "");
    const limit = Math.min(Math.max(Number(req.query?.limit || 20) || 20, 1), 50);

    if (!mongoose.Types.ObjectId.isValid(authorizedVendorId)) {
      return res.status(400).json({
        success: false,
        message: "Vendor ID is required",
      });
    }

    const bills = await BillingSession.find({
      vendorId: authorizedVendorId,
      status: { $in: ["COMPLETED", "CANCELLED"] },
      billingMode: "WALK_IN",
      customerId: null,
      $or: [
        { customerPhoneSnapshot: "" },
        { customerPhoneSnapshot: null },
        { customerPhoneSnapshot: { $exists: false } },
      ],
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .lean();

    const billIds = bills.map((bill) => bill._id);
    const transactions = await Transaction.find({ billingSessionId: { $in: billIds } }).lean();
    const transactionByBillId = new Map(
      transactions.map((transaction) => [String(transaction.billingSessionId), transaction])
    );
    const billIdByTransactionId = new Map(
      transactions.map((transaction) => [String(transaction._id), String(transaction.billingSessionId)])
    );
    const transactionIds = transactions.map((transaction) => transaction._id);

    const customerLinkedLedgers = await LoyaltyLedger.find({
      $or: [
        { billingSessionId: { $in: billIds } },
        { transactionId: { $in: transactionIds } },
      ],
      type: { $in: ["EARN", "REDEEM", "EARN_REVERSAL", "REDEEM_REVERSAL"] },
      customerId: { $ne: null },
    })
      .select("billingSessionId transactionId")
      .lean();
    const loyaltyLinkedBillIds = new Set();
    customerLinkedLedgers.forEach((ledger) => {
      if (ledger.billingSessionId) {
        loyaltyLinkedBillIds.add(String(ledger.billingSessionId));
        return;
      }
      const billId = billIdByTransactionId.get(String(ledger.transactionId || ""));
      if (billId) loyaltyLinkedBillIds.add(billId);
    });

    const items = bills.map((bill) => {
      const transaction = transactionByBillId.get(String(bill._id)) || null;
      const item = buildVendorBillListItem({ bill, transaction });
      if (
        !transaction ||
        !isCancellableTransactionStatus(transaction) ||
        transaction.customerId ||
        loyaltyLinkedBillIds.has(String(bill._id)) ||
        Number(transaction.redeemedPoints || 0) > 0 ||
        Number(transaction.redeemValue || 0) > 0 ||
        Number(bill.pointsEarned || 0) > 0 ||
        Number(bill.pointsRedeemed || 0) > 0
      ) {
        return { ...item, canCancel: false };
      }
      return item;
    });

    const ambiguousCount = await BillingSession.countDocuments({
      vendorId: authorizedVendorId,
      status: "COMPLETED",
      customerId: null,
      $and: [
        {
          $or: [
            { billingMode: { $exists: false } },
            { billingMode: { $ne: "WALK_IN" } },
          ],
        },
        {
          $or: [
            { customerPhoneSnapshot: "" },
            { customerPhoneSnapshot: null },
            { customerPhoneSnapshot: { $exists: false } },
          ],
        },
      ],
    });

    return res.status(200).json({
      success: true,
      data: {
        bills: items,
        ambiguousCount,
      },
    });
  } catch (err) {
    console.error("getRecentPhoneLessWalkInBills error:", err?.message || err);
    return res.status(500).json({
      success: false,
      message: "Failed to load walk-in bills",
    });
  }
};

exports.resendHistoricalBillWhatsapp = async (req, res) => {
  try {
    const { billingSessionId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(billingSessionId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid bill ID",
      });
    }

    const bill = await BillingSession.findById(billingSessionId);
    if (!bill || bill.status !== "COMPLETED") {
      return res.status(404).json({
        success: false,
        message: "Completed bill not found",
      });
    }

    const authorizedVendorId = String(req.vendorWriteAuth?.vendorId || "");
    if (String(bill.vendorId || "") !== authorizedVendorId) {
      return res.status(403).json({
        success: false,
        message: "Bill does not belong to this vendor",
      });
    }

    const sendResult = await sendCompletedBillWhatsApp({
      billing: bill,
      referencePrefix: "billing-resend",
    });

    if (!sendResult.success) {
      return res.status(400).json({
        success: false,
        message: sendResult.message || "WhatsApp bill was not sent",
        reason: sendResult.reason || "",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Bill resent on WhatsApp",
      data: {
        provider: sendResult.provider,
        status: sendResult.status,
      },
    });
  } catch (err) {
    console.error("resendHistoricalBillWhatsapp error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to resend WhatsApp bill",
    });
  }
};

exports.requestCancelBillOtp = async (req, res) => {
  try {
    const { billingSessionId } = req.params;
    const reason = normalizeCancellationReason(req.body?.reason);
    const note = normalizeCancellationNote(req.body?.note);

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: "Cancellation reason is required",
      });
    }

    if (reason === "OTHER" && !note) {
      return res.status(400).json({
        success: false,
        message: "Cancellation note is required for Other",
      });
    }

    const context = await resolveCancellationBillContext({
      billingSessionId,
      authorizedVendorId: req.vendorWriteAuth?.vendorId,
    });

    if (!(await hasAvailableOTPBalance(context.bill.vendorId))) {
      return res.status(400).json({
        success: false,
        message: "Insufficient OTP balance. Please recharge OTP credits.",
      });
    }

    await axios.post(
      "https://control.msg91.com/api/v5/otp",
      {
        mobile: context.mobile,
        otp_length: 6,
        sender: process.env.MSG91_SENDER,
        template_id: "63e1e445d6fc0560d933a5e2",
      },
      {
        headers: {
          authkey: process.env.MSG91_AUTHKEY,
          "Content-Type": "application/json",
        },
      }
    );

    const cancelOtpAttemptToken = buildCancelOtpAttemptToken({
      vendorId: context.bill.vendorId,
      billingSessionId: context.bill._id,
      customerId: context.bill.customerId,
      mobile: context.mobile,
      reason,
      note,
    });

    return res.status(200).json({
      success: true,
      message: "Cancellation OTP sent to the original bill customer number",
      data: {
        cancelOtpAttemptToken,
        phoneMasked: context.mobile.replace(/.(?=.{4})/g, "•"),
        cancellationDeadline: context.cancellationDeadline,
      },
    });
  } catch (err) {
    if (err?.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.publicMessage || err.message,
      });
    }

    console.error("requestCancelBillOtp error:", err?.response?.data || err?.message || err);
    return res.status(500).json({
      success: false,
      message: "Failed to request cancellation OTP",
    });
  }
};

exports.cancelPhoneLessWalkInBillByVendor = async (req, res) => {
  try {
    const { billingSessionId } = req.params;
    const reason = normalizeCancellationReason(req.body?.reason);
    const note = normalizeCancellationNote(req.body?.note);

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: "Cancellation reason is required",
      });
    }

    if (reason === "OTHER" && !note) {
      return res.status(400).json({
        success: false,
        message: "Cancellation note is required for Other",
      });
    }

    const context = await resolvePhoneLessWalkInCancellationContext({
      billingSessionId,
      authorizedVendorId: req.vendorWriteAuth?.vendorId,
    });

    const result = await cancelCompletedBillAtomically({
      billingSessionId: context.bill._id,
      vendorId: context.bill.vendorId,
      actorId: getCancellationActorId(req),
      reason,
      note,
      mobile: "",
      otpVerifiedAt: null,
      cancellationKey: `vendor-confirm:${context.bill._id}:${crypto.randomUUID()}`,
      authorizationMethod: "VENDOR_CONFIRM",
    });

    return res.status(200).json({
      success: true,
      message: result.alreadyCancelled ? "Bill was already cancelled" : "Bill cancelled",
      data: {
        billId: String(context.bill._id),
        status: "CANCELLED",
        authorizationMethod: "VENDOR_CONFIRM",
      },
    });
  } catch (err) {
    if (err?.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.publicMessage || err.message,
      });
    }

    if (err?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Bill cancellation is already being processed. Please refresh.",
      });
    }

    console.error("cancelPhoneLessWalkInBillByVendor error:", err?.message || err);
    return res.status(500).json({
      success: false,
      message: "Failed to cancel walk-in bill",
    });
  }
};

exports.verifyCancelBillOtp = async (req, res) => {
  try {
    const { billingSessionId } = req.params;
    const otp = String(req.body?.otp || "").trim();
    const cancelOtpAttemptToken = String(req.body?.cancelOtpAttemptToken || "").trim();
    const reason = normalizeCancellationReason(req.body?.reason);
    const note = normalizeCancellationNote(req.body?.note);

    if (!otp || !cancelOtpAttemptToken) {
      return res.status(400).json({
        success: false,
        message: "OTP and cancellation session are required",
      });
    }

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: "Cancellation reason is required",
      });
    }

    if (reason === "OTHER" && !note) {
      return res.status(400).json({
        success: false,
        message: "Cancellation note is required for Other",
      });
    }

    const context = await resolveCancellationBillContext({
      billingSessionId,
      authorizedVendorId: req.vendorWriteAuth?.vendorId,
    });

    let attempt;
    try {
      attempt = verifyCancelOtpAttemptToken({
        token: cancelOtpAttemptToken,
        vendorId: context.bill.vendorId,
        billingSessionId: context.bill._id,
        customerId: context.bill.customerId,
        mobile: context.mobile,
        reason,
        note,
      });
    } catch (attemptErr) {
      return res.status(400).json({
        success: false,
        message: "Cancellation OTP session expired. Please request a new OTP.",
      });
    }

    try {
      const verifyResp = await axios.post(
        "https://control.msg91.com/api/v5/otp/verify",
        {
          mobile: context.mobile,
          otp,
        },
        {
          headers: {
            authkey: process.env.MSG91_AUTHKEY,
            "Content-Type": "application/json",
          },
        }
      );

      if (!isMsg91OtpVerifySuccess(verifyResp)) {
        return res.status(400).json({
          success: false,
          message: "Invalid OTP",
        });
      }
    } catch (verifyErr) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    try {
      await deductOTP(context.bill.vendorId, `billing-cancel:${attempt.jti}`);
    } catch (walletErr) {
      return res.status(400).json({
        success: false,
        message: "Insufficient OTP balance. Please recharge OTP credits.",
      });
    }

    const result = await cancelCompletedBillAtomically({
      billingSessionId: context.bill._id,
      vendorId: context.bill.vendorId,
      actorId: getCancellationActorId(req),
      reason,
      note,
      mobile: context.mobile,
      otpVerifiedAt: new Date(),
      cancellationKey: attempt.jti,
    });

    return res.status(200).json({
      success: true,
      message: result.alreadyCancelled ? "Bill was already cancelled" : "Bill cancelled",
      data: {
        billId: String(context.bill._id),
        status: "CANCELLED",
      },
    });
  } catch (err) {
    if (err?.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.publicMessage || err.message,
      });
    }

    if (err?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Bill cancellation is already being processed. Please refresh.",
      });
    }

    console.error("verifyCancelBillOtp error:", err?.response?.data || err?.message || err);
    return res.status(500).json({
      success: false,
      message: "Failed to cancel bill",
    });
  }
};


// 🔐 Request OTP for Loyalty Redemption (MSG91)
exports.requestRedeemOTP = async (req, res) => {
  try {
    const { billingId, redeemPoints } = req.body;

    const billing = await BillingSession.findById(billingId);

    if (!billing || billing.status !== "ACTIVE") {
      return res.status(400).json({
        success: false,
        message: "Invalid billing session",
      });
    }

    if (!billing.customerId) {
      return res.status(400).json({
        success: false,
        message: "Loyalty redemption requires customer",
      });
    }

    const customer = await Customer.findById(billing.customerId);
    const mobile = customer?.fullNumber;

    if (!mobile) {
      return res.status(400).json({
        success: false,
        message: "Customer mobile not found",
      });
    }

    if (!(await hasAvailableOTPBalance(billing.vendorId))) {
      return res.status(400).json({
        success: false,
        message: "Insufficient OTP balance. Please recharge OTP credits.",
      });
    }

    await axios.post(
      "https://control.msg91.com/api/v5/otp",
      {
        mobile,
        otp_length: 6,
        sender: process.env.MSG91_SENDER,
        template_id: "63e1e445d6fc0560d933a5e2",
      },
      {
        headers: {
          authkey: process.env.MSG91_AUTHKEY,
          "Content-Type": "application/json",
        },
      }
    );

    billing.pointsRedeemed = redeemPoints;
    billing.otpVerified = false;

    await billing.save();

    res.status(200).json({
      success: true,
      message: "OTP sent via MSG91",
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Failed to request OTP",
    });
  }
};


// 🔐 Verify OTP (MSG91)
exports.verifyRedeemOTP = async (req, res) => {
  try {
    const { billingId, otp } = req.body;

    const billing = await BillingSession.findById(billingId);

    if (!billing) {
      return res.status(404).json({
        success: false,
        message: "Billing not found",
      });
    }

    const customer = await Customer.findById(billing.customerId);
    const mobile = customer?.fullNumber;

    if (!mobile) {
      return res.status(400).json({
        success: false,
        message: "Customer mobile not found",
      });
    }

    try {
      const verifyResp = await axios.post(
        "https://control.msg91.com/api/v5/otp/verify",
        {
          mobile,
          otp,
        },
        {
          headers: {
            authkey: process.env.MSG91_AUTHKEY,
            "Content-Type": "application/json",
          },
        }
      );

      if (!isMsg91OtpVerifySuccess(verifyResp)) {
        return res.status(400).json({
          success: false,
          message: "Invalid OTP",
        });
      }
    } catch (verifyErr) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    if (!billing.otpVerified) {
      try {
        await deductOTP(billing.vendorId, `billing-redemption:${billing._id}`);
      } catch (walletErr) {
        return res.status(400).json({
          success: false,
          message: "Insufficient OTP balance. Please recharge OTP credits.",
        });
      }
    }

    billing.otpVerified = true;
    await billing.save();

    res.status(200).json({
      success: true,
      message: "OTP verified successfully",
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "OTP verification failed",
    });
  }
};


// ✅ Complete Billing WITH FIFO + OTP SAFETY
exports.completeBillingSession = async (req, res) => {
  try {
    const { billingId, paymentMode } = req.body;
    const normalizedPaymentMode = normalizeBillingPaymentMode(paymentMode);

    if (!normalizedPaymentMode) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment mode. Please choose Online or Cash.",
      });
    }

    const completionResult = await runBillingCompletionAtomically(async (session) => {
      const billing = await findBillingSessionById(billingId, session);

      if (!billing || billing.status !== "ACTIVE") {
        const error = new Error("Invalid billing session");
        error.statusCode = 400;
        error.publicMessage = "Invalid billing session";
        throw error;
      }

      const isWalkIn = !billing.customerId;

      // 🔐 OTP SAFETY CHECK
      if (!isWalkIn && billing.pointsRedeemed > 0 && !billing.otpVerified) {
        const error = new Error("OTP verification required before redemption");
        error.statusCode = 400;
        error.publicMessage = "OTP verification required before redemption";
        throw error;
      }

      const requestedRedeemPoints = normalizeRedeemPoints(billing.pointsRedeemed);
      const effectiveRedeemPoints = isWalkIn ? 0 : requestedRedeemPoints;
      let rewardCreditBucketsForRedemption = [];

      if (effectiveRedeemPoints > 0) {
        const now = new Date();

        const rewardBalance = await calculateRewardBalance({
          vendorId: billing.vendorId,
          customerId: billing.customerId,
          now,
          session,
        });

        if (rewardBalance.redeemableBalance < effectiveRedeemPoints) {
          const error = new Error("Insufficient reward points available. Please refresh and try again.");
          error.statusCode = 400;
          error.publicMessage = "Insufficient reward points available. Please refresh and try again.";
          throw error;
        }

        rewardCreditBucketsForRedemption = await findConsumableRewardBuckets({
          vendorId: billing.vendorId,
          customerId: billing.customerId,
          now,
          session,
        });
      }

      const finalPaidAmount = billing.totalAmount - effectiveRedeemPoints;
      let pointsEarned = Number(billing.pointsEarned || 0);
      let earnExpiryDate = null;
      const customerForSnapshot = isWalkIn
        ? null
        : await findCustomerById(billing.customerId, session);
      const customerPhoneSnapshot = String(
        customerForSnapshot?.fullNumber ||
        customerForSnapshot?.phone ||
        ""
      ).trim();

      // -------------------------
      // Earn Points
      // -------------------------
      let rule = null;
      if (!isWalkIn) {
        rule = await findLoyaltyRule(billing.vendorId, session);
      }

      if (!isWalkIn && rule) {
        const earnPercent = rule?.earn?.percentPer100 ?? 0;
        let calculatedEarnedPoints = 0;

        if (
          typeof finalPaidAmount === "number" &&
          finalPaidAmount > 0 &&
          typeof earnPercent === "number" &&
          earnPercent > 0
        ) {
          calculatedEarnedPoints = Math.floor((finalPaidAmount / 100) * earnPercent);
        }

        pointsEarned = Number.isFinite(calculatedEarnedPoints)
          ? calculatedEarnedPoints
          : 0;

        if (pointsEarned > 0 && rule?.expiry?.expiryDays) {
          earnExpiryDate = new Date();
          earnExpiryDate.setDate(
            earnExpiryDate.getDate() + rule.expiry.expiryDays
          );
        }
      }

      // 🔒 Atomic completion ownership. Side effects run only for the request
      // that wins this ACTIVE -> COMPLETED transition.
      const completedAt = new Date();
      const billingUpdate = {
        status: "COMPLETED",
        completedAt,
        paymentMode: normalizedPaymentMode,
        pointsEarned: isWalkIn ? 0 : pointsEarned,
        customerPhoneSnapshot: isWalkIn ? "" : customerPhoneSnapshot,
      };

      if (isWalkIn) {
        billingUpdate.pointsRedeemed = 0;
      }

      const closed = await BillingSession.findOneAndUpdate(
        { _id: billingId, status: "ACTIVE" },
        { $set: billingUpdate },
        { new: true, session }
      );

      if (!closed) {
        const error = new Error("Billing already completed or locked");
        error.statusCode = 400;
        error.publicMessage = "Billing already completed or locked";
        throw error;
      }

      billing.status = "COMPLETED";
      billing.completedAt = completedAt;
      billing.paymentMode = normalizedPaymentMode;
      billing.pointsEarned = billingUpdate.pointsEarned;
      billing.customerPhoneSnapshot = billingUpdate.customerPhoneSnapshot;
      if (isWalkIn) {
        billing.pointsRedeemed = 0;
      }

      // -------------------------
      // Create Transaction
      // -------------------------
      const transaction = await createTransaction({
        vendorId: billing.vendorId,
        customerId: billing.customerId || null,
        billingSessionId: billing._id,
        totalAmount: billing.totalAmount,
        grossAmount: billing.grossAmount,
        discountAmount: billing.discountAmount,
        redeemedPoints: effectiveRedeemPoints,
        redeemValue: effectiveRedeemPoints,
        finalPaidAmount,
        paymentMode: normalizedPaymentMode,
        paymentStatus: "OFFLINE_PAID",
        billingSource: "POS_OFFLINE",
        status: "COMPLETED",
      }, session);

      // -------------------------
      // FIFO Redemption
      // -------------------------
      let redeemLeft = effectiveRedeemPoints;
      const redemptionAllocations = [];

      if (redeemLeft > 0) {
        for (const rewardCredit of rewardCreditBucketsForRedemption) {
          if (redeemLeft <= 0) break;

          const availableInBucket = getRewardCreditRemaining(rewardCredit);
          if (availableInBucket <= 0) continue;

          const deduct = Math.min(availableInBucket, redeemLeft);

          rewardCredit.remainingPoints = availableInBucket - deduct;
          redeemLeft -= deduct;
          redemptionAllocations.push({
            earnLedgerId: rewardCredit._id,
            points: deduct,
          });

          await rewardCredit.save(session ? { session } : undefined);
        }

        if (redeemLeft > 0) {
          const error = new Error("Insufficient reward points available. Please refresh and try again.");
          error.statusCode = 400;
          error.publicMessage = "Insufficient reward points available. Please refresh and try again.";
          throw error;
        }

        await createLoyaltyLedger({
          type: "REDEEM",
          vendorId: billing.vendorId,
          customerId: billing.customerId,
          transactionId: transaction._id,
          billingSessionId: billing._id,
          points: -effectiveRedeemPoints,
          redemptionAllocations,
        }, session);
      }

      if (!isWalkIn && pointsEarned > 0) {
        await createLoyaltyLedger({
          type: "EARN",
          vendorId: billing.vendorId,
          customerId: billing.customerId,
          transactionId: transaction._id,
          billingSessionId: billing._id,
          points: pointsEarned,
          remainingPoints: pointsEarned,
          expiryDate: earnExpiryDate,
        }, session);
      }

      return {
        billing,
        closed,
        isWalkIn,
        transaction,
      };
    });

    const { billing, closed, isWalkIn, transaction } = completionResult;
    const whatsapp = await buildWhatsAppCompletionStatus(closed);

    setImmediate(async () => {
      try {
        const sendResult = await sendCompletedBillWhatsApp({
          billing,
          referencePrefix: "billing",
        });
        console.log("[WhatsApp Billing Trace]", {
          stage: sendResult?.success ? "sent" : "skipped_or_failed",
          vendorId: String(billing.vendorId || ""),
          billId: String(billing._id || ""),
          provider: sendResult?.provider || "",
          status: sendResult?.status || "",
          reason: sendResult?.reason || "",
        });
      } catch (err) {
        console.error("WhatsApp send failed:", err?.message || err);
      }
    });

    res.status(200).json({
      success: true,
      type: isWalkIn ? "WALK_IN" : "CUSTOMER",
      message: isWalkIn ? "Walk-in bill generated" : "Bill generated",
      transaction,
      ...(whatsapp ? { whatsapp } : {}),
    });

  } catch (err) {
    if (err?.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.publicMessage || err.message,
      });
    }

    if (isDuplicateCompletionError(err)) {
      return res.status(400).json({
        success: false,
        message: "Billing already completed or locked",
      });
    }

    console.error(err);
    res.status(500).json({
      success: false,
      message: "Failed to complete billing",
    });
  }
};
