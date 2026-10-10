const LoyaltyLedger = require("../models/LoyaltyLedger");

const EXPIRING_SOON_DAYS = 7;
const LEGACY_RESTORATION_FALLBACK_DAYS = 7;

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toDateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isLegacyRestorationCredit(row) {
  return row?.type === "REDEEM_REVERSAL" && Boolean(row?.metadata?.legacyNoAllocationRestoration);
}

function getRewardExpiryDate(row) {
  const expiryDate = toDateOrNull(row?.expiryDate);
  if (expiryDate) return expiryDate;

  if (isLegacyRestorationCredit(row)) {
    const createdAt = toDateOrNull(row?.createdAt);
    if (createdAt) {
      return new Date(createdAt.getTime() + LEGACY_RESTORATION_FALLBACK_DAYS * 24 * 60 * 60 * 1000);
    }
  }

  return null;
}

function isExpired(row, now = new Date()) {
  const expiryDate = getRewardExpiryDate(row);
  return Boolean(expiryDate && expiryDate < now);
}

function isUnexpired(row, now = new Date()) {
  return !isExpired(row, now);
}

function getRewardCreditRemaining(row) {
  return Math.max(toNumber(row?.remainingPoints), 0);
}

function getRewardCreditCap(row) {
  if (row?.type === "REDEEM_REVERSAL") {
    return Math.max(toNumber(row?.points), 0);
  }

  return Math.max(toNumber(row?.points), 0);
}

function sortRewardCreditBuckets(a, b) {
  const aExpiry = getRewardExpiryDate(a);
  const bExpiry = getRewardExpiryDate(b);

  if (aExpiry && bExpiry && aExpiry.getTime() !== bExpiry.getTime()) {
    return aExpiry.getTime() - bExpiry.getTime();
  }

  if (aExpiry && !bExpiry) return -1;
  if (!aExpiry && bExpiry) return 1;

  const aCreated = toDateOrNull(a?.createdAt)?.getTime() || 0;
  const bCreated = toDateOrNull(b?.createdAt)?.getTime() || 0;
  return aCreated - bCreated;
}

function makeEmptySummary(vendorId = "") {
  return {
    vendorId,
    accountingBalance: 0,
    redeemableBalance: 0,
    availablePoints: 0,
    totalEarnedPoints: 0,
    totalRedeemedPoints: 0,
    totalExpiredPoints: 0,
    expiringSoonPoints: 0,
    expiryBatches: [],
  };
}

function summarizeRewardLedgerRowsByVendor({
  ledgerRows = [],
  now = new Date(),
  expiringSoonDays = EXPIRING_SOON_DAYS,
} = {}) {
  const groups = new Map();
  const expiryBatchMaps = new Map();
  const soonDate = new Date(now.getTime() + expiringSoonDays * 24 * 60 * 60 * 1000);

  const ensureGroup = (vendorId) => {
    const key = String(vendorId || "");
    if (!key) return null;

    if (!groups.has(key)) {
      groups.set(key, makeEmptySummary(key));
      expiryBatchMaps.set(key, new Map());
    }

    return groups.get(key);
  };

  ledgerRows.forEach((row) => {
    const group = ensureGroup(row?.vendorId);
    if (!group) return;

    const points = toNumber(row?.points);

    if (row.type === "EARN") {
      const earnedPoints = Math.max(points, 0);
      const remainingPoints = getRewardCreditRemaining(row);
      const expiryDate = getRewardExpiryDate(row);

      group.totalEarnedPoints += earnedPoints;

      if (remainingPoints <= 0) return;

      if (expiryDate && expiryDate < now) {
        group.totalExpiredPoints += remainingPoints;
        return;
      }

      group.accountingBalance += remainingPoints;

      if (expiryDate && expiryDate <= soonDate) {
        group.expiringSoonPoints += remainingPoints;
        const expiryKey = expiryDate.toISOString();
        const expiryBatchMap = expiryBatchMaps.get(group.vendorId);
        const current = expiryBatchMap.get(expiryKey) || {
          points: 0,
          expiryDate: expiryKey,
        };
        current.points += remainingPoints;
        expiryBatchMap.set(expiryKey, current);
      }

      return;
    }

    if (row.type === "REDEEM") {
      group.totalRedeemedPoints += Math.abs(points);
      return;
    }

    if (row.type === "EARN_REVERSAL") {
      group.totalEarnedPoints -= Math.abs(points);

      if (isUnexpired(row, now)) {
        group.accountingBalance += points;
      }

      return;
    }

    if (row.type === "REDEEM_REVERSAL") {
      const restoredPoints = Math.max(points, 0);
      group.totalRedeemedPoints -= restoredPoints;

      if (!isLegacyRestorationCredit(row)) return;

      const remainingPoints = getRewardCreditRemaining(row);
      const expiryDate = getRewardExpiryDate(row);

      if (remainingPoints <= 0) return;

      if (expiryDate && expiryDate < now) {
        group.totalExpiredPoints += remainingPoints;
        return;
      }

      group.accountingBalance += remainingPoints;

      if (expiryDate && expiryDate <= soonDate) {
        group.expiringSoonPoints += remainingPoints;
        const expiryKey = expiryDate.toISOString();
        const expiryBatchMap = expiryBatchMaps.get(group.vendorId);
        const current = expiryBatchMap.get(expiryKey) || {
          points: 0,
          expiryDate: expiryKey,
        };
        current.points += remainingPoints;
        expiryBatchMap.set(expiryKey, current);
      }
    }
  });

  groups.forEach((group, vendorId) => {
    group.redeemableBalance = Math.max(group.accountingBalance, 0);
    group.availablePoints = group.redeemableBalance;
    group.totalEarnedPoints = Math.max(group.totalEarnedPoints, 0);
    group.totalRedeemedPoints = Math.max(group.totalRedeemedPoints, 0);
    group.expiryBatches = Array.from(expiryBatchMaps.get(vendorId).values()).sort(
      (a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()
    );
  });

  return groups;
}

function summarizeRewardLedgerRowsForVendor({ ledgerRows = [], vendorId, now = new Date() } = {}) {
  return (
    summarizeRewardLedgerRowsByVendor({ ledgerRows, now }).get(String(vendorId || "")) ||
    makeEmptySummary(String(vendorId || ""))
  );
}

function normalizeLedgerRowsForBalance(rows = [], vendorId) {
  return rows.map((row) => ({
    vendorId: row?.vendorId || vendorId,
    type: row?.type || "EARN",
    points: row?.points ?? row?.remainingPoints ?? 0,
    ...row,
  }));
}

async function calculateRewardBalance({
  customerId,
  vendorId,
  now = new Date(),
  session = null,
} = {}) {
  if (!customerId || !vendorId) {
    return makeEmptySummary(String(vendorId || ""));
  }

  const query = LoyaltyLedger.find({ customerId, vendorId });
  if (session && typeof query.session === "function") query.session(session);

  let rows;
  if (typeof query.lean === "function") {
    rows = await query.lean();
  } else if (typeof query.sort === "function") {
    rows = await query.sort({ createdAt: 1 });
  } else {
    rows = await query;
  }

  return summarizeRewardLedgerRowsForVendor({
    ledgerRows: normalizeLedgerRowsForBalance(rows, vendorId),
    vendorId,
    now,
  });
}

async function calculateCustomerBalance(customerId, vendorId) {
  const balance = await calculateRewardBalance({ customerId, vendorId });
  return balance.redeemableBalance;
}

async function findConsumableRewardBuckets({
  customerId,
  vendorId,
  now = new Date(),
  session = null,
} = {}) {
  const query = LoyaltyLedger.find({
    customerId,
    vendorId,
    remainingPoints: { $gt: 0 },
    $or: [
      {
        type: "EARN",
      },
      {
        type: "REDEEM_REVERSAL",
        "metadata.legacyNoAllocationRestoration": true,
      },
    ],
    $and: [
      {
        $or: [
          { expiryDate: null },
          { expiryDate: { $gte: now } },
        ],
      },
    ],
  });

  if (session && typeof query.session === "function") query.session(session);

  const sortedQuery = typeof query.sort === "function"
    ? query.sort({ expiryDate: 1, createdAt: 1 })
    : query;
  const buckets = await sortedQuery;
  return buckets
    .filter((bucket) => isUnexpired(bucket, now))
    .sort(sortRewardCreditBuckets);
}

module.exports = {
  calculateCustomerBalance,
  calculateRewardBalance,
  findConsumableRewardBuckets,
  getRewardExpiryDate,
  getRewardCreditCap,
  getRewardCreditRemaining,
  sortRewardCreditBuckets,
  summarizeRewardLedgerRowsByVendor,
  summarizeRewardLedgerRowsForVendor,
};
