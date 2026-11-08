const mongoose = require("mongoose");
const BillingSession = require("../models/BillingSession");
const CustomerMembership = require("../models/CustomerMembership");
const { REPORTING_TIMEZONE } = require("./revenueReportingTimezone");

function toRupees(paise) {
  return Number(paise || 0) / 100;
}

function buildDateMatch(field, from, to, { inclusiveTo = false } = {}) {
  if (!from && !to) return {};
  return {
    [field]: {
      ...(from ? { $gte: new Date(from) } : {}),
      ...(to ? { [inclusiveTo ? "$lte" : "$lt"]: new Date(to) } : {}),
    },
  };
}

function paymentPaiseExpression() {
  return { $round: [{ $multiply: [{ $ifNull: ["$payment.amount", 0] }, 100] }, 0] };
}

function billPaiseExpression(path) {
  return { $round: [{ $multiply: [{ $ifNull: [path, 0] }, 100] }, 0] };
}

function getBillReportingGroup() {
  const completed = { $eq: ["$status", "COMPLETED"] };
  const cancelled = { $eq: ["$status", "CANCELLED"] };
  const walletType = "$prepaidSettlementSnapshot.walletType";
  const isValue = { $eq: [walletType, "PREPAID_VALUE"] };
  const isSessions = { $eq: [walletType, "PREPAID_SESSIONS"] };
  const isPrepaid = { $in: [walletType, ["PREPAID_VALUE", "PREPAID_SESSIONS"]] };
  const rewards = {
    $ifNull: ["$transaction.redeemValue", { $ifNull: ["$pointsRedeemed", 0] }],
  };
  const ordinaryFreshPaise = {
    $round: [{
      $multiply: [{
        $max: [{ $subtract: [{ $ifNull: ["$totalAmount", 0] }, rewards] }, 0],
      }, 100],
    }, 0],
  };
  const operationalPaise = {
    $cond: [
      isPrepaid,
      { $ifNull: ["$prepaidSettlementSnapshot.operationalServiceValuePaise", 0] },
      billPaiseExpression("$totalAmount"),
    ],
  };

  return {
    _id: null,
    serviceActivityPaise: { $sum: { $cond: [completed, operationalPaise, 0] } },
    ordinaryFreshCollectionsPaise: {
      $sum: { $cond: [{ $and: [completed, { $not: [isPrepaid] }] }, ordinaryFreshPaise, 0] },
    },
    prepaidServiceActivityPaise: {
      $sum: { $cond: [{ $and: [completed, isPrepaid] }, operationalPaise, 0] },
    },
    valueWalletRedemptionBills: {
      $sum: { $cond: [{ $and: [completed, isValue] }, 1, 0] },
    },
    valueWalletUsedPaise: {
      $sum: {
        $cond: [
          { $and: [completed, isValue] },
          { $ifNull: ["$prepaidSettlementSnapshot.authorizedAmountPaise", 0] },
          0,
        ],
      },
    },
    sessionWalletRedemptionBills: {
      $sum: { $cond: [{ $and: [completed, isSessions] }, 1, 0] },
    },
    sessionsUsed: {
      $sum: {
        $cond: [
          { $and: [completed, isSessions] },
          { $ifNull: ["$prepaidSettlementSnapshot.authorizedQuantity", 0] },
          0,
        ],
      },
    },
    sessionServiceActivityPaise: {
      $sum: { $cond: [{ $and: [completed, isSessions] }, operationalPaise, 0] },
    },
    reversedValueWalletBills: {
      $sum: { $cond: [{ $and: [cancelled, isValue] }, 1, 0] },
    },
    reversedValueWalletPaise: {
      $sum: {
        $cond: [
          { $and: [cancelled, isValue] },
          { $ifNull: ["$prepaidSettlementSnapshot.authorizedAmountPaise", 0] },
          0,
        ],
      },
    },
    reversedSessionBills: {
      $sum: { $cond: [{ $and: [cancelled, isSessions] }, 1, 0] },
    },
    reversedSessions: {
      $sum: {
        $cond: [
          { $and: [cancelled, isSessions] },
          { $ifNull: ["$prepaidSettlementSnapshot.authorizedQuantity", 0] },
          0,
        ],
      },
    },
  };
}

function getMembershipReportingGroup() {
  const paymentPaise = paymentPaiseExpression();
  const isRenewal = { $ne: [{ $ifNull: ["$renewedFromMembershipId", null] }, null] };
  const isValue = { $eq: ["$membershipType", "PREPAID_VALUE"] };
  const isSessions = { $eq: ["$membershipType", "PREPAID_SESSIONS"] };
  const isCash = { $eq: ["$payment.method", "CASH"] };
  const isOnline = { $eq: ["$payment.method", "ONLINE"] };
  const isUpi = { $eq: ["$payment.method", "UPI"] };
  const isCard = { $eq: ["$payment.method", "CARD"] };
  return {
    _id: null,
    membershipsSold: { $sum: { $cond: [isRenewal, 0, 1] } },
    membershipsRenewed: { $sum: { $cond: [isRenewal, 1, 0] } },
    membershipCollectionsPaise: { $sum: paymentPaise },
    prepaidValueCollectionsPaise: { $sum: { $cond: [isValue, paymentPaise, 0] } },
    prepaidSessionsCollectionsPaise: { $sum: { $cond: [isSessions, paymentPaise, 0] } },
    membershipCashCollectionsPaise: { $sum: { $cond: [isCash, paymentPaise, 0] } },
    membershipOnlineCollectionsPaise: { $sum: { $cond: [isOnline, paymentPaise, 0] } },
    membershipUpiCollectionsPaise: { $sum: { $cond: [isUpi, paymentPaise, 0] } },
    membershipCardCollectionsPaise: { $sum: { $cond: [isCard, paymentPaise, 0] } },
  };
}

function normalizeReportingRows(billRow = {}, membershipRow = {}) {
  const ordinaryFreshCollectionsPaise = Number(billRow.ordinaryFreshCollectionsPaise || 0);
  const membershipCollectionsPaise = Number(membershipRow.membershipCollectionsPaise || 0);
  return {
    serviceActivity: toRupees(billRow.serviceActivityPaise),
    freshCollections: toRupees(ordinaryFreshCollectionsPaise + membershipCollectionsPaise),
    ordinaryFreshCollections: toRupees(ordinaryFreshCollectionsPaise),
    membershipCollections: toRupees(membershipCollectionsPaise),
    membershipsSold: Number(membershipRow.membershipsSold || 0),
    membershipsRenewed: Number(membershipRow.membershipsRenewed || 0),
    prepaidValueCollections: toRupees(membershipRow.prepaidValueCollectionsPaise),
    prepaidSessionsCollections: toRupees(membershipRow.prepaidSessionsCollectionsPaise),
    membershipCashCollections: toRupees(membershipRow.membershipCashCollectionsPaise),
    membershipOnlineCollections: toRupees(membershipRow.membershipOnlineCollectionsPaise),
    membershipUpiCollections: toRupees(membershipRow.membershipUpiCollectionsPaise),
    membershipCardCollections: toRupees(membershipRow.membershipCardCollectionsPaise),
    prepaidServiceActivity: toRupees(billRow.prepaidServiceActivityPaise),
    valueWalletRedemptionBills: Number(billRow.valueWalletRedemptionBills || 0),
    valueWalletUsed: toRupees(billRow.valueWalletUsedPaise),
    sessionWalletRedemptionBills: Number(billRow.sessionWalletRedemptionBills || 0),
    sessionsUsed: Number(billRow.sessionsUsed || 0),
    sessionServiceActivity: toRupees(billRow.sessionServiceActivityPaise),
    reversedValueWalletBills: Number(billRow.reversedValueWalletBills || 0),
    reversedValueWallet: toRupees(billRow.reversedValueWalletPaise),
    reversedSessionBills: Number(billRow.reversedSessionBills || 0),
    reversedSessions: Number(billRow.reversedSessions || 0),
  };
}

async function getPrepaidRevenueSummary({
  vendorId,
  from,
  to,
  inclusiveTo = false,
  BillingSessionModel = BillingSession,
  CustomerMembershipModel = CustomerMembership,
}) {
  const usesDefaultModels =
    BillingSessionModel === BillingSession && CustomerMembershipModel === CustomerMembership;
  if (usesDefaultModels && mongoose.connection.readyState !== 1) {
    throw new Error("Prepaid revenue reporting requires an active database connection");
  }
  const vendorObjectId = new mongoose.Types.ObjectId(vendorId);
  const [billRows, membershipRows] = await Promise.all([
    BillingSessionModel.aggregate([
      {
        $match: {
          vendorId: vendorObjectId,
          status: { $in: ["COMPLETED", "CANCELLED"] },
          ...buildDateMatch("createdAt", from, to, { inclusiveTo }),
        },
      },
      {
        $lookup: {
          from: "transactions",
          localField: "_id",
          foreignField: "billingSessionId",
          as: "transactions",
        },
      },
      { $addFields: { transaction: { $arrayElemAt: ["$transactions", 0] } } },
      { $group: getBillReportingGroup() },
    ]),
    CustomerMembershipModel.aggregate([
      {
        $match: {
          vendorId: vendorObjectId,
          membershipType: { $in: ["PREPAID_VALUE", "PREPAID_SESSIONS"] },
          ...buildDateMatch("createdAt", from, to, { inclusiveTo }),
        },
      },
      { $group: getMembershipReportingGroup() },
    ]),
  ]);
  return normalizeReportingRows(billRows[0], membershipRows[0]);
}

async function getPrepaidRevenueMonthly({
  vendorId,
  from,
  to,
  BillingSessionModel = BillingSession,
  CustomerMembershipModel = CustomerMembership,
}) {
  const usesDefaultModels =
    BillingSessionModel === BillingSession && CustomerMembershipModel === CustomerMembership;
  if (usesDefaultModels && mongoose.connection.readyState !== 1) {
    throw new Error("Prepaid revenue reporting requires an active database connection");
  }
  const vendorObjectId = new mongoose.Types.ObjectId(vendorId);
  const monthKey = {
    $dateToString: {
      format: "%Y-%m",
      date: "$createdAt",
      timezone: REPORTING_TIMEZONE,
    },
  };
  const [billRows, membershipRows] = await Promise.all([
    BillingSessionModel.aggregate([
      {
        $match: {
          vendorId: vendorObjectId,
          status: { $in: ["COMPLETED", "CANCELLED"] },
          ...buildDateMatch("createdAt", from, to),
        },
      },
      {
        $lookup: {
          from: "transactions",
          localField: "_id",
          foreignField: "billingSessionId",
          as: "transactions",
        },
      },
      { $addFields: { transaction: { $arrayElemAt: ["$transactions", 0] } } },
      { $group: { ...getBillReportingGroup(), _id: monthKey } },
    ]),
    CustomerMembershipModel.aggregate([
      {
        $match: {
          vendorId: vendorObjectId,
          membershipType: { $in: ["PREPAID_VALUE", "PREPAID_SESSIONS"] },
          ...buildDateMatch("createdAt", from, to),
        },
      },
      { $group: { ...getMembershipReportingGroup(), _id: monthKey } },
    ]),
  ]);
  const billMap = new Map(billRows.map((row) => [row._id, row]));
  const membershipMap = new Map(membershipRows.map((row) => [row._id, row]));
  return new Map(
    [...new Set([...billMap.keys(), ...membershipMap.keys()])].map((key) => [
      key,
      normalizeReportingRows(billMap.get(key), membershipMap.get(key)),
    ])
  );
}

async function getPrepaidRevenueDaily({
  vendorId,
  from,
  to,
  BillingSessionModel = BillingSession,
  CustomerMembershipModel = CustomerMembership,
}) {
  const usesDefaultModels =
    BillingSessionModel === BillingSession && CustomerMembershipModel === CustomerMembership;
  if (usesDefaultModels && mongoose.connection.readyState !== 1) {
    throw new Error("Prepaid revenue reporting requires an active database connection");
  }
  const vendorObjectId = new mongoose.Types.ObjectId(vendorId);
  const dayKey = {
    $dateToString: {
      format: "%Y-%m-%d",
      date: "$createdAt",
      timezone: REPORTING_TIMEZONE,
    },
  };
  const [billRows, membershipRows] = await Promise.all([
    BillingSessionModel.aggregate([
      {
        $match: {
          vendorId: vendorObjectId,
          status: { $in: ["COMPLETED", "CANCELLED"] },
          ...buildDateMatch("createdAt", from, to),
        },
      },
      {
        $lookup: {
          from: "transactions",
          localField: "_id",
          foreignField: "billingSessionId",
          as: "transactions",
        },
      },
      { $addFields: { transaction: { $arrayElemAt: ["$transactions", 0] } } },
      { $group: { ...getBillReportingGroup(), _id: dayKey } },
    ]),
    CustomerMembershipModel.aggregate([
      {
        $match: {
          vendorId: vendorObjectId,
          membershipType: { $in: ["PREPAID_VALUE", "PREPAID_SESSIONS"] },
          ...buildDateMatch("createdAt", from, to),
        },
      },
      { $group: { ...getMembershipReportingGroup(), _id: dayKey } },
    ]),
  ]);
  const billMap = new Map(billRows.map((row) => [row._id, row]));
  const membershipMap = new Map(membershipRows.map((row) => [row._id, row]));
  return new Map(
    [...new Set([...billMap.keys(), ...membershipMap.keys()])].map((key) => [
      key,
      normalizeReportingRows(billMap.get(key), membershipMap.get(key)),
    ])
  );
}

module.exports = {
  getPrepaidRevenueDaily,
  getPrepaidRevenueMonthly,
  getPrepaidRevenueSummary,
  normalizeReportingRows,
};
