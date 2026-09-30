const mongoose = require("mongoose");
const BillingSession = require("../models/BillingSession");
const Transaction = require("../models/Transaction");
const Vendor = require("../models/DummyVendor");

const DEFAULT_BILL_LIMIT = 20;
const MAX_BILL_LIMIT = 50;

function toSafeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function hasStoredNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizePaymentMode(paymentMode) {
  return ["ONLINE", "CASH"].includes(paymentMode) ? paymentMode : null;
}

function buildBillFinancials(bill = {}, transaction = null) {
  const netBillValue = toSafeNumber(bill.totalAmount);
  const hasGrossAmount = hasStoredNumber(bill.grossAmount);
  const hasDiscountAmount = hasStoredNumber(bill.discountAmount);
  const billValue = hasGrossAmount ? toSafeNumber(bill.grossAmount) : netBillValue;
  const discountAmount = hasDiscountAmount ? toSafeNumber(bill.discountAmount) : 0;
  const rewardsRedeemed = transaction
    ? toSafeNumber(transaction.redeemValue)
    : toSafeNumber(bill.pointsRedeemed);
  const rawCollected = transaction
    ? toSafeNumber(transaction.finalPaidAmount)
    : netBillValue - rewardsRedeemed;

  return {
    billValue,
    discountAmount,
    rewardsRedeemed,
    netCollected: Math.max(rawCollected, 0),
    grossAmount: hasGrossAmount ? toSafeNumber(bill.grossAmount) : null,
    netBillValue,
    financialSnapshotAvailable: hasGrossAmount && hasDiscountAmount,
    transactionMissing: !transaction,
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

function buildSafeVendorDetail(vendor) {
  return {
    ...buildSafeVendorDisplay(vendor),
    address: vendor?.location?.address || "",
  };
}

function buildSafeItem(item = {}) {
  const quantity = toSafeNumber(item.qty);
  const unitPrice = toSafeNumber(item.price);
  const itemTotal = hasStoredNumber(item.total)
    ? toSafeNumber(item.total)
    : unitPrice * quantity;
  const staffName = typeof item.resourceName === "string" ? item.resourceName.trim() : "";

  return {
    name: item.name || "Item",
    quantity,
    unitPrice,
    itemTotal,
    ...(staffName ? { staffName } : {}),
  };
}

function encodeCursor(bill) {
  if (!bill?.createdAt || !bill?._id) return null;
  const payload = JSON.stringify({
    createdAt: new Date(bill.createdAt).toISOString(),
    id: String(bill._id),
  });
  return Buffer.from(payload, "utf8").toString("base64url");
}

function decodeCursor(cursor) {
  if (!cursor) return null;

  try {
    const parsed = JSON.parse(Buffer.from(String(cursor), "base64url").toString("utf8"));
    const createdAt = parsed?.createdAt ? new Date(parsed.createdAt) : null;
    const id = parsed?.id;

    if (!createdAt || Number.isNaN(createdAt.getTime()) || !mongoose.isValidObjectId(id)) {
      return null;
    }

    return {
      createdAt,
      id: new mongoose.Types.ObjectId(id),
    };
  } catch (err) {
    return null;
  }
}

function parseLimit(limit) {
  const parsed = Number.parseInt(limit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_BILL_LIMIT;
  return Math.min(parsed, MAX_BILL_LIMIT);
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

async function getVendorMapForBills(bills = []) {
  const vendorIds = Array.from(
    new Set(bills.map((bill) => String(bill.vendorId || "")).filter(Boolean))
  );
  if (!vendorIds.length) return new Map();

  const vendors = await Vendor.find({ _id: { $in: vendorIds } })
    .select("businessName subdomain logoUrl location.address")
    .lean();

  return new Map(vendors.map((vendor) => [String(vendor._id), vendor]));
}

function buildBillListItem(bill, { transaction = null, vendor = null } = {}) {
  const financials = buildBillFinancials(bill, transaction);
  const paymentMode = normalizePaymentMode(bill.paymentMode || transaction?.paymentMode);

  return {
    billId: String(bill._id),
    date: bill.createdAt || null,
    vendor: buildSafeVendorDisplay(vendor),
    billValue: financials.billValue,
    discountAmount: financials.discountAmount,
    rewardsRedeemed: financials.rewardsRedeemed,
    netCollected: financials.netCollected,
    paymentMode,
    financialSnapshotAvailable: financials.financialSnapshotAvailable,
  };
}

function buildBillDetail(bill, { transaction = null, vendor = null } = {}) {
  const financials = buildBillFinancials(bill, transaction);
  const paymentMode = normalizePaymentMode(bill.paymentMode || transaction?.paymentMode);

  return {
    billId: String(bill._id),
    date: bill.createdAt || null,
    vendor: buildSafeVendorDetail(vendor),
    customer: {
      type: bill.customerId ? "CUSTOMER" : "WALK_IN",
    },
    items: (bill.cartItems || bill.items || []).map(buildSafeItem),
    billValue: financials.billValue,
    discountAmount: financials.discountAmount,
    rewardsRedeemed: financials.rewardsRedeemed,
    netCollected: financials.netCollected,
    grossAmount: financials.grossAmount,
    netBillValue: financials.netBillValue,
    paymentMode,
    pointsEarned: toSafeNumber(bill.pointsEarned),
    pointsRedeemed: toSafeNumber(bill.pointsRedeemed),
    financialSnapshotAvailable: financials.financialSnapshotAvailable,
    transactionMissing: financials.transactionMissing,
  };
}

function applyCursorFilter(query, cursor) {
  const decoded = decodeCursor(cursor);
  if (!decoded) return false;

  query.$or = [
    { createdAt: { $lt: decoded.createdAt } },
    { createdAt: decoded.createdAt, _id: { $lt: decoded.id } },
  ];
  return true;
}

async function getBills(req, res) {
  try {
    const customerId = req.auth?.customerId;
    if (!customerId) {
      return res.status(401).json({
        success: false,
        message: "Customer portal session invalid or expired",
      });
    }

    const limit = parseLimit(req.query?.limit);
    const query = {
      customerId,
      status: "COMPLETED",
    };

    if (req.query?.cursor && !applyCursorFilter(query, req.query.cursor)) {
      return res.status(400).json({
        success: false,
        message: "Invalid pagination cursor",
      });
    }

    const rows = await BillingSession.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean();

    const pageBills = rows.slice(0, limit);
    const hasMore = rows.length > limit;
    const [transactionMap, vendorMap] = await Promise.all([
      getTransactionsForBills(pageBills),
      getVendorMapForBills(pageBills),
    ]);

    const bills = pageBills.map((bill) =>
      buildBillListItem(bill, {
        transaction: transactionMap.get(String(bill._id)) || null,
        vendor: vendorMap.get(String(bill.vendorId)) || null,
      })
    );

    return res.json({
      success: true,
      data: {
        bills,
        pagination: {
          hasMore,
          nextCursor: hasMore ? encodeCursor(pageBills[pageBills.length - 1]) : null,
          limit,
        },
      },
    });
  } catch (err) {
    console.error("customer portal bills error:", err?.message || err);
    return res.status(500).json({
      success: false,
      message: "Unable to load bills right now.",
    });
  }
}

async function getBillDetail(req, res) {
  try {
    const customerId = req.auth?.customerId;
    const billIdentifier = req.params?.billIdentifier;

    if (!customerId) {
      return res.status(401).json({
        success: false,
        message: "Customer portal session invalid or expired",
      });
    }

    if (!mongoose.isValidObjectId(billIdentifier)) {
      return res.status(404).json({
        success: false,
        message: "Bill not found",
      });
    }

    const bill = await BillingSession.findOne({
      _id: billIdentifier,
      customerId,
      status: "COMPLETED",
    }).lean();

    if (!bill) {
      return res.status(404).json({
        success: false,
        message: "Bill not found",
      });
    }

    const [transaction, vendor] = await Promise.all([
      Transaction.findOne({ billingSessionId: bill._id }).lean(),
      Vendor.findById(bill.vendorId)
        .select("businessName subdomain logoUrl location.address")
        .lean(),
    ]);

    return res.json({
      success: true,
      data: {
        bill: buildBillDetail(bill, { transaction, vendor }),
      },
    });
  } catch (err) {
    console.error("customer portal bill detail error:", err?.message || err);
    return res.status(500).json({
      success: false,
      message: "Unable to load bill right now.",
    });
  }
}

module.exports = {
  DEFAULT_BILL_LIMIT,
  MAX_BILL_LIMIT,
  buildBillDetail,
  buildBillFinancials,
  buildBillListItem,
  decodeCursor,
  encodeCursor,
  getBillDetail,
  getBills,
  parseLimit,
};
