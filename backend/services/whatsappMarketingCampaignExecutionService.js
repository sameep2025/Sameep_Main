const crypto = require("crypto");
const mongoose = require("mongoose");
const WhatsappMarketingCampaign = require("../models/WhatsappMarketingCampaign");
const WhatsappMarketingCampaignRecipient = require("../models/WhatsappMarketingCampaignRecipient");
const WhatsappMarketingConsent = require("../models/WhatsappMarketingConsent");
const WhatsappMarketingTemplate = require("../models/WhatsappMarketingTemplate");
const { sendMetaTemplateMessage } = require("./metaWhatsAppService");
const {
  WhatsappMarketingCampaignError,
  buildCampaignTemplateSnapshot,
  getApprovedMarketingTemplate,
  resolveCampaignRecipients,
} = require("./whatsappMarketingCampaignService");
const { loadVendorMetaConnection } = require("../controllers/vendorWhatsappMarketingController");

const ACTIVE_CAMPAIGN_STATUSES = ["QUEUED", "RUNNING"];
const TERMINAL_RECIPIENT_STATUSES = ["ACCEPTED", "SENT", "DELIVERED", "READ", "FAILED", "CANCELLED"];
const SAFE_RETRY_HTTP_STATUSES = new Set([429, 500, 502, 503, 504]);

function sanitizeFailureValue(value, maxLength) {
  return String(value || "").replace(/[\r\n\t\0]/g, " ").trim().slice(0, maxLength);
}

function getCampaignSelection(campaign) {
  return {
    mode: campaign.selection?.mode,
    segment: campaign.sourceSegment?.segment,
    filters: campaign.sourceSegment?.filters || {},
    selectedCustomerIds: campaign.selection?.selectedCustomerIds || [],
    excludedCustomerIds: campaign.selection?.excludedCustomerIds || [],
  };
}

function buildCampaignSendPayload(campaign, recipient) {
  const snapshot = campaign?.templateSnapshot || {};
  const personalization = recipient?.personalization || {};
  const bodyParameters = (snapshot.variableOrder || []).map((variable) => {
    const value = String(personalization[variable] || "").trim();
    if (!value) {
      throw new WhatsappMarketingCampaignError(
        `Recipient personalization is missing ${String(variable).replaceAll("_", " ")}`,
        "campaign_personalization_missing"
      );
    }
    return value;
  });
  let headerParameter = null;
  if (["IMAGE", "DOCUMENT"].includes(snapshot.headerType)) {
    if (!snapshot.primaryMedia?.url) {
      throw new WhatsappMarketingCampaignError(
        "The approved campaign media is unavailable",
        "campaign_media_unavailable",
        409
      );
    }
    headerParameter = {
      type: snapshot.headerType,
      link: snapshot.primaryMedia.url,
      ...(snapshot.headerType === "DOCUMENT"
        ? { filename: snapshot.primaryMedia.originalName || "offer.pdf" }
        : {}),
    };
  }
  return { bodyParameters, headerParameter };
}

function classifyCampaignSendFailure(error, attemptCount, maxAttempts) {
  const status = Number(error?.metaError?.status || 0);
  const safeToRetry = SAFE_RETRY_HTTP_STATUSES.has(status) && attemptCount < maxAttempts;
  const ambiguous = !status;
  return {
    retry: safeToRetry,
    ambiguous,
    code: sanitizeFailureValue(
      ambiguous
        ? "META_REQUEST_OUTCOME_UNKNOWN"
        : error?.metaError?.code || error?.code || "META_REJECTED",
      80
    ),
    message: sanitizeFailureValue(
      ambiguous
        ? "Meta request outcome is unknown; automatic retry was blocked"
        : error?.metaError?.message || error?.message || "Meta rejected the campaign message",
      240
    ),
  };
}

async function ensureCampaignRecipientRecords(campaign, dependencies = {}) {
  const RecipientModel = dependencies.RecipientModel || WhatsappMarketingCampaignRecipient;
  const eligible = (campaign.recipients || []).filter((recipient) => recipient.eligible === true);
  if (!campaign.execution?.runId) {
    throw new WhatsappMarketingCampaignError("Campaign execution is not initialized", "campaign_run_missing", 409);
  }
  if (eligible.length) {
    try {
      await RecipientModel.bulkWrite(
        eligible.map((recipient) => ({
        updateOne: {
          filter: { campaignId: campaign._id, customerId: recipient.customerId },
          update: {
            $setOnInsert: {
              vendorId: campaign.vendorId,
              campaignId: campaign._id,
              runId: campaign.execution.runId,
              customerId: recipient.customerId,
              normalizedPhone: recipient.normalizedPhone,
              displayName: recipient.displayName || "",
              personalization: recipient.personalization || {},
              status: "QUEUED",
              attemptCount: 0,
              nextAttemptAt: new Date(),
            },
          },
          upsert: true,
        },
        })),
        { ordered: false }
      );
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }
  const preparedAt = campaign.execution.preparedAt || new Date();
  await (dependencies.CampaignModel || WhatsappMarketingCampaign).updateOne(
    {
      _id: campaign._id,
      "execution.runId": campaign.execution.runId,
      "execution.preparedAt": null,
    },
    {
      $set: {
        "execution.preparedAt": preparedAt,
        deliveryCounts: {
          total: eligible.length,
          queued: eligible.length,
          sent: 0,
          delivered: 0,
          read: 0,
          failed: 0,
          cancelled: 0,
        },
      },
    }
  );
  return { count: eligible.length, preparedAt };
}

async function queueCampaignExecution({ vendorId, campaignId, confirmed, dependencies = {} }) {
  if (confirmed !== true) {
    throw new WhatsappMarketingCampaignError(
      "Confirm the eligible recipient count before running this campaign",
      "campaign_run_confirmation_required"
    );
  }
  const CampaignModel = dependencies.CampaignModel || WhatsappMarketingCampaign;
  const campaign = await CampaignModel.findOne({ _id: campaignId, vendorId, status: "DRAFT" }).lean();
  if (!campaign) {
    throw new WhatsappMarketingCampaignError(
      "Campaign is not available to run",
      "campaign_not_runnable",
      409
    );
  }
  const getTemplate = dependencies.getApprovedMarketingTemplate || getApprovedMarketingTemplate;
  const template = await getTemplate(vendorId, campaign.templateId);
  const resolveRecipients = dependencies.resolveCampaignRecipients || resolveCampaignRecipients;
  const recipientResult = await resolveRecipients({
    vendorId,
    selection: getCampaignSelection(campaign),
    template,
    offerDetails: campaign.offerDetails,
  });
  const eligibleRecipients = recipientResult.recipients.filter((recipient) => recipient.eligible);
  if (!eligibleRecipients.length) {
    throw new WhatsappMarketingCampaignError(
      "No eligible opted-in recipients are available for this campaign",
      "campaign_has_no_eligible_recipients",
      409
    );
  }
  const loadConnection = dependencies.loadVendorMetaConnection || loadVendorMetaConnection;
  const connection = await loadConnection(vendorId);
  if (!connection.phoneNumberId) {
    throw new WhatsappMarketingCampaignError(
      "The connected WhatsApp sender number is unavailable",
      "meta_phone_number_not_connected",
      409
    );
  }
  const now = new Date();
  const runId = crypto.randomUUID();
  const templateSnapshot = buildCampaignTemplateSnapshot(template);
  const queued = await CampaignModel.findOneAndUpdate(
    { _id: campaignId, vendorId, status: "DRAFT" },
    {
      $set: {
        status: "QUEUED",
        recipients: recipientResult.recipients,
        counts: recipientResult.counts,
        templateId: template._id,
        templateSnapshot,
        wabaSnapshot: { wabaId: connection.wabaId, verifiedAt: now },
        execution: {
          runId,
          phoneNumberId: connection.phoneNumberId,
          queuedAt: now,
          preparedAt: null,
          startedAt: null,
          completedAt: null,
          cancelledAt: null,
          failureCode: "",
          failureMessage: "",
        },
        deliveryCounts: {
          total: eligibleRecipients.length,
          queued: eligibleRecipients.length,
          sent: 0,
          delivered: 0,
          read: 0,
          failed: 0,
          cancelled: 0,
        },
      },
    },
    { new: true, runValidators: true }
  );
  if (!queued) {
    throw new WhatsappMarketingCampaignError(
      "Campaign execution has already started",
      "campaign_run_conflict",
      409
    );
  }
  await ensureCampaignRecipientRecords(queued, { ...dependencies, CampaignModel });
  queued.execution.preparedAt = now;
  return queued;
}

async function getDeliveryCounts(campaignId, dependencies = {}) {
  const RecipientModel = dependencies.RecipientModel || WhatsappMarketingCampaignRecipient;
  const normalizedCampaignId = mongoose.Types.ObjectId.isValid(String(campaignId || ""))
    ? new mongoose.Types.ObjectId(String(campaignId))
    : campaignId;
  const rows = await RecipientModel.aggregate([
    { $match: { campaignId: normalizedCampaignId } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const byStatus = new Map(rows.map((row) => [row._id, row.count]));
  const count = (...statuses) => statuses.reduce((sum, status) => sum + (byStatus.get(status) || 0), 0);
  return {
    total: count("QUEUED", "PROCESSING", ...TERMINAL_RECIPIENT_STATUSES),
    queued: count("QUEUED", "PROCESSING"),
    sent: count("ACCEPTED", "SENT", "DELIVERED", "READ"),
    delivered: count("DELIVERED", "READ"),
    read: count("READ"),
    failed: count("FAILED"),
    cancelled: count("CANCELLED"),
  };
}

async function refreshCampaignDeliverySummary(campaignId, dependencies = {}) {
  const CampaignModel = dependencies.CampaignModel || WhatsappMarketingCampaign;
  const counts = await getDeliveryCounts(campaignId, dependencies);
  const campaign = await CampaignModel.findById(campaignId).select("status execution").lean();
  if (!campaign) return null;
  let status = campaign.status;
  const update = { deliveryCounts: counts };
  const executionFinished = counts.total > 0 && counts.queued === 0;
  if (status !== "CANCELLED" && executionFinished) {
    status = counts.failed > 0
      ? counts.sent > 0 ? "PARTIALLY_FAILED" : "FAILED"
      : counts.cancelled > 0
        ? counts.sent > 0 ? "PARTIALLY_FAILED" : "CANCELLED"
        : "COMPLETED";
    update.status = status;
    if (ACTIVE_CAMPAIGN_STATUSES.includes(campaign.status)) {
      update["execution.completedAt"] = new Date();
    }
  }
  await CampaignModel.updateOne({ _id: campaignId }, { $set: update });
  return { status, deliveryCounts: counts };
}

async function cancelCampaignExecution({ vendorId, campaignId, dependencies = {} }) {
  const CampaignModel = dependencies.CampaignModel || WhatsappMarketingCampaign;
  const RecipientModel = dependencies.RecipientModel || WhatsappMarketingCampaignRecipient;
  const now = new Date();
  const campaign = await CampaignModel.findOneAndUpdate(
    { _id: campaignId, vendorId, status: { $in: ACTIVE_CAMPAIGN_STATUSES } },
    { $set: { status: "CANCELLED", "execution.cancelledAt": now, "execution.completedAt": now } },
    { new: true }
  );
  if (!campaign) {
    throw new WhatsappMarketingCampaignError(
      "Campaign is not currently running",
      "campaign_not_cancellable",
      409
    );
  }
  await RecipientModel.updateMany(
    { campaignId: campaign._id, status: "QUEUED" },
    { $set: { status: "CANCELLED", lastStatusAt: now, failureCode: "CAMPAIGN_CANCELLED" } }
  );
  await refreshCampaignDeliverySummary(campaign._id, dependencies);
  return CampaignModel.findById(campaign._id);
}

async function recoverExpiredRecipientClaims({ now = new Date(), dependencies = {} } = {}) {
  const RecipientModel = dependencies.RecipientModel || WhatsappMarketingCampaignRecipient;
  return RecipientModel.updateMany(
    { status: "PROCESSING", leaseExpiresAt: { $lte: now } },
    {
      $set: {
        status: "FAILED",
        ambiguousFailure: true,
        failureCode: "WORKER_INTERRUPTED_OUTCOME_UNKNOWN",
        failureMessage: "Worker stopped during a Meta request; automatic retry was blocked",
        lastStatusAt: now,
      },
      $unset: { leaseToken: "", leaseExpiresAt: "" },
    }
  );
}

async function claimCampaignRecipient({ now = new Date(), leaseMs = 120000, dependencies = {} } = {}) {
  const RecipientModel = dependencies.RecipientModel || WhatsappMarketingCampaignRecipient;
  const leaseToken = crypto.randomUUID();
  return RecipientModel.findOneAndUpdate(
    { status: "QUEUED", nextAttemptAt: { $lte: now } },
    {
      $set: {
        status: "PROCESSING",
        leaseToken,
        leaseExpiresAt: new Date(now.getTime() + leaseMs),
        lastStatusAt: now,
      },
      $inc: { attemptCount: 1 },
    },
    { new: true, sort: { nextAttemptAt: 1, createdAt: 1 } }
  ).select("+leaseToken");
}

async function processClaimedCampaignRecipient(recipient, options = {}) {
  const dependencies = options.dependencies || {};
  const CampaignModel = dependencies.CampaignModel || WhatsappMarketingCampaign;
  const RecipientModel = dependencies.RecipientModel || WhatsappMarketingCampaignRecipient;
  const ConsentModel = dependencies.ConsentModel || WhatsappMarketingConsent;
  const TemplateModel = dependencies.TemplateModel || WhatsappMarketingTemplate;
  const sendMessage = dependencies.sendMetaTemplateMessage || sendMetaTemplateMessage;
  const loadConnection = dependencies.loadVendorMetaConnection || loadVendorMetaConnection;
  const maxAttempts = Math.max(1, Number(options.maxAttempts || 3));
  const campaign = await CampaignModel.findOne({
    _id: recipient.campaignId,
    vendorId: recipient.vendorId,
    status: { $in: ACTIVE_CAMPAIGN_STATUSES },
    "execution.runId": recipient.runId,
  }).lean();
  if (!campaign) {
    await RecipientModel.updateOne(
      { _id: recipient._id, status: "PROCESSING", leaseToken: recipient.leaseToken },
      { $set: { status: "CANCELLED", failureCode: "CAMPAIGN_NOT_ACTIVE", lastStatusAt: new Date() } }
    );
    return { status: "CANCELLED" };
  }
  const consent = await ConsentModel.findOne({
    vendorId: recipient.vendorId,
    customerId: recipient.customerId,
  }).lean();
  if (consent?.status !== "OPTED_IN") {
    const failureCode = consent?.status === "OPTED_OUT" ? "MARKETING_OPT_OUT" : "MARKETING_CONSENT_REQUIRED";
    await RecipientModel.updateOne(
      { _id: recipient._id, status: "PROCESSING", leaseToken: recipient.leaseToken },
      {
        $set: { status: "CANCELLED", failureCode, lastStatusAt: new Date() },
        $unset: { leaseToken: "", leaseExpiresAt: "" },
      }
    );
    return { status: "CANCELLED", code: failureCode };
  }
  const template = await TemplateModel.findOne({
    _id: campaign.templateId,
    vendorId: recipient.vendorId,
    status: "APPROVED",
    "metaTemplate.status": "APPROVED",
    "metaTemplate.templateId": campaign.templateSnapshot.metaTemplateId,
  }).lean();
  if (!template) {
    await RecipientModel.updateOne(
      { _id: recipient._id, status: "PROCESSING", leaseToken: recipient.leaseToken },
      {
        $set: {
          status: "FAILED",
          failureCode: "CAMPAIGN_TEMPLATE_NOT_APPROVED",
          failureMessage: "The approved template is no longer available",
          lastStatusAt: new Date(),
        },
        $unset: { leaseToken: "", leaseExpiresAt: "" },
      }
    );
    return { status: "FAILED" };
  }
  try {
    const connection = await loadConnection(String(recipient.vendorId));
    if (String(connection.phoneNumberId) !== String(campaign.execution.phoneNumberId)) {
      throw new WhatsappMarketingCampaignError(
        "The connected WhatsApp sender changed after the campaign was queued",
        "campaign_sender_changed",
        409
      );
    }
    const payload = buildCampaignSendPayload(campaign, recipient);
    const result = await sendMessage({
      phoneNumberId: connection.phoneNumberId,
      accessToken: connection.accessToken,
      recipientPhoneNumber: recipient.normalizedPhone,
      templateName: campaign.templateSnapshot.metaTemplateName,
      languageCode: campaign.templateSnapshot.language || "en",
      bodyParameters: payload.bodyParameters,
      headerParameter: payload.headerParameter,
    });
    const metaMessageId = String(result?.messages?.[0]?.id || "").trim();
    if (!metaMessageId) {
      const error = new Error("Meta did not return a message identifier");
      error.code = "meta_campaign_message_id_missing";
      throw error;
    }
    const now = new Date();
    await RecipientModel.updateOne(
      { _id: recipient._id, status: "PROCESSING", leaseToken: recipient.leaseToken },
      {
        $set: {
          status: "ACCEPTED",
          metaMessageId,
          acceptedAt: now,
          lastStatusAt: now,
          failureCode: "",
          failureMessage: "",
          ambiguousFailure: false,
        },
        $unset: { leaseToken: "", leaseExpiresAt: "" },
      }
    );
    return { status: "ACCEPTED", metaMessageId };
  } catch (error) {
    const failure = classifyCampaignSendFailure(error, recipient.attemptCount, maxAttempts);
    const now = new Date();
    if (failure.retry) {
      const retryDelayMs = Math.min(60000, 1000 * (2 ** Math.max(recipient.attemptCount - 1, 0)));
      await RecipientModel.updateOne(
        { _id: recipient._id, status: "PROCESSING", leaseToken: recipient.leaseToken },
        {
          $set: {
            status: "QUEUED",
            nextAttemptAt: new Date(now.getTime() + retryDelayMs),
            failureCode: failure.code,
            failureMessage: failure.message,
            lastStatusAt: now,
          },
          $unset: { leaseToken: "", leaseExpiresAt: "" },
        }
      );
      return { status: "QUEUED", retry: true };
    }
    await RecipientModel.updateOne(
      { _id: recipient._id, status: "PROCESSING", leaseToken: recipient.leaseToken },
      {
        $set: {
          status: "FAILED",
          failureCode: failure.code,
          failureMessage: failure.message,
          ambiguousFailure: failure.ambiguous,
          lastStatusAt: now,
        },
        $unset: { leaseToken: "", leaseExpiresAt: "" },
      }
    );
    return { status: "FAILED", ambiguous: failure.ambiguous };
  }
}

module.exports = {
  ACTIVE_CAMPAIGN_STATUSES,
  buildCampaignSendPayload,
  cancelCampaignExecution,
  claimCampaignRecipient,
  classifyCampaignSendFailure,
  ensureCampaignRecipientRecords,
  getDeliveryCounts,
  processClaimedCampaignRecipient,
  queueCampaignExecution,
  recoverExpiredRecipientClaims,
  refreshCampaignDeliverySummary,
};
