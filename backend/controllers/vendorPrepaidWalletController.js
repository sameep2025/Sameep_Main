const axios = require("axios");
const crypto = require("crypto");
const mongoose = require("mongoose");
const BillingSession = require("../models/BillingSession");
const Customer = require("../models/Customer");
const CustomerMembership = require("../models/CustomerMembership");
const PrepaidMembershipWallet = require("../models/PrepaidMembershipWallet");
const PrepaidRedemptionAuthorization = require("../models/PrepaidRedemptionAuthorization");
const {
  assertPrepaidMembershipWalletEnabled,
  assertPrepaidWalletRedemptionEnabled,
  isPrepaidMembershipWalletEnabled,
  isPrepaidWalletRedemptionEnabled,
} = require("../services/prepaidMembershipCapability");
const {
  reconcilePrepaidLifecycleForCustomer,
} = require("../services/prepaidMembershipLifecycleService");
const { deductOTP, hasAvailableOTPBalance } = require("../services/vendorWalletService");
const {
  MAX_OTP_ATTEMPTS,
  MAX_OTP_PROVIDER_SUBMISSIONS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_SEND_RESERVATION_MS,
  OTP_TTL_MS,
  assertAuthorizationCanResend,
  assertAuthorizationCanVerify,
  createCartFingerprint,
  createOtp,
  createPublicError,
  getEligibleSessionQuantity,
  hashOtp,
  normalizeId,
  verifyOtpHash,
} = require("../services/prepaidRedemptionAuthorizationService");

function validId(value) {
  return mongoose.Types.ObjectId.isValid(normalizeId(value));
}

function serializeWallet(wallet, membership) {
  const base = {
    id: String(wallet._id),
    customerMembershipId: String(wallet.customerMembershipId),
    walletType: wallet.walletType,
    planName: String(membership?.planSnapshot?.name || ""),
    expiresAt: wallet.expiresAt,
  };
  if (wallet.walletType === "PREPAID_VALUE") {
    return { ...base, remainingAmountPaise: Number(wallet.remainingAmountPaise) };
  }
  const item = membership.prepaidSessionsSnapshot;
  return {
    ...base,
    remainingQuantity: Number(wallet.remainingQuantity),
    eligibleItem: {
      itemId: String(item.eligibleItemId),
      itemSource: item.eligibleItemSource,
      itemType: item.eligibleItemKind,
      itemName: item.itemName,
    },
  };
}

function hasAvailableBalance(wallet) {
  return wallet?.walletType === "PREPAID_VALUE"
    ? Number(wallet.remainingAmountPaise) > 0
    : Number(wallet?.remainingQuantity) > 0;
}

async function loadAvailableWallets(
  vendorId,
  customerId,
  now = new Date(),
  { reconcileLifecycle = reconcilePrepaidLifecycleForCustomer } = {}
) {
  if (!validId(vendorId) || !validId(customerId)) {
    throw createPublicError("Valid vendor and customer identity required", "invalid_identity");
  }
  const customer = await Customer.findById(customerId).select("_id fullNumber").lean();
  if (!customer) throw createPublicError("Customer not found", "customer_not_found", 404);

  await reconcileLifecycle({ vendorId, customerId, now });

  const wallets = await PrepaidMembershipWallet.find({
    vendorId,
    customerId,
    walletType: { $in: ["PREPAID_VALUE", "PREPAID_SESSIONS"] },
    status: "ACTIVE",
    activatesAt: { $lte: now },
    expiresAt: { $gt: now },
  }).lean();
  const availableWallets = wallets.filter(hasAvailableBalance);
  if (!availableWallets.length) return { customer, entries: [] };

  const memberships = await CustomerMembership.find({
    _id: { $in: availableWallets.map((wallet) => wallet.customerMembershipId) },
    vendorId,
    customerId,
    membershipType: { $in: ["PREPAID_VALUE", "PREPAID_SESSIONS"] },
    status: "ACTIVE",
    activatedAt: { $lte: now },
    expiresAt: { $gt: now },
  }).lean();
  const membershipMap = new Map(memberships.map((membership) => [String(membership._id), membership]));
  const entries = availableWallets
    .map((wallet) => ({ wallet, membership: membershipMap.get(String(wallet.customerMembershipId)) }))
    .filter(({ wallet, membership }) => membership && membership.membershipType === wallet.walletType)
    .sort((left, right) => {
      const expiryDiff = new Date(left.wallet.expiresAt).getTime() - new Date(right.wallet.expiresAt).getTime();
      if (expiryDiff !== 0) return expiryDiff;
      return String(left.wallet._id).localeCompare(String(right.wallet._id));
    });
  return { customer, entries };
}

function maskMobile(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 4) return "";
  return `${"*".repeat(Math.max(digits.length - 4, 0))}${digits.slice(-4)}`;
}

async function loadAvailableWallet(
  vendorId,
  customerId,
  walletId = "",
  now = new Date(),
  { reconcileLifecycle = reconcilePrepaidLifecycleForCustomer } = {}
) {
  if (!validId(vendorId) || !validId(customerId) || (walletId && !validId(walletId))) {
    throw createPublicError("Valid vendor, customer, and wallet identity required", "invalid_identity");
  }
  if (!walletId) {
    const available = await loadAvailableWallets(vendorId, customerId, now, { reconcileLifecycle });
    if (available.entries.length === 0) {
      throw createPublicError("No available prepaid wallet balance", "prepaid_wallet_unavailable", 404);
    }
    if (available.entries.length > 1) {
      throw createPublicError(
        "Select one prepaid wallet or package",
        "prepaid_wallet_selection_required",
        409
      );
    }
    return { customer: available.customer, ...available.entries[0] };
  }

  const customer = await Customer.findById(customerId).select("_id fullNumber").lean();
  if (!customer) throw createPublicError("Customer not found", "customer_not_found", 404);
  await reconcileLifecycle({ vendorId, customerId, now });

  const wallet = await PrepaidMembershipWallet.findOne({
    _id: walletId,
    vendorId,
    customerId,
    walletType: { $in: ["PREPAID_VALUE", "PREPAID_SESSIONS"] },
    status: "ACTIVE",
    activatesAt: { $lte: now },
    expiresAt: { $gt: now },
  }).lean();
  if (!wallet || !hasAvailableBalance(wallet)) {
    throw createPublicError("No available prepaid wallet balance", "prepaid_wallet_unavailable", 404);
  }
  const membership = await CustomerMembership.findOne({
    _id: wallet.customerMembershipId,
    vendorId,
    customerId,
    membershipType: wallet.walletType,
    status: "ACTIVE",
    activatedAt: { $lte: now },
    expiresAt: { $gt: now },
  }).lean();
  if (!membership) {
    throw createPublicError("No active prepaid membership found", "prepaid_membership_unavailable", 404);
  }
  return { customer, membership, wallet };
}

const OTP_DELIVERY_OUTCOMES = Object.freeze({
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
  UNCERTAIN: "UNCERTAIN",
});

function classifyMsg91Response(response) {
  const type = String(response?.data?.type || "").trim().toLowerCase();
  const requestId = String(response?.data?.request_id || "").trim();
  if (type === "success" && requestId) return OTP_DELIVERY_OUTCOMES.ACCEPTED;
  if (type === "error") return OTP_DELIVERY_OUTCOMES.REJECTED;
  return OTP_DELIVERY_OUTCOMES.UNCERTAIN;
}

async function sendPrepaidOtp(mobile, otp, post = axios.post) {
  try {
    const response = await post(
      "https://control.msg91.com/api/v5/otp",
      {
        mobile,
        otp,
        otp_length: 6,
        sender: process.env.MSG91_SENDER,
        template_id: process.env.MSG91_PREPAID_OTP_TEMPLATE_ID || "63e1e445d6fc0560d933a5e2",
      },
      {
        headers: { authkey: process.env.MSG91_AUTHKEY, "Content-Type": "application/json" },
        timeout: 10000,
      }
    );
    return classifyMsg91Response(response);
  } catch (error) {
    if (!error?.response) return OTP_DELIVERY_OUTCOMES.UNCERTAIN;
    const classified = classifyMsg91Response(error.response);
    if (classified === OTP_DELIVERY_OUTCOMES.REJECTED) return classified;
    const status = Number(error.response.status);
    return status >= 400 && status < 500
      ? OTP_DELIVERY_OUTCOMES.REJECTED
      : OTP_DELIVERY_OUTCOMES.UNCERTAIN;
  }
}

function serializeAuthorization(authorization, maskedMobile) {
  const failedAttempts = Number(authorization.failedVerificationAttempts || 0);
  return {
    id: String(authorization._id),
    expiresAt: authorization.otpExpiresAt,
    resendAvailableAt: authorization.resendAvailableAt,
    sendCount: Number(authorization.sendCount || 0),
    maskedMobile,
    maxVerificationAttempts: MAX_OTP_ATTEMPTS,
    remainingVerificationAttempts: Math.max(MAX_OTP_ATTEMPTS - failedAttempts, 0),
  };
}

function deliveryError(message, code, statusCode, authorization, maskedMobile) {
  const error = createPublicError(message, code, statusCode);
  if (authorization) {
    error.authorization = {
      ...serializeAuthorization(authorization, maskedMobile),
      deliveryStatus: "UNCERTAIN",
    };
  }
  return error;
}

function otpGenerationFilter(authorization) {
  const generation = Number(authorization.otpGeneration);
  if (generation === 1) {
    return {
      $or: [
        { otpGeneration: 1 },
        { otpGeneration: { $exists: false } },
      ],
    };
  }
  return { otpGeneration: generation };
}

async function reserveExistingAuthorization(
  authorization,
  reservationToken,
  now,
  reservationExpiresAt,
  AuthorizationModel = PrepaidRedemptionAuthorization
) {
  return AuthorizationModel.findOneAndUpdate(
    {
      _id: authorization._id,
      status: "PENDING",
      sendCount: authorization.sendCount,
      resendAvailableAt: { $lte: now },
      $and: [
        {
          $or: [
            { providerSubmissionCount: { $lt: MAX_OTP_PROVIDER_SUBMISSIONS } },
            { providerSubmissionCount: { $exists: false } },
          ],
        },
        {
          $or: [
            { sendReservationToken: null },
            { sendReservationToken: { $exists: false } },
            { sendReservationExpiresAt: { $lte: now } },
          ],
        },
      ],
    },
    {
      $set: {
        sendReservationToken: reservationToken,
        sendReservationExpiresAt: reservationExpiresAt,
      },
      $inc: { providerSubmissionCount: 1 },
    },
    { new: true }
  );
}

async function finalizeAcceptedReservation(
  authorizationId,
  reservationToken,
  { otpHash, otpExpiresAt, now, resendAvailableAt },
  AuthorizationModel = PrepaidRedemptionAuthorization
) {
  return AuthorizationModel.findOneAndUpdate(
    { _id: authorizationId, status: "PENDING", sendReservationToken: reservationToken },
    {
      $set: {
        otpHash,
        otpExpiresAt,
        lastSentAt: now,
        resendAvailableAt,
        failedVerificationAttempts: 0,
      },
      $inc: { sendCount: 1, otpGeneration: 1 },
      $unset: { sendReservationToken: 1, sendReservationExpiresAt: 1 },
    },
    { new: true }
  );
}

async function releaseRejectedReservation(
  authorization,
  reservationToken,
  existingAuthorization,
  AuthorizationModel = PrepaidRedemptionAuthorization
) {
  if (existingAuthorization) {
    return AuthorizationModel.updateOne(
      { _id: authorization._id, status: "PENDING", sendReservationToken: reservationToken },
      { $unset: { sendReservationToken: 1, sendReservationExpiresAt: 1 } }
    );
  }
  return AuthorizationModel.deleteOne({
    _id: authorization._id,
    status: "PENDING",
    sendCount: 0,
    sendReservationToken: reservationToken,
  });
}

async function finalizeUncertainReservation(
  authorizationId,
  reservationToken,
  resendAvailableAt,
  AuthorizationModel = PrepaidRedemptionAuthorization
) {
  return AuthorizationModel.findOneAndUpdate(
    { _id: authorizationId, status: "PENDING", sendReservationToken: reservationToken },
    {
      $set: { resendAvailableAt },
      $unset: { sendReservationToken: 1, sendReservationExpiresAt: 1 },
    },
    { new: true }
  );
}

function sendError(res, error, fallback) {
  if (!error?.statusCode) console.error(fallback, error?.message || error);
  return res.status(error?.statusCode || 500).json({
    success: false,
    code: error?.code || "internal_error",
    message: error?.statusCode ? error.message : fallback,
    ...(Number.isSafeInteger(error?.remainingVerificationAttempts)
      ? { remainingVerificationAttempts: error.remainingVerificationAttempts }
      : {}),
    ...(error?.authorization ? { authorization: error.authorization } : {}),
  });
}

exports.getAvailableWallet = async (req, res) => {
  try {
    assertPrepaidMembershipWalletEnabled();
    const { entries } = await loadAvailableWallets(req.params.vendorId, req.params.customerId);
    if (!entries.length) {
      throw createPublicError("No available prepaid wallet balance", "prepaid_wallet_unavailable", 404);
    }
    const wallets = entries.map(({ wallet, membership }) => serializeWallet(wallet, membership));
    return res.json({
      success: true,
      wallets,
      wallet: wallets.length === 1 ? wallets[0] : null,
      selectionRequired: wallets.length > 1,
    });
  } catch (error) {
    return sendError(res, error, "Failed to load prepaid wallet");
  }
};

exports.getCapabilities = async (req, res) => {
  const walletsEnabled = isPrepaidMembershipWalletEnabled();
  const redemptionEnabled = walletsEnabled && isPrepaidWalletRedemptionEnabled();
  return res.json({
    success: true,
    capabilities: {
      prepaidMembershipWallets: walletsEnabled,
      prepaidWalletRedemption: redemptionEnabled,
      walletPaymentAvailable: walletsEnabled && redemptionEnabled,
    },
  });
};

exports.prepareAuthorization = async (req, res) => {
  try {
    assertPrepaidWalletRedemptionEnabled();
    const vendorId = req.params.vendorId;
    const { walletId, billingSessionId } = req.body || {};
    const now = new Date();
    if (!validId(walletId) || !validId(billingSessionId)) {
      throw createPublicError("Valid wallet and billing session required", "invalid_billing_session");
    }
    const billing = await BillingSession.findOne({
      _id: billingSessionId,
      vendorId,
      status: "ACTIVE",
      customerId: { $ne: null },
    }).lean();
    if (!billing) throw createPublicError("Active customer bill not found", "billing_session_unavailable", 404);

    const { customer, membership, wallet } = await loadAvailableWallet(
      vendorId,
      billing.customerId,
      walletId,
      now
    );
    const fingerprint = createCartFingerprint({
      vendorId,
      customerId: billing.customerId,
      billingSessionId,
      cartItems: billing.cartItems,
    });
    const binding = {
      authorizationType: wallet.walletType,
      eligibleItemId: undefined,
      eligibleItemSource: undefined,
      exactQuantity: undefined,
      exactAmountPaise: undefined,
    };
    if (wallet.walletType === "PREPAID_VALUE") {
      const amount = Number(req.body?.amountPaise);
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > wallet.remainingAmountPaise) {
        throw createPublicError("Requested wallet amount is invalid", "invalid_prepaid_amount");
      }
      binding.exactAmountPaise = amount;
    } else {
      const item = membership.prepaidSessionsSnapshot;
      const availableInCart = getEligibleSessionQuantity(
        billing.cartItems,
        item.eligibleItemSource,
        item.eligibleItemId
      );
      const quantity = Number(req.body?.quantity);
      if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > wallet.remainingQuantity || quantity > availableInCart) {
        throw createPublicError("Requested session quantity is invalid", "invalid_prepaid_quantity");
      }
      binding.eligibleItemId = item.eligibleItemId;
      binding.eligibleItemSource = item.eligibleItemSource;
      binding.exactQuantity = quantity;
    }

    const enrolledMobile = String(membership.customerMobileSnapshot || "").replace(/\D/g, "");
    if (!enrolledMobile || enrolledMobile !== String(customer.fullNumber || "").replace(/\D/g, "")) {
      throw createPublicError(
        "Enrolled customer mobile could not be verified",
        "prepaid_customer_mobile_mismatch",
        409
      );
    }

    let authorization = await PrepaidRedemptionAuthorization.findOne({ billingSessionId })
      .select("+otpHash +sendReservationToken");
    const existingAuthorization = Boolean(authorization);
    if (authorization) {
      const sameBinding =
        String(authorization.vendorId) === String(vendorId) &&
        String(authorization.customerId) === String(billing.customerId) &&
        String(authorization.walletId) === String(wallet._id) &&
        authorization.authorizationType === binding.authorizationType &&
        authorization.cartFingerprint === fingerprint &&
        Number(authorization.exactAmountPaise || 0) === Number(binding.exactAmountPaise || 0) &&
        Number(authorization.exactQuantity || 0) === Number(binding.exactQuantity || 0) &&
        String(authorization.eligibleItemId || "") === String(binding.eligibleItemId || "") &&
        String(authorization.eligibleItemSource || "") === String(binding.eligibleItemSource || "");
      if (!sameBinding) throw createPublicError("Bill or redemption details changed", "prepaid_authorization_binding_changed", 409);
      assertAuthorizationCanResend(authorization, now);
    }

    if (!(await hasAvailableOTPBalance(vendorId))) {
      throw createPublicError("Insufficient OTP balance. Please recharge OTP credits.", "otp_balance_unavailable");
    }
    const otp = createOtp();
    const otpHash = await hashOtp(otp);
    const otpExpiresAt = new Date(now.getTime() + OTP_TTL_MS);
    const resendAvailableAt = new Date(now.getTime() + OTP_RESEND_COOLDOWN_MS);
    const reservationToken = crypto.randomUUID();
    const reservationExpiresAt = new Date(now.getTime() + OTP_SEND_RESERVATION_MS);
    if (authorization) {
      authorization = await reserveExistingAuthorization(
        authorization,
        reservationToken,
        now,
        reservationExpiresAt
      );
      if (!authorization) {
        throw createPublicError("OTP resend already requested", "prepaid_otp_resend_conflict", 409);
      }
    } else {
      authorization = await PrepaidRedemptionAuthorization.create({
        vendorId,
        customerId: billing.customerId,
        walletId: wallet._id,
        billingSessionId,
        ...binding,
        cartFingerprint: fingerprint,
        otpHash,
        otpExpiresAt,
        otpGeneration: 0,
        sendCount: 0,
        providerSubmissionCount: 1,
        sendReservationToken: reservationToken,
        sendReservationExpiresAt: reservationExpiresAt,
        lastSentAt: now,
        resendAvailableAt: now,
      });
    }

    const deliveryOutcome = await sendPrepaidOtp(enrolledMobile, otp);
    if (deliveryOutcome === OTP_DELIVERY_OUTCOMES.ACCEPTED) {
      const finalized = await finalizeAcceptedReservation(
        authorization._id,
        reservationToken,
        { otpHash, otpExpiresAt, now, resendAvailableAt }
      );
      if (!finalized) {
        throw createPublicError(
          "OTP delivery was accepted but the authorization changed",
          "prepaid_otp_finalize_conflict",
          409
        );
      }
      return res.json({
        success: true,
        deliveryStatus: "CONFIRMED",
        authorization: {
          ...serializeAuthorization(finalized, maskMobile(enrolledMobile)),
          deliveryStatus: "CONFIRMED",
        },
      });
    }

    if (deliveryOutcome === OTP_DELIVERY_OUTCOMES.REJECTED) {
      await releaseRejectedReservation(
        authorization,
        reservationToken,
        existingAuthorization
      );
      throw createPublicError(
        "OTP provider rejected the request",
        "prepaid_otp_delivery_failed",
        502
      );
    }

    const uncertain = await finalizeUncertainReservation(
      authorization._id,
      reservationToken,
      resendAvailableAt
    );
    if (!uncertain) {
      throw createPublicError(
        "OTP delivery result is uncertain and the authorization changed",
        "prepaid_otp_finalize_conflict",
        409
      );
    }
    throw deliveryError(
      "OTP delivery could not be confirmed. Enter the code if it arrived; any previous code remains valid.",
      "prepaid_otp_delivery_uncertain",
      503,
      uncertain,
      maskMobile(enrolledMobile)
    );
  } catch (error) {
    if (error?.code === 11000) {
      return sendError(res, createPublicError("Authorization already exists for this bill", "prepaid_authorization_exists", 409), "Failed to prepare prepaid authorization");
    }
    return sendError(res, error, "Failed to prepare prepaid authorization");
  }
};

exports.verifyAuthorization = async (req, res) => {
  try {
    assertPrepaidWalletRedemptionEnabled();
    const vendorId = req.params.vendorId;
    const authorizationId = req.params.authorizationId;
    const otp = String(req.body?.otp || "").trim();
    if (!validId(authorizationId) || !/^\d{6}$/.test(otp)) {
      throw createPublicError("Valid authorization and OTP required", "invalid_prepaid_otp");
    }
    const authorization = await PrepaidRedemptionAuthorization.findOne({
      _id: authorizationId,
      vendorId,
    }).select("+otpHash");
    if (!authorization) throw createPublicError("Authorization not found", "prepaid_authorization_not_found", 404);
    const now = new Date();
    try {
      assertAuthorizationCanVerify(authorization, now);
    } catch (stateError) {
      if (stateError.code !== "prepaid_otp_expired") throw stateError;
      await PrepaidRedemptionAuthorization.updateOne(
        {
          _id: authorization._id,
          status: "PENDING",
          otpHash: authorization.otpHash,
          ...otpGenerationFilter(authorization),
        },
        { $set: { status: "EXPIRED" } }
      );
      throw stateError;
    }
    const billing = await BillingSession.findOne({
      _id: authorization.billingSessionId,
      vendorId,
      customerId: authorization.customerId,
      status: "ACTIVE",
    }).lean();
    if (!billing) throw createPublicError("Active bound bill not found", "billing_session_unavailable", 409);
    const fingerprint = createCartFingerprint({
      vendorId,
      customerId: authorization.customerId,
      billingSessionId: authorization.billingSessionId,
      cartItems: billing.cartItems,
    });
    if (fingerprint !== authorization.cartFingerprint) {
      throw createPublicError("Billing cart changed after OTP request", "prepaid_authorization_binding_changed", 409);
    }
    const { membership, wallet } = await loadAvailableWallet(
      vendorId,
      authorization.customerId,
      authorization.walletId,
      now
    );
    if (authorization.authorizationType === "PREPAID_VALUE") {
      if (
        authorization.exactAmountPaise > wallet.remainingAmountPaise
      ) {
        throw createPublicError("Authorized wallet amount is no longer available", "prepaid_authorization_binding_changed", 409);
      }
    } else {
      const item = membership.prepaidSessionsSnapshot;
      const availableInCart = getEligibleSessionQuantity(
        billing.cartItems,
        item.eligibleItemSource,
        item.eligibleItemId
      );
      if (
        String(authorization.eligibleItemId) !== String(item.eligibleItemId) ||
        authorization.eligibleItemSource !== item.eligibleItemSource ||
        authorization.exactQuantity > wallet.remainingQuantity ||
        authorization.exactQuantity > availableInCart
      ) {
        throw createPublicError("Authorized session quantity is no longer available", "prepaid_authorization_binding_changed", 409);
      }
    }
    if (!(await verifyOtpHash(otp, authorization.otpHash))) {
      const failed = await PrepaidRedemptionAuthorization.findOneAndUpdate(
        {
          _id: authorization._id,
          status: "PENDING",
          otpHash: authorization.otpHash,
          ...otpGenerationFilter(authorization),
          failedVerificationAttempts: { $lt: MAX_OTP_ATTEMPTS },
        },
        { $inc: { failedVerificationAttempts: 1 } },
        { new: true }
      );
      if (!failed) {
        throw createPublicError(
          "OTP changed while verification was in progress",
          "prepaid_otp_generation_changed",
          409
        );
      }
      const attempts = Number(failed?.failedVerificationAttempts || MAX_OTP_ATTEMPTS);
      if (attempts >= MAX_OTP_ATTEMPTS) {
        await PrepaidRedemptionAuthorization.updateOne(
          {
            _id: authorization._id,
            status: "PENDING",
            otpHash: authorization.otpHash,
            ...otpGenerationFilter(authorization),
          },
          { $set: { status: "EXPIRED" } }
        );
      }
      const verificationError = createPublicError(
        attempts >= MAX_OTP_ATTEMPTS ? "OTP attempt limit reached" : "Invalid OTP",
        attempts >= MAX_OTP_ATTEMPTS ? "prepaid_otp_attempt_limit" : "invalid_prepaid_otp",
        attempts >= MAX_OTP_ATTEMPTS ? 429 : 400
      );
      verificationError.remainingVerificationAttempts = Math.max(MAX_OTP_ATTEMPTS - attempts, 0);
      throw verificationError;
    }
    const verified = await PrepaidRedemptionAuthorization.findOneAndUpdate(
      {
        _id: authorization._id,
        status: "PENDING",
        cartFingerprint: fingerprint,
        otpHash: authorization.otpHash,
        ...otpGenerationFilter(authorization),
      },
      { $set: { status: "VERIFIED", verifiedAt: now } },
      { new: true }
    );
    if (!verified) {
      throw createPublicError(
        "OTP changed or authorization was already processed",
        "prepaid_otp_generation_changed",
        409
      );
    }
    try {
      await deductOTP(vendorId, `prepaid-authorization:${authorization._id}`);
    } catch (error) {
      await PrepaidRedemptionAuthorization.updateOne(
        {
          _id: authorization._id,
          status: "VERIFIED",
          verifiedAt: now,
          ...otpGenerationFilter(authorization),
        },
        { $set: { status: "PENDING", verifiedAt: null } }
      ).catch(() => {});
      throw error;
    }
    return res.json({ success: true, authorization: { id: String(verified._id), status: verified.status, verifiedAt: verified.verifiedAt } });
  } catch (error) {
    return sendError(res, error, "Failed to verify prepaid authorization");
  }
};

exports._private = {
  OTP_DELIVERY_OUTCOMES,
  classifyMsg91Response,
  finalizeAcceptedReservation,
  finalizeUncertainReservation,
  loadAvailableWallet,
  loadAvailableWallets,
  maskMobile,
  otpGenerationFilter,
  releaseRejectedReservation,
  reserveExistingAuthorization,
  sendPrepaidOtp,
  serializeAuthorization,
  serializeWallet,
};
