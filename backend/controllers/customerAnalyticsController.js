const BillingSession = require("../models/BillingSession");
const Customer = require("../models/Customer");
const mongoose = require("mongoose");

const CUSTOMER_ANALYTICS_LIMIT_DEFAULT = 10;
const CUSTOMER_ANALYTICS_LIMIT_MAX = 50;
const INACTIVE_DAY_OPTIONS = [30, 45, 60, 75, 90, 120, 180];
const SPENDING_THRESHOLD_OPTIONS = [500, 1000, 1500, 2000, 3000, 5000, 10000];

function normalizePositiveInteger(value, fallback, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function normalizeOffset(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function getAuthorizedVendorId(req) {
  const vendorId = req.vendorWriteAuth?.vendorId || req.query?.vendorId;
  return String(vendorId || "").trim();
}

function isCanonicalObjectId(value) {
  const id = String(value || "").trim();
  return mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id;
}

function getCompletedAtExpression() {
  return { $ifNull: ["$completedAt", "$createdAt"] };
}

function getNetCollectedExpression() {
  return {
    $max: [
      0,
      {
        $ifNull: [
          "$transaction.finalPaidAmount",
          {
            $subtract: [
              { $ifNull: ["$totalAmount", 0] },
              { $ifNull: ["$pointsRedeemed", 0] },
            ],
          },
        ],
      },
    ],
  };
}

function getCompletedBillingBasePipeline(vendorId, { customerLinkedOnly = false } = {}) {
  const match = {
    vendorId: new mongoose.Types.ObjectId(vendorId),
    status: "COMPLETED",
  };

  if (customerLinkedOnly) {
    match.customerId = { $ne: null };
  }

  return [
    { $match: match },
    {
      $lookup: {
        from: "transactions",
        localField: "_id",
        foreignField: "billingSessionId",
        as: "transactions",
      },
    },
    {
      $set: {
        transaction: { $first: "$transactions" },
      },
    },
    {
      $match: {
        $or: [
          { "transaction.status": { $exists: false } },
          { "transaction.status": { $ne: "CANCELLED" } },
        ],
      },
    },
    {
      $set: {
        analyticsCompletedAt: getCompletedAtExpression(),
        analyticsNetCollected: getNetCollectedExpression(),
      },
    },
  ];
}

function getCustomerGroupStages() {
  return [
    {
      $group: {
        _id: "$customerId",
        totalSpend: { $sum: "$analyticsNetCollected" },
        visitCount: { $sum: 1 },
        firstVisit: { $min: "$analyticsCompletedAt" },
        lastVisit: { $max: "$analyticsCompletedAt" },
      },
    },
    {
      $lookup: {
        from: "customers",
        localField: "_id",
        foreignField: "_id",
        as: "customer",
      },
    },
    {
      $set: {
        customer: { $first: "$customer" },
      },
    },
  ];
}

function formatCustomerRow(row, now = new Date()) {
  const lastVisit = row?.lastVisit ? new Date(row.lastVisit) : null;
  const daysSinceLastVisit = lastVisit
    ? Math.max(0, Math.floor((now.getTime() - lastVisit.getTime()) / 86400000))
    : null;

  return {
    customerId: row?._id ? String(row._id) : "",
    phone: row?.customer?.fullNumber || row?.customer?.phone || "",
    name: row?.customer?.name || row?.customer?.fullName || row?.customer?.displayName || "",
    totalSpend: Number(row?.totalSpend || 0),
    visitCount: Number(row?.visitCount || 0),
    firstVisit: row?.firstVisit || null,
    lastVisit: row?.lastVisit || null,
    daysSinceLastVisit,
  };
}

function formatItemRow(row) {
  return {
    key: String(row?._id || ""),
    itemId: row?.itemId ? String(row.itemId) : "",
    name: String(row?.name || "Unknown item"),
    quantitySold: Number(row?.quantitySold || 0),
    grossSales: Number(row?.grossSales || 0),
    category: "Items",
    samplePath: Array.isArray(row?.samplePath) ? row.samplePath : [],
  };
}

exports.getCustomerAnalyticsSummary = async (req, res) => {
  try {
    const vendorId = getAuthorizedVendorId(req);
    if (!isCanonicalObjectId(vendorId)) {
      return res.status(400).json({ success: false, message: "Valid vendorId required" });
    }

    const [allBillSummary = {}, customerSummary = {}] = await Promise.all([
      BillingSession.aggregate([
        ...getCompletedBillingBasePipeline(vendorId),
        {
          $group: {
            _id: null,
            completedBillCount: { $sum: 1 },
            totalNetCollected: { $sum: "$analyticsNetCollected" },
            averageCompletedBillValue: { $avg: "$analyticsNetCollected" },
          },
        },
      ]).then((rows) => rows?.[0] || {}),
      BillingSession.aggregate([
        ...getCompletedBillingBasePipeline(vendorId, { customerLinkedOnly: true }),
        ...getCustomerGroupStages(),
        {
          $group: {
            _id: null,
            totalCustomers: { $sum: 1 },
            repeatCustomers: {
              $sum: {
                $cond: [{ $gte: ["$visitCount", 2] }, 1, 0],
              },
            },
          },
        },
      ]).then((rows) => rows?.[0] || {}),
    ]);

    return res.json({
      success: true,
      data: {
        customerLinked: {
          totalCustomers: Number(customerSummary.totalCustomers || 0),
          repeatCustomers: Number(customerSummary.repeatCustomers || 0),
        },
        allCompletedBills: {
          completedBillCount: Number(allBillSummary.completedBillCount || 0),
          totalNetCollected: Number(allBillSummary.totalNetCollected || 0),
          averageCompletedBillValue: Math.round(Number(allBillSummary.averageCompletedBillValue || 0)),
        },
        notes: {
          customerMetrics: "Customer metrics include only completed bills linked to a customer mobile number.",
          allBillMetrics: "All-bill metrics include completed customer-linked and walk-in bills.",
        },
      },
    });
  } catch (err) {
    console.error("Customer analytics summary error:", err);
    return res.status(500).json({ success: false, message: "Failed to load customer analytics summary" });
  }
};

exports.getCustomerAnalyticsCustomers = async (req, res) => {
  try {
    const vendorId = getAuthorizedVendorId(req);
    if (!isCanonicalObjectId(vendorId)) {
      return res.status(400).json({ success: false, message: "Valid vendorId required" });
    }

    const segment = String(req.query.segment || "top_spenders").trim();
    const limit = normalizePositiveInteger(req.query.limit, CUSTOMER_ANALYTICS_LIMIT_DEFAULT, CUSTOMER_ANALYTICS_LIMIT_MAX);
    const offset = normalizeOffset(req.query.offset);
    const now = new Date();
    const pipeline = [
      ...getCompletedBillingBasePipeline(vendorId, { customerLinkedOnly: true }),
      ...getCustomerGroupStages(),
    ];

    if (segment === "inactive") {
      const days = Number(req.query.days || 30);
      if (!INACTIVE_DAY_OPTIONS.includes(days)) {
        return res.status(400).json({ success: false, message: "Invalid inactive day filter" });
      }
      const cutoff = new Date(now.getTime() - days * 86400000);
      pipeline.push({ $match: { lastVisit: { $lte: cutoff } } });
      pipeline.push({ $sort: { lastVisit: 1, _id: 1 } });
    } else if (segment === "threshold") {
      const threshold = Number(req.query.threshold || 500);
      if (!SPENDING_THRESHOLD_OPTIONS.includes(threshold)) {
        return res.status(400).json({ success: false, message: "Invalid spending threshold" });
      }
      pipeline.push({ $match: { totalSpend: { $gte: threshold } } });
      pipeline.push({ $sort: { totalSpend: -1, lastVisit: -1, _id: 1 } });
    } else if (segment === "top_spenders") {
      pipeline.push({ $sort: { totalSpend: -1, lastVisit: -1, _id: 1 } });
    } else {
      return res.status(400).json({ success: false, message: "Invalid customer analytics segment" });
    }

    pipeline.push({ $skip: offset }, { $limit: limit + 1 });

    const rows = await BillingSession.aggregate(pipeline);
    const pageRows = rows.slice(0, limit);

    return res.json({
      success: true,
      data: {
        items: pageRows.map((row) => formatCustomerRow(row, now)),
        pagination: {
          limit,
          offset,
          hasMore: rows.length > limit,
          nextOffset: rows.length > limit ? offset + limit : null,
        },
      },
    });
  } catch (err) {
    console.error("Customer analytics customers error:", err);
    return res.status(500).json({ success: false, message: "Failed to load customer analytics customers" });
  }
};

exports.getCustomerAnalyticsItems = async (req, res) => {
  try {
    const vendorId = getAuthorizedVendorId(req);
    if (!isCanonicalObjectId(vendorId)) {
      return res.status(400).json({ success: false, message: "Valid vendorId required" });
    }

    const sortBy = String(req.query.sortBy || "revenue").trim();
    if (!["revenue", "quantity"].includes(sortBy)) {
      return res.status(400).json({ success: false, message: "Invalid item sort" });
    }

    const limit = normalizePositiveInteger(req.query.limit, CUSTOMER_ANALYTICS_LIMIT_DEFAULT, CUSTOMER_ANALYTICS_LIMIT_MAX);
    const offset = normalizeOffset(req.query.offset);
    const sortSpec = sortBy === "quantity"
      ? { quantitySold: -1, grossSales: -1, _id: 1 }
      : { grossSales: -1, quantitySold: -1, _id: 1 };

    const rows = await BillingSession.aggregate([
      ...getCompletedBillingBasePipeline(vendorId),
      { $unwind: "$cartItems" },
      {
        $set: {
          itemGroupKey: {
            $cond: [
              { $ifNull: ["$cartItems.itemId", false] },
              { $toString: "$cartItems.itemId" },
              {
                $concat: [
                  "legacy:",
                  {
                    $toLower: {
                      $trim: {
                        input: { $ifNull: ["$cartItems.name", "Unknown item"] },
                      },
                    },
                  },
                ],
              },
            ],
          },
        },
      },
      {
        $group: {
          _id: "$itemGroupKey",
          itemId: { $first: "$cartItems.itemId" },
          name: { $first: "$cartItems.name" },
          quantitySold: { $sum: { $ifNull: ["$cartItems.qty", 0] } },
          grossSales: { $sum: { $ifNull: ["$cartItems.total", 0] } },
          samplePath: { $first: "$cartItems.nodePath" },
        },
      },
      { $sort: sortSpec },
      { $skip: offset },
      { $limit: limit + 1 },
    ]);

    const pageRows = rows.slice(0, limit);

    return res.json({
      success: true,
      data: {
        items: pageRows.map(formatItemRow),
        pagination: {
          limit,
          offset,
          hasMore: rows.length > limit,
          nextOffset: rows.length > limit ? offset + limit : null,
        },
      },
    });
  } catch (err) {
    console.error("Customer analytics items error:", err);
    return res.status(500).json({ success: false, message: "Failed to load customer analytics items" });
  }
};

exports.getCustomerAnalytics = async (req, res) => {
  try {
    const { vendorId } = req.query;

    if (!vendorId) {
      return res.status(400).json({ success: false, message: "vendorId required" });
    }

    const bills = await BillingSession.find({
      vendorId: new mongoose.Types.ObjectId(vendorId),
      status: "COMPLETED",
      customerId: { $ne: null },
    }).lean();

    if (!bills.length) {
      return res.json({
        success: true,
        data: {
          totalCustomers: 0,
          repeatCustomers: 0,
          repeatRate: 0,
          newCustomers: 0,
          returningCustomers: 0,
          topSpenders: [],
          avgLTV: 0,
        },
      });
    }

    // ===============================
    // Build customer map
    // ===============================
    const customerMap = {};

    bills.forEach((bill) => {
      const id = String(bill.customerId);

      if (!customerMap[id]) {
        customerMap[id] = {
          customerId: id,
          visits: 0,
          spend: 0,
          firstVisit: bill.createdAt,
          lastVisit: bill.createdAt,
        };
      }

      const cust = customerMap[id];
      cust.visits += 1;
      cust.spend += bill.totalAmount || 0;

      if (bill.createdAt < cust.firstVisit) cust.firstVisit = bill.createdAt;
      if (bill.createdAt > cust.lastVisit) cust.lastVisit = bill.createdAt;
    });

    const customers = Object.values(customerMap);

    // ===============================
    // Repeat Customers
    // ===============================
    const repeatCustomers = customers.filter((c) => c.visits > 1).length;
    const totalCustomers = customers.length;
    const repeatRate = Math.round((repeatCustomers / totalCustomers) * 100);

    // ===============================
    // FIX: New vs Returning Logic
    // ===============================
    const THIRTY_DAYS = new Date();
    THIRTY_DAYS.setDate(THIRTY_DAYS.getDate() - 30);

    let newCustomers = 0;
    let activeCustomers = 0;

    customers.forEach((c) => {
      const firstVisit = new Date(c.firstVisit);
      const lastVisit = new Date(c.lastVisit);

      if (firstVisit >= THIRTY_DAYS) {
        newCustomers++;
      }

      if (lastVisit >= THIRTY_DAYS) {
        activeCustomers++;
      }
    });

    // Returning = active - new (removes overlap)
    const returningCustomers = Math.max(activeCustomers - newCustomers, 0);

    // ===============================
    // Retained Customers (True Retention)
    // ===============================
    let retainedCustomers = 0;

    customers.forEach((c) => {
      const firstVisit = new Date(c.firstVisit);
      const lastVisit = new Date(c.lastVisit);

      if (firstVisit < THIRTY_DAYS && lastVisit >= THIRTY_DAYS) {
        retainedCustomers++;
      }
    });

    // ===============================
    // Top Spenders
    // ===============================
    const topSpendersRaw = customers
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 5);

    const customerIds = topSpendersRaw.map((c) => c.customerId);
    const customerDocs = await Customer.find({ _id: { $in: customerIds } })
      .select("fullNumber phone mobile")
      .lean();

    const customerLookup = {};
    customerDocs.forEach((c) => {
      customerLookup[String(c._id)] = c.fullNumber || c.phone || c.mobile || "";
    });

    const topSpenders = topSpendersRaw.map((c) => ({
      customerId: c.customerId,
      phone: customerLookup[c.customerId] || "",
      totalSpend: c.spend,
      visits: c.visits,
    }));

    // ===============================
    // Customer Lifetime Value (LTV)
    // ===============================
    const totalRevenue = customers.reduce((sum, c) => sum + c.spend, 0);
    const avgLTV = Math.round(totalRevenue / totalCustomers);

    res.json({
      success: true,
      data: {
        totalCustomers,
        repeatCustomers,
        repeatRate,
        newCustomers,
        returningCustomers,
        retainedCustomers,
        topSpenders,
        avgLTV,
      },
    });
  } catch (err) {
    console.error("Customer analytics error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports._private = {
  INACTIVE_DAY_OPTIONS,
  SPENDING_THRESHOLD_OPTIONS,
  CUSTOMER_ANALYTICS_LIMIT_MAX,
  formatCustomerRow,
  formatItemRow,
  getCompletedBillingBasePipeline,
  isCanonicalObjectId,
  normalizePositiveInteger,
  normalizeOffset,
};
