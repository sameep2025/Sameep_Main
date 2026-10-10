const Customer = require("../models/Customer");
const Vendor = require("../models/DummyVendor");
const { calculateCustomerBalance } = require("./loyaltyService");
const { buildMessagingReadiness } = require("./metaWhatsAppReadiness");
const {
  getPhoneNumberReadinessWithSystemUserToken,
} = require("./metaWhatsAppService");
const {
  isVendorMetaBillRoutingEnabled,
  sendRoutedWhatsAppBillingMessage,
} = require("./whatsappBillingRouter");
const {
  isSendWhatsAppBillEnabled,
} = require("./vendorBillingPreferences");
const { deductWhatsApp } = require("./vendorWalletService");
const {
  buildPublicBillPath,
  buildPublicBillUrl,
  createBillAccessToken,
} = require("../utils/billLink");

function getBillingCustomerPhone({ billing, customer }) {
  return String(
    billing?.customerPhoneSnapshot ||
    customer?.fullNumber ||
    customer?.phone ||
    ""
  ).trim();
}

async function sendCompletedBillWhatsApp({ billing, referencePrefix = "billing" }) {
  if (!billing?.customerId) {
    return {
      success: false,
      skipped: true,
      reason: "no_customer",
      message: "Bill has no customer linked.",
    };
  }

  const [customer, vendor] = await Promise.all([
    Customer.findById(billing.customerId).lean(),
    Vendor.findById(billing.vendorId).lean(),
  ]);
  let vendorForWhatsApp = vendor;

  if (!vendor) {
    return {
      success: false,
      skipped: true,
      reason: "vendor_not_found",
      message: "Vendor not found.",
    };
  }

  if (!isSendWhatsAppBillEnabled(vendor)) {
    return {
      success: false,
      skipped: true,
      reason: "vendor_preference_disabled",
      message: "WhatsApp bill sending is disabled for this vendor.",
    };
  }

  const mobile = getBillingCustomerPhone({ billing, customer });
  if (!mobile) {
    return {
      success: false,
      skipped: true,
      reason: "no_mobile",
      message: "Customer mobile number not found.",
    };
  }

  if (
    isVendorMetaBillRoutingEnabled() &&
    vendor?.whatsappBusiness?.provider === "meta" &&
    vendor?.whatsappBusiness?.enabled === true &&
    vendor?.whatsappBusiness?.phoneNumberId
  ) {
    try {
      const phoneStatus = await getPhoneNumberReadinessWithSystemUserToken({
        phoneNumberId: vendor.whatsappBusiness.phoneNumberId,
      });
      vendorForWhatsApp = {
        ...vendor,
        whatsappBusiness: {
          ...vendor.whatsappBusiness,
          messagingReadiness: buildMessagingReadiness(phoneStatus?.health_status || null),
        },
      };
    } catch (readinessErr) {
      vendorForWhatsApp = {
        ...vendor,
        whatsappBusiness: {
          ...vendor.whatsappBusiness,
          messagingReadiness: buildMessagingReadiness(null),
        },
      };
      console.error("[WhatsApp Billing Meta Readiness Refresh Failed]", {
        vendorId: String(billing.vendorId || ""),
        billId: String(billing._id || ""),
        code: readinessErr?.code || "",
        metaCode: readinessErr?.metaError?.code || "",
        metaSubcode: readinessErr?.metaError?.subcode || "",
      });
    }
  }

  const balance = await calculateCustomerBalance(
    billing.customerId,
    billing.vendorId
  );
  const billToken = await createBillAccessToken({
    billingId: billing._id,
  });
  const billUrl = await buildPublicBillUrl({
    token: billToken,
  });
  const billPath = buildPublicBillPath({
    token: billToken,
  });
  const finalPaid =
    Number(billing.totalAmount || 0) - Number(billing.pointsRedeemed || 0);
  const messagePayload = {
    mobile,
    customerName: customer?.name || "Customer",
    vendorName: vendor?.businessName || "Vendor",
    billAmount: billing.totalAmount,
    earned: billing.pointsEarned || 0,
    redeemed: billing.pointsRedeemed || 0,
    finalPaid,
    balance,
    billUrl,
    billPath,
  };

  const sendResult = await sendRoutedWhatsAppBillingMessage({
    vendor: vendorForWhatsApp,
    vendorId: billing.vendorId,
    billId: billing._id,
    msg91Payload: messagePayload,
    metaPayload: {
      vendor: vendorForWhatsApp,
      vendorId: billing.vendorId,
      billId: billing._id,
      recipientPhoneNumber: mobile,
      vendorName: messagePayload.vendorName,
      billAmount: messagePayload.billAmount,
      pointsEarned: messagePayload.earned,
      pointsRedeemed: messagePayload.redeemed,
      finalPaid: messagePayload.finalPaid,
      loyaltyBalance: balance,
      billUrl,
    },
  });

  if (sendResult?.status === "accepted" && sendResult?.provider === "ynot_msg91") {
    await deductWhatsApp(billing.vendorId, `${referencePrefix}:${billing._id}`);
  }

  return {
    success: sendResult?.status === "accepted",
    skipped: false,
    provider: sendResult?.provider || "",
    status: sendResult?.status || "",
    mobile,
  };
}

module.exports = {
  getBillingCustomerPhone,
  sendCompletedBillWhatsApp,
};
