const Enquiry = require("../models/Enquiry");
const DummyVendor = require("../models/DummyVendor");
const { sendVendorEnquiryWhatsapp, normalizeWhatsAppMobile } = require("../utils/whatsappService");
const { getWhatsAppEnquiryConfig } = require("../utils/whatsappEnquiryConfig");
const {
  deductWhatsApp,
  deductWhatsAppForEnquiry,
  hasAvailableWhatsAppBalance,
} = require("./vendorWalletService");
const {
  buildEnquiryOperationId,
  isYnotMetaEnquiryEnabled,
  sendYnotMetaEnquiryNotification,
} = require("./ynotMetaEnquirySender");

async function sendVendorWhatsappForEnquiry(doc, vendorId, dependencies = {}) {
  const VendorModel = dependencies.VendorModel || DummyVendor;
  const EnquiryModel = dependencies.EnquiryModel || Enquiry;
  const sendMsg91 = dependencies.sendVendorEnquiryWhatsapp || sendVendorEnquiryWhatsapp;
  const sendMeta = dependencies.sendYnotMetaEnquiryNotification || sendYnotMetaEnquiryNotification;
  const deductMsg91 = dependencies.deductWhatsApp || deductWhatsApp;
  const hasWhatsAppBalance =
    dependencies.hasAvailableWhatsAppBalance || hasAvailableWhatsAppBalance;
  const getEnquiryConfig = dependencies.getWhatsAppEnquiryConfig || getWhatsAppEnquiryConfig;
  const metaEnabled = (dependencies.isYnotMetaEnquiryEnabled || isYnotMetaEnquiryEnabled)(
    dependencies.env || process.env
  );
  try {
    const vendor = await VendorModel.findById(vendorId).lean();
    const vendorMobile = vendor?.phone ? String(vendor.phone).trim() : "";
    const normalizedVendorMobile = normalizeWhatsAppMobile(vendorMobile);

    if (!normalizedVendorMobile) {
      await EnquiryModel.findByIdAndUpdate(doc._id, {
        $set: {
          "meta.vendorWhatsappStatus": "skipped",
          "meta.vendorWhatsappError": "Vendor phone not found",
        },
      });
      return;
    }

    if (metaEnabled) {
      const enquiryConfig = await getEnquiryConfig();
      if (!enquiryConfig.enabled) {
        await EnquiryModel.findByIdAndUpdate(doc._id, {
          $set: {
            "meta.vendorWhatsappProvider": "ynot_meta",
            "meta.vendorWhatsappTemplate":
              String((dependencies.env || process.env).YNOT_META_ENQUIRY_TEMPLATE_NAME || "").trim() ||
              "vendor_enquiry",
            "meta.vendorWhatsappStatus": "skipped",
            "meta.vendorWhatsappError": "disabled",
          },
        });
        return { provider: "ynot_meta", status: "skipped", reason: "disabled" };
      }
      if (!(await hasWhatsAppBalance(vendorId))) {
        await EnquiryModel.findByIdAndUpdate(doc._id, {
          $set: {
            "meta.vendorWhatsappProvider": "ynot_meta",
            "meta.vendorWhatsappTemplate":
              String((dependencies.env || process.env).YNOT_META_ENQUIRY_TEMPLATE_NAME || "").trim() ||
              "vendor_enquiry",
            "meta.vendorWhatsappStatus": "skipped",
            "meta.vendorWhatsappError": "Insufficient WhatsApp balance",
          },
        });
        return {
          provider: "ynot_meta",
          status: "skipped",
          reason: "insufficient_whatsapp_balance",
        };
      }
      return await sendMeta({
        enquiryId: doc._id,
        vendorId,
        recipientPhoneNumber: normalizedVendorMobile,
      }, {
        env: dependencies.env || process.env,
        deductWhatsAppForEnquiry: (args) => deductWhatsAppForEnquiry({
          ...args,
          dependencies: dependencies.walletDependencies || {},
        }),
      });
    }

    const response = await sendMsg91({
      mobile: normalizedVendorMobile,
    });

    if (response?.skipped) {
      await EnquiryModel.findByIdAndUpdate(doc._id, {
        $set: {
          "meta.vendorWhatsappTemplate": "vendor_enquiry",
          "meta.vendorWhatsappStatus": "skipped",
          "meta.vendorWhatsappError": response.reason || "Skipped",
        },
      });
      return;
    }

    await deductMsg91(String(vendorId), `enquiry:${doc._id}`);

    const responseId =
      response?.data?.message_id ||
      response?.message_id ||
      response?.id ||
      "";

    await EnquiryModel.findByIdAndUpdate(doc._id, {
      $set: {
        "meta.vendorWhatsappTemplate": "vendor_enquiry",
        "meta.vendorWhatsappSentAt": new Date(),
        "meta.vendorWhatsappStatus": "sent",
        "meta.vendorWhatsappMessageId": responseId ? String(responseId) : "",
        "meta.vendorWhatsappRecipient": normalizedVendorMobile,
        "meta.vendorWhatsappError": "",
      },
    });
  } catch (sendError) {
    if (metaEnabled) {
      console.error("YNOT Meta enquiry notification failed", {
        code: String(sendError?.code || "ynot_meta_enquiry_send_failed").slice(0, 80),
      });
      if (sendError?.operationId) return;
    } else {
      console.error("Vendor enquiry WhatsApp send failed:", sendError?.message || sendError);
    }
    const set = metaEnabled
      ? {
          "meta.vendorWhatsappProvider": "ynot_meta",
          "meta.vendorWhatsappOperationId": buildEnquiryOperationId(doc._id),
          "meta.vendorWhatsappTemplate":
            String((dependencies.env || process.env).YNOT_META_ENQUIRY_TEMPLATE_NAME || "").trim() ||
            "vendor_enquiry",
          "meta.vendorWhatsappStatus": "failed",
          "meta.vendorWhatsappDeliveryStatus":
            sendError?.metaOutcomeUnknown === true ? "UNKNOWN" : "FAILED",
          "meta.vendorWhatsappOutcomeUnknown": sendError?.metaOutcomeUnknown === true,
          "meta.vendorWhatsappErrorCode": String(
            sendError?.code || "ynot_meta_enquiry_send_failed"
          ).slice(0, 80),
          "meta.vendorWhatsappError": sendError?.metaOutcomeUnknown === true
            ? "Meta request outcome is unknown; automatic retry was blocked"
            : "Meta enquiry notification failed",
        }
      : {
          "meta.vendorWhatsappTemplate": "vendor_enquiry",
          "meta.vendorWhatsappStatus": "failed",
          "meta.vendorWhatsappError": String(sendError?.message || sendError || "Unknown error"),
        };
    await EnquiryModel.findByIdAndUpdate(doc._id, {
      $set: {
        ...set,
      },
    }).catch(() => {});
  }
}

async function createEnquiryAndNotify(payload) {
  const doc = await Enquiry.create(payload);

  setImmediate(() => {
    sendVendorWhatsappForEnquiry(doc, payload.vendorId);
  });

  return doc;
}

module.exports = {
  createEnquiryAndNotify,
  sendVendorWhatsappForEnquiry,
};
