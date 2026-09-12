const BillingSession = require("../models/BillingSession");
const DummyCategory = require("../models/dummyCategory");
const DummyVendor = require("../models/DummyVendor");
const LoyaltyLedger = require("../models/LoyaltyLedger");
const VendorSubscription = require("../models/VendorSubscription");
const {
  buildCreatedAtMatch,
  getAdminAnalyticsDateRange,
} = require("./adminAnalyticsDateRanges");

function getFirstAggregationRow(result) {
  return Array.isArray(result) && result.length ? result[0] : {};
}

function calculateAverage(total, count) {
  return count > 0 ? total / count : 0;
}

async function buildCategoryNameMap(categoryIds = []) {
  const ids = Array.from(new Set(categoryIds.filter(Boolean).map(String)));
  if (!ids.length) return new Map();

  const categories = await DummyCategory.find(
    { _id: { $in: ids } },
    { name: 1 }
  ).lean();

  return new Map(categories.map((category) => [String(category._id), category.name]));
}

function resolveCategoryName(categoryId, categoryNameMap) {
  if (!categoryId) return "Uncategorized";
  return categoryNameMap.get(String(categoryId)) || "Unknown Category";
}

function buildCompletedBillMatch(range) {
  return {
    status: "COMPLETED",
    ...buildCreatedAtMatch(range),
  };
}

function getBillingTrendBucket(period) {
  if (period === "today") {
    return {
      format: "%H:00",
      outputKey: "hour",
    };
  }

  if (period === "thisMonth" || period === "month") {
    return {
      format: "%Y-%m-%d",
      outputKey: "date",
    };
  }

  return {
    format: "%Y-%m",
    outputKey: "month",
  };
}

function getAnalyticsTrendBucket(period) {
  return getBillingTrendBucket(period);
}

async function getOverviewMetrics({ period, month } = {}) {
  const range = getAdminAnalyticsDateRange(period, new Date(), { month });
  const createdAtMatch = buildCreatedAtMatch(range);
  const completedBillMatch = buildCompletedBillMatch(range);

  const [
    billingRows,
    walkInBills,
    uniqueCustomerRows,
    activeVendorRows,
    rewardRows,
  ] = await Promise.all([
    BillingSession.aggregate([
      { $match: completedBillMatch },
      {
        $group: {
          _id: null,
          completedBills: { $sum: 1 },
          grossBillingValue: { $sum: { $ifNull: ["$totalAmount", 0] } },
        },
      },
    ]),
    BillingSession.countDocuments({
      ...completedBillMatch,
      customerId: null,
    }),
    BillingSession.aggregate([
      {
        $match: {
          ...completedBillMatch,
          customerId: { $ne: null },
        },
      },
      { $group: { _id: "$customerId" } },
      { $count: "uniqueCustomers" },
    ]),
    BillingSession.aggregate([
      {
        $match: {
          ...completedBillMatch,
          vendorId: { $ne: null },
        },
      },
      { $group: { _id: "$vendorId" } },
      { $count: "activeBillingVendors" },
    ]),
    LoyaltyLedger.aggregate([
      {
        $match: {
          type: { $in: ["EARN", "REDEEM"] },
          ...createdAtMatch,
        },
      },
      {
        $group: {
          _id: null,
          issued: {
            $sum: {
              $cond: [{ $eq: ["$type", "EARN"] }, { $ifNull: ["$points", 0] }, 0],
            },
          },
          redeemed: {
            $sum: {
              $cond: [{ $eq: ["$type", "REDEEM"] }, { $abs: { $ifNull: ["$points", 0] } }, 0],
            },
          },
        },
      },
    ]),
  ]);

  const billing = getFirstAggregationRow(billingRows);
  const uniqueCustomers = getFirstAggregationRow(uniqueCustomerRows);
  const activeVendors = getFirstAggregationRow(activeVendorRows);
  const rewards = getFirstAggregationRow(rewardRows);

  const completedBills = billing.completedBills || 0;
  const grossBillingValue = billing.grossBillingValue || 0;

  return {
    period: range.period,
    timezone: range.timezone,
    range: {
      from: range.from ? range.from.toISOString() : null,
      to: range.to.toISOString(),
    },
    billing: {
      completedBills,
      grossBillingValue,
      averageBillValue: calculateAverage(grossBillingValue, completedBills),
    },
    customers: {
      uniqueCustomers: uniqueCustomers.uniqueCustomers || 0,
      walkInBills: walkInBills || 0,
    },
    vendors: {
      activeBillingVendors: activeVendors.activeBillingVendors || 0,
    },
    rewards: {
      issued: rewards.issued || 0,
      redeemed: rewards.redeemed || 0,
    },
  };
}

async function getBillingAnalytics({ period, month } = {}) {
  const range = getAdminAnalyticsDateRange(period, new Date(), { month });
  const completedBillMatch = buildCompletedBillMatch(range);
  const trendBucket = getBillingTrendBucket(period);

  const [summaryRows, trendRows, vendorPerformanceRows] = await Promise.all([
    BillingSession.aggregate([
      { $match: completedBillMatch },
      {
        $group: {
          _id: null,
          completedBills: { $sum: 1 },
          grossBillingValue: { $sum: { $ifNull: ["$totalAmount", 0] } },
        },
      },
    ]),
    BillingSession.aggregate([
      { $match: completedBillMatch },
      {
        $group: {
          _id: {
            $dateToString: {
              format: trendBucket.format,
              date: "$createdAt",
              timezone: range.timezone,
            },
          },
          completedBills: { $sum: 1 },
          grossBillingValue: { $sum: { $ifNull: ["$totalAmount", 0] } },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          bucket: "$_id",
          [trendBucket.outputKey]: "$_id",
          completedBills: 1,
          grossBillingValue: 1,
        },
      },
    ]),
    BillingSession.aggregate([
      { $match: completedBillMatch },
      {
        $group: {
          _id: "$vendorId",
          completedBills: { $sum: 1 },
          grossBillingValue: { $sum: { $ifNull: ["$totalAmount", 0] } },
          customerIds: { $addToSet: "$customerId" },
          walkInBills: {
            $sum: {
              $cond: [{ $eq: [{ $ifNull: ["$customerId", null] }, null] }, 1, 0],
            },
          },
        },
      },
      {
        $lookup: {
          from: "dummyvendors",
          localField: "_id",
          foreignField: "_id",
          as: "vendor",
        },
      },
      {
        $unwind: {
          path: "$vendor",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 0,
          vendorId: {
            $cond: [{ $ne: ["$_id", null] }, { $toString: "$_id" }, null],
          },
          businessName: { $ifNull: ["$vendor.businessName", "Unknown Vendor"] },
          categoryId: {
            $cond: [
              { $ne: ["$vendor.categoryId", null] },
              { $toString: "$vendor.categoryId" },
              null,
            ],
          },
          vendorMetadataFound: { $cond: [{ $ifNull: ["$vendor._id", false] }, true, false] },
          completedBills: 1,
          grossBillingValue: 1,
          averageBillValue: {
            $cond: [
              { $gt: ["$completedBills", 0] },
              { $divide: ["$grossBillingValue", "$completedBills"] },
              0,
            ],
          },
          uniqueCustomers: { $size: { $setDifference: ["$customerIds", [null]] } },
          walkInBills: 1,
        },
      },
      { $sort: { grossBillingValue: -1, completedBills: -1, vendorId: 1 } },
    ]),
  ]);

  const summary = getFirstAggregationRow(summaryRows);
  const completedBills = summary.completedBills || 0;
  const grossBillingValue = summary.grossBillingValue || 0;

  const withRank = (items) =>
    items.map((item, index) => ({
      rank: index + 1,
      vendorId: item.vendorId,
      businessName: item.businessName,
      completedBills: item.completedBills,
      grossBillingValue: item.grossBillingValue,
      averageBillValue: item.averageBillValue,
    }));

  const topByBillCount = withRank(
    [...vendorPerformanceRows]
      .sort((a, b) => {
        if (b.completedBills !== a.completedBills) {
          return b.completedBills - a.completedBills;
        }
        return b.grossBillingValue - a.grossBillingValue;
      })
      .slice(0, 10)
  );

  const topByBillingValue = withRank(
    [...vendorPerformanceRows]
      .sort((a, b) => {
        if (b.grossBillingValue !== a.grossBillingValue) {
          return b.grossBillingValue - a.grossBillingValue;
        }
        return b.completedBills - a.completedBills;
      })
      .slice(0, 10)
  );

  const missingVendorReferences = vendorPerformanceRows
    .filter((row) => !row.vendorMetadataFound)
    .map((row) => row.vendorId);

  return {
    period: range.period,
    timezone: range.timezone,
    range: {
      from: range.from ? range.from.toISOString() : null,
      to: range.to.toISOString(),
    },
    summary: {
      completedBills,
      grossBillingValue,
      averageBillValue: calculateAverage(grossBillingValue, completedBills),
    },
    trend: trendRows,
    vendorPerformance: vendorPerformanceRows.map(({ vendorMetadataFound, ...row }) => row),
    topVendors: {
      topByBillCount,
      topByBillingValue,
    },
    diagnostics: {
      missingVendorReferences,
    },
  };
}

async function getRewardsAnalytics({ period, month } = {}) {
  const range = getAdminAnalyticsDateRange(period, new Date(), { month });
  const createdAtMatch = buildCreatedAtMatch(range);
  const ledgerMatch = {
    type: { $in: ["EARN", "REDEEM"] },
    ...createdAtMatch,
  };
  const trendBucket = getAnalyticsTrendBucket(period);
  const now = new Date();

  const [
    summaryRows,
    trendRows,
    vendorPerformanceRows,
    outstandingRows,
    dataQualityRows,
  ] = await Promise.all([
    LoyaltyLedger.aggregate([
      { $match: ledgerMatch },
      {
        $group: {
          _id: null,
          issuedPoints: {
            $sum: {
              $cond: [{ $eq: ["$type", "EARN"] }, { $ifNull: ["$points", 0] }, 0],
            },
          },
          redeemedPoints: {
            $sum: {
              $cond: [{ $eq: ["$type", "REDEEM"] }, { $abs: { $ifNull: ["$points", 0] } }, 0],
            },
          },
          earnEvents: {
            $sum: { $cond: [{ $eq: ["$type", "EARN"] }, 1, 0] },
          },
          redeemEvents: {
            $sum: { $cond: [{ $eq: ["$type", "REDEEM"] }, 1, 0] },
          },
          customersEarnedSet: {
            $addToSet: {
              $cond: [{ $eq: ["$type", "EARN"] }, "$customerId", null],
            },
          },
          customersRedeemedSet: {
            $addToSet: {
              $cond: [{ $eq: ["$type", "REDEEM"] }, "$customerId", null],
            },
          },
          vendorsIssuedSet: {
            $addToSet: {
              $cond: [{ $eq: ["$type", "EARN"] }, "$vendorId", null],
            },
          },
          vendorsRedeemedSet: {
            $addToSet: {
              $cond: [{ $eq: ["$type", "REDEEM"] }, "$vendorId", null],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          issuedPoints: 1,
          redeemedPoints: 1,
          earnEvents: 1,
          redeemEvents: 1,
          customersEarned: { $size: { $setDifference: ["$customersEarnedSet", [null]] } },
          customersRedeemed: { $size: { $setDifference: ["$customersRedeemedSet", [null]] } },
          vendorsIssuedRewards: { $size: { $setDifference: ["$vendorsIssuedSet", [null]] } },
          vendorsWithRedemptions: { $size: { $setDifference: ["$vendorsRedeemedSet", [null]] } },
        },
      },
    ]),
    LoyaltyLedger.aggregate([
      { $match: ledgerMatch },
      {
        $group: {
          _id: {
            $dateToString: {
              format: trendBucket.format,
              date: "$createdAt",
              timezone: range.timezone,
            },
          },
          issuedPoints: {
            $sum: {
              $cond: [{ $eq: ["$type", "EARN"] }, { $ifNull: ["$points", 0] }, 0],
            },
          },
          redeemedPoints: {
            $sum: {
              $cond: [{ $eq: ["$type", "REDEEM"] }, { $abs: { $ifNull: ["$points", 0] } }, 0],
            },
          },
          earnEvents: {
            $sum: { $cond: [{ $eq: ["$type", "EARN"] }, 1, 0] },
          },
          redeemEvents: {
            $sum: { $cond: [{ $eq: ["$type", "REDEEM"] }, 1, 0] },
          },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          bucket: "$_id",
          [trendBucket.outputKey]: "$_id",
          issuedPoints: 1,
          redeemedPoints: 1,
          earnEvents: 1,
          redeemEvents: 1,
        },
      },
    ]),
    LoyaltyLedger.aggregate([
      { $match: ledgerMatch },
      {
        $group: {
          _id: "$vendorId",
          issuedPoints: {
            $sum: {
              $cond: [{ $eq: ["$type", "EARN"] }, { $ifNull: ["$points", 0] }, 0],
            },
          },
          redeemedPoints: {
            $sum: {
              $cond: [{ $eq: ["$type", "REDEEM"] }, { $abs: { $ifNull: ["$points", 0] } }, 0],
            },
          },
          earnEvents: {
            $sum: { $cond: [{ $eq: ["$type", "EARN"] }, 1, 0] },
          },
          redeemEvents: {
            $sum: { $cond: [{ $eq: ["$type", "REDEEM"] }, 1, 0] },
          },
          earnedCustomerIds: {
            $addToSet: {
              $cond: [{ $eq: ["$type", "EARN"] }, "$customerId", null],
            },
          },
          redeemedCustomerIds: {
            $addToSet: {
              $cond: [{ $eq: ["$type", "REDEEM"] }, "$customerId", null],
            },
          },
        },
      },
      {
        $lookup: {
          from: "dummyvendors",
          localField: "_id",
          foreignField: "_id",
          as: "vendor",
        },
      },
      {
        $unwind: {
          path: "$vendor",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 0,
          vendorId: {
            $cond: [{ $ne: ["$_id", null] }, { $toString: "$_id" }, null],
          },
          businessName: { $ifNull: ["$vendor.businessName", "Unknown Vendor"] },
          categoryId: {
            $cond: [
              { $ne: ["$vendor.categoryId", null] },
              { $toString: "$vendor.categoryId" },
              null,
            ],
          },
          vendorMetadataFound: { $cond: [{ $ifNull: ["$vendor._id", false] }, true, false] },
          issuedPoints: 1,
          redeemedPoints: 1,
          earnEvents: 1,
          redeemEvents: 1,
          uniqueCustomersEarned: { $size: { $setDifference: ["$earnedCustomerIds", [null]] } },
          uniqueCustomersRedeemed: { $size: { $setDifference: ["$redeemedCustomerIds", [null]] } },
        },
      },
      { $sort: { issuedPoints: -1, redeemedPoints: -1, vendorId: 1 } },
    ]),
    LoyaltyLedger.aggregate([
      {
        $match: {
          type: "EARN",
          remainingPoints: { $gt: 0 },
          $or: [{ expiryDate: null }, { expiryDate: { $gt: now } }],
        },
      },
      {
        $group: {
          _id: null,
          currentOutstandingPoints: { $sum: { $ifNull: ["$remainingPoints", 0] } },
        },
      },
    ]),
    LoyaltyLedger.aggregate([
      { $match: ledgerMatch },
      {
        $facet: {
          earnRowsWithZeroOrNegativePoints: [
            { $match: { type: "EARN", points: { $lte: 0 } } },
            { $count: "count" },
          ],
          redeemRowsWithZeroOrPositivePoints: [
            { $match: { type: "REDEEM", points: { $gte: 0 } } },
            { $count: "count" },
          ],
          rowsMissingVendorId: [
            { $match: { vendorId: null } },
            { $count: "count" },
          ],
          rowsMissingCustomerId: [
            { $match: { customerId: null } },
            { $count: "count" },
          ],
          earnRowsMissingExpiryDate: [
            { $match: { type: "EARN", expiryDate: null } },
            { $count: "count" },
          ],
          earnRowsMissingRemainingPoints: [
            { $match: { type: "EARN", remainingPoints: null } },
            { $count: "count" },
          ],
          transactionsWithEarnAndRedeem: [
            { $match: { transactionId: { $ne: null } } },
            {
              $group: {
                _id: "$transactionId",
                earnRows: { $sum: { $cond: [{ $eq: ["$type", "EARN"] }, 1, 0] } },
                redeemRows: { $sum: { $cond: [{ $eq: ["$type", "REDEEM"] }, 1, 0] } },
              },
            },
            { $match: { earnRows: { $gt: 0 }, redeemRows: { $gt: 0 } } },
            { $count: "count" },
          ],
          suspiciousDuplicateLedgerRows: [
            { $match: { transactionId: { $ne: null } } },
            {
              $group: {
                _id: "$transactionId",
                earnRows: { $sum: { $cond: [{ $eq: ["$type", "EARN"] }, 1, 0] } },
                redeemRows: { $sum: { $cond: [{ $eq: ["$type", "REDEEM"] }, 1, 0] } },
              },
            },
            {
              $match: {
                $or: [{ earnRows: { $gt: 1 } }, { redeemRows: { $gt: 1 } }],
              },
            },
            { $count: "count" },
          ],
        },
      },
    ]),
  ]);

  const summary = getFirstAggregationRow(summaryRows);
  const outstanding = getFirstAggregationRow(outstandingRows);
  const dataQuality = getFirstAggregationRow(dataQualityRows);

  const getFacetCount = (name) =>
    Array.isArray(dataQuality[name]) && dataQuality[name][0]?.count
      ? dataQuality[name][0].count
      : 0;

  const withRank = (items) =>
    items.map((item, index) => ({
      rank: index + 1,
      vendorId: item.vendorId,
      businessName: item.businessName,
      issuedPoints: item.issuedPoints,
      redeemedPoints: item.redeemedPoints,
      earnEvents: item.earnEvents,
      redeemEvents: item.redeemEvents,
    }));

  const topByPointsIssued = withRank(
    [...vendorPerformanceRows]
      .sort((a, b) => {
        if (b.issuedPoints !== a.issuedPoints) {
          return b.issuedPoints - a.issuedPoints;
        }
        return b.redeemedPoints - a.redeemedPoints;
      })
      .slice(0, 10)
  );

  const topByPointsRedeemed = withRank(
    [...vendorPerformanceRows]
      .sort((a, b) => {
        if (b.redeemedPoints !== a.redeemedPoints) {
          return b.redeemedPoints - a.redeemedPoints;
        }
        return b.issuedPoints - a.issuedPoints;
      })
      .slice(0, 10)
  );

  const missingVendorReferences = vendorPerformanceRows
    .filter((row) => !row.vendorMetadataFound)
    .map((row) => row.vendorId);

  return {
    period: range.period,
    timezone: range.timezone,
    range: {
      from: range.from ? range.from.toISOString() : null,
      to: range.to.toISOString(),
    },
    summary: {
      issuedPoints: summary.issuedPoints || 0,
      redeemedPoints: summary.redeemedPoints || 0,
      earnEvents: summary.earnEvents || 0,
      redeemEvents: summary.redeemEvents || 0,
      customersEarned: summary.customersEarned || 0,
      customersRedeemed: summary.customersRedeemed || 0,
      vendorsIssuedRewards: summary.vendorsIssuedRewards || 0,
      vendorsWithRedemptions: summary.vendorsWithRedemptions || 0,
      currentOutstandingPoints: outstanding.currentOutstandingPoints || 0,
      expiredPoints: null,
    },
    trend: trendRows,
    vendorPerformance: vendorPerformanceRows.map(({ vendorMetadataFound, ...row }) => row),
    topVendors: {
      topByPointsIssued,
      topByPointsRedeemed,
    },
    diagnostics: {
      missingVendorReferences,
      currentOutstandingPoints:
        "Calculated from current non-expired EARN ledger remainingPoints across all time.",
      expiredPoints: "Historical expiry events are not persisted.",
      dataQuality: {
        earnRowsWithZeroOrNegativePoints: getFacetCount("earnRowsWithZeroOrNegativePoints"),
        redeemRowsWithZeroOrPositivePoints: getFacetCount("redeemRowsWithZeroOrPositivePoints"),
        rowsMissingVendorId: getFacetCount("rowsMissingVendorId"),
        rowsMissingCustomerId: getFacetCount("rowsMissingCustomerId"),
        earnRowsMissingExpiryDate: getFacetCount("earnRowsMissingExpiryDate"),
        earnRowsMissingRemainingPoints: getFacetCount("earnRowsMissingRemainingPoints"),
        transactionsWithEarnAndRedeem: getFacetCount("transactionsWithEarnAndRedeem"),
        suspiciousDuplicateLedgerRows: getFacetCount("suspiciousDuplicateLedgerRows"),
      },
    },
  };
}

function buildPeriodExpression(range) {
  const conditions = [{ $lte: ["$createdAt", range.to] }];
  if (range.from) {
    conditions.unshift({ $gte: ["$createdAt", range.from] });
  }
  return { $and: conditions };
}

function buildFirstVisitMatch(range) {
  const match = { lifetimeFirstVisit: { $lte: range.to } };
  if (range.from) {
    match.lifetimeFirstVisit.$gte = range.from;
  }
  return match;
}

function buildDateInRangeExpression(fieldPath, range) {
  const conditions = [{ $lte: [fieldPath, range.to] }];
  if (range.from) {
    conditions.unshift({ $gte: [fieldPath, range.from] });
  }
  return { $and: conditions };
}

async function getCustomerAnalytics({ period, month } = {}) {
  const range = getAdminAnalyticsDateRange(period, new Date(), { month });
  const completedBillMatch = buildCompletedBillMatch(range);
  const identifiedBillMatch = {
    ...completedBillMatch,
    customerId: { $ne: null },
  };
  const trendBucket = getAnalyticsTrendBucket(period);
  const periodExpression = buildPeriodExpression(range);
  const futureDate = new Date("9999-12-31T00:00:00.000Z");

  const [
    customerSummaryRows,
    walkInBills,
    newCustomerRows,
    repeatCustomerRows,
    crossVendorCustomerRows,
    trendRows,
    customerPerformanceRows,
    vendorCustomerPerformanceRows,
    dataQualityRows,
  ] = await Promise.all([
    BillingSession.aggregate([
      { $match: identifiedBillMatch },
      {
        $group: {
          _id: null,
          activeCustomerIds: { $addToSet: "$customerId" },
          completedCustomerBills: { $sum: 1 },
          grossCustomerBillingValue: { $sum: { $ifNull: ["$totalAmount", 0] } },
        },
      },
      {
        $project: {
          _id: 0,
          activeCustomers: { $size: "$activeCustomerIds" },
          completedCustomerBills: 1,
          grossCustomerBillingValue: 1,
        },
      },
    ]),
    BillingSession.countDocuments({
      ...completedBillMatch,
      customerId: null,
    }),
    BillingSession.aggregate([
      {
        $match: {
          status: "COMPLETED",
          customerId: { $ne: null },
          createdAt: { $lte: range.to },
        },
      },
      {
        $group: {
          _id: "$customerId",
          lifetimeFirstVisit: { $min: "$createdAt" },
        },
      },
      { $match: buildFirstVisitMatch(range) },
      { $count: "newCustomers" },
    ]),
    BillingSession.aggregate([
      { $match: identifiedBillMatch },
      { $group: { _id: "$customerId", periodBills: { $sum: 1 } } },
      { $match: { periodBills: { $gte: 2 } } },
      { $count: "repeatCustomers" },
    ]),
    BillingSession.aggregate([
      { $match: identifiedBillMatch },
      { $group: { _id: "$customerId", vendorIds: { $addToSet: "$vendorId" } } },
      {
        $project: {
          vendorCount: { $size: { $setDifference: ["$vendorIds", [null]] } },
        },
      },
      { $match: { vendorCount: { $gt: 1 } } },
      { $count: "crossVendorCustomers" },
    ]),
    BillingSession.aggregate([
      { $match: completedBillMatch },
      {
        $group: {
          _id: {
            $dateToString: {
              format: trendBucket.format,
              date: "$createdAt",
              timezone: range.timezone,
            },
          },
          activeCustomerIds: {
            $addToSet: {
              $cond: [{ $ne: ["$customerId", null] }, "$customerId", null],
            },
          },
          completedCustomerBills: {
            $sum: {
              $cond: [{ $ne: ["$customerId", null] }, 1, 0],
            },
          },
          grossCustomerBillingValue: {
            $sum: {
              $cond: [
                { $ne: ["$customerId", null] },
                { $ifNull: ["$totalAmount", 0] },
                0,
              ],
            },
          },
          walkInBills: {
            $sum: {
              $cond: [{ $eq: [{ $ifNull: ["$customerId", null] }, null] }, 1, 0],
            },
          },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          bucket: "$_id",
          [trendBucket.outputKey]: "$_id",
          activeCustomers: { $size: { $setDifference: ["$activeCustomerIds", [null]] } },
          completedCustomerBills: 1,
          grossCustomerBillingValue: 1,
          walkInBills: 1,
        },
      },
    ]),
    BillingSession.aggregate([
      {
        $match: {
          status: "COMPLETED",
          customerId: { $ne: null },
          createdAt: { $lte: range.to },
        },
      },
      {
        $group: {
          _id: "$customerId",
          lifetimeBills: { $sum: 1 },
          lifetimeBillingValue: { $sum: { $ifNull: ["$totalAmount", 0] } },
          lifetimeVendorIds: { $addToSet: "$vendorId" },
          lifetimeFirstVisit: { $min: "$createdAt" },
          lifetimeLastVisit: { $max: "$createdAt" },
          periodBills: {
            $sum: { $cond: [periodExpression, 1, 0] },
          },
          periodBillingValue: {
            $sum: {
              $cond: [periodExpression, { $ifNull: ["$totalAmount", 0] }, 0],
            },
          },
          periodVendorIds: {
            $addToSet: {
              $cond: [periodExpression, "$vendorId", null],
            },
          },
          periodFirstVisit: {
            $min: {
              $cond: [periodExpression, "$createdAt", futureDate],
            },
          },
          periodLastVisit: {
            $max: {
              $cond: [periodExpression, "$createdAt", null],
            },
          },
        },
      },
      { $match: { periodBills: { $gt: 0 } } },
      {
        $lookup: {
          from: "customers",
          localField: "_id",
          foreignField: "_id",
          as: "customer",
        },
      },
      {
        $unwind: {
          path: "$customer",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 0,
          customerId: { $toString: "$_id" },
          customerMetadataFound: { $cond: [{ $ifNull: ["$customer._id", false] }, true, false] },
          periodBills: 1,
          periodBillingValue: 1,
          periodAverageBillValue: {
            $cond: [
              { $gt: ["$periodBills", 0] },
              { $divide: ["$periodBillingValue", "$periodBills"] },
              0,
            ],
          },
          periodVendorCount: { $size: { $setDifference: ["$periodVendorIds", [null]] } },
          periodFirstVisit: {
            $cond: [
              { $ne: ["$periodFirstVisit", futureDate] },
              { $dateToString: { date: "$periodFirstVisit", format: "%Y-%m-%dT%H:%M:%S.%LZ" } },
              null,
            ],
          },
          periodLastVisit: {
            $cond: [
              { $ne: ["$periodLastVisit", null] },
              { $dateToString: { date: "$periodLastVisit", format: "%Y-%m-%dT%H:%M:%S.%LZ" } },
              null,
            ],
          },
          lifetimeBills: 1,
          lifetimeBillingValue: 1,
          lifetimeAverageBillValue: {
            $cond: [
              { $gt: ["$lifetimeBills", 0] },
              { $divide: ["$lifetimeBillingValue", "$lifetimeBills"] },
              0,
            ],
          },
          lifetimeVendorCount: { $size: { $setDifference: ["$lifetimeVendorIds", [null]] } },
          lifetimeFirstVisit: {
            $dateToString: { date: "$lifetimeFirstVisit", format: "%Y-%m-%dT%H:%M:%S.%LZ" },
          },
          lifetimeLastVisit: {
            $dateToString: { date: "$lifetimeLastVisit", format: "%Y-%m-%dT%H:%M:%S.%LZ" },
          },
          isNewInPeriod: {
            $cond: [buildDateInRangeExpression("$lifetimeFirstVisit", range), true, false],
          },
          isRepeatInPeriod: { $gte: ["$periodBills", 2] },
          isCrossVendorInPeriod: {
            $gt: [{ $size: { $setDifference: ["$periodVendorIds", [null]] } }, 1],
          },
        },
      },
      { $sort: { periodBillingValue: -1, periodBills: -1, customerId: 1 } },
    ]),
    BillingSession.aggregate([
      { $match: identifiedBillMatch },
      {
        $group: {
          _id: { vendorId: "$vendorId", customerId: "$customerId" },
          customerBills: { $sum: 1 },
          customerBillingValue: { $sum: { $ifNull: ["$totalAmount", 0] } },
        },
      },
      {
        $group: {
          _id: "$_id.vendorId",
          uniqueCustomers: { $sum: 1 },
          customerBills: { $sum: "$customerBills" },
          customerBillingValue: { $sum: "$customerBillingValue" },
          repeatCustomersWithinVendor: {
            $sum: { $cond: [{ $gte: ["$customerBills", 2] }, 1, 0] },
          },
        },
      },
      {
        $lookup: {
          from: "dummyvendors",
          localField: "_id",
          foreignField: "_id",
          as: "vendor",
        },
      },
      {
        $unwind: {
          path: "$vendor",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 0,
          vendorId: {
            $cond: [{ $ne: ["$_id", null] }, { $toString: "$_id" }, null],
          },
          businessName: { $ifNull: ["$vendor.businessName", "Unknown Vendor"] },
          categoryId: {
            $cond: [
              { $ne: ["$vendor.categoryId", null] },
              { $toString: "$vendor.categoryId" },
              null,
            ],
          },
          vendorMetadataFound: { $cond: [{ $ifNull: ["$vendor._id", false] }, true, false] },
          uniqueCustomers: 1,
          customerBills: 1,
          customerBillingValue: 1,
          averageBillsPerCustomer: {
            $cond: [
              { $gt: ["$uniqueCustomers", 0] },
              { $divide: ["$customerBills", "$uniqueCustomers"] },
              0,
            ],
          },
          averageBillingValuePerCustomer: {
            $cond: [
              { $gt: ["$uniqueCustomers", 0] },
              { $divide: ["$customerBillingValue", "$uniqueCustomers"] },
              0,
            ],
          },
          repeatCustomersWithinVendor: 1,
        },
      },
      { $sort: { customerBillingValue: -1, customerBills: -1, vendorId: 1 } },
    ]),
    BillingSession.aggregate([
      { $match: completedBillMatch },
      {
        $facet: {
          completedBillsMissingCustomerId: [
            { $match: { customerId: null } },
            { $count: "count" },
          ],
          identifiedBillsMissingVendorId: [
            { $match: { customerId: { $ne: null }, vendorId: null } },
            { $count: "count" },
          ],
          identifiedBillsWithZeroOrNullTotalAmount: [
            {
              $match: {
                customerId: { $ne: null },
                $or: [{ totalAmount: null }, { totalAmount: 0 }],
              },
            },
            { $count: "count" },
          ],
          customerIdsNotFound: [
            { $match: { customerId: { $ne: null } } },
            { $group: { _id: "$customerId" } },
            {
              $lookup: {
                from: "customers",
                localField: "_id",
                foreignField: "_id",
                as: "customer",
              },
            },
            { $match: { customer: { $eq: [] } } },
            { $count: "count" },
          ],
        },
      },
    ]),
  ]);

  const customerSummary = getFirstAggregationRow(customerSummaryRows);
  const newCustomers = getFirstAggregationRow(newCustomerRows).newCustomers || 0;
  const repeatCustomers = getFirstAggregationRow(repeatCustomerRows).repeatCustomers || 0;
  const crossVendorCustomers =
    getFirstAggregationRow(crossVendorCustomerRows).crossVendorCustomers || 0;
  const activeCustomers = customerSummary.activeCustomers || 0;
  const completedCustomerBills = customerSummary.completedCustomerBills || 0;
  const grossCustomerBillingValue = customerSummary.grossCustomerBillingValue || 0;
  const dataQuality = getFirstAggregationRow(dataQualityRows);

  const getFacetCount = (name) =>
    Array.isArray(dataQuality[name]) && dataQuality[name][0]?.count
      ? dataQuality[name][0].count
      : 0;

  const topCustomerFields = (item, index) => ({
    rank: index + 1,
    customerId: item.customerId,
    periodBills: item.periodBills,
    periodBillingValue: item.periodBillingValue,
    periodAverageBillValue: item.periodAverageBillValue,
    periodVendorCount: item.periodVendorCount,
    isRepeatInPeriod: item.isRepeatInPeriod,
    isCrossVendorInPeriod: item.isCrossVendorInPeriod,
  });

  const topByBillCount = [...customerPerformanceRows]
    .sort((a, b) => {
      if (b.periodBills !== a.periodBills) {
        return b.periodBills - a.periodBills;
      }
      return b.periodBillingValue - a.periodBillingValue;
    })
    .slice(0, 10)
    .map(topCustomerFields);

  const topByBillingValue = [...customerPerformanceRows]
    .sort((a, b) => {
      if (b.periodBillingValue !== a.periodBillingValue) {
        return b.periodBillingValue - a.periodBillingValue;
      }
      return b.periodBills - a.periodBills;
    })
    .slice(0, 10)
    .map(topCustomerFields);

  const missingCustomerReferences = customerPerformanceRows
    .filter((row) => !row.customerMetadataFound)
    .map((row) => row.customerId);
  const missingVendorReferences = vendorCustomerPerformanceRows
    .filter((row) => !row.vendorMetadataFound)
    .map((row) => row.vendorId);

  return {
    period: range.period,
    timezone: range.timezone,
    range: {
      from: range.from ? range.from.toISOString() : null,
      to: range.to.toISOString(),
    },
    summary: {
      activeCustomers,
      newCustomers,
      repeatCustomers,
      crossVendorCustomers,
      completedCustomerBills,
      walkInBills: walkInBills || 0,
      grossCustomerBillingValue,
      averageBillsPerCustomer: calculateAverage(completedCustomerBills, activeCustomers),
      averageBillingValuePerCustomer: calculateAverage(grossCustomerBillingValue, activeCustomers),
    },
    trend: trendRows,
    customerPerformance: customerPerformanceRows.map(({ customerMetadataFound, ...row }) => row),
    topCustomers: {
      topByBillCount,
      topByBillingValue,
    },
    vendorCustomerPerformance: vendorCustomerPerformanceRows.map(
      ({ vendorMetadataFound, ...row }) => row
    ),
    diagnostics: {
      missingCustomerReferences,
      missingVendorReferences,
      repeatCustomerDefinition: "At least 2 completed bills within selected period.",
      newCustomerDefinition: "First ever completed BillingSession falls within selected period.",
      crossVendorDefinition: "More than one distinct vendor within selected period.",
      dataQuality: {
        completedBillsMissingCustomerId: getFacetCount("completedBillsMissingCustomerId"),
        identifiedBillsMissingVendorId: getFacetCount("identifiedBillsMissingVendorId"),
        identifiedBillsWithZeroOrNullTotalAmount: getFacetCount(
          "identifiedBillsWithZeroOrNullTotalAmount"
        ),
        customerIdsNotFound: getFacetCount("customerIdsNotFound"),
      },
    },
  };
}

function toIdString(value) {
  return value ? String(value) : null;
}

function dateToIso(value) {
  return value ? new Date(value).toISOString() : null;
}

function isDateInRange(value, range) {
  if (!value) return false;
  const date = new Date(value);
  if (date > range.to) return false;
  if (range.from && date < range.from) return false;
  return true;
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function getIstBucket(value, period) {
  const date = new Date(value);
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");

  if (period === "today") {
    return `${String(shifted.getUTCHours()).padStart(2, "0")}:00`;
  }

  if (period === "thisMonth" || period === "month") {
    return `${year}-${month}-${day}`;
  }

  return `${year}-${month}`;
}

function getDaysUntilExpiry(expiryDate, now) {
  if (!expiryDate) return null;
  return Math.ceil((new Date(expiryDate).getTime() - now.getTime()) / DAY_MS);
}

function isTrialPlan(plan) {
  if (!plan) return false;
  return String(plan.name || "").trim().toLowerCase() === "trial" || Number(plan.price || 0) === 0;
}

function isNonTrialPlan(plan) {
  return Boolean(plan) && !isTrialPlan(plan) && Number(plan.price || 0) > 0;
}

function calculateSubscriptionFlags(subscription, now) {
  const expiryDate = subscription.expiryDate ? new Date(subscription.expiryDate) : null;
  const hasValidFutureExpiry = Boolean(expiryDate && expiryDate >= now);
  const isCurrentlyExpired = Boolean(expiryDate && expiryDate < now);
  const isCurrentlyActive = subscription.active === true && (!expiryDate || expiryDate >= now);
  const trialPlan = isTrialPlan(subscription.plan);
  const nonTrialPlan = isNonTrialPlan(subscription.plan);
  const isPublishedVendor = subscription.vendor?.status === "Published";
  const isActivePaidVendor =
    nonTrialPlan &&
    isPublishedVendor &&
    subscription.active === true &&
    hasValidFutureExpiry &&
    Boolean(subscription.vendor) &&
    Boolean(subscription.plan);
  const isExpiredPaidVendor =
    nonTrialPlan &&
    isPublishedVendor &&
    isCurrentlyExpired &&
    Boolean(subscription.vendor) &&
    Boolean(subscription.plan);
  const isExpiringNext7Days =
    isCurrentlyActive && Boolean(expiryDate) && expiryDate >= now && expiryDate <= new Date(now.getTime() + 7 * DAY_MS);
  const isExpiringNext30Days =
    isCurrentlyActive && Boolean(expiryDate) && expiryDate >= now && expiryDate <= new Date(now.getTime() + 30 * DAY_MS);

  return {
    hasValidFutureExpiry,
    isCurrentlyActive,
    isCurrentlyExpired,
    isTrialPlan: trialPlan,
    isNonTrialPlan: nonTrialPlan,
    isPublishedVendor,
    isActivePaidVendor,
    isExpiredPaidVendor,
    daysUntilExpiry: getDaysUntilExpiry(expiryDate, now),
    isExpiringNext7Days,
    isExpiringNext30Days,
  };
}

async function getSubscriptionAnalytics({ period, month } = {}) {
  const range = getAdminAnalyticsDateRange(period, new Date(), { month });
  const now = range.to;
  const next7Cutoff = new Date(now.getTime() + 7 * DAY_MS);
  const next30Cutoff = new Date(now.getTime() + 30 * DAY_MS);

  const [platformVendors, subscriptionRows] = await Promise.all([
    DummyVendor.aggregate([
      {
        $project: {
          _id: 0,
          vendorId: { $toString: "$_id" },
          businessName: { $ifNull: ["$businessName", null] },
          categoryId: {
            $cond: [
              { $ne: ["$categoryId", null] },
              { $toString: "$categoryId" },
              null,
            ],
          },
          status: { $ifNull: ["$status", null] },
        },
      },
    ]),
    VendorSubscription.aggregate([
      {
        $lookup: {
          from: "plans",
          localField: "planId",
          foreignField: "_id",
          as: "plan",
        },
      },
      { $unwind: { path: "$plan", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "dummyvendors",
          localField: "vendorId",
          foreignField: "_id",
          as: "vendor",
        },
      },
      { $unwind: { path: "$vendor", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          subscriptionId: { $toString: "$_id" },
          vendorId: {
            $cond: [{ $ne: ["$vendorId", null] }, { $toString: "$vendorId" }, null],
          },
          planId: {
            $cond: [{ $ne: ["$planId", null] }, { $toString: "$planId" }, null],
          },
          startDate: 1,
          expiryDate: 1,
          active: 1,
          createdAt: 1,
          plan: {
            _id: "$plan._id",
            name: "$plan.name",
            price: "$plan.price",
            billingCycle: "$plan.billingCycle",
            active: "$plan.active",
          },
          vendor: {
            _id: "$vendor._id",
            businessName: "$vendor.businessName",
            categoryId: "$vendor.categoryId",
            status: "$vendor.status",
          },
        },
      },
    ]),
  ]);

  const totalPlatformVendors = platformVendors.length;
  const platformVendorMap = new Map(platformVendors.map((vendor) => [vendor.vendorId, vendor]));
  const subscriptionVendorIds = new Set(
    subscriptionRows.map((row) => row.vendorId).filter(Boolean)
  );
  const vendorsWithSubscription = subscriptionVendorIds.size;
  const publishedVendors = platformVendors.filter(
    (vendor) => vendor.status === "Published"
  ).length;

  const enrichedSubscriptions = subscriptionRows.map((row) => {
    const hasVendor = Boolean(row.vendor?._id);
    const hasPlan = Boolean(row.plan?._id);
    const flags = calculateSubscriptionFlags(
      {
        ...row,
        vendor: hasVendor ? row.vendor : null,
        plan: hasPlan ? row.plan : null,
      },
      now
    );
    const expiryDate = row.expiryDate ? new Date(row.expiryDate) : null;

    return {
      ...row,
      hasVendor,
      hasPlan,
      planName: hasPlan ? row.plan.name || null : null,
      configuredPrice: hasPlan ? row.plan.price ?? null : null,
      billingCycle: hasPlan ? row.plan.billingCycle || null : null,
      planActive: hasPlan ? row.plan.active === true : null,
      businessName: hasVendor ? row.vendor.businessName || null : null,
      categoryId:
        hasVendor && row.vendor.categoryId ? String(row.vendor.categoryId) : null,
      vendorStatus: hasVendor ? row.vendor.status || null : null,
      ...flags,
      inSelectedPeriod: isDateInRange(row.createdAt, range),
      expiresInNext7Only: flags.isCurrentlyActive && Boolean(expiryDate) && expiryDate >= now && expiryDate <= next7Cutoff,
      expiresInNext30Only: flags.isCurrentlyActive && Boolean(expiryDate) && expiryDate > next7Cutoff && expiryDate <= next30Cutoff,
    };
  });

  const countWhere = (predicate) => enrichedSubscriptions.filter(predicate).length;
  const currentlyActiveSubscriptions = countWhere((row) => row.isCurrentlyActive);
  const currentlyExpiredSubscriptions = countWhere((row) => row.isCurrentlyExpired);
  const expiringNext7Days = countWhere((row) => row.isExpiringNext7Days);
  const expiringNext30Days = countWhere((row) => row.isExpiringNext30Days);
  const trialVendors = countWhere((row) => row.isTrialPlan);
  const nonTrialPlanVendors = countWhere((row) => row.isNonTrialPlan);
  const activePaidVendors = countWhere((row) => row.isActivePaidVendor);
  const expiredPaidVendors = countWhere((row) => row.isExpiredPaidVendor);
  const publishedVendorsWithActiveTrial = countWhere(
    (row) => row.isPublishedVendor && row.isTrialPlan && row.isCurrentlyActive
  );
  const publishedVendorsWithoutActivePaidSubscription = Math.max(
    publishedVendors - activePaidVendors,
    0
  );

  const periodSubscriptions = enrichedSubscriptions.filter((row) => row.inSelectedPeriod);
  const periodActivity = {
    subscriptionRecordsCreatedInPeriod: periodSubscriptions.length,
    currentTrialRecordsCreatedInPeriod: periodSubscriptions.filter((row) => row.isTrialPlan).length,
    currentNonTrialRecordsCreatedInPeriod: periodSubscriptions.filter((row) => row.isNonTrialPlan).length,
    currentPaidVendorRecordsCreatedInPeriod: periodSubscriptions.filter(
      (row) => row.isActivePaidVendor
    ).length,
  };

  const trendMap = new Map();
  for (const row of periodSubscriptions) {
    const bucket = getIstBucket(row.createdAt, period);
    if (!trendMap.has(bucket)) {
      trendMap.set(bucket, {
        bucket,
        subscriptionRecordsCreated: 0,
        currentTrialPlanRecords: 0,
        currentNonTrialPlanRecords: 0,
        currentPaidVendorRecords: 0,
      });
    }
    const trendRow = trendMap.get(bucket);
    trendRow.subscriptionRecordsCreated += 1;
    if (row.isTrialPlan) trendRow.currentTrialPlanRecords += 1;
    if (row.isNonTrialPlan) trendRow.currentNonTrialPlanRecords += 1;
    if (row.isActivePaidVendor) trendRow.currentPaidVendorRecords += 1;
  }
  const trend = Array.from(trendMap.values()).sort((a, b) =>
    String(a.bucket).localeCompare(String(b.bucket))
  );

  const planMap = new Map();
  for (const row of enrichedSubscriptions) {
    const key = row.planId || "missing-plan";
    if (!planMap.has(key)) {
      planMap.set(key, {
        planId: row.hasPlan ? row.planId : null,
        planName: row.planName,
        configuredPrice: row.configuredPrice,
        billingCycle: row.billingCycle,
        planActive: row.planActive,
        assignedVendors: 0,
        publishedVendors: 0,
        currentlyActiveSubscriptions: 0,
        currentlyExpiredSubscriptions: 0,
        activePaidVendors: 0,
        expiredPaidVendors: 0,
        expiringNext7Days: 0,
        expiringNext30Days: 0,
      });
    }
    const plan = planMap.get(key);
    plan.assignedVendors += 1;
    if (row.isPublishedVendor) plan.publishedVendors += 1;
    if (row.isCurrentlyActive) plan.currentlyActiveSubscriptions += 1;
    if (row.isCurrentlyExpired) plan.currentlyExpiredSubscriptions += 1;
    if (row.isActivePaidVendor) plan.activePaidVendors += 1;
    if (row.isExpiredPaidVendor) plan.expiredPaidVendors += 1;
    if (row.isExpiringNext7Days) plan.expiringNext7Days += 1;
    if (row.isExpiringNext30Days) plan.expiringNext30Days += 1;
  }
  const planDistribution = Array.from(planMap.values()).sort((a, b) =>
    String(a.planName || "Missing Plan").localeCompare(String(b.planName || "Missing Plan"))
  );

  const toExpiryPipelineItem = (row) => ({
    subscriptionId: row.subscriptionId,
    vendorId: row.vendorId,
    businessName: row.businessName,
    vendorStatus: row.vendorStatus,
    planId: row.hasPlan ? row.planId : null,
    planName: row.planName,
    expiryDate: dateToIso(row.expiryDate),
    daysUntilExpiry: row.daysUntilExpiry,
    isActivePaidVendor: row.isActivePaidVendor,
  });
  const expirySorter = (a, b) => {
    const dateCompare = new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
    if (dateCompare !== 0) return dateCompare;
    return String(a.vendorId || "").localeCompare(String(b.vendorId || ""));
  };
  const expiryPipeline = {
    next7Days: enrichedSubscriptions
      .filter((row) => row.expiresInNext7Only)
      .map(toExpiryPipelineItem)
      .sort(expirySorter),
    next30Days: enrichedSubscriptions
      .filter((row) => row.expiresInNext30Only)
      .map(toExpiryPipelineItem)
      .sort(expirySorter),
  };

  const subscriptionByVendorId = new Map();
  for (const row of enrichedSubscriptions) {
    if (row.vendorId && !subscriptionByVendorId.has(row.vendorId)) {
      subscriptionByVendorId.set(row.vendorId, row);
    }
  }
  const categoryMap = new Map();
  for (const vendor of platformVendors) {
    const categoryId = vendor.categoryId || null;
    if (!categoryMap.has(categoryId)) {
      categoryMap.set(categoryId, {
        categoryId,
        totalVendors: 0,
        vendorsWithSubscription: 0,
        currentlyActiveSubscriptions: 0,
        currentlyExpiredSubscriptions: 0,
        trialPlanVendors: 0,
        nonTrialPlanVendors: 0,
        publishedVendors: 0,
        activePaidVendors: 0,
        expiredPaidVendors: 0,
      });
    }
    const row = categoryMap.get(categoryId);
    const subscription = subscriptionByVendorId.get(vendor.vendorId);
    row.totalVendors += 1;
    if (vendor.status === "Published") row.publishedVendors += 1;
    if (subscription) {
      row.vendorsWithSubscription += 1;
      if (subscription.isCurrentlyActive) row.currentlyActiveSubscriptions += 1;
      if (subscription.isCurrentlyExpired) row.currentlyExpiredSubscriptions += 1;
      if (subscription.isTrialPlan) row.trialPlanVendors += 1;
      if (subscription.isNonTrialPlan) row.nonTrialPlanVendors += 1;
      if (subscription.isActivePaidVendor) row.activePaidVendors += 1;
      if (subscription.isExpiredPaidVendor) row.expiredPaidVendors += 1;
    }
  }
  const categoryNameMap = await buildCategoryNameMap(
    Array.from(categoryMap.keys()).filter(Boolean)
  );
  const unresolvedCategoryReferences = Array.from(categoryMap.keys()).filter(
    (categoryId) => categoryId && !categoryNameMap.has(String(categoryId))
  );
  const categoryCoverage = Array.from(categoryMap.values())
    .map((row) => ({
      ...row,
      categoryName: resolveCategoryName(row.categoryId, categoryNameMap),
      subscriptionCoverageRate: calculateAverage(row.vendorsWithSubscription * 100, row.totalVendors),
      paidVendorRateAmongPublished: calculateAverage(row.activePaidVendors * 100, row.publishedVendors),
    }))
    .sort((a, b) => {
      if (b.activePaidVendors !== a.activePaidVendors) {
        return b.activePaidVendors - a.activePaidVendors;
      }
      return String(a.categoryId || "").localeCompare(String(b.categoryId || ""));
    });

  const vendorIdCounts = new Map();
  for (const row of subscriptionRows) {
    if (!row.vendorId) continue;
    vendorIdCounts.set(row.vendorId, (vendorIdCounts.get(row.vendorId) || 0) + 1);
  }
  const missingVendorReferences = Array.from(
    new Set(enrichedSubscriptions.filter((row) => row.vendorId && !row.hasVendor).map((row) => row.vendorId))
  );
  const missingPlanReferences = Array.from(
    new Set(enrichedSubscriptions.filter((row) => row.planId && !row.hasPlan).map((row) => row.planId))
  );

  return {
    period: range.period,
    timezone: range.timezone,
    range: {
      from: range.from ? range.from.toISOString() : null,
      to: range.to.toISOString(),
    },
    summary: {
      totalPlatformVendors,
      vendorsWithSubscription,
      vendorsWithoutSubscription: Math.max(totalPlatformVendors - vendorsWithSubscription, 0),
      currentlyActiveSubscriptions,
      currentlyExpiredSubscriptions,
      expiringNext7Days,
      expiringNext30Days,
      trialVendors,
      nonTrialPlanVendors,
      publishedVendors,
      activePaidVendors,
      expiredPaidVendors,
      publishedVendorsWithActiveTrial,
      publishedVendorsWithoutActivePaidSubscription,
      subscriptionCoverageRate: calculateAverage(vendorsWithSubscription * 100, totalPlatformVendors),
      paidVendorRateAmongPublished: calculateAverage(activePaidVendors * 100, publishedVendors),
    },
    periodActivity,
    trend,
    planDistribution,
    subscriptionPerformance: enrichedSubscriptions
      .map((row) => ({
        subscriptionId: row.subscriptionId,
        vendorId: row.vendorId,
        businessName: row.businessName,
        categoryId: row.categoryId,
        vendorStatus: row.vendorStatus,
        planId: row.hasPlan ? row.planId : null,
        planName: row.planName,
        configuredPrice: row.configuredPrice,
        billingCycle: row.billingCycle,
        startDate: dateToIso(row.startDate),
        expiryDate: dateToIso(row.expiryDate),
        createdAt: dateToIso(row.createdAt),
        storedActiveFlag: row.active === true,
        isCurrentlyActive: row.isCurrentlyActive,
        isCurrentlyExpired: row.isCurrentlyExpired,
        isTrialPlan: row.isTrialPlan,
        isNonTrialPlan: row.isNonTrialPlan,
        isActivePaidVendor: row.isActivePaidVendor,
        isExpiredPaidVendor: row.isExpiredPaidVendor,
        daysUntilExpiry: row.daysUntilExpiry,
        isExpiringNext7Days: row.isExpiringNext7Days,
        isExpiringNext30Days: row.isExpiringNext30Days,
      }))
      .sort((a, b) => String(a.businessName || "").localeCompare(String(b.businessName || ""))),
    expiryPipeline,
    categoryCoverage,
    diagnostics: {
      platformVendorCountDefinition: "All DummyVendor records are counted.",
      generalActiveSubscriptionDefinition:
        "VendorSubscription.active === true and expiryDate is null/missing or expiryDate is greater than or equal to current time.",
      paidVendorDefinition:
        "Non-trial subscription + Published vendor + active subscription + valid unexpired expiry date. Paid plans are manually assigned by Admin after offline payment receipt.",
      paymentCollectionMethod: "Offline",
      subscriptionPaymentGatewayUsed: false,
      periodActivityDefinition:
        "Based on VendorSubscription.createdAt. Renewals and historical plan changes are not preserved.",
      configuredPriceWarning:
        "Plan.price is current configured price, not historical or collected revenue.",
      paidVendorCountReliable: true,
      revenueAnalyticsAvailable: false,
      renewalAnalyticsAvailable: false,
      revenueAnalyticsReason:
        "Paid-plan assignment confirms offline payment operationally, but the actual collected amount is not stored in VendorSubscription.",
      renewalAnalyticsReason:
        "VendorSubscription keeps one current record per vendor and does not preserve renewal history.",
      missingVendorReferences,
      missingPlanReferences,
      unresolvedCategoryReferencesCount: unresolvedCategoryReferences.length,
      dataQuality: {
        subscriptionRecordsMissingVendorId: subscriptionRows.filter((row) => !row.vendorId).length,
        subscriptionRecordsMissingPlanId: subscriptionRows.filter((row) => !row.planId).length,
        subscriptionRecordsMissingExpiryDate: enrichedSubscriptions.filter((row) => !row.expiryDate).length,
        subscriptionVendorIdsNotInDummyVendors: missingVendorReferences.length,
        subscriptionPlanIdsNotInPlans: missingPlanReferences.length,
        expiredRecordsStillStoredActiveTrue: enrichedSubscriptions.filter(
          (row) => row.isCurrentlyExpired && row.active === true
        ).length,
        duplicateSubscriptionRecordsPerVendor: Array.from(vendorIdCounts.values()).filter(
          (count) => count > 1
        ).length,
        nonTrialPublishedRecordsMissingExpiryDate: enrichedSubscriptions.filter(
          (row) => row.isNonTrialPlan && row.isPublishedVendor && !row.expiryDate
        ).length,
        activePaidVendorCandidatesRejectedForMissingExpiry: enrichedSubscriptions.filter(
          (row) =>
            row.isNonTrialPlan &&
            row.isPublishedVendor &&
            row.active === true &&
            !row.expiryDate
        ).length,
        activePaidVendorCandidatesRejectedForNonPublishedStatus: enrichedSubscriptions.filter(
          (row) =>
            row.isNonTrialPlan &&
            !row.isPublishedVendor &&
            row.active === true &&
            row.hasValidFutureExpiry &&
            row.hasVendor
        ).length,
      },
    },
  };
}

async function getVendorAnalytics({ period, month } = {}) {
  const range = getAdminAnalyticsDateRange(period, new Date(), { month });
  const completedBillMatch = buildCompletedBillMatch(range);
  const createdAtMatch = buildCreatedAtMatch(range);
  const trendBucket = getAnalyticsTrendBucket(period);
  const now = new Date();

  const [
    platformVendors,
    billingSummaryRows,
    periodBillingRows,
    lifetimeBillingRows,
    rewardRows,
    rewardSummaryRows,
    billingTrendRows,
    firstBillingTrendRows,
    dataQualityRows,
    rewardDataQualityRows,
    duplicateBusinessNameRows,
    subscriptionAnalyticsRows,
  ] = await Promise.all([
    DummyVendor.aggregate([
      {
        $project: {
          _id: 0,
          vendorId: { $toString: "$_id" },
          businessName: { $ifNull: ["$businessName", null] },
          categoryId: {
            $cond: [
              { $ne: ["$categoryId", null] },
              { $toString: "$categoryId" },
              null,
            ],
          },
          status: { $ifNull: ["$status", null] },
        },
      },
      { $sort: { businessName: 1, vendorId: 1 } },
    ]),
    BillingSession.aggregate([
      { $match: completedBillMatch },
      {
        $group: {
          _id: null,
          completedBills: { $sum: 1 },
          grossBillingValue: { $sum: { $ifNull: ["$totalAmount", 0] } },
          customerIds: { $addToSet: "$customerId" },
          identifiedCustomerBills: {
            $sum: { $cond: [{ $ne: ["$customerId", null] }, 1, 0] },
          },
          walkInBills: {
            $sum: {
              $cond: [{ $eq: [{ $ifNull: ["$customerId", null] }, null] }, 1, 0],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          completedBills: 1,
          grossBillingValue: 1,
          identifiedCustomerBills: 1,
          walkInBills: 1,
          uniqueCustomers: { $size: { $setDifference: ["$customerIds", [null]] } },
        },
      },
    ]),
    BillingSession.aggregate([
      { $match: completedBillMatch },
      {
        $group: {
          _id: "$vendorId",
          periodCompletedBills: { $sum: 1 },
          periodGrossBillingValue: { $sum: { $ifNull: ["$totalAmount", 0] } },
          periodCustomerIds: { $addToSet: "$customerId" },
          periodWalkInBills: {
            $sum: {
              $cond: [{ $eq: [{ $ifNull: ["$customerId", null] }, null] }, 1, 0],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          vendorId: {
            $cond: [{ $ne: ["$_id", null] }, { $toString: "$_id" }, null],
          },
          periodCompletedBills: 1,
          periodGrossBillingValue: 1,
          periodWalkInBills: 1,
          periodUniqueCustomers: { $size: { $setDifference: ["$periodCustomerIds", [null]] } },
          periodCustomerIds: { $setDifference: ["$periodCustomerIds", [null]] },
        },
      },
    ]),
    BillingSession.aggregate([
      { $match: { status: "COMPLETED", vendorId: { $ne: null } } },
      {
        $group: {
          _id: "$vendorId",
          lifetimeCompletedBills: { $sum: 1 },
          lifetimeGrossBillingValue: { $sum: { $ifNull: ["$totalAmount", 0] } },
          lifetimeCustomerIds: { $addToSet: "$customerId" },
          firstCompletedBillAt: { $min: "$createdAt" },
          lastCompletedBillAt: { $max: "$createdAt" },
        },
      },
      {
        $project: {
          _id: 0,
          vendorId: { $toString: "$_id" },
          lifetimeCompletedBills: 1,
          lifetimeGrossBillingValue: 1,
          lifetimeUniqueCustomers: { $size: { $setDifference: ["$lifetimeCustomerIds", [null]] } },
          firstCompletedBillAt: 1,
          lastCompletedBillAt: 1,
        },
      },
    ]),
    LoyaltyLedger.aggregate([
      {
        $match: {
          type: { $in: ["EARN", "REDEEM"] },
          ...createdAtMatch,
        },
      },
      {
        $group: {
          _id: "$vendorId",
          periodIssuedPoints: {
            $sum: {
              $cond: [{ $eq: ["$type", "EARN"] }, { $ifNull: ["$points", 0] }, 0],
            },
          },
          periodRedeemedPoints: {
            $sum: {
              $cond: [{ $eq: ["$type", "REDEEM"] }, { $abs: { $ifNull: ["$points", 0] } }, 0],
            },
          },
          periodEarnEvents: {
            $sum: { $cond: [{ $eq: ["$type", "EARN"] }, 1, 0] },
          },
          periodRedeemEvents: {
            $sum: { $cond: [{ $eq: ["$type", "REDEEM"] }, 1, 0] },
          },
        },
      },
      {
        $project: {
          _id: 0,
          vendorId: {
            $cond: [{ $ne: ["$_id", null] }, { $toString: "$_id" }, null],
          },
          periodIssuedPoints: 1,
          periodRedeemedPoints: 1,
          periodEarnEvents: 1,
          periodRedeemEvents: 1,
        },
      },
    ]),
    LoyaltyLedger.aggregate([
      {
        $match: {
          type: { $in: ["EARN", "REDEEM"] },
          ...createdAtMatch,
        },
      },
      {
        $group: {
          _id: null,
          issuedPoints: {
            $sum: {
              $cond: [{ $eq: ["$type", "EARN"] }, { $ifNull: ["$points", 0] }, 0],
            },
          },
          redeemedPoints: {
            $sum: {
              $cond: [{ $eq: ["$type", "REDEEM"] }, { $abs: { $ifNull: ["$points", 0] } }, 0],
            },
          },
          earnEvents: {
            $sum: { $cond: [{ $eq: ["$type", "EARN"] }, 1, 0] },
          },
          redeemEvents: {
            $sum: { $cond: [{ $eq: ["$type", "REDEEM"] }, 1, 0] },
          },
        },
      },
    ]),
    BillingSession.aggregate([
      { $match: completedBillMatch },
      {
        $group: {
          _id: {
            $dateToString: {
              format: trendBucket.format,
              date: "$createdAt",
              timezone: range.timezone,
            },
          },
          activeVendorIds: { $addToSet: "$vendorId" },
          completedBills: { $sum: 1 },
          grossBillingValue: { $sum: { $ifNull: ["$totalAmount", 0] } },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          bucket: "$_id",
          [trendBucket.outputKey]: "$_id",
          activeBillingVendors: { $size: { $setDifference: ["$activeVendorIds", [null]] } },
          completedBills: 1,
          grossBillingValue: 1,
        },
      },
    ]),
    BillingSession.aggregate([
      { $match: { status: "COMPLETED", vendorId: { $ne: null } } },
      {
        $group: {
          _id: "$vendorId",
          firstCompletedBillAt: { $min: "$createdAt" },
        },
      },
      { $match: buildFirstVisitMatch(range).lifetimeFirstVisit ? {
        firstCompletedBillAt: buildFirstVisitMatch(range).lifetimeFirstVisit,
      } : {} },
      {
        $group: {
          _id: {
            $dateToString: {
              format: trendBucket.format,
              date: "$firstCompletedBillAt",
              timezone: range.timezone,
            },
          },
          newBillingVendors: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, bucket: "$_id", newBillingVendors: 1 } },
    ]),
    BillingSession.aggregate([
      { $match: completedBillMatch },
      {
        $facet: {
          completedBillsMissingVendorId: [
            { $match: { vendorId: null } },
            { $count: "count" },
          ],
          billingVendorIds: [
            { $match: { vendorId: { $ne: null } } },
            { $group: { _id: "$vendorId" } },
            {
              $lookup: {
                from: "dummyvendors",
                localField: "_id",
                foreignField: "_id",
                as: "vendor",
              },
            },
            { $match: { vendor: { $eq: [] } } },
            { $count: "count" },
          ],
        },
      },
    ]),
    LoyaltyLedger.aggregate([
      {
        $match: {
          type: { $in: ["EARN", "REDEEM"] },
          ...createdAtMatch,
        },
      },
      {
        $facet: {
          rewardRowsMissingVendorId: [
            { $match: { vendorId: null } },
            { $count: "count" },
          ],
          rewardVendorIdsNotInDummyVendors: [
            { $match: { vendorId: { $ne: null } } },
            { $group: { _id: "$vendorId" } },
            {
              $lookup: {
                from: "dummyvendors",
                localField: "_id",
                foreignField: "_id",
                as: "vendor",
              },
            },
            { $match: { vendor: { $eq: [] } } },
            { $count: "count" },
          ],
        },
      },
    ]),
    DummyVendor.aggregate([
      {
        $group: {
          _id: {
            $toLower: {
              $trim: { input: { $ifNull: ["$businessName", ""] } },
            },
          },
          businessName: { $first: "$businessName" },
          vendorIds: { $addToSet: { $toString: "$_id" } },
          count: { $sum: 1 },
        },
      },
      { $match: { _id: { $ne: "" }, count: { $gt: 1 } } },
      { $project: { _id: 0, businessName: 1, vendorIds: 1, count: 1 } },
      { $sort: { count: -1, businessName: 1 } },
    ]),
    VendorSubscription.aggregate([
      {
        $lookup: {
          from: "plans",
          localField: "planId",
          foreignField: "_id",
          as: "plan",
        },
      },
      { $unwind: { path: "$plan", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "dummyvendors",
          localField: "vendorId",
          foreignField: "_id",
          as: "vendor",
        },
      },
      { $unwind: { path: "$vendor", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          isTrialPlan: {
            $eq: [{ $toLower: { $ifNull: ["$plan.name", ""] } }, "trial"],
          },
          isPublishedVendor: { $eq: ["$vendor.status", "Published"] },
          hasValidExpiry: {
            $and: [{ $ne: ["$expiryDate", null] }, { $gte: ["$expiryDate", now] }],
          },
          isExpired: {
            $and: [{ $ne: ["$expiryDate", null] }, { $lt: ["$expiryDate", now] }],
          },
          hasVendor: { $ne: ["$vendor._id", null] },
          hasPlan: { $ne: ["$plan._id", null] },
        },
      },
      {
        $facet: {
          summary: [
            {
              $group: {
                _id: null,
                activePaidVendors: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $not: ["$isTrialPlan"] },
                          "$isPublishedVendor",
                          { $eq: ["$active", true] },
                          "$hasValidExpiry",
                          "$hasVendor",
                          "$hasPlan",
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                expiredPaidVendors: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $not: ["$isTrialPlan"] },
                          "$isPublishedVendor",
                          "$isExpired",
                          "$hasVendor",
                          "$hasPlan",
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                trialVendors: { $sum: { $cond: ["$isTrialPlan", 1, 0] } },
                publishedVendorsWithActiveTrial: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          "$isTrialPlan",
                          "$isPublishedVendor",
                          { $eq: ["$active", true] },
                          "$hasValidExpiry",
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                missingVendorSubscriptions: {
                  $sum: { $cond: ["$hasVendor", 0, 1] },
                },
                missingPlanSubscriptions: {
                  $sum: { $cond: ["$hasPlan", 0, 1] },
                },
                missingExpiryDateSubscriptions: {
                  $sum: { $cond: [{ $eq: ["$expiryDate", null] }, 1, 0] },
                },
              },
            },
          ],
          planDistribution: [
            {
              $group: {
                _id: {
                  planName: { $ifNull: ["$plan.name", "Missing Plan"] },
                  isTrialPlan: "$isTrialPlan",
                },
                assignedVendors: { $sum: 1 },
                publishedVendors: { $sum: { $cond: ["$isPublishedVendor", 1, 0] } },
                activePaidVendors: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $not: ["$isTrialPlan"] },
                          "$isPublishedVendor",
                          { $eq: ["$active", true] },
                          "$hasValidExpiry",
                          "$hasVendor",
                          "$hasPlan",
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
              },
            },
            { $sort: { "_id.planName": 1 } },
            {
              $project: {
                _id: 0,
                planName: "$_id.planName",
                assignedVendors: 1,
                publishedVendors: 1,
                activePaidVendors: 1,
              },
            },
          ],
        },
      },
    ]),
  ]);

  const platformVendorMap = new Map(platformVendors.map((vendor) => [vendor.vendorId, vendor]));
  const periodBillingMap = new Map(periodBillingRows.map((row) => [row.vendorId, row]));
  const lifetimeBillingMap = new Map(lifetimeBillingRows.map((row) => [row.vendorId, row]));
  const rewardMap = new Map(rewardRows.map((row) => [row.vendorId, row]));
  const billingSummary = getFirstAggregationRow(billingSummaryRows);
  const rewardsSummary = getFirstAggregationRow(rewardSummaryRows);
  const subscriptionAnalytics = getFirstAggregationRow(subscriptionAnalyticsRows);
  const subscriptionSummary = getFirstAggregationRow(subscriptionAnalytics.summary);
  const publishedVendors = platformVendors.filter(
    (vendor) => vendor.status === "Published"
  ).length;
  const activePaidVendors = subscriptionSummary.activePaidVendors || 0;
  const totalPlatformVendors = platformVendors.length;
  const activeBillingVendorIds = periodBillingRows
    .map((row) => row.vendorId)
    .filter(Boolean);
  const lifetimeBillingVendorIds = lifetimeBillingRows
    .map((row) => row.vendorId)
    .filter(Boolean);
  const rewardVendorIds = rewardRows.map((row) => row.vendorId).filter(Boolean);
  const activeBillingVendors = activeBillingVendorIds.length;
  const lifetimeBillingVendors = lifetimeBillingVendorIds.length;
  const customerActiveVendors = periodBillingRows.filter(
    (row) => Number(row.periodUniqueCustomers || 0) > 0
  ).length;
  const rewardsActiveVendors = rewardVendorIds.length;
  const newBillingVendors = lifetimeBillingRows.filter((row) =>
    isDateInRange(row.firstCompletedBillAt, range)
  ).length;
  const repeatBillingVendors = periodBillingRows.filter(
    (row) => Number(row.periodCompletedBills || 0) >= 2
  ).length;

  const unresolvedBillingVendorIds = activeBillingVendorIds.filter(
    (vendorId) => !platformVendorMap.has(vendorId)
  );
  const unresolvedRewardVendorIds = rewardVendorIds.filter(
    (vendorId) => !platformVendorMap.has(vendorId)
  );
  const missingVendorReferences = Array.from(
    new Set([...unresolvedBillingVendorIds, ...unresolvedRewardVendorIds])
  );

  const firstBillingTrendMap = new Map(
    firstBillingTrendRows.map((row) => [row.bucket, row.newBillingVendors || 0])
  );
  const trend = billingTrendRows.map((row) => ({
    ...row,
    newBillingVendors: firstBillingTrendMap.get(row.bucket) || 0,
  }));
  for (const row of firstBillingTrendRows) {
    if (!trend.some((trendRow) => trendRow.bucket === row.bucket)) {
      trend.push({
        bucket: row.bucket,
        [trendBucket.outputKey]: row.bucket,
        activeBillingVendors: 0,
        newBillingVendors: row.newBillingVendors || 0,
        completedBills: 0,
        grossBillingValue: 0,
      });
    }
  }
  trend.sort((a, b) => String(a.bucket).localeCompare(String(b.bucket)));

  const vendorPerformance = platformVendors.map((vendor) => {
    const periodBilling = periodBillingMap.get(vendor.vendorId) || {};
    const lifetimeBilling = lifetimeBillingMap.get(vendor.vendorId) || {};
    const rewards = rewardMap.get(vendor.vendorId) || {};
    const periodCompletedBills = periodBilling.periodCompletedBills || 0;
    const periodGrossBillingValue = periodBilling.periodGrossBillingValue || 0;
    const lifetimeCompletedBills = lifetimeBilling.lifetimeCompletedBills || 0;
    const lifetimeGrossBillingValue = lifetimeBilling.lifetimeGrossBillingValue || 0;
    const periodUniqueCustomers = periodBilling.periodUniqueCustomers || 0;
    const periodIssuedPoints = rewards.periodIssuedPoints || 0;
    const periodRedeemedPoints = rewards.periodRedeemedPoints || 0;
    const periodEarnEvents = rewards.periodEarnEvents || 0;
    const periodRedeemEvents = rewards.periodRedeemEvents || 0;
    const firstCompletedBillAt = lifetimeBilling.firstCompletedBillAt || null;

    return {
      vendorId: vendor.vendorId,
      businessName: vendor.businessName,
      categoryId: vendor.categoryId,
      periodCompletedBills,
      periodGrossBillingValue,
      periodAverageBillValue: calculateAverage(periodGrossBillingValue, periodCompletedBills),
      periodUniqueCustomers,
      periodWalkInBills: periodBilling.periodWalkInBills || 0,
      periodIssuedPoints,
      periodRedeemedPoints,
      periodEarnEvents,
      periodRedeemEvents,
      lifetimeCompletedBills,
      lifetimeGrossBillingValue,
      lifetimeAverageBillValue: calculateAverage(lifetimeGrossBillingValue, lifetimeCompletedBills),
      lifetimeUniqueCustomers: lifetimeBilling.lifetimeUniqueCustomers || 0,
      firstCompletedBillAt: dateToIso(firstCompletedBillAt),
      lastCompletedBillAt: dateToIso(lifetimeBilling.lastCompletedBillAt),
      isBillingActiveInPeriod: periodCompletedBills > 0,
      isNewBillingVendorInPeriod: isDateInRange(firstCompletedBillAt, range),
      isRepeatBillingVendorInPeriod: periodCompletedBills >= 2,
      isCustomerActiveInPeriod: periodUniqueCustomers > 0,
      isRewardsActiveInPeriod: periodEarnEvents + periodRedeemEvents > 0,
    };
  });

  const categoryMap = new Map();
  for (const vendor of vendorPerformance) {
    const categoryId = vendor.categoryId || null;
    if (!categoryMap.has(categoryId)) {
      categoryMap.set(categoryId, {
        categoryId,
        totalVendors: 0,
        activeBillingVendors: 0,
        newBillingVendors: 0,
        completedBills: 0,
        grossBillingValue: 0,
        uniqueCustomerIds: new Set(),
        rewardsActiveVendors: 0,
        issuedPoints: 0,
        redeemedPoints: 0,
      });
    }
    const row = categoryMap.get(categoryId);
    row.totalVendors += 1;
    if (vendor.isBillingActiveInPeriod) row.activeBillingVendors += 1;
    if (vendor.isNewBillingVendorInPeriod) row.newBillingVendors += 1;
    if (vendor.isRewardsActiveInPeriod) row.rewardsActiveVendors += 1;
    row.completedBills += vendor.periodCompletedBills;
    row.grossBillingValue += vendor.periodGrossBillingValue;
    row.issuedPoints += vendor.periodIssuedPoints;
    row.redeemedPoints += vendor.periodRedeemedPoints;
    const billing = periodBillingMap.get(vendor.vendorId);
    (billing?.periodCustomerIds || []).forEach((customerId) => {
      if (customerId) row.uniqueCustomerIds.add(String(customerId));
    });
  }

  const categoryNameMap = await buildCategoryNameMap(
    Array.from(categoryMap.keys()).filter(Boolean)
  );
  const unresolvedCategoryReferences = Array.from(categoryMap.keys()).filter(
    (categoryId) => categoryId && !categoryNameMap.has(String(categoryId))
  );
  const categoryPerformance = Array.from(categoryMap.values())
    .map((row) => ({
      categoryId: row.categoryId,
      categoryName: resolveCategoryName(row.categoryId, categoryNameMap),
      totalVendors: row.totalVendors,
      activeBillingVendors: row.activeBillingVendors,
      newBillingVendors: row.newBillingVendors,
      completedBills: row.completedBills,
      grossBillingValue: row.grossBillingValue,
      uniqueCustomers: row.uniqueCustomerIds.size,
      rewardsActiveVendors: row.rewardsActiveVendors,
      issuedPoints: row.issuedPoints,
      redeemedPoints: row.redeemedPoints,
    }))
    .sort((a, b) => {
      if (b.grossBillingValue !== a.grossBillingValue) {
        return b.grossBillingValue - a.grossBillingValue;
      }
      return b.completedBills - a.completedBills;
    });

  const rankVendor = (items) =>
    items.map((item, index) => ({
      rank: index + 1,
      vendorId: item.vendorId,
      businessName: item.businessName,
      categoryId: item.categoryId,
      periodCompletedBills: item.periodCompletedBills,
      periodGrossBillingValue: item.periodGrossBillingValue,
      periodUniqueCustomers: item.periodUniqueCustomers,
      periodIssuedPoints: item.periodIssuedPoints,
      periodEarnEvents: item.periodEarnEvents,
    }));

  const topByBillCount = rankVendor(
    vendorPerformance
      .filter((row) => row.periodCompletedBills > 0)
      .sort((a, b) => {
        if (b.periodCompletedBills !== a.periodCompletedBills) {
          return b.periodCompletedBills - a.periodCompletedBills;
        }
        return b.periodGrossBillingValue - a.periodGrossBillingValue;
      })
      .slice(0, 10)
  );
  const topByBillingValue = rankVendor(
    vendorPerformance
      .filter((row) => row.periodGrossBillingValue > 0)
      .sort((a, b) => {
        if (b.periodGrossBillingValue !== a.periodGrossBillingValue) {
          return b.periodGrossBillingValue - a.periodGrossBillingValue;
        }
        return b.periodCompletedBills - a.periodCompletedBills;
      })
      .slice(0, 10)
  );
  const topByUniqueCustomers = rankVendor(
    vendorPerformance
      .filter((row) => row.periodUniqueCustomers > 0)
      .sort((a, b) => {
        if (b.periodUniqueCustomers !== a.periodUniqueCustomers) {
          return b.periodUniqueCustomers - a.periodUniqueCustomers;
        }
        return b.periodCompletedBills - a.periodCompletedBills;
      })
      .slice(0, 10)
  );
  const topByRewardsIssued = rankVendor(
    vendorPerformance
      .filter((row) => row.periodIssuedPoints > 0)
      .sort((a, b) => {
        if (b.periodIssuedPoints !== a.periodIssuedPoints) {
          return b.periodIssuedPoints - a.periodIssuedPoints;
        }
        return b.periodEarnEvents - a.periodEarnEvents;
      })
      .slice(0, 10)
  );

  const dataQuality = getFirstAggregationRow(dataQualityRows);
  const rewardDataQuality = getFirstAggregationRow(rewardDataQualityRows);
  const getFacetCount = (name) =>
    Array.isArray(dataQuality[name]) && dataQuality[name][0]?.count
      ? dataQuality[name][0].count
      : 0;
  const getRewardFacetCount = (name) =>
    Array.isArray(rewardDataQuality[name]) && rewardDataQuality[name][0]?.count
      ? rewardDataQuality[name][0].count
      : 0;

  return {
    period: range.period,
    timezone: range.timezone,
    range: {
      from: range.from ? range.from.toISOString() : null,
      to: range.to.toISOString(),
    },
    summary: {
      totalPlatformVendors,
      lifetimeBillingVendors,
      activeBillingVendors,
      activePaidVendors,
      expiredPaidVendors: subscriptionSummary.expiredPaidVendors || 0,
      trialVendors: subscriptionSummary.trialVendors || 0,
      publishedVendors,
      publishedVendorsWithActiveTrial:
        subscriptionSummary.publishedVendorsWithActiveTrial || 0,
      publishedVendorsWithoutActivePaidSubscription: Math.max(
        publishedVendors - activePaidVendors,
        0
      ),
      newBillingVendors,
      repeatBillingVendors,
      customerActiveVendors,
      rewardsActiveVendors,
      inactiveBillingVendors: Math.max(totalPlatformVendors - activeBillingVendors, 0),
      billingAdoptionRate:
        totalPlatformVendors > 0 ? (lifetimeBillingVendors / totalPlatformVendors) * 100 : 0,
    },
    billing: {
      completedBills: billingSummary.completedBills || 0,
      grossBillingValue: billingSummary.grossBillingValue || 0,
      averageBillValue: calculateAverage(
        billingSummary.grossBillingValue || 0,
        billingSummary.completedBills || 0
      ),
      identifiedCustomerBills: billingSummary.identifiedCustomerBills || 0,
      walkInBills: billingSummary.walkInBills || 0,
      uniqueCustomers: billingSummary.uniqueCustomers || 0,
    },
    rewards: {
      issuedPoints: rewardsSummary.issuedPoints || 0,
      redeemedPoints: rewardsSummary.redeemedPoints || 0,
      earnEvents: rewardsSummary.earnEvents || 0,
      redeemEvents: rewardsSummary.redeemEvents || 0,
    },
    trend,
    vendorPerformance,
    topVendors: {
      topByBillCount,
      topByBillingValue,
      topByUniqueCustomers,
      topByRewardsIssued,
    },
    categoryPerformance,
    subscriptionPlanDistribution: subscriptionAnalytics.planDistribution || [],
    diagnostics: {
      missingVendorReferences,
      platformVendorCountDefinition:
        "All DummyVendor records are counted; no reliable production-only filter was found.",
      billingActiveVendorDefinition:
        "At least one COMPLETED BillingSession inside the selected period.",
      newBillingVendorDefinition:
        "First ever COMPLETED BillingSession falls inside the selected period.",
      repeatBillingVendorDefinition:
        "At least two COMPLETED BillingSessions inside the selected period.",
      rewardsActiveVendorDefinition:
        "At least one LoyaltyLedger EARN or REDEEM event inside the selected period.",
      paidVendorDefinition:
        "Non-trial subscription + Published vendor + active subscription + valid unexpired expiry date. Paid plans are manually assigned by Admin after offline payment receipt.",
      paymentCollectionMethod: "Offline",
      subscriptionPaymentGatewayUsed: false,
      revenueAnalyticsAvailable: false,
      revenueAnalyticsReason:
        "Payment receipt is confirmed operationally by paid-plan assignment, but actual collected amount is not stored in VendorSubscription.",
      uncategorizedVendorCount: platformVendors.filter((vendor) => !vendor.categoryId).length,
      unresolvedCategoryReferencesCount: unresolvedCategoryReferences.length,
      dataQuality: {
        completedBillsMissingVendorId: getFacetCount("completedBillsMissingVendorId"),
        rewardRowsMissingVendorId: getRewardFacetCount("rewardRowsMissingVendorId"),
        billingVendorIdsNotInDummyVendors: getFacetCount("billingVendorIds"),
        rewardVendorIdsNotInDummyVendors: getRewardFacetCount("rewardVendorIdsNotInDummyVendors"),
        subscriptionRowsMissingVendor: subscriptionSummary.missingVendorSubscriptions || 0,
        subscriptionRowsMissingPlan: subscriptionSummary.missingPlanSubscriptions || 0,
        subscriptionRowsMissingExpiryDate:
          subscriptionSummary.missingExpiryDateSubscriptions || 0,
        duplicateBusinessNamesAcrossVendorIds: duplicateBusinessNameRows,
      },
    },
  };
}

module.exports = {
  getBillingAnalytics,
  getCustomerAnalytics,
  getOverviewMetrics,
  getRewardsAnalytics,
  getSubscriptionAnalytics,
  getVendorAnalytics,
};
