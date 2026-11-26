const WhatsappBillingDelivery = require("../models/WhatsappBillingDelivery");
const { getMetaWhatsAppConfig } = require("../config/metaWhatsAppConfig");
const { sendMetaTemplateMessage } = require("./metaWhatsAppService");
const { buildBillStandardTemplatePayload } = require("./whatsappBillingRouteResolver");
const { normalizeWhatsappRecipientPhone } = require("../utils/whatsappRecipientPhone");

function sanitize(value, maxLength) {
  return String(value || "").replace(/[\r\n\t\0]/g, " ").trim().slice(0, maxLength);
}

function maskPhone(value) {
  const phone = String(value || "");
  return phone ? `${"*".repeat(Math.max(phone.length - 4, 0))}${phone.slice(-4)}` : "";
}

function makeConfigurationError(message, code) {
  const error = new Error(message);
  error.code = code;
  error.metaRequestAttempted = false;
  error.metaOutcomeUnknown = false;
  return error;
}

function getYnotMetaBillConfiguration(env = process.env) {
  const config = env === process.env
    ? getMetaWhatsAppConfig()
    : {
        ynotWabaId: String(env.YNOT_META_WABA_ID || "").trim(),
        ynotPhoneNumberId: String(env.YNOT_META_PHONE_NUMBER_ID || "").trim(),
        ynotBillTemplateName:
          String(env.YNOT_META_BILL_TEMPLATE_NAME || "").trim() || "ynot_bill_standard_v1",
        ynotBillTemplateLanguage:
          String(env.YNOT_META_BILL_TEMPLATE_LANGUAGE || "").trim() || "en",
        systemUserAccessToken: String(env.META_SYSTEM_USER_ACCESS_TOKEN || "").trim(),
      };
  const missing = [];
  if (!config.ynotWabaId) missing.push("YNOT_META_WABA_ID");
  if (!config.ynotPhoneNumberId) missing.push("YNOT_META_PHONE_NUMBER_ID");
  if (!config.systemUserAccessToken) missing.push("META_SYSTEM_USER_ACCESS_TOKEN");
  if (!config.ynotBillTemplateName) missing.push("YNOT_META_BILL_TEMPLATE_NAME");
  if (!config.ynotBillTemplateLanguage) missing.push("YNOT_META_BILL_TEMPLATE_LANGUAGE");
  if (missing.length) {
    const error = makeConfigurationError(
      `YNOT Meta billing configuration is incomplete: ${missing.join(", ")}`,
      "ynot_meta_configuration_missing"
    );
    error.missingConfiguration = missing;
    throw error;
  }
  return config;
}

async function findDelivery(Model, operationId) {
  const query = Model.findOne({ operationId });
  return typeof query?.lean === "function" ? query.lean() : query;
}

async function reserveDelivery(Model, values) {
  try {
    return { delivery: await Model.create(values), duplicate: false };
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return { delivery: await findDelivery(Model, values.operationId), duplicate: true };
  }
}

function buildFailureUpdate(error, status) {
  const metaError = error?.metaError || {};
  return {
    status,
    lastStatusAt: new Date(),
    failureCode: sanitize(error?.code || metaError.code || "ynot_meta_bill_send_failed", 80),
    failureMessage: sanitize(metaError.message || error?.message || "Meta billing send failed", 240),
    httpStatus: Number(metaError.status) || null,
    metaCode: sanitize(metaError.code, 80),
    metaSubcode: sanitize(metaError.subcode, 80),
    metaTraceId: sanitize(metaError.fbtraceId, 160),
  };
}

async function sendYnotMetaBillMessage(payload, dependencies = {}) {
  const DeliveryModel = dependencies.DeliveryModel || WhatsappBillingDelivery;
  const sendMessage = dependencies.sendMetaTemplateMessage || sendMetaTemplateMessage;
  const config = dependencies.config || getYnotMetaBillConfiguration(dependencies.env || process.env);
  const recipient = normalizeWhatsappRecipientPhone(payload.recipientPhoneNumber, {
    defaultCountry: "IN",
  });
  if (!recipient.valid) {
    throw makeConfigurationError("Recipient WhatsApp number is invalid", "ynot_meta_recipient_invalid");
  }
  if (!payload.operationId || !payload.billId || !payload.vendorId || !payload.sendPurpose) {
    throw makeConfigurationError("YNOT Meta billing delivery identity is incomplete", "ynot_meta_delivery_invalid");
  }

  const reservation = await reserveDelivery(DeliveryModel, {
    operationId: payload.operationId,
    vendorId: payload.vendorId,
    billingSessionId: payload.billId,
    purpose: payload.sendPurpose,
    provider: "ynot_meta",
    senderPhoneNumberId: config.ynotPhoneNumberId,
    recipientPhone: recipient.value,
    recipientMasked: maskPhone(recipient.value),
    templateName: config.ynotBillTemplateName,
    templateLanguage: config.ynotBillTemplateLanguage,
    status: "SUBMITTING",
    walletReference: payload.operationId,
  });
  if (reservation.duplicate) {
    const existingStatus = reservation.delivery?.status || "";
    const accepted = ["ACCEPTED", "SENT", "DELIVERED", "READ"].includes(existingStatus);
    return {
      provider: "ynot_meta",
      status: accepted ? "accepted" : "skipped",
      reason: "delivery_already_claimed",
      duplicate: true,
      deliveryId: reservation.delivery?._id,
      existingStatus,
      metaMessageId: reservation.delivery?.metaMessageId || "",
    };
  }

  const deliveryId = reservation.delivery._id;
  try {
    const attemptUpdate = await DeliveryModel.updateOne(
      { _id: deliveryId, status: "SUBMITTING" },
      { $set: { sendAttemptedAt: new Date(), lastStatusAt: new Date() } }
    );
    if (attemptUpdate?.matchedCount === 0) {
      throw makeConfigurationError(
        "YNOT Meta billing delivery claim is no longer available",
        "ynot_meta_delivery_claim_lost"
      );
    }
    const template = buildBillStandardTemplatePayload(payload);
    const result = await sendMessage({
      phoneNumberId: config.ynotPhoneNumberId,
      accessToken: config.systemUserAccessToken,
      recipientPhoneNumber: recipient.value,
      templateName: config.ynotBillTemplateName,
      languageCode: config.ynotBillTemplateLanguage,
      bodyParameters: template.bodyParameters,
    });
    const metaMessageId = String(result?.messages?.[0]?.id || "").trim();
    if (!metaMessageId) {
      const error = new Error("Meta did not return a message identifier");
      error.code = "ynot_meta_message_id_missing";
      error.metaRequestAttempted = true;
      error.metaOutcomeUnknown = true;
      throw error;
    }
    const acceptedAt = new Date();
    try {
      const acceptedUpdate = await DeliveryModel.updateOne(
        { _id: deliveryId, status: "SUBMITTING" },
        {
          $set: {
            status: "ACCEPTED",
            metaMessageId,
            acceptedAt,
            lastStatusAt: acceptedAt,
            failureCode: "",
            failureMessage: "",
          },
        }
      );
      if (acceptedUpdate?.matchedCount === 0) {
        const error = new Error("Meta acceptance could not be persisted");
        error.code = "ynot_meta_acceptance_persist_failed";
        throw error;
      }
    } catch (persistError) {
      persistError.code = persistError.code || "ynot_meta_acceptance_persist_failed";
      persistError.metaRequestAttempted = true;
      persistError.metaOutcomeUnknown = true;
      persistError.metaAccepted = true;
      persistError.metaMessageId = metaMessageId;
      throw persistError;
    }
    return {
      provider: "ynot_meta",
      status: "accepted",
      deliveryId,
      metaMessageId,
      attemptedAt: acceptedAt,
    };
  } catch (error) {
    const unknown = error?.metaOutcomeUnknown === true;
    try {
      const failureUpdate = buildFailureUpdate(error, unknown ? "UNKNOWN" : "FAILED");
      if (error?.metaMessageId) failureUpdate.metaMessageId = String(error.metaMessageId);
      await DeliveryModel.updateOne(
        { _id: deliveryId, status: "SUBMITTING" },
        { $set: failureUpdate }
      );
    } catch (trackingError) {
      error.trackingErrorCode = sanitize(trackingError?.code || "delivery_tracking_failed", 80);
    }
    error.deliveryId = deliveryId;
    throw error;
  }
}

module.exports = {
  getYnotMetaBillConfiguration,
  sendYnotMetaBillMessage,
};
