const mongoose = require("mongoose");
const LoyaltyLedger = require("../models/LoyaltyLedger");
const VendorLoyaltyRule = require("../models/VendorLoyaltyRule");
const {
  summarizeRewardLedgerRowsForVendor,
} = require("../services/loyaltyService");


// ✅ Create or Update Vendor Loyalty Rule
exports.upsertVendorRule = async (req, res) => {
  try {
    const payload = req.body;
    const vendorId = req.vendorWriteAuth?.vendorId;

    const normalizedRule = {
      vendorId,
      isEnabled: payload.isEnabled ?? true,
      minBillAmount: payload.minBillAmount ?? 0,
      rounding: payload.rounding ?? "FLOOR",
      earn: {
        percentPer100: payload?.earn?.percentPer100 ?? payload?.percentPer100 ?? 0,
        type: "PERCENT_PER_BILL",
      },
      expiry: {
        expiryDays: payload?.expiry?.expiryDays ?? payload?.expiryDays ?? 0,
      },
      redeem: {
        allowPartial: payload.allowPartial ?? false,
        maxPercentPerBill: payload.maxPercentPerBill ?? null,
      },
    };

    delete normalizedRule.percentPer100;
    delete normalizedRule.expiryDays;

    const rule = await VendorLoyaltyRule.findOneAndUpdate(
      { vendorId },
      normalizedRule,
      { upsert: true, new: true }
    );

    res.status(200).json({ success: true, data: rule });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to save rule" });
  }
};


// ✅ Get Vendor Loyalty Rule
exports.getVendorRule = async (req, res) => {
  try {
    const vendorId = String(req.params?.vendorId || "").trim();
    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({ success: false, message: "Valid vendorId required" });
    }

    const rule = await VendorLoyaltyRule.findOne({ vendorId })
      .select("isEnabled minBillAmount rounding earn expiry redeem")
      .lean();

    res.status(200).json({ success: true, data: rule });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch rule" });
  }
};


// ✅ Wallet API (Expiry-aware)
exports.getWallet = async (req, res) => {
  try {
    const { customerId } = req.query;
    const vendorId = req.vendorWriteAuth?.vendorId;

    const earns = await LoyaltyLedger.find({
      customerId,
      vendorId,
    });
    const summary = summarizeRewardLedgerRowsForVendor({
      ledgerRows: earns,
      vendorId,
      now: new Date(),
    });

    res.status(200).json({
      success: true,
      availablePoints: summary.availablePoints,
      expiredPoints: summary.totalExpiredPoints,
      expiringSoon: summary.expiringSoonPoints,
      entries: earns,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch wallet",
    });
  }
};
