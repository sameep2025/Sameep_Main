const BillingSession = require("../models/BillingSession");
const Customer = require("../models/Customer");
const LoyaltyLedger = require("../models/LoyaltyLedger");
const Transaction = require("../models/Transaction");
const mongoose = require("mongoose");

const NO_STYLIST_SELECTED_ID = "NO_STYLIST_SELECTED";
const NO_STYLIST_SELECTED_LABEL = "No Stylist Selected";

function toSafeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function hasStoredNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function getTransactionMap(transactions = []) {
  return new Map(
    transactions
      .filter((transaction) => transaction?.billingSessionId)
      .map((transaction) => [String(transaction.billingSessionId), transaction])
  );
}

async function getTransactionsForBills(bills = []) {
  const billIds = bills.map((bill) => bill._id).filter(Boolean);
  if (!billIds.length) return new Map();

  const transactions = await Transaction.find({
    billingSessionId: { $in: billIds },
  }).lean();

  return getTransactionMap(transactions);
}

function buildBillFinancials(bill = {}, transaction = null) {
  const netBillValue = toSafeNumber(bill.totalAmount);
  const hasGrossAmount = hasStoredNumber(bill.grossAmount);
  const hasDiscountAmount = hasStoredNumber(bill.discountAmount);
  const billValue = hasGrossAmount ? toSafeNumber(bill.grossAmount) : netBillValue;
  const fallbackRewardsRedeemed = toSafeNumber(bill.pointsRedeemed);
  const rewardsRedeemedValue = transaction
    ? toSafeNumber(transaction.redeemValue)
    : fallbackRewardsRedeemed;
  const rawCollected = transaction
    ? toSafeNumber(transaction.finalPaidAmount)
    : netBillValue - rewardsRedeemedValue;

  return {
    grossAmount: hasGrossAmount ? toSafeNumber(bill.grossAmount) : null,
    discountAmount: hasDiscountAmount ? toSafeNumber(bill.discountAmount) : null,
    billValue,
    netBillValue,
    rewardsRedeemedValue,
    netCollected: Math.max(rawCollected, 0),
    financialSnapshotAvailable: hasGrossAmount && hasDiscountAmount,
    transactionMissing: !transaction,
  };
}

function getFinancialAccumulatorStage() {
  const rewardsExpression = {
    $ifNull: ["$transaction.redeemValue", { $ifNull: ["$pointsRedeemed", 0] }],
  };
  const billValueExpression = {
    $ifNull: ["$grossAmount", { $ifNull: ["$totalAmount", 0] }],
  };

  return {
    revenue: { $sum: { $ifNull: ["$totalAmount", 0] } },
    billValue: { $sum: billValueExpression },
    netBillValue: { $sum: { $ifNull: ["$totalAmount", 0] } },
    discountsGiven: { $sum: { $ifNull: ["$discountAmount", 0] } },
    rewardsRedeemed: { $sum: rewardsExpression },
    netCollected: {
      $sum: {
        $max: [
          {
            $subtract: [{ $ifNull: ["$totalAmount", 0] }, rewardsExpression],
          },
          0,
        ],
      },
    },
    orders: { $sum: 1 },
    totalBills: { $sum: 1 },
  };
}

function getFinancialGroupStage() {
  return {
    _id: null,
    ...getFinancialAccumulatorStage(),
  };
}

function withTransactionLookupStages() {
  return [
    {
      $lookup: {
        from: "transactions",
        localField: "_id",
        foreignField: "billingSessionId",
        as: "transactions",
      },
    },
    {
      $addFields: {
        transaction: { $arrayElemAt: ["$transactions", 0] },
      },
    },
  ];
}

function buildFinancialSummary(row = {}) {
  return {
    billValue: row.billValue || row.netBillValue || row.revenue || 0,
    netBillValue: row.netBillValue || row.revenue || 0,
    discountsGiven: row.discountsGiven || 0,
    rewardsRedeemed: row.rewardsRedeemed || 0,
    netCollected: row.netCollected || 0,
    totalBills: row.totalBills || row.orders || 0,
  };
}

// Helper: start of day
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const startOfMonth = () => {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};

exports.getDashboardSummary = async (req, res) => {
  try {
    const { vendorId } = req.query;

    if (!vendorId) {
      return res.status(400).json({ success: false, message: "vendorId required" });
    }

    const vendorObjectId = new mongoose.Types.ObjectId(vendorId);

    const today = startOfToday();
    const monthStart = startOfMonth();

    const summaryAgg = await BillingSession.aggregate([
      {
        $match: {
          vendorId: vendorObjectId,
          status: "COMPLETED",
        },
      },
      ...withTransactionLookupStages(),
      {
        $facet: {
          today: [
            { $match: { createdAt: { $gte: today } } },
            { $group: getFinancialGroupStage() },
          ],
          month: [
            { $match: { createdAt: { $gte: monthStart } } },
            { $group: getFinancialGroupStage() },
          ],
        },
      },
    ]);

    const todayRow = summaryAgg?.[0]?.today?.[0] || {};
    const monthRow = summaryAgg?.[0]?.month?.[0] || {};

    const todayRevenue = todayRow.revenue || 0;
    const todayOrders = todayRow.orders || 0;
    const avgBillValue = todayOrders ? todayRevenue / todayOrders : 0;
    const todayFinancials = buildFinancialSummary(todayRow);

    const monthRevenue = monthRow.revenue || 0;
    const monthOrders = monthRow.orders || 0;
    const monthAvgBill = monthOrders > 0 ? Math.round(monthRevenue / monthOrders) : 0;
    const monthFinancials = buildFinancialSummary(monthRow);

    const loyaltyAgg = await LoyaltyLedger.aggregate([
      {
        $match: {
          vendorId: vendorObjectId,
        },
      },
      {
        $group: {
          _id: null,
          earned: {
            $sum: {
              $cond: [{ $eq: ["$type", "EARN"] }, "$points", 0],
            },
          },
          redeemed: {
            $sum: {
              $cond: [
                { $eq: ["$type", "REDEEM"] },
                { $abs: "$points" },
                0,
              ],
            },
          },
        },
      },
    ]);

    const loyaltyRow = loyaltyAgg?.[0] || {};

    res.json({
      success: true,
      data: {
        todayRevenue,
        todayOrders,
        avgBillValue: Math.round(avgBillValue),
        todayBillValue: todayFinancials.billValue,
        todayNetBillValue: todayFinancials.netBillValue,
        todayDiscountsGiven: todayFinancials.discountsGiven,
        todayRewardsRedeemed: todayFinancials.rewardsRedeemed,
        todayNetCollected: todayFinancials.netCollected,
        monthRevenue,
        monthOrders,
        monthAvgBill,
        monthBillValue: monthFinancials.billValue,
        monthNetBillValue: monthFinancials.netBillValue,
        monthDiscountsGiven: monthFinancials.discountsGiven,
        monthRewardsRedeemed: monthFinancials.rewardsRedeemed,
        monthNetCollected: monthFinancials.netCollected,
        loyaltyEarned: loyaltyRow.earned || 0,
        loyaltyRedeemed: loyaltyRow.redeemed || 0,
      },
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).json({ success: false, message: "Dashboard failed" });
  }
};

exports.getFinancialYearMonthly = async (req, res) => {
  try {
    const { vendorId } = req.query;

    if (!vendorId) {
      return res.status(400).json({ success: false, message: "vendorId required" });
    }

    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const rollingStart = new Date(currentMonthStart);
    rollingStart.setMonth(rollingStart.getMonth() - 11);

    const rollingEnd = new Date(currentMonthStart);
    rollingEnd.setMonth(rollingEnd.getMonth() + 1);

    const aggregationResult = await BillingSession.aggregate([
      {
        $match: {
          vendorId: new mongoose.Types.ObjectId(vendorId),
          status: "COMPLETED",
          createdAt: { $gte: rollingStart, $lt: rollingEnd },
        },
      },
      ...withTransactionLookupStages(),
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          ...getFinancialAccumulatorStage(),
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    const MONTH_LABELS = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];

    // Convert aggregation into lookup
    const monthMap = {};
    aggregationResult.forEach((m) => {
      const monthKey = `${m._id.year}-${String(m._id.month).padStart(2, "0")}`;
      const label = MONTH_LABELS[m._id.month - 1];
      monthMap[monthKey] = {
        month: label,
        year: m._id.year,
        revenue: m.revenue || 0,
        billValue: m.billValue || m.netBillValue || m.revenue || 0,
        netBillValue: m.netBillValue || m.revenue || 0,
        discountsGiven: m.discountsGiven || 0,
        rewardsRedeemed: m.rewardsRedeemed || 0,
        netCollected: m.netCollected || 0,
        totalBills: m.totalBills || m.orders || 0,
        orders: m.orders || 0,
        avgBill: m.orders ? Math.round(m.revenue / m.orders) : 0,
      };
    });

    const rollingYearData = Array.from({ length: 12 }, (_, index) => {
      const date = new Date(rollingStart);
      date.setMonth(rollingStart.getMonth() + index);
      const year = date.getFullYear();
      const monthNumber = date.getMonth() + 1;
      const month = MONTH_LABELS[date.getMonth()];
      const monthKey = `${year}-${String(monthNumber).padStart(2, "0")}`;
      const row = monthMap[monthKey] || {};

      return {
        month,
        year,
        monthKey,
        label: `${month} ${year}`,
        startDate: date.toISOString(),
        endDate: new Date(year, monthNumber, 1).toISOString(),
        isCurrentMonth:
          year === now.getFullYear() && date.getMonth() === now.getMonth(),
        revenue: row.revenue || 0,
        billValue: row.billValue || row.netBillValue || row.revenue || 0,
        netBillValue: row.netBillValue || row.revenue || 0,
        discountsGiven: row.discountsGiven || 0,
        rewardsRedeemed: row.rewardsRedeemed || 0,
        netCollected: row.netCollected || 0,
        totalBills: row.totalBills || row.orders || 0,
        orders: row.orders || 0,
        avgBill: row.avgBill || 0,
      };
    });

    res.json({ success: true, data: rollingYearData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
};

exports.getTopServices = async (req, res) => {
  try {
    const { vendorId } = req.query;

    if (!vendorId) {
      return res.status(400).json({ success: false, message: "vendorId required" });
    }

    const data = await BillingSession.aggregate([
      {
        $match: {
          vendorId: new mongoose.Types.ObjectId(vendorId),
          status: "COMPLETED",
        },
      },
      { $unwind: "$cartItems" },
      {
        $group: {
          _id: "$cartItems.name",
          totalQty: { $sum: "$cartItems.qty" },
          revenue: { $sum: "$cartItems.total" },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
    ]);

    res.json({ success: true, data });
  } catch (err) {
    console.error("Top services error", err);
    res.status(500).json({ success: false, message: "Failed to load top services" });
  }
};

exports.getDailyTrend = async (req, res) => {
  try {
    const { vendorId } = req.query;
    if (!vendorId) {
      return res.status(400).json({ success: false, message: "vendorId required" });
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const trend = await BillingSession.aggregate([
      {
        $match: {
          vendorId: new mongoose.Types.ObjectId(vendorId),
          status: "COMPLETED",
          createdAt: { $gte: startOfMonth },
        },
      },
      {
        $group: {
          _id: { day: { $dayOfMonth: "$createdAt" } },
          revenue: { $sum: "$totalAmount" },
          orders: { $sum: 1 },
        },
      },
      { $sort: { "_id.day": 1 } },
    ]);

    res.json({ success: true, data: trend });
  } catch (err) {
    console.error("Daily trend error", err);
    res.status(500).json({ success: false });
  }
};

exports.getBillsDrilldown = async (req, res) => {
  try {
    const { vendorId, from, to, limit = 100 } = req.query;

    if (!vendorId) {
      return res.status(400).json({ success: false, message: "vendorId required" });
    }

    const query = {
      vendorId: new mongoose.Types.ObjectId(vendorId),
      status: "COMPLETED",
    };

    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(to);
    }

    const bills = await BillingSession.find(query)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .lean();
    const transactionMap = await getTransactionsForBills(bills);

    const formatted = await Promise.all(
      bills.map(async (bill) => {
        let phone = "Walk-in";

        if (bill.customerId) {
          const customer = await Customer.findById(bill.customerId).lean();
          if (customer?.phone) {
            phone = customer.phone;
          } else if (customer?.fullNumber) {
            phone = customer.fullNumber;
          }
        }
        const transaction = transactionMap.get(String(bill._id)) || null;
        const financials = buildBillFinancials(bill, transaction);

        return {
          billId: bill._id,
          total: bill.totalAmount,
          grossAmount: financials.grossAmount,
          discountAmount: financials.discountAmount,
          billValue: financials.billValue,
          netBillValue: financials.netBillValue,
          rewardsRedeemedValue: financials.rewardsRedeemedValue,
          netCollected: financials.netCollected,
          financialSnapshotAvailable: financials.financialSnapshotAvailable,
          transactionMissing: financials.transactionMissing,
          earned: bill.pointsEarned || 0,
          redeemed: bill.pointsRedeemed || 0,
          items: bill.items || bill.cartItems || [],
          createdAt: bill.createdAt,
          phone,
        };
      })
    );

    res.json({ success: true, data: formatted });
  } catch (err) {
    console.error("getBillsDrilldown error", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getStylistPerformance = async (req, res) => {
  try {
    const { vendorId, range, from, to } = req.query;

    if (!vendorId) {
      return res.status(400).json({ message: "vendorId required" });
    }

    const now = new Date();
    let startDate;
    let endDate;

    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;

    if (fromDate && !Number.isNaN(fromDate.getTime())) {
      startDate = fromDate;
      if (toDate && !Number.isNaN(toDate.getTime())) {
        endDate = toDate;
      }
    } else if (range === "today") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (range === "mtd") {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (range === "ytd") {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      startDate.setMonth(startDate.getMonth() - 11);
    } else {
      startDate = new Date(0);
    }

    const createdAtMatch = { $gte: startDate };
    if (endDate) {
      createdAtMatch.$lt = endDate;
    }

    const result = await BillingSession.aggregate([
      {
        $match: {
          vendorId: new mongoose.Types.ObjectId(vendorId),
          status: "COMPLETED",
          createdAt: createdAtMatch,
        },
      },
      { $unwind: "$cartItems" },
      {
        $group: {
          _id: {
            $let: {
              vars: {
                resourceId: { $ifNull: ["$cartItems.resourceId", ""] },
              },
              in: {
                $cond: [
                  { $eq: ["$$resourceId", ""] },
                  NO_STYLIST_SELECTED_ID,
                  "$$resourceId",
                ],
              },
            },
          },
          stylist: {
            $first: {
              $cond: [
                {
                  $gt: [
                    {
                      $strLenCP: {
                        $trim: {
                          input: { $ifNull: ["$cartItems.resourceName", ""] },
                        },
                      },
                    },
                    0,
                  ],
                },
                "$cartItems.resourceName",
                NO_STYLIST_SELECTED_LABEL,
              ],
            },
          },
          revenue: { $sum: "$cartItems.total" },
          services: { $sum: "$cartItems.qty" },
        },
      },
      { $sort: { revenue: -1 } },
    ]);

    res.json(result);
  } catch (err) {
    console.error("Stylist analytics error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
