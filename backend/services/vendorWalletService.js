const mongoose = require("mongoose");
const VendorWallet = require("../models/VendorWallet");
const VendorWalletLedger = require("../models/VendorWalletLedger");
const WhatsappBillingDelivery = require("../models/WhatsappBillingDelivery");

function isDuplicateKeyError(error) {
  return error?.code === 11000 || String(error?.message || "").includes("E11000");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function deductWhatsApp(vendorId, reference) {
  const wallet = await VendorWallet.findOne({ vendorId });

  if (!wallet) {
    throw new Error("Vendor wallet not found");
  }

  if (wallet.whatsappBalance <= 0) {
    throw new Error("Insufficient WhatsApp balance");
  }

  wallet.whatsappBalance -= 1;
  await wallet.save();

  await VendorWalletLedger.create({
    vendorId,
    type: reference && String(reference).startsWith("enquiry:")
      ? "ENQUIRY_MESSAGE"
      : "BILL_MESSAGE",
    channel: "WHATSAPP",
    quantity: -1,
    reference,
    balanceAfter: wallet.whatsappBalance,
  });

  return wallet.whatsappBalance;
}

async function hasAvailableWhatsAppBalance(vendorId) {
  const wallet = await VendorWallet.findOne({ vendorId }).select("whatsappBalance").lean();
  return Number(wallet?.whatsappBalance || 0) > 0;
}

async function hasAvailableOTPBalance(vendorId) {
  const wallet = await VendorWallet.findOne({ vendorId }).select("otpBalance").lean();
  return Number(wallet?.otpBalance || 0) > 0;
}

async function deductOTP(vendorId, reference) {
  if (!reference) {
    const wallet = await VendorWallet.findOneAndUpdate(
      { vendorId, otpBalance: { $gt: 0 } },
      { $inc: { otpBalance: -1 } },
      { new: true }
    );

    if (!wallet) {
      throw new Error("Insufficient OTP balance");
    }

    await VendorWalletLedger.create({
      vendorId,
      type: "OTP_USAGE",
      channel: "OTP",
      quantity: -1,
      reference,
      balanceAfter: wallet.otpBalance,
    });

    return wallet.otpBalance;
  }

  let ledgerClaim = null;
  try {
    ledgerClaim = await VendorWalletLedger.create({
      vendorId,
      type: "OTP_USAGE",
      channel: "OTP",
      quantity: 0,
      reference,
      balanceAfter: null,
    });
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const existingLedger = await VendorWalletLedger.findOne({
        vendorId,
        channel: "OTP",
        reference,
      }).lean();

      if (existingLedger && Number(existingLedger.quantity) < 0) {
        return Number(existingLedger.balanceAfter || 0);
      }

      if (!existingLedger) {
        throw new Error("Insufficient OTP balance");
      }

      await sleep(50);
    }

    throw new Error("OTP deduction already in progress");
  }

  const wallet = await VendorWallet.findOneAndUpdate(
    { vendorId, otpBalance: { $gt: 0 } },
    { $inc: { otpBalance: -1 } },
    { new: true }
  );

  if (!wallet) {
    await VendorWalletLedger.deleteOne({ _id: ledgerClaim._id });
    throw new Error("Insufficient OTP balance");
  }

  await VendorWalletLedger.updateOne(
    { _id: ledgerClaim._id },
    {
      $set: {
        quantity: -1,
        balanceAfter: wallet.otpBalance,
      },
    }
  );

  return wallet.otpBalance;
}

async function deductWhatsAppForBillingDelivery({
  vendorId,
  deliveryId,
  reference,
  dependencies = {},
}) {
  const WalletModel = dependencies.WalletModel || VendorWallet;
  const LedgerModel = dependencies.LedgerModel || VendorWalletLedger;
  const DeliveryModel = dependencies.DeliveryModel || WhatsappBillingDelivery;
  const startSession = dependencies.startSession || (() => mongoose.startSession());
  const session = await startSession();
  let balanceAfter = null;
  let alreadyDeducted = false;

  try {
    await session.withTransaction(async () => {
      const delivery = await DeliveryModel.findOne({
        _id: deliveryId,
        vendorId,
        provider: "ynot_meta",
        status: { $in: ["ACCEPTED", "SENT", "DELIVERED", "READ"] },
      }).session(session);
      if (!delivery) throw new Error("Accepted YNOT Meta billing delivery not found");
      if (delivery.walletDeductedAt) {
        alreadyDeducted = true;
        balanceAfter = null;
        return;
      }

      const wallet = await WalletModel.findOneAndUpdate(
        { vendorId, whatsappBalance: { $gt: 0 } },
        { $inc: { whatsappBalance: -1 } },
        { new: true, session }
      );
      if (!wallet) throw new Error("Insufficient WhatsApp balance");
      balanceAfter = wallet.whatsappBalance;

      await LedgerModel.create(
        [{
          vendorId,
          type: "BILL_MESSAGE",
          channel: "WHATSAPP",
          quantity: -1,
          reference,
          balanceAfter,
        }],
        { session }
      );
      delivery.walletDeductedAt = new Date();
      delivery.walletReference = reference;
      await delivery.save({ session });
    });
    return { alreadyDeducted, balanceAfter };
  } finally {
    await session.endSession();
  }
}

module.exports = {
  hasAvailableOTPBalance,
  hasAvailableWhatsAppBalance,
  deductWhatsApp,
  deductWhatsAppForBillingDelivery,
  deductOTP,
};
