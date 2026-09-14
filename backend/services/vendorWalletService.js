const VendorWallet = require("../models/VendorWallet");
const VendorWalletLedger = require("../models/VendorWalletLedger");

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

module.exports = {
  hasAvailableOTPBalance,
  hasAvailableWhatsAppBalance,
  deductWhatsApp,
  deductOTP,
};
