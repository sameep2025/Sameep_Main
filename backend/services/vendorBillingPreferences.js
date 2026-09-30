function isSendWhatsAppBillEnabled(vendor = {}) {
  return vendor?.billingPreferences?.sendWhatsAppBill !== false;
}

function sanitizeBillingPreferences(vendor = {}) {
  return {
    sendWhatsAppBill: isSendWhatsAppBillEnabled(vendor),
  };
}

module.exports = {
  isSendWhatsAppBillEnabled,
  sanitizeBillingPreferences,
};
