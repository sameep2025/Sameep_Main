const WhatsappMarketingCampaign = require("../models/WhatsappMarketingCampaign");
const WhatsappMarketingCampaignRecipient = require("../models/WhatsappMarketingCampaignRecipient");
const WhatsappMarketingTemplate = require("../models/WhatsappMarketingTemplate");
const {
  WhatsappMarketingCampaignError,
  buildCampaignTemplateSnapshot,
  getApprovedMarketingTemplate,
  loadVendorDisplay,
  renderRecipientPreview,
  resolveCampaignRecipients,
} = require("../services/whatsappMarketingCampaignService");
const {
  cancelCampaignExecution,
  queueCampaignExecution,
  refreshCampaignDeliverySummary,
} = require("../services/whatsappMarketingCampaignExecutionService");
const {
  loadVendorMetaConnection,
} = require("./vendorWhatsappMarketingController");

function getVendorId(req) {
  return String(req.vendorWriteAuth?.vendorId || req.params?.vendorId || "").trim();
}

function serializeCampaign(campaign) {
  const source = typeof campaign?.toObject === "function" ? campaign.toObject() : campaign;
  if (!source) return null;
  return {
    id: String(source._id),
    campaignName: source.campaignName,
    status: source.status,
    sourceSegment: source.sourceSegment,
    selection: {
      mode: source.selection?.mode,
      selectedCustomerIds: (source.selection?.selectedCustomerIds || []).map(String),
      excludedCustomerIds: (source.selection?.excludedCustomerIds || []).map(String),
    },
    templateId: source.templateId ? String(source.templateId) : "",
    templateSnapshot: source.templateId ? source.templateSnapshot : null,
    offerDetails: source.offerDetails || "",
    recipients: (source.recipients || []).map((recipient) => ({
      customerId: String(recipient.customerId),
      normalizedPhone: recipient.normalizedPhone || "",
      displayName: recipient.displayName || "",
      consentStatus: recipient.consentStatus || "UNKNOWN",
      eligible: Boolean(recipient.eligible),
      exclusionReasons: recipient.exclusionReasons || [],
      personalization: recipient.personalization || {},
      preview: renderRecipientPreview(source.templateSnapshot, recipient.personalization),
    })),
    counts: source.counts,
    deliveryCounts: source.deliveryCounts || {
      total: 0,
      queued: 0,
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0,
      cancelled: 0,
    },
    execution: source.execution ? {
      queuedAt: source.execution.queuedAt || null,
      startedAt: source.execution.startedAt || null,
      completedAt: source.execution.completedAt || null,
      cancelledAt: source.execution.cancelledAt || null,
      failureCode: source.execution.failureCode || "",
      failureMessage: source.execution.failureMessage || "",
    } : null,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

function sendCampaignError(res, error, fallback) {
  if (error instanceof WhatsappMarketingCampaignError || error?.statusCode) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message,
      code: error.code || "whatsapp_marketing_campaign_error",
    });
  }
  if (error?.name === "CastError") {
    return res.status(404).json({ success: false, message: "Campaign draft not found" });
  }
  console.error(fallback, { code: error?.code || "campaign_draft_error" });
  return res.status(500).json({ success: false, message: fallback });
}

async function listApprovedTemplates(req, res) {
  try {
    const vendorId = getVendorId(req);
    const [templates, vendor] = await Promise.all([
      WhatsappMarketingTemplate.find({
        vendorId,
        status: "APPROVED",
        "metaTemplate.status": "APPROVED",
      })
        .sort({ updatedAt: -1, _id: -1 })
        .select("internalName purpose submittedSnapshot metaTemplate draftVersion")
        .lean(),
      loadVendorDisplay(vendorId),
    ]);
    return res.json({
      success: true,
      data: {
        vendorDisplayName: vendor.businessName,
        templates: templates
          .filter((template) => template.submittedSnapshot && template.metaTemplate?.templateId)
          .map((template) => ({
            id: String(template._id),
            internalName: template.internalName,
            purpose: template.purpose,
            templateSnapshot: buildCampaignTemplateSnapshot(template),
          })),
      },
    });
  } catch (error) {
    return sendCampaignError(res, error, "Unable to load approved marketing templates");
  }
}

async function previewRecipients(req, res) {
  try {
    const vendorId = getVendorId(req);
    const template = req.body?.templateId
      ? await getApprovedMarketingTemplate(vendorId, req.body.templateId)
      : null;
    const result = await resolveCampaignRecipients({
      vendorId,
      selection: req.body?.selection,
      template,
      offerDetails: req.body?.offerDetails,
    });
    const snapshot = template ? buildCampaignTemplateSnapshot(template) : null;
    return res.json({
      success: true,
      data: {
        ...result,
        recipients: result.recipients.map((recipient) => ({
          ...recipient,
          preview: snapshot ? renderRecipientPreview(snapshot, recipient.personalization) : "",
        })),
      },
    });
  } catch (error) {
    return sendCampaignError(res, error, "Unable to resolve campaign recipients");
  }
}

async function buildCampaignDraftPayload(vendorId, body) {
  const campaignName = String(body?.campaignName || "").trim();
  if (!campaignName || campaignName.length > 100) {
    throw new WhatsappMarketingCampaignError(
      "Campaign name is required and cannot exceed 100 characters",
      "invalid_campaign_name"
    );
  }
  const template = body?.templateId
    ? await getApprovedMarketingTemplate(vendorId, body.templateId)
    : null;
  const recipientResult = await resolveCampaignRecipients({
    vendorId,
    selection: body?.selection,
    template,
    offerDetails: body?.offerDetails,
  });
  if (!recipientResult.recipients.length) {
    throw new WhatsappMarketingCampaignError(
      "Select at least one customer",
      "campaign_recipients_required"
    );
  }
  const connection = await loadVendorMetaConnection(vendorId);
  return {
    vendorId,
    campaignName,
    status: "DRAFT",
    sourceSegment: {
      segment: recipientResult.selection.segment,
      filters: recipientResult.selection.filters,
    },
    selection: {
      mode: recipientResult.selection.mode,
      selectedCustomerIds: recipientResult.selection.selectedCustomerIds,
      excludedCustomerIds: recipientResult.selection.excludedCustomerIds,
    },
    templateId: template?._id || null,
    templateSnapshot: template ? buildCampaignTemplateSnapshot(template) : null,
    offerDetails: String(body?.offerDetails || "").trim(),
    recipients: recipientResult.recipients,
    counts: recipientResult.counts,
    wabaSnapshot: { wabaId: connection.wabaId, verifiedAt: new Date() },
  };
}

async function createCampaignDraft(req, res) {
  try {
    const payload = await buildCampaignDraftPayload(getVendorId(req), req.body);
    const campaign = await WhatsappMarketingCampaign.create(payload);
    return res.status(201).json({
      success: true,
      message: "Marketing campaign draft saved",
      data: { campaign: serializeCampaign(campaign) },
    });
  } catch (error) {
    return sendCampaignError(res, error, "Unable to save campaign draft");
  }
}

async function updateCampaignDraft(req, res) {
  try {
    const vendorId = getVendorId(req);
    const existing = await WhatsappMarketingCampaign.findOne({
      _id: req.params.campaignId,
      vendorId,
      status: "DRAFT",
    }).lean();
    if (!existing) {
      return res.status(404).json({ success: false, message: "Campaign draft not found" });
    }
    const payload = await buildCampaignDraftPayload(vendorId, req.body);
    const campaign = await WhatsappMarketingCampaign.findOneAndUpdate(
      { _id: existing._id, vendorId, status: "DRAFT" },
      { $set: payload },
      { new: true, runValidators: true }
    );
    return res.json({
      success: true,
      message: "Marketing campaign draft updated",
      data: { campaign: serializeCampaign(campaign) },
    });
  } catch (error) {
    return sendCampaignError(res, error, "Unable to update campaign draft");
  }
}

async function listCampaignDrafts(req, res) {
  try {
    const campaigns = await WhatsappMarketingCampaign.find({ vendorId: getVendorId(req) })
      .sort({ updatedAt: -1, _id: -1 })
      .select("campaignName status sourceSegment counts deliveryCounts templateSnapshot execution updatedAt createdAt")
      .lean();
    return res.json({
      success: true,
      data: { campaigns: campaigns.map(serializeCampaign) },
    });
  } catch (error) {
    return sendCampaignError(res, error, "Unable to load campaign drafts");
  }
}

async function getCampaignDraft(req, res) {
  try {
    const campaign = await WhatsappMarketingCampaign.findOne({
      _id: req.params.campaignId,
      vendorId: getVendorId(req),
    }).lean();
    if (!campaign) {
      return res.status(404).json({ success: false, message: "Campaign draft not found" });
    }
    if (["QUEUED", "RUNNING"].includes(campaign.status)) {
      await refreshCampaignDeliverySummary(campaign._id);
      Object.assign(
        campaign,
        await WhatsappMarketingCampaign.findById(campaign._id).select("status deliveryCounts execution").lean()
      );
    }
    const failures = await WhatsappMarketingCampaignRecipient.find({
      campaignId: campaign._id,
      status: { $in: ["FAILED", "CANCELLED"] },
    })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(20)
      .select("displayName status failureCode failureMessage ambiguousFailure updatedAt")
      .lean();
    return res.json({
      success: true,
      data: {
        campaign: serializeCampaign(campaign),
        failures: failures.map((failure) => ({
          id: String(failure._id),
          displayName: failure.displayName || "",
          status: failure.status,
          failureCode: failure.failureCode || "",
          failureMessage: failure.failureMessage || "",
          ambiguousFailure: Boolean(failure.ambiguousFailure),
          updatedAt: failure.updatedAt || null,
        })),
      },
    });
  } catch (error) {
    return sendCampaignError(res, error, "Unable to load campaign draft");
  }
}

async function runCampaign(req, res) {
  try {
    const campaign = await queueCampaignExecution({
      vendorId: getVendorId(req),
      campaignId: req.params.campaignId,
      confirmed: req.body?.confirmed === true,
    });
    return res.status(202).json({
      success: true,
      message: "Campaign queued for delivery",
      data: { campaign: serializeCampaign(campaign) },
    });
  } catch (error) {
    return sendCampaignError(res, error, "Unable to run campaign");
  }
}

async function cancelCampaign(req, res) {
  try {
    const campaign = await cancelCampaignExecution({
      vendorId: getVendorId(req),
      campaignId: req.params.campaignId,
    });
    return res.json({
      success: true,
      message: "Campaign cancellation recorded",
      data: { campaign: serializeCampaign(campaign) },
    });
  } catch (error) {
    return sendCampaignError(res, error, "Unable to cancel campaign");
  }
}

module.exports = {
  buildCampaignDraftPayload,
  cancelCampaign,
  createCampaignDraft,
  getCampaignDraft,
  listApprovedTemplates,
  listCampaignDrafts,
  previewRecipients,
  runCampaign,
  serializeCampaign,
  updateCampaignDraft,
};

