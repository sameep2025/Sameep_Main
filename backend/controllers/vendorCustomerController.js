const mongoose = require("mongoose");
const Customer = require("../models/Customer");
const BillingSession = require("../models/BillingSession");
const Transaction = require("../models/Transaction");
const LoyaltyLedger = require("../models/LoyaltyLedger");
const {
  summarizeRewardLedgerRowsForVendor,
} = require("../services/loyaltyService");

exports.getVendorCustomer = async (req, res) => {
  try {
    const { vendorId, phone, range = "all" } = req.query;

    if (!vendorId) {
      return res.status(400).json({ success: false, message: "vendorId required" });
    }
    if (!phone) {
      return res.status(400).json({ success: false, message: "phone required" });
    }

    const customer = await Customer.findOne({
      $or: [{ phone }, { fullNumber: phone }],
    }).lean();

    if (!customer) {
      return res.json({ success: true, data: null });
    }

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
