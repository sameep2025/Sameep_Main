const mongoose = require("mongoose");
const LoyaltyLedger = require("../models/LoyaltyLedger");
const CustomerRewardReveal = require("../models/CustomerRewardReveal");
const Vendor = require("../models/DummyVendor");
const {
  summarizeRewardLedgerRowsByVendor,
} = require("../services/loyaltyService");

const EXPIRING_SOON_DAYS = 7;
const RECENT_ACTIVITY_LIMIT_PER_VENDOR = 10;
const DEFAULT_ACTIVITY_PAGE_LIMIT = 10;
const MAX_ACTIVITY_PAGE_LIMIT = 50;
const SCRATCH_REVEAL_LAUNCH_ENV = "SCRATCH_REVEAL_LAUNCHED_AT";
const REWARD_ACTIVITY_TYPES = ["EARN", "REDEEM", "EARN_REVERSAL", "REDEEM_REVERSAL"];

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toObjectIdOrNull(value) {
  if (!mongoose.Types.ObjectId.isValid(value)) return null;
  return new mongoose.Types.ObjectId(value);
}

function getScratchRevealLaunchDate(env = process.env) {
  const rawValue = String(env?.[SCRATCH_REVEAL_LAUNCH_ENV] || "").trim();
  if (!rawValue) return null;

  const launchDate = new Date(rawValue);
  if (Number.isNaN(launchDate.getTime())) return null;

  return launchDate;
}

function buildSafeVendorDisplay(vendor) {
  if (!vendor) {
    return {
      businessName: "Unknown Business",
      subdomain: "",
      logoUrl: "",
    };
  }

  return {
    businessName: vendor.businessName || "Business",
    subdomain: vendor.subdomain || "",
    logoUrl: vendor.logoUrl || "",
  };
}

function buildRewardEventVendorDisplay(vendor) {
  return buildSafeVendorDisplay(vendor);
}

function buildRewardActivityEntry(row) {
  const type = ["REDEEM", "EARN_REVERSAL", "REDEEM_REVERSAL"].includes(row.type)
    ? row.type
    : "EARN";
  const rawPoints = toNumber(row.points);
  const isRedeemLike = type === "REDEEM";
  const entry = {
    type,
    points: Math.abs(rawPoints),
    signedPoints: isRedeemLike ? -Math.abs(rawPoints) : rawPoints,
    createdAt: row.createdAt || null,
    expiryDate: type === "EARN" ? row.expiryDate || null : null,
  };

  if (row._id) {
    entry.activityId = String(row._id);
  }

  if (type === "EARN") {
    entry.remainingPoints = Math.max(toNumber(row.remainingPoints), 0);
  }

  return entry;
}

function parseActivityLimit(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_ACTIVITY_PAGE_LIMIT;
  return Math.min(parsed, MAX_ACTIVITY_PAGE_LIMIT);
}

function encodeRewardActivityCursor(row) {
  const rowId = row?._id || row?.activityId;
  if (!row?.createdAt || !rowId) return null;
  return Buffer.from(
    JSON.stringify({
      createdAt: new Date(row.createdAt).toISOString(),
      id: String(rowId),
    })
  ).toString("base64url");
}

function decodeRewardActivityCursor(cursor) {
  const rawCursor = String(cursor || "").trim();
  if (!rawCursor) return null;

  try {
    const decoded = JSON.parse(Buffer.from(rawCursor, "base64url").toString("utf8"));
    const createdAt = new Date(decoded?.createdAt);
    const id = String(decoded?.id || "");

    if (Number.isNaN(createdAt.getTime()) || !mongoose.Types.ObjectId.isValid(id)) {
      return { error: true };
    }

    return {
      createdAt,
      id: new mongoose.Types.ObjectId(id),
    };
  } catch {
    return { error: true };
  }
}

function buildCompletedEarnPipeline({ customerId, launchDate, rewardId = null } = {}) {
  const customerObjectId = toObjectIdOrNull(customerId);
  if (!customerObjectId || !launchDate) return null;

  const match = {
    customerId: customerObjectId,
    type: "EARN",
    points: { $gt: 0 },
    createdAt: { $gte: launchDate },
  };

  if (rewardId) {
    const rewardObjectId = toObjectIdOrNull(rewardId);
    if (!rewardObjectId) return null;
    match._id = rewardObjectId;
  }

  return [
    { $match: match },
    {
      $lookup: {
        from: "transactions",
        localField: "transactionId",
        foreignField: "_id",
        as: "transaction",
      },
    },
    { $unwind: "$transaction" },
    {
      $lookup: {
        from: "billingsessions",
        localField: "transaction.billingSessionId",
        foreignField: "_id",
        as: "billingSession",
      },
    },
    { $unwind: "$billingSession" },
    { $match: { "billingSession.status": "COMPLETED" } },
    { $sort: { createdAt: -1, _id: -1 } },
    {
      $project: {
        _id: 1,
        customerId: 1,
        vendorId: 1,
        transactionId: 1,
        points: 1,
        remainingPoints: 1,
        expiryDate: 1,
        createdAt: 1,
      },
    },
  ];
}

function buildRewardRevealResponse(row, { vendor = null, revealedAt = null, availablePoints = 0 } = {}) {
  return {
    rewardId: String(row._id || ""),
    revealed: Boolean(revealedAt),
    ...(revealedAt ? { revealedAt } : {}),
    points: Math.max(toNumber(row.points), 0),
    remainingPoints: Math.max(toNumber(row.remainingPoints), 0),
    expiryDate: row.expiryDate || null,
    createdAt: row.createdAt || null,
    vendor: buildRewardEventVendorDisplay(vendor),
    availablePoints: Math.max(toNumber(availablePoints), 0),
  };
}

function buildCustomerRewardSummary({ ledgerRows = [], vendorMap = new Map(), now = new Date() }) {
  const rewardSummaries = summarizeRewardLedgerRowsByVendor({
    ledgerRows,
    now,
    expiringSoonDays: EXPIRING_SOON_DAYS,
  });
  const recentActivityByVendor = new Map();
  const recentActivityCountsByVendor = new Map();

  ledgerRows.forEach((row) => {
    const vendorId = String(row.vendorId || "");
    if (!vendorId) return;

    if (!recentActivityByVendor.has(vendorId)) {
      recentActivityByVendor.set(vendorId, []);
      recentActivityCountsByVendor.set(vendorId, 0);
    }

    const activityCount = recentActivityCountsByVendor.get(vendorId) || 0;
    recentActivityCountsByVendor.set(vendorId, activityCount + 1);

    const recentActivity = recentActivityByVendor.get(vendorId);
    if (recentActivity.length < RECENT_ACTIVITY_LIMIT_PER_VENDOR) {
      recentActivity.push(buildRewardActivityEntry(row));
    }
  });

  const vendors = Array.from(rewardSummaries.entries()).map(([vendorId, group]) => {
    return {
      vendor: buildSafeVendorDisplay(vendorMap.get(vendorId)),
      availablePoints: group.availablePoints,
      totalEarnedPoints: group.totalEarnedPoints,
      totalRedeemedPoints: group.totalRedeemedPoints,
      totalExpiredPoints: group.totalExpiredPoints,
      expiringSoonPoints: group.expiringSoonPoints,
      expiryBatches: group.expiryBatches,
      recentActivity: recentActivityByVendor.get(vendorId) || [],
      recentActivityHasMore:
        (recentActivityCountsByVendor.get(vendorId) || 0) > RECENT_ACTIVITY_LIMIT_PER_VENDOR,
      recentActivityNextCursor: encodeRewardActivityCursor(
        (recentActivityByVendor.get(vendorId) || [])[RECENT_ACTIVITY_LIMIT_PER_VENDOR - 1]
      ),
      activityVendorId: vendorId,
    };
  });

  vendors.sort((a, b) =>
    String(a.vendor.businessName || "").localeCompare(String(b.vendor.businessName || ""))
  );

  return { vendors };
}

async function calculateAvailablePointsForCustomerVendor({ customerId, vendorId, now = new Date() } = {}) {
  if (!customerId || !vendorId) return 0;

  const rows = await LoyaltyLedger.find({ customerId, vendorId }).lean();
  const summary = buildCustomerRewardSummary({
    ledgerRows: rows,
    vendorMap: new Map(),
    now,
  });

  return summary.vendors[0]?.availablePoints || 0;
}

async function buildUnrevealedRewards({ customerId, vendorMap = new Map(), launchDate = null } = {}) {
  if (!launchDate) return [];

  const pipeline = buildCompletedEarnPipeline({ customerId, launchDate });
  if (!pipeline) return [];

  const earnRows = await LoyaltyLedger.aggregate(pipeline);
  if (!earnRows.length) return [];

  const rewardIds = earnRows.map((row) => row._id).filter(Boolean);
  const customerObjectId = toObjectIdOrNull(customerId);
  if (!customerObjectId || !rewardIds.length) return [];

  const reveals = await CustomerRewardReveal.find({
    customerId: customerObjectId,
    rewardLedgerId: { $in: rewardIds },
    invalidatedAt: null,
  })
    .select("rewardLedgerId")
    .lean();

  const revealedIds = new Set(reveals.map((row) => String(row.rewardLedgerId || "")));

  return earnRows
    .filter((row) => !revealedIds.has(String(row._id || "")))
    .map((row) => buildRewardRevealResponse(row, {
      vendor: vendorMap.get(String(row.vendorId || "")),
    }));
}

async function getRewards(req, res) {
  try {
    const customerId = req.auth?.customerId;
    if (!customerId) {
      return res.status(401).json({
        success: false,
        message: "Customer portal session invalid or expired",
      });
    }

    const ledgerRows = await LoyaltyLedger.find({ customerId })
      .sort({ createdAt: -1, _id: -1 })
      .lean();

    if (!ledgerRows.length) {
      return res.json({
        success: true,
        data: { vendors: [], unrevealedRewards: [] },
      });
    }

    const vendorIds = Array.from(
      new Set(ledgerRows.map((row) => String(row.vendorId || "")).filter(Boolean))
    );

    const vendors = await Vendor.find({ _id: { $in: vendorIds } })
      .select("businessName subdomain logoUrl")
      .lean();

    const vendorMap = new Map(
      vendors.map((vendor) => [String(vendor._id), vendor])
    );

    const launchDate = getScratchRevealLaunchDate();
    const unrevealedRewards = await buildUnrevealedRewards({
      customerId,
      vendorMap,
      launchDate,
    });

    return res.json({
      success: true,
      data: {
        ...buildCustomerRewardSummary({
        ledgerRows,
        vendorMap,
        now: new Date(),
      }),
        unrevealedRewards,
      },
    });
  } catch (err) {
    console.error("customer portal rewards error:", err?.message || err);
    return res.status(500).json({
      success: false,
      message: "Unable to load rewards right now.",
    });
  }
}

async function revealReward(req, res) {
  try {
    const customerId = req.auth?.customerId;
    const rewardId = req.params?.rewardId;
    const launchDate = getScratchRevealLaunchDate();

    if (!customerId || !launchDate) {
      return res.status(404).json({
        success: false,
        message: "Reward not found or not eligible",
      });
    }

    const pipeline = buildCompletedEarnPipeline({ customerId, launchDate, rewardId });
    if (!pipeline) {
      return res.status(404).json({
        success: false,
        message: "Reward not found or not eligible",
      });
    }

    const [reward] = await LoyaltyLedger.aggregate(pipeline);
    if (!reward) {
      return res.status(404).json({
        success: false,
        message: "Reward not found or not eligible",
      });
    }

    const customerObjectId = toObjectIdOrNull(customerId);
    if (!customerObjectId) {
      return res.status(404).json({
        success: false,
        message: "Reward not found or not eligible",
      });
    }

    let reveal;
    try {
      reveal = await CustomerRewardReveal.findOneAndUpdate(
        {
          customerId: customerObjectId,
          rewardLedgerId: reward._id,
        },
        {
          $setOnInsert: {
            customerId: customerObjectId,
            vendorId: reward.vendorId,
            rewardLedgerId: reward._id,
            revealedAt: new Date(),
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        }
      );
    } catch (err) {
      if (err?.code !== 11000) throw err;
      reveal = await CustomerRewardReveal.findOne({
        customerId: customerObjectId,
        rewardLedgerId: reward._id,
      });
    }

    const [vendor, availablePoints] = await Promise.all([
      Vendor.findById(reward.vendorId).select("businessName subdomain logoUrl").lean(),
      calculateAvailablePointsForCustomerVendor({
        customerId,
        vendorId: reward.vendorId,
        now: new Date(),
      }),
    ]);

    return res.json({
      success: true,
      data: buildRewardRevealResponse(reward, {
        vendor,
        revealedAt: reveal?.revealedAt || null,
        availablePoints,
      }),
    });
  } catch (err) {
    console.error("customer portal reward reveal error:", err?.message || err);
    return res.status(500).json({
      success: false,
      message: "Unable to reveal reward right now.",
    });
  }
}

async function getRewardActivity(req, res) {
  try {
    const customerId = req.auth?.customerId;
    const vendorId = req.params?.vendorId;

    if (!customerId) {
      return res.status(401).json({
        success: false,
        message: "Customer portal session invalid or expired",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid vendor",
      });
    }

    const limit = parseActivityLimit(req.query?.limit);
    const cursor = decodeRewardActivityCursor(req.query?.cursor);
    if (cursor?.error) {
      return res.status(400).json({
        success: false,
        message: "Invalid activity cursor",
      });
    }

    const query = {
      customerId,
      vendorId: new mongoose.Types.ObjectId(vendorId),
      type: { $in: REWARD_ACTIVITY_TYPES },
    };

    if (cursor) {
      query.$or = [
        { createdAt: { $lt: cursor.createdAt } },
        {
          createdAt: cursor.createdAt,
          _id: { $lt: cursor.id },
        },
      ];
    }

    const rows = await LoyaltyLedger.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean();

    const pageRows = rows.slice(0, limit);
    const hasMore = rows.length > limit;

    return res.json({
      success: true,
      data: {
        items: pageRows.map(buildRewardActivityEntry),
        hasMore,
        nextCursor: hasMore ? encodeRewardActivityCursor(pageRows[pageRows.length - 1]) : null,
      },
    });
  } catch (err) {
    console.error("customer portal reward activity error:", err?.message || err);
    return res.status(500).json({
      success: false,
      message: "Unable to load reward activity right now.",
    });
  }
}

module.exports = {
  EXPIRING_SOON_DAYS,
  RECENT_ACTIVITY_LIMIT_PER_VENDOR,
  DEFAULT_ACTIVITY_PAGE_LIMIT,
  MAX_ACTIVITY_PAGE_LIMIT,
  REWARD_ACTIVITY_TYPES,
  SCRATCH_REVEAL_LAUNCH_ENV,
  buildCompletedEarnPipeline,
  buildCustomerRewardSummary,
  buildUnrevealedRewards,
  calculateAvailablePointsForCustomerVendor,
  decodeRewardActivityCursor,
  encodeRewardActivityCursor,
  getScratchRevealLaunchDate,
  getRewardActivity,
  getRewards,
  revealReward,
};
