const Enquiry = require("../models/Enquiry");
const { getMetaWhatsAppConfig } = require("../config/metaWhatsAppConfig");
const { sendMetaTemplateMessage } = require("./metaWhatsAppService");
const { normalizeWhatsappRecipientPhone } = require("../utils/whatsappRecipientPhone");

function sanitize(value, maxLength) {
  return String(value || "").replace(/[\r\n\t\0]/g, " ").trim().slice(0, maxLength);
}

function makeConfigurationError(message, code) {
  const error = new Error(message);
  error.code = code;
  error.metaRequestAttempted = false;
  error.metaOutcomeUnknown = false;
  return error;
}

function isYnotMetaEnquiryEnabled(env = process.env) {
  return String(env.YNOT_META_ENQUIRY_ENABLED || "").trim() === "true";
}

function getYnotMetaEnquiryConfiguration(env = process.env) {
  const config = env === process.env
    ? getMetaWhatsAppConfig()
    : {
        ynotWabaId: String(env.YNOT_META_WABA_ID || "").trim(),
        ynotPhoneNumberId: String(env.YNOT_META_PHONE_NUMBER_ID || "").trim(),
        ynotEnquiryTemplateName:
          String(env.YNOT_META_ENQUIRY_TEMPLATE_NAME || "").trim() || "vendor_enquiry",
        ynotEnquiryTemplateLanguage:
          String(env.YNOT_META_ENQUIRY_TEMPLATE_LANGUAGE || "").trim() || "en",
        systemUserAccessToken: String(env.META_SYSTEM_USER_ACCESS_TOKEN || "").trim(),
      };
  const missing = [];
  if (!config.ynotWabaId) missing.push("YNOT_META_WABA_ID");
  if (!config.ynotPhoneNumberId) missing.push("YNOT_META_PHONE_NUMBER_ID");
  if (!config.systemUserAccessToken) missing.push("META_SYSTEM_USER_ACCESS_TOKEN");
  if (!config.ynotEnquiryTemplateName) missing.push("YNOT_META_ENQUIRY_TEMPLATE_NAME");
  if (!config.ynotEnquiryTemplateLanguage) missing.push("YNOT_META_ENQUIRY_TEMPLATE_LANGUAGE");
  if (missing.length) {
    const error = makeConfigurationError(
      `YNOT Meta enquiry configuration is incomplete: ${missing.join(", ")}`,
      "ynot_meta_enquiry_configuration_missing"
    );
    error.missingConfiguration = missing;
    throw error;
  }
  return config;
}

function buildEnquiryOperationId(enquiryId) {
  return `enquiry:${String(enquiryId || "")}:vendor-alert`;
}

async function resolveLean(query) {
  return typeof query?.lean === "function" ? query.lean() : query;
}

function buildFailureFields(error, deliveryStatus) {
  const metaError = error?.metaError || {};
  const unknown = deliveryStatus === "UNKNOWN";
  return {
    "meta.vendorWhatsappStatus": unknown ? "pending" : "failed",
    "meta.vendorWhatsappDeliveryStatus": deliveryStatus,
    "meta.vendorWhatsappLastStatusAt": new Date(),
    "meta.vendorWhatsappFailedAt": unknown ? null : new Date(),
    "meta.vendorWhatsappOutcomeUnknown": unknown,
    "meta.vendorWhatsappErrorCode": sanitize(error?.code || metaError.code, 80),
    "meta.vendorWhatsappError": sanitize(
      unknown
        ? "Meta request outcome is unknown; automatic retry was blocked"
        : metaError.message || error?.message || "Meta enquiry notification failed",
      240
    ),
    "meta.vendorWhatsappHttpStatus": Number(metaError.status) || null,
    "meta.vendorWhatsappMetaCode": sanitize(metaError.code, 80),
    "meta.vendorWhatsappMetaSubcode": sanitize(metaError.subcode, 80),
    "meta.vendorWhatsappMetaTraceId": sanitize(metaError.fbtraceId, 160),
  };
}

async function sendYnotMetaEnquiryNotification(payload, dependencies = {}) {
  const EnquiryModel = dependencies.EnquiryModel || Enquiry;
  const sendMessage = dependencies.sendMetaTemplateMessage || sendMetaTemplateMessage;
  const deductWallet = dependencies.deductWhatsAppForEnquiry;
  const config = dependencies.config || getYnotMetaEnquiryConfiguration(dependencies.env || process.env);
  const enquiryId = String(payload.enquiryId || "").trim();
  const vendorId = String(payload.vendorId || "").trim();
  const operationId = buildEnquiryOperationId(enquiryId);
  const recipient = normalizeWhatsappRecipientPhone(payload.recipientPhoneNumber, {
    defaultCountry: "IN",
  });
  if (!enquiryId || !vendorId) {
    throw makeConfigurationError(
      "YNOT Meta enquiry delivery identity is incomplete",
      "ynot_meta_enquiry_identity_invalid"
    );
  }
  if (!recipient.valid) {
    throw makeConfigurationError(
      "Vendor WhatsApp number is invalid",
      "ynot_meta_enquiry_recipient_invalid"
    );
  }

  const attemptedAt = new Date();
  const claimed = await resolveLean(EnquiryModel.findOneAndUpdate(
    {
      _id: enquiryId,
      vendorId,
      $or: [
        { "meta.vendorWhatsappOperationId": { $exists: false } },
        { "meta.vendorWhatsappOperationId": "" },
      ],
    },
    {
      $set: {
        "meta.vendorWhatsappProvider": "ynot_meta",
        "meta.vendorWhatsappOperationId": operationId,
        "meta.vendorWhatsappSenderPhoneNumberId": config.ynotPhoneNumberId,
        "meta.vendorWhatsappTemplate": config.ynotEnquiryTemplateName,
        "meta.vendorWhatsappTemplateLanguage": config.ynotEnquiryTemplateLanguage,
        "meta.vendorWhatsappRecipient": recipient.value,
        "meta.vendorWhatsappStatus": "pending",
        "meta.vendorWhatsappDeliveryStatus": "SUBMITTING",
        "meta.vendorWhatsappAttemptedAt": attemptedAt,
        "meta.vendorWhatsappLastStatusAt": attemptedAt,
        "meta.vendorWhatsappOutcomeUnknown": false,
        "meta.vendorWhatsappErrorCode": "",
        "meta.vendorWhatsappError": "",
      },
    },
    { new: true }
  ));
  if (!claimed) {
    const existing = await resolveLean(EnquiryModel.findOne({ _id: enquiryId, vendorId }));
    const existingStatus = existing?.meta?.vendorWhatsappDeliveryStatus || "";
    const accepted = ["ACCEPTED", "SENT", "DELIVERED", "READ"].includes(existingStatus);
    let walletCharged = Boolean(existing?.meta?.vendorWhatsappWalletDeductedAt);
    if (accepted && !walletCharged && typeof deductWallet === "function") {
      try {
        await deductWallet({ vendorId, enquiryId, operationId });
        walletCharged = true;
      } catch (walletError) {
        await EnquiryModel.updateOne(
          { _id: enquiryId, vendorId, "meta.vendorWhatsappOperationId": operationId },
          {
            $set: {
              "meta.vendorWhatsappWalletError": sanitize(
                walletError?.code || walletError?.message || "wallet_deduction_failed",
                160
              ),
            },
          }
        ).catch(() => {});
      }
    }
    return {
      provider: "ynot_meta",
      status: accepted ? "accepted" : "skipped",
      reason: "enquiry_notification_already_claimed",
      duplicate: true,
      operationId,
      existingStatus,
      metaMessageId: existing?.meta?.vendorWhatsappMessageId || "",
      walletCharged,
    };
  }

  try {
    const response = await sendMessage({
      phoneNumberId: config.ynotPhoneNumberId,
      accessToken: config.systemUserAccessToken,
      recipientPhoneNumber: recipient.value,
      templateName: config.ynotEnquiryTemplateName,
      languageCode: config.ynotEnquiryTemplateLanguage,
      bodyParameters: [],
    });
    const metaMessageId = String(response?.messages?.[0]?.id || "").trim();
    if (!metaMessageId) {
      const error = new Error("Meta did not return a message identifier");
      error.code = "ynot_meta_enquiry_message_id_missing";
      error.metaRequestAttempted = true;
      error.metaOutcomeUnknown = true;
      throw error;
    }

    const acceptedAt = new Date();
    try {
      const accepted = await EnquiryModel.updateOne(
        {
          _id: enquiryId,
          vendorId,
          "meta.vendorWhatsappOperationId": operationId,
          "meta.vendorWhatsappDeliveryStatus": "SUBMITTING",
        },
        {
          $set: {
            "meta.vendorWhatsappStatus": "sent",
            "meta.vendorWhatsappDeliveryStatus": "ACCEPTED",
            "meta.vendorWhatsappMessageId": metaMessageId,
            "meta.vendorWhatsappAcceptedAt": acceptedAt,
            "meta.vendorWhatsappSentAt": acceptedAt,
            "meta.vendorWhatsappLastStatusAt": acceptedAt,
            "meta.vendorWhatsappOutcomeUnknown": false,
            "meta.vendorWhatsappErrorCode": "",
            "meta.vendorWhatsappError": "",
          },
        }
      );
      if (accepted?.matchedCount !== 1) {
        const error = new Error("Meta enquiry acceptance could not be persisted");
        error.code = "ynot_meta_enquiry_acceptance_persist_failed";
        throw error;
      }
    } catch (persistError) {
      persistError.code = persistError.code || "ynot_meta_enquiry_acceptance_persist_failed";
      persistError.metaRequestAttempted = true;
      persistError.metaOutcomeUnknown = true;
      persistError.metaAccepted = true;
      persistError.metaMessageId = metaMessageId;
      throw persistError;
    }

    let walletCharged = false;
    if (typeof deductWallet === "function") {
      try {
        await deductWallet({ vendorId, enquiryId, operationId });
        walletCharged = true;
      } catch (walletError) {
        await EnquiryModel.updateOne(
          { _id: enquiryId, vendorId, "meta.vendorWhatsappOperationId": operationId },
          {
            $set: {
              "meta.vendorWhatsappWalletError": sanitize(
                walletError?.code || walletError?.message || "wallet_deduction_failed",
                160
              ),
            },
          }
        ).catch(() => {});
      }
    }

    return {
      provider: "ynot_meta",
      status: "accepted",
      operationId,
      metaMessageId,
      walletCharged,
    };
  } catch (error) {
    const unknown = error?.metaOutcomeUnknown === true;
    const deliveryStatus = unknown ? "UNKNOWN" : "FAILED";
    const failureFields = buildFailureFields(error, deliveryStatus);
    if (error?.metaMessageId) {
      failureFields["meta.vendorWhatsappMessageId"] = sanitize(error.metaMessageId, 256);
    }
    await EnquiryModel.updateOne(
      {
        _id: enquiryId,
        vendorId,
        "meta.vendorWhatsappOperationId": operationId,
        "meta.vendorWhatsappDeliveryStatus": "SUBMITTING",
      },
      { $set: failureFields }
    ).catch(() => {});
    error.enquiryId = enquiryId;
    error.operationId = operationId;
    throw error;
  }
}

module.exports = {
  buildEnquiryOperationId,
  getYnotMetaEnquiryConfiguration,
  isYnotMetaEnquiryEnabled,
  sendYnotMetaEnquiryNotification,
};
