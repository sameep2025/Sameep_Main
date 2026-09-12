const { decryptMetaAccessToken } = require("./metaTokenStorage");
const { sendTemplateMessage } = require("./metaWhatsAppService");
const {
  buildBillStandardTemplatePayload,
} = require("./whatsappBillingRouteResolver");
const { getBillingTemplateInstance } = require("./whatsappBillingActivationEligibility");
const { normalizeWhatsappRecipientPhone } = require("../utils/whatsappRecipientPhone");

function makeBillSendError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function getSafeErrorCode(error) {
  return String(
    error?.metaError?.code ||
      error?.metaError?.errorCode ||
      error?.code ||
      "vendor_meta_bill_send_failed"
  );
}

async function sendVendorMetaBillMessage({
  vendor,
  vendorId,
  billId,
  recipientPhoneNumber,
  vendorName,
  billAmount,
  pointsEarned,
  pointsRedeemed,
  finalPaid,
  loyaltyBalance,
  billUrl,
}) {
  const config = vendor?.whatsappBusiness || {};
  const phoneNumberId = String(config.phoneNumberId || "").trim();
  const templateInstance = getBillingTemplateInstance(config);
  const recipient = normalizeWhatsappRecipientPhone(recipientPhoneNumber, {
    defaultCountry: "IN",
  });
  const hasApprovedTemplate = Boolean(
    templateInstance?.status === "approved" && templateInstance?.metaTemplateName
  );
  const parameterValues = [
    vendorName,
    billAmount,
    pointsEarned,
    pointsRedeemed,
    finalPaid,
    loyaltyBalance,
    billUrl,
  ];

  console.log("[WhatsApp Billing Trace]", {
    stage: "meta_preparation",
    vendorId: String(vendorId || vendor?._id || vendor?.id || ""),
    billId: String(billId || ""),
    hasEncryptedToken: Boolean(config.metaAuth?.accessTokenEncrypted),
    hasPhoneNumberId: Boolean(phoneNumberId),
    hasApprovedTemplate,
    templateKey: "BILL_STANDARD",
    paramCount: parameterValues.length,
    recipientNormalized: Boolean(recipient.valid),
  });

  if (!phoneNumberId) {
    throw makeBillSendError("Vendor Meta phone number ID is missing", "vendor_meta_phone_missing");
  }

  if (!templateInstance || templateInstance.status !== "approved") {
    throw makeBillSendError(
      "Approved BILL_STANDARD template is required",
      "vendor_meta_template_not_approved"
    );
  }

  if (!templateInstance.metaTemplateName) {
    throw makeBillSendError(
      "BILL_STANDARD Meta template name is missing",
      "vendor_meta_template_name_missing"
    );
  }

  if (!recipient.valid) {
    throw makeBillSendError("Recipient WhatsApp number is invalid", "vendor_meta_recipient_invalid");
  }

  const accessToken = decryptMetaAccessToken(config.metaAuth?.accessTokenEncrypted || "");
  if (!accessToken) {
    throw makeBillSendError("Vendor Meta access token is missing", "vendor_meta_token_missing");
  }

  const payload = buildBillStandardTemplatePayload({
    vendorName,
    billAmount,
    pointsEarned,
    pointsRedeemed,
    finalPaid,
    loyaltyBalance,
    billUrl,
  });

  console.log("[WhatsApp Billing Trace]", {
    stage: "meta_request_start",
    vendorId: String(vendorId || vendor?._id || vendor?.id || ""),
    billId: String(billId || ""),
    templateName: templateInstance.metaTemplateName,
    paramCount: payload.bodyParameters.length,
  });

  const result = await sendTemplateMessage({
    phoneNumberId,
    accessToken,
    recipientPhoneNumber: recipient.value,
    templateName: templateInstance.metaTemplateName,
    languageCode: templateInstance.language || payload.language,
    bodyParameters: payload.bodyParameters,
  });
  const metaMessageId = String(result?.messages?.[0]?.id || "");

  return {
    provider: "vendor_meta",
    status: "accepted",
    metaMessageId,
    attemptedAt: new Date(),
  };
}

module.exports = {
  getSafeErrorCode,
  sendVendorMetaBillMessage,
};
