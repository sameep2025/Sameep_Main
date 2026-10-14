const mongoose = require("mongoose");
const Customer = require("../models/Customer");
const BillingSession = require("../models/BillingSession");
const Transaction = require("../models/Transaction");
const LoyaltyLedger = require("../models/LoyaltyLedger");
const VendorCustomerProfile = require("../models/VendorCustomerProfile");
const {
  summarizeRewardLedgerRowsForVendor,
} = require("../services/loyaltyService");
const {
  normalizeCustomerName,
  validateOptionalCustomerName,
} = require("../utils/customerName");

function normalizePhoneQuery(phone = "") {
  return String(phone || "").replace(/\D/g, "");
}

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenizeCustomerSearch(value = "") {
  return normalizeCustomerName(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, 6);
}

async function findCustomerByPhone(phone) {
  const normalized = normalizePhoneQuery(phone);
  if (!normalized) return null;

  const candidates = new Set([normalized]);
  if (normalized.length === 10) candidates.add(`91${normalized}`);
  if (normalized.length > 10 && normalized.startsWith("91")) candidates.add(normalized.slice(2));

  return Customer.findOne({
    $or: Array.from(candidates).flatMap((value) => [
      { phone: value },
      { fullNumber: value },
    ]),
  }).lean();
}

async function getVendorCustomerProfile(vendorId, customerId) {
  if (!vendorId || !customerId) return null;
  return VendorCustomerProfile.findOne({ vendorId, customerId }).lean();
}

function getCustomerDigits(customer = {}) {
  return normalizePhoneQuery(customer.fullNumber || customer.phone || "");
}

function localPhoneFromDigits(digits = "") {
  const normalized = normalizePhoneQuery(digits);
  return normalized.startsWith("91") && normalized.length > 10
    ? normalized.slice(2)
    : normalized;
}

function customerMatchesTokens({ tokens, name, digits }) {
  const normalizedName = normalizeCustomerName(name).toLowerCase();
  const normalizedDigits = getCustomerDigits({ fullNumber: digits });

  return tokens.every((token) => {
    const lowerToken = token.toLowerCase();
    const digitToken = normalizePhoneQuery(token);
    const nameMatches = normalizedName.includes(lowerToken);
    const phoneMatches = digitToken ? normalizedDigits.includes(digitToken) : false;
    return nameMatches || phoneMatches;
  });
}

function rankCustomerSearchResult({ rawSearch, name, digits }) {
  const normalizedSearch = normalizeCustomerName(rawSearch).toLowerCase();
  const searchDigits = normalizePhoneQuery(rawSearch);
  const normalizedName = normalizeCustomerName(name).toLowerCase();
  const fullDigits = getCustomerDigits({ fullNumber: digits });
  const localDigits = localPhoneFromDigits(fullDigits);

  if (searchDigits && (fullDigits === searchDigits || localDigits === searchDigits)) return 10;
  if (searchDigits && (fullDigits.startsWith(searchDigits) || localDigits.startsWith(searchDigits))) return 20;
  if (normalizedSearch && normalizedName === normalizedSearch) return 30;
  if (normalizedSearch && normalizedName.startsWith(normalizedSearch)) return 40;
  if (searchDigits && (fullDigits.includes(searchDigits) || localDigits.includes(searchDigits))) return 50;
  if (normalizedSearch && normalizedName.includes(normalizedSearch)) return 60;
  return 80;
}

async function searchVendorCustomers({ vendorId, searchText, limit = 10 }) {
  const tokens = tokenizeCustomerSearch(searchText);
  if (!tokens.length) return [];

  const vendorObjectId = new mongoose.Types.ObjectId(vendorId);
  const [profiles, billedCustomerIds] = await Promise.all([
    VendorCustomerProfile.find({ vendorId: vendorObjectId })
      .select("customerId displayName updatedAt")
      .limit(1000)
      .lean(),
    BillingSession.distinct("customerId", {
      vendorId: vendorObjectId,
      customerId: { $ne: null },
    }),
  ]);

  const candidateIds = new Set([
    ...profiles.map((profile) => String(profile.customerId || "")).filter(Boolean),
    ...billedCustomerIds.map((id) => String(id || "")).filter(Boolean),
  ]);

  const digitTokens = tokens.map(normalizePhoneQuery).filter((token) => token.length >= 3);
  if (digitTokens.length) {
    const phoneRegex = { $regex: digitTokens.map(escapeRegex).join("|") };
    const phoneMatches = await Customer.find({
      $or: [{ phone: phoneRegex }, { fullNumber: phoneRegex }],
    })
      .select("_id")
      .limit(100)
      .lean();
    phoneMatches.forEach((customer) => candidateIds.add(String(customer._id)));
  }

  const validCandidateIds = Array.from(candidateIds).filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (!validCandidateIds.length) return [];

  const [customers, profileRows] = await Promise.all([
    Customer.find({ _id: { $in: validCandidateIds } })
      .select("phone fullNumber")
      .lean(),
    VendorCustomerProfile.find({
      vendorId: vendorObjectId,
      customerId: { $in: validCandidateIds },
    })
      .select("customerId displayName updatedAt")
      .lean(),
  ]);

  const profileMap = new Map(
    profileRows.map((profile) => [String(profile.customerId), profile])
  );
  const vendorScopedIds = new Set([
    ...profiles.map((profile) => String(profile.customerId || "")).filter(Boolean),
    ...billedCustomerIds.map((id) => String(id || "")).filter(Boolean),
  ]);

  return customers
    .filter((customer) => vendorScopedIds.has(String(customer._id)))
    .map((customer) => {
      const profile = profileMap.get(String(customer._id)) || {};
      const name = normalizeCustomerName(profile.displayName || "");
      const digits = getCustomerDigits(customer);
      return {
        customerId: String(customer._id),
        name,
        phone: customer.phone || customer.fullNumber || "",
        fullNumber: customer.fullNumber || "",
        digits,
        rank: rankCustomerSearchResult({ rawSearch: searchText, name, digits }),
      };
    })
    .filter((result) =>
      customerMatchesTokens({
        tokens,
        name: result.name,
        digits: result.digits,
      })
    )
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      const aName = a.name || "";
      const bName = b.name || "";
      if (aName !== bName) return aName.localeCompare(bName);
      return String(a.fullNumber || a.phone).localeCompare(String(b.fullNumber || b.phone));
    })
    .slice(0, limit)
    .map(({ rank, digits, ...result }) => result);
}

exports.getVendorCustomer = async (req, res) => {
  try {
    const { vendorId, phone, search, range = "all" } = req.query;

    if (!vendorId) {
      return res.status(400).json({ success: false, message: "vendorId required" });
    }
    const searchText = normalizeCustomerName(search || "");
    if (!phone && searchText) {
      if (searchText.length < 2) {
        return res.status(400).json({ success: false, message: "Enter at least 2 characters" });
      }

      const matches = await searchVendorCustomers({
        vendorId,
        searchText,
        limit: Math.min(Number(req.query.limit || 10) || 10, 10),
      });

      return res.json({
        success: true,
        data: {
          matches,
        },
      });
    }
    if (!phone) {
      return res.status(400).json({ success: false, message: "phone required" });
    }

    const customer = await findCustomerByPhone(phone);

    if (!customer) {
      return res.json({ success: true, data: null });
    }

    const vendorCustomerProfile = await getVendorCustomerProfile(vendorId, customer._id);
    const vendorCustomerName = normalizeCustomerName(vendorCustomerProfile?.displayName || "");

    let rangeStart = null;
    if (range === "3m") {
      rangeStart = new Date();
      rangeStart.setDate(rangeStart.getDate() - 90);
    } else if (range === "6m") {
      rangeStart = new Date();
      rangeStart.setDate(rangeStart.getDate() - 180);
    } else if (range === "1y") {
      rangeStart = new Date();
      rangeStart.setDate(rangeStart.getDate() - 365);
    }

    const billQuery = {
      vendorId: new mongoose.Types.ObjectId(vendorId),
      customerId: customer._id,
      status: { $in: ["COMPLETED", "CANCELLED"] },
    };
    if (rangeStart) {
      billQuery.createdAt = { $gte: rangeStart };
    }

    const billsRaw = await BillingSession.find(billQuery)
      .sort({ createdAt: -1 })
      .lean();

    const billIds = billsRaw.map((b) => b._id).filter(Boolean);
    const transactions = billIds.length
      ? await Transaction.find({ billingSessionId: { $in: billIds } })
          .select("_id billingSessionId finalPaidAmount redeemValue paymentMode status createdAt")
          .lean()
      : [];
    const transactionMap = new Map(
      transactions
        .filter((transaction) => transaction.billingSessionId)
        .map((transaction) => [String(transaction.billingSessionId), transaction])
    );
    const transactionIds = transactions
      .map((transaction) => transaction._id)
      .filter(Boolean)
      .map((id) => String(id));

    const ledgerMap = new Map();
    if (transactionIds.length) {
      const earnEntries = await LoyaltyLedger.find({
        type: "EARN",
        transactionId: { $in: transactionIds },
      })
        .select("transactionId points expiryDate")
        .lean();

      earnEntries.forEach((e) => {
        if (e.transactionId) {
          ledgerMap.set(String(e.transactionId), e);
        }
      });
    }

    const bills = billsRaw.map((bill) => {
      const items = bill.items || bill.cartItems || [];
      const earned = bill.pointsEarned || 0;
      const redeemed = bill.pointsRedeemed || 0;
      const transaction = transactionMap.get(String(bill._id || ""));
      const ledger = transaction?._id
        ? ledgerMap.get(String(transaction._id))
        : null;
      const now = new Date();
      let daysLeft = null;
      if (ledger?.expiryDate) {
        const diff = new Date(ledger.expiryDate) - now;
        daysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24));
      }

      const effectiveCompletedAt = bill.completedAt || transaction?.createdAt || bill.createdAt || null;
      const cancellationDeadline = effectiveCompletedAt
        ? new Date(new Date(effectiveCompletedAt).getTime() + 7 * 24 * 60 * 60 * 1000)
        : null;

      return {
        billId: bill._id,
        total: bill.total || transaction?.finalPaidAmount || bill.totalAmount || 0,
        earned,
        redeemed: transaction?.redeemValue ?? redeemed,
        createdAt: bill.createdAt,
        transactionDate: bill.createdAt,
        pointsEarned: ledger?.points ?? earned,
        expiryDate: ledger?.expiryDate || null,
        daysLeft,
        phone: bill.customerPhoneSnapshot || bill.phone || bill.customerPhone || customer.fullNumber || customer.phone || "Walk-in",
        customerNameSnapshot: bill.customerNameSnapshot || "",
        status: bill.status,
        cancellationReason: bill.cancellationReason || "",
        cancellationNote: bill.cancellationNote || "",
        cancelledAt: bill.cancelledAt || null,
        canCancel:
          bill.status === "COMPLETED" &&
          cancellationDeadline &&
          new Date() <= cancellationDeadline,
        cancellationDeadline,
        paymentMode: bill.paymentMode || transaction?.paymentMode || "",
        items: items.map((i) => ({
          itemId: i.itemId ? String(i.itemId) : "",
          name: i.name,
          qty: Number(i.qty || 0),
          price: Number(i.price || 0),
          total: Number(i.total || i.price || 0),
          nodePath: i.nodePath || [],
          resourceName: i.resourceName || "",
        })),
      };
    });

    const completedBillsRaw = billsRaw.filter((bill) => bill.status === "COMPLETED");
    const totalSpend = completedBillsRaw.reduce(
      (sum, b) => sum + (b.totalAmount || 0),
      0
    );
    const totalVisits = completedBillsRaw.length;
    const avgBill = totalVisits ? Math.round(totalSpend / totalVisits) : 0;
    const lastVisit = completedBillsRaw[0]?.createdAt || null;

    const now = new Date();

    const loyaltyRows = await LoyaltyLedger.find({
      vendorId: new mongoose.Types.ObjectId(vendorId),
      customerId: customer._id,
    }).lean();

    const rewardSummary = summarizeRewardLedgerRowsForVendor({
      ledgerRows: loyaltyRows,
      vendorId,
      now,
    });
    const loyaltyRow = {
      earned: rewardSummary.totalEarnedPoints,
      redeemed: rewardSummary.totalRedeemedPoints,
      balance: rewardSummary.redeemableBalance,
      availablePoints: rewardSummary.availablePoints,
      expiredPoints: rewardSummary.totalExpiredPoints,
      expiringSoonPoints: rewardSummary.expiringSoonPoints,
    };

    const expiringPoints = await LoyaltyLedger.aggregate([
      {
        $match: {
          vendorId: new mongoose.Types.ObjectId(vendorId),
          customerId: customer._id,
          type: "EARN",
          remainingPoints: { $gt: 0 },
          expiryDate: { $gt: now },
        },
      },
      {
        $project: {
          _id: 0,
          expiryDate: 1,
          remainingPoints: 1,
          daysLeft: {
            $ceil: {
              $divide: [{ $subtract: ["$expiryDate", now] }, 86400000],
            },
          },
        },
      },
      { $sort: { expiryDate: 1 } },
    ]);

    const retentionAgg = await BillingSession.aggregate([
      {
        $match: {
          vendorId: new mongoose.Types.ObjectId(vendorId),
          status: "COMPLETED",
        },
      },
      {
        $group: {
          _id: "$customerId",
          visits: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: null,
          totalCustomers: { $sum: 1 },
          returningCustomers: {
            $sum: {
              $cond: [{ $gt: ["$visits", 1] }, 1, 0],
            },
          },
        },
      },
    ]);

    const retentionRow = retentionAgg?.[0] || {};
    const totalCustomers = retentionRow.totalCustomers || 0;
    const returningCustomers = retentionRow.returningCustomers || 0;
    const retentionScore = totalCustomers
      ? Math.round((returningCustomers / totalCustomers) * 100)
      : 0;

    res.json({
      success: true,
      data: {
        customer: {
          id: String(customer._id),
          name: vendorCustomerName,
          phone: customer.phone || customer.fullNumber || phone,
          totalVisits,
          totalSpend,
          avgBill,
          lastVisit,
        },
        loyalty: {
          earned: loyaltyRow.earned || 0,
          redeemed: loyaltyRow.redeemed || 0,
          balance: loyaltyRow.balance || 0,
          availablePoints: loyaltyRow.availablePoints || 0,
          expiredPoints: loyaltyRow.expiredPoints || 0,
          expiringSoonPoints: loyaltyRow.expiringSoonPoints || 0,
          expiringPoints,
        },
        retention: {
          totalCustomers,
          returningCustomers,
          retentionScore,
        },
        bills,
      },
    });
  } catch (err) {
    console.error("getVendorCustomer error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getVendorCustomerProfile = async (req, res) => {
  try {
    const vendorId = String(req.vendorWriteAuth?.vendorId || req.query?.vendorId || "").trim();
    const customer = await findCustomerByPhone(req.query?.phone || "");

    if (!vendorId) {
      return res.status(400).json({ success: false, message: "vendorId required" });
    }

    if (!customer) {
      return res.json({ success: true, data: null });
    }

    const profile = await getVendorCustomerProfile(vendorId, customer._id);

    return res.json({
      success: true,
      data: {
        customerId: String(customer._id),
        phone: customer.phone || customer.fullNumber || "",
        fullNumber: customer.fullNumber || "",
        name: normalizeCustomerName(profile?.displayName || ""),
      },
    });
  } catch (err) {
    console.error("getVendorCustomerProfile error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.updateVendorCustomerName = async (req, res) => {
  try {
    const vendorId = String(req.vendorWriteAuth?.vendorId || req.body?.vendorId || "").trim();
    const customerId = String(req.body?.customerId || "").trim();
    const phone = req.body?.phone || "";
    const validation = validateOptionalCustomerName(req.body?.name, { allowEmpty: true });

    if (!vendorId) {
      return res.status(400).json({ success: false, message: "vendorId required" });
    }
    if (!validation.ok) {
      return res.status(400).json({ success: false, message: validation.message });
    }

    let customer = null;
    if (customerId && mongoose.Types.ObjectId.isValid(customerId)) {
      customer = await Customer.findById(customerId).lean();
    }
    if (!customer) {
      customer = await findCustomerByPhone(phone);
    }
    if (!customer) {
      return res.status(404).json({ success: false, message: "Customer not found" });
    }

    const profile = await VendorCustomerProfile.findOneAndUpdate(
      { vendorId, customerId: customer._id },
      {
        $set: {
          vendorId,
          customerId: customer._id,
          displayName: validation.value,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    return res.json({
      success: true,
      data: {
        customerId: String(customer._id),
        phone: customer.phone || customer.fullNumber || "",
        fullNumber: customer.fullNumber || "",
        name: normalizeCustomerName(profile?.displayName || ""),
      },
    });
  } catch (err) {
    console.error("updateVendorCustomerName error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
