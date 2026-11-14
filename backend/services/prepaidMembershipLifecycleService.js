const mongoose = require("mongoose");
const CustomerMembership = require("../models/CustomerMembership");
const PrepaidMembershipWallet = require("../models/PrepaidMembershipWallet");

const PREPAID_MEMBERSHIP_TYPES = ["PREPAID_VALUE", "PREPAID_SESSIONS"];
const MAX_TRANSACTION_ATTEMPTS = 3;

function createLifecycleError(message, code, statusCode = 409) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function datesMatch(left, right) {
  return new Date(left).getTime() === new Date(right).getTime();
}

function isTransientTransactionError(error) {
  return Boolean(
    error?.hasErrorLabel?.("TransientTransactionError") ||
    error?.hasErrorLabel?.("UnknownTransactionCommitResult") ||
    [112, 244, 251].includes(Number(error?.code))
  );
}

async function prepaidLifecycleNeedsReconciliation({
  vendorId,
  customerId,
  now = new Date(),
  CustomerMembershipModel = CustomerMembership,
  PrepaidMembershipWalletModel = PrepaidMembershipWallet,
}) {
  const [membership, wallet] = await Promise.all([
    CustomerMembershipModel.exists({
      vendorId,
      customerId,
      membershipType: { $in: PREPAID_MEMBERSHIP_TYPES },
      $or: [
        { status: { $in: ["ACTIVE", "SCHEDULED", "DEPLETED"] }, expiresAt: { $lte: now } },
        { status: "SCHEDULED", activatedAt: { $lte: now }, expiresAt: { $gt: now } },
      ],
    }),
    PrepaidMembershipWalletModel.exists({
      vendorId,
      customerId,
      walletType: { $in: PREPAID_MEMBERSHIP_TYPES },
      $or: [
        {
          status: { $in: ["ACTIVE", "SCHEDULED", "DEPLETED"] },
          expiresAt: { $lte: now },
        },
        { status: "SCHEDULED", activatesAt: { $lte: now }, expiresAt: { $gt: now } },
      ],
    }),
  ]);
  return Boolean(membership || wallet);
}

async function refreshLifecycleForCustomer({
  vendorId,
  customerId,
  session,
  now = new Date(),
  CustomerMembershipModel = CustomerMembership,
  PrepaidMembershipWalletModel = PrepaidMembershipWallet,
}) {
  await CustomerMembershipModel.updateMany(
    {
      vendorId,
      customerId,
      membershipType: "DISCOUNT",
      status: "ACTIVE",
      expiresAt: { $lte: now },
    },
    { $set: { status: "EXPIRED" } },
    { session }
  );

  await CustomerMembershipModel.updateMany(
    {
      vendorId,
      customerId,
      membershipType: "DISCOUNT",
      status: "SCHEDULED",
      activatedAt: { $lte: now },
      expiresAt: { $gt: now },
    },
    { $set: { status: "ACTIVE" } },
    { session }
  );

  await reconcilePrepaidLifecycleInSession({
    vendorId,
    customerId,
    session,
    now,
    CustomerMembershipModel,
    PrepaidMembershipWalletModel,
  });
}

async function reconcilePrepaidLifecycleInSession({
  vendorId,
  customerId,
  session,
  now = new Date(),
  CustomerMembershipModel = CustomerMembership,
  PrepaidMembershipWalletModel = PrepaidMembershipWallet,
}) {
  const prepaidScope = { membershipType: { $in: PREPAID_MEMBERSHIP_TYPES } };

  await CustomerMembershipModel.updateMany(
    {
      vendorId,
      customerId,
      ...prepaidScope,
      status: { $in: ["ACTIVE", "SCHEDULED", "DEPLETED"] },
      expiresAt: { $lte: now },
    },
    { $set: { status: "EXPIRED" } },
    { session }
  );

  await PrepaidMembershipWalletModel.updateMany(
    {
      vendorId,
      customerId,
      walletType: { $in: PREPAID_MEMBERSHIP_TYPES },
      status: { $in: ["ACTIVE", "SCHEDULED", "DEPLETED"] },
      expiresAt: { $lte: now },
    },
    { $set: { status: "EXPIRED" } },
    { session }
  );

  const dueMemberships = await CustomerMembershipModel.find({
    vendorId,
    customerId,
    ...prepaidScope,
    status: "SCHEDULED",
    activatedAt: { $lte: now },
    expiresAt: { $gt: now },
  })
    .sort({ activatedAt: 1, _id: 1 })
    .session(session)
    .lean();

  if (dueMemberships.length === 0) return { promoted: false };

  const promoted = [];
  for (const membership of dueMemberships) {
    const wallet = await PrepaidMembershipWalletModel.findOne({
      vendorId,
      customerId,
      customerMembershipId: membership._id,
    }).session(session).lean();
    if (
      !wallet ||
      wallet.status !== "SCHEDULED" ||
      wallet.walletType !== membership.membershipType ||
      !datesMatch(wallet.activatesAt, membership.activatedAt) ||
      !datesMatch(wallet.expiresAt, membership.expiresAt) ||
      new Date(wallet.activatesAt) > now ||
      new Date(wallet.expiresAt) <= now
    ) {
      throw createLifecycleError(
        "Scheduled prepaid renewal records are inconsistent",
        "prepaid_lifecycle_inconsistent"
      );
    }

    const membershipUpdate = await CustomerMembershipModel.updateOne(
      {
        _id: membership._id,
        vendorId,
        customerId,
        membershipType: membership.membershipType,
        status: "SCHEDULED",
        activatedAt: { $lte: now },
        expiresAt: { $gt: now },
      },
      { $set: { status: "ACTIVE" } },
      { session }
    );
    if (membershipUpdate.modifiedCount !== 1) {
      throw createLifecycleError(
        "Prepaid renewal membership activation conflicted",
        "prepaid_lifecycle_conflict"
      );
    }

    const walletUpdate = await PrepaidMembershipWalletModel.updateOne(
      {
        _id: wallet._id,
        vendorId,
        customerId,
        customerMembershipId: membership._id,
        walletType: membership.membershipType,
        status: "SCHEDULED",
        activatesAt: { $lte: now },
        expiresAt: { $gt: now },
      },
      { $set: { status: "ACTIVE" } },
      { session }
    );
    if (walletUpdate.modifiedCount !== 1) {
      throw createLifecycleError(
        "Prepaid renewal wallet activation conflicted",
        "prepaid_lifecycle_conflict"
      );
    }
    promoted.push({ customerMembershipId: membership._id, walletId: wallet._id });
  }

  return {
    promoted: true,
    promotedCount: promoted.length,
    memberships: promoted,
    customerMembershipId: promoted[0].customerMembershipId,
    walletId: promoted[0].walletId,
  };
}

async function reconcilePrepaidLifecycleForCustomer({
  vendorId,
  customerId,
  now = new Date(),
  CustomerMembershipModel = CustomerMembership,
  PrepaidMembershipWalletModel = PrepaidMembershipWallet,
  startSession = () => mongoose.startSession(),
  maxAttempts = MAX_TRANSACTION_ATTEMPTS,
}) {
  const needsReconciliation = await prepaidLifecycleNeedsReconciliation({
    vendorId,
    customerId,
    now,
    CustomerMembershipModel,
    PrepaidMembershipWalletModel,
  });
  if (!needsReconciliation) return { promoted: false };

  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const session = await startSession();
    try {
      session.startTransaction();
      const result = await reconcilePrepaidLifecycleInSession({
        vendorId,
        customerId,
        session,
        now,
        CustomerMembershipModel,
        PrepaidMembershipWalletModel,
      });
      await session.commitTransaction();
      return result;
    } catch (error) {
      lastError = error;
      if (session.inTransaction?.()) await session.abortTransaction();
      if (!isTransientTransactionError(error) || attempt === maxAttempts) throw error;
    } finally {
      await session.endSession();
    }
  }
  throw lastError;
}

module.exports = {
  MAX_TRANSACTION_ATTEMPTS,
  PREPAID_MEMBERSHIP_TYPES,
  createLifecycleError,
  isTransientTransactionError,
  prepaidLifecycleNeedsReconciliation,
  reconcilePrepaidLifecycleForCustomer,
  reconcilePrepaidLifecycleInSession,
  refreshLifecycleForCustomer,
};
