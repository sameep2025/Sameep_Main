const mongoose = require("mongoose");
const LoyaltyLedger = require("../models/LoyaltyLedger");
const CustomerRewardReveal = require("../models/CustomerRewardReveal");
const Vendor = require("../models/DummyVendor");

const EXPIRING_SOON_DAYS = 7;
const RECENT_ACTIVITY_LIMIT_PER_VENDOR = 10;
const SCRATCH_REVEAL_LAUNCH_ENV = "SCRATCH_REVEAL_LAUNCHED_AT";

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toDateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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

function makeEmptyVendorRewardGroup(vendorId) {
  return {
    vendorId,
    availablePoints: 0,
    totalEarnedPoints: 0,
    totalRedeemedPoints: 0,
    totalExpiredPoints: 0,
    expiringSoonPoints: 0,
    expiryBatchMap: new Map(),
    recentActivity: [],
  };
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
  const type = row.type === "REDEEM" ? "REDEEM" : "EARN";
  const rawPoints = toNumber(row.points);
  const entry = {
    type,
    points: type === "REDEEM" ? Math.abs(rawPoints) : Math.max(rawPoints, 0),
    signedPoints: type === "REDEEM" ? -Math.abs(rawPoints) : Math.max(rawPoints, 0),
    createdAt: row.createdAt || null,
    expiryDate: type === "EARN" ? row.expiryDate || null : null,
  };

  if (type === "EARN") {
    entry.remainingPoints = Math.max(toNumber(row.remainingPoints), 0);
  }

  return entry;
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
  const groups = new Map();
  const soonDate = new Date(now.getTime() + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000);

  ledgerRows.forEach((row) => {
    const vendorId = String(row.vendorId || "");
    if (!vendorId) return;

    if (!groups.has(vendorId)) {
      groups.set(vendorId, makeEmptyVendorRewardGroup(vendorId));
    }

    const group = groups.get(vendorId);
    const type = row.type;
    const points = toNumber(row.points);

    if (type === "EARN") {
      const earnedPoints = Math.max(points, 0);
      const remainingPoints = Math.max(toNumber(row.remainingPoints), 0);
      const expiryDate = toDateOrNull(row.expiryDate);

      group.totalEarnedPoints += earnedPoints;

      if (remainingPoints > 0) {
        if (!expiryDate || expiryDate >= now) {
          group.availablePoints += remainingPoints;
        }

        if (expiryDate && expiryDate < now) {
          group.totalExpiredPoints += remainingPoints;
        }

        if (expiryDate && expiryDate > now && expiryDate <= soonDate) {
          group.expiringSoonPoints += remainingPoints;
          const key = expiryDate.toISOString();
          const current = group.expiryBatchMap.get(key) || {
            points: 0,
            expiryDate: key,
          };
          current.points += remainingPoints;
          group.expiryBatchMap.set(key, current);
        }
      }
    } else if (type === "REDEEM") {
      group.totalRedeemedPoints += Math.abs(points);
    }

    if (group.recentActivity.length < RECENT_ACTIVITY_LIMIT_PER_VENDOR) {
      group.recentActivity.push(buildRewardActivityEntry(row));
    }
  });

  const vendors = Array.from(groups.entries()).map(([vendorId, group]) => {
    const expiryBatches = Array.from(group.expiryBatchMap.values()).sort(
      (a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()
    );

    return {
      vendor: buildSafeVendorDisplay(vendorMap.get(vendorId)),
      availablePoints: group.availablePoints,
      totalEarnedPoints: group.totalEarnedPoints,
      totalRedeemedPoints: group.totalRedeemedPoints,
      totalExpiredPoints: group.totalExpiredPoints,
      expiringSoonPoints: group.expiringSoonPoints,
      expiryBatches,
      recentActivity: group.recentActivity,
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
      .sort({ createdAt: -1 })
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

module.exports = {
  EXPIRING_SOON_DAYS,
  RECENT_ACTIVITY_LIMIT_PER_VENDOR,
  SCRATCH_REVEAL_LAUNCH_ENV,
  buildCompletedEarnPipeline,
  buildCustomerRewardSummary,
  buildUnrevealedRewards,
  calculateAvailablePointsForCustomerVendor,
  getScratchRevealLaunchDate,
  getRewards,
  revealReward,
};
