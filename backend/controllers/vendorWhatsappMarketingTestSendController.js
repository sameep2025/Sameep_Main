const WhatsappMarketingTestSend = require("../models/WhatsappMarketingTestSend");
const { sendMetaTemplateMessage } = require("../services/metaWhatsAppService");
const {
  WhatsappMarketingCampaignError,
  getApprovedMarketingTemplate,
  loadVendorDisplay,
} = require("../services/whatsappMarketingCampaignService");
const {
  assertAuthorizedMarketingTestRecipient,
  buildMarketingTestSendPayload,
  hashMarketingTestRecipient,
  maskMarketingTestRecipient,
} = require("../services/whatsappMarketingTestSendService");
const { loadVendorMetaConnection } = require("./vendorWhatsappMarketingController");

function getVendorId(req) {
  return String(req.vendorWriteAuth?.vendorId || req.params?.vendorId || "").trim();
}

function serializeTestSend(record) {
  const source = typeof record?.toObject === "function" ? record.toObject() : record;
  return source ? {
    id: String(source._id),
    templateId: String(source.templateId),
    metaTemplateName: source.metaTemplateName,
    recipientMasked: source.recipientMasked,
    personalization: source.personalization,
    headerType: source.headerType,
    status: source.status,
    metaMessageId: source.metaMessageId || "",
    failureCode: source.failureCode || "",
    failureMessage: source.failureMessage || "",
    acceptedAt: source.acceptedAt || null,
    lastStatusAt: source.lastStatusAt || null,
    createdAt: source.createdAt || null,
  } : null;
}

function sendError(res, error) {
  if (error instanceof WhatsappMarketingCampaignError || error?.statusCode) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message,
      code: error.code || "marketing_test_send_error",
    });
  }
  console.error("WhatsApp Marketing test send failed", {
    code: error?.code || "marketing_test_send_failed",
    metaCode: error?.metaError?.code || "",
  });
  return res.status(502).json({
    success: false,
    message: "Meta did not accept the WhatsApp Marketing test message",
    code: error?.code || "marketing_test_send_failed",
  });
}

async function sendMarketingTestMessage(req, res) {
  let testSend = null;
  try {
    const vendorId = getVendorId(req);
    if (req.body?.confirmedAuthorized !== true) {
      throw new WhatsappMarketingCampaignError(
        "Confirm that this number is authorized to receive the test message",
        "marketing_test_confirmation_required"
      );
    }
    const recipient = assertAuthorizedMarketingTestRecipient({
      vendorId,
      phone: req.body?.recipientPhoneNumber,
    });
    const template = await getApprovedMarketingTemplate(vendorId, req.body?.templateId);
    const [connection, vendor] = await Promise.all([
      loadVendorMetaConnection(vendorId),
      loadVendorDisplay(vendorId),
    ]);
    if (!connection.phoneNumberId) {
      throw new WhatsappMarketingCampaignError(
        "The connected WhatsApp sender number is unavailable",
        "meta_phone_number_not_connected",
        409
      );
    }
    const prepared = buildMarketingTestSendPayload({
      template,
      customerName: req.body?.customerName,
      offerDetails: req.body?.offerDetails,
      salonName: vendor.businessName,
    });
    testSend = await WhatsappMarketingTestSend.create({
      vendorId,
      templateId: template._id,
      metaTemplateId: template.metaTemplate.templateId,
      metaTemplateName: template.metaTemplate.templateName,
      recipientHash: hashMarketingTestRecipient(recipient),
      recipientMasked: maskMarketingTestRecipient(recipient),
      personalization: prepared.personalization,
      headerType: prepared.snapshot.headerType,
      status: "SUBMITTING",
    });
    const result = await sendMetaTemplateMessage({
      phoneNumberId: connection.phoneNumberId,
      accessToken: connection.accessToken,
      recipientPhoneNumber: recipient,
      templateName: template.metaTemplate.templateName,
      languageCode: template.metaTemplate.language || prepared.snapshot.language || "en",
      bodyParameters: prepared.bodyParameters,
      headerParameter: prepared.headerParameter,
    });
    const metaMessageId = String(result?.messages?.[0]?.id || "").trim();
    if (!metaMessageId) {
      const error = new Error("Meta did not return a message identifier");
      error.code = "meta_test_message_id_missing";
      throw error;
    }
    const now = new Date();
    testSend.status = "ACCEPTED";
    testSend.metaMessageId = metaMessageId;
    testSend.acceptedAt = now;
    testSend.lastStatusAt = now;
    await testSend.save();
    return res.status(202).json({
      success: true,
      message: "Test message accepted by Meta",
      data: { testSend: serializeTestSend(testSend), preview: prepared.preview },
    });
  } catch (error) {
    if (testSend?._id) {
      testSend.status = "FAILED";
      testSend.failureCode = String(error?.metaError?.code || error?.code || "META_REJECTED").slice(0, 80);
      testSend.failureMessage = String(error?.metaError?.message || error?.message || "Meta request failed").slice(0, 240);
      testSend.lastStatusAt = new Date();
      await testSend.save().catch(() => {});
    }
    return sendError(res, error);
  }
}

async function listMarketingTestSends(req, res) {
  try {
    const records = await WhatsappMarketingTestSend.find({ vendorId: getVendorId(req) })
      .sort({ createdAt: -1, _id: -1 })
      .limit(20)
      .lean();
    return res.json({
      success: true,
      data: { testSends: records.map(serializeTestSend) },
    });
  } catch (error) {
    return sendError(res, error);
  }
}

module.exports = {
  listMarketingTestSends,
  sendMarketingTestMessage,
  serializeTestSend,
};

