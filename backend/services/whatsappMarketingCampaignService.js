const mongoose = require("mongoose");
const DummyVendor = require("../models/DummyVendor");
const Vendor = require("../models/Vendor");
const WhatsappMarketingConsent = require("../models/WhatsappMarketingConsent");
const WhatsappMarketingTemplate = require("../models/WhatsappMarketingTemplate");
const { normalizeWhatsappRecipientPhone } = require("../utils/whatsappRecipientPhone");
const {
  resolveCustomerAnalyticsSegment,
} = require("../controllers/customerAnalyticsController");

const MAX_CAMPAIGN_RECIPIENTS = 500;
const SEGMENTS = new Set(["top_spenders", "repeat", "inactive", "threshold"]);

class WhatsappMarketingCampaignError extends Error {
  constructor(message, code, statusCode = 400) {
    super(message);
    this.name = "WhatsappMarketingCampaignError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function normalizeObjectIdList(values, fieldName) {
  if (!Array.isArray(values)) return [];
  if (values.length > MAX_CAMPAIGN_RECIPIENTS) {
    throw new WhatsappMarketingCampaignError(
      `${fieldName} list exceeds the ${MAX_CAMPAIGN_RECIPIENTS}-recipient limit`,
      "campaign_recipient_limit_exceeded",
      409
    );
  }
  const result = [];
  const seen = new Set();
  for (const value of values) {
    const id = String(value || "").trim();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new WhatsappMarketingCampaignError(
        `Invalid ${fieldName}`,
        "invalid_campaign_customer_selection"
      );
    }
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

function normalizeSelectionInput(body = {}) {
  const selection = body.selection || body;
  const mode = String(selection.mode || "EXPLICIT").trim().toUpperCase();
  const segment = String(selection.segment || body.segment || "top_spenders").trim();
  if (!["EXPLICIT", "ALL_MATCHING"].includes(mode)) {
    throw new WhatsappMarketingCampaignError("Invalid campaign selection mode", "invalid_selection_mode");
  }
  if (!SEGMENTS.has(segment)) {
    throw new WhatsappMarketingCampaignError("Invalid customer segment", "invalid_campaign_segment");
  }
  const selectedCustomerIds = normalizeObjectIdList(
    selection.selectedCustomerIds,
    "selected customer"
  );
  const excludedCustomerIds = normalizeObjectIdList(
    selection.excludedCustomerIds,
    "excluded customer"
  );
  return {
    mode,
    segment,
    filters: {
      inactiveDays: Number(selection.filters?.inactiveDays || body.filters?.inactiveDays || 30),
      spendingThreshold: Number(
        selection.filters?.spendingThreshold || body.filters?.spendingThreshold || 500
      ),
    },
    selectedCustomerIds,
    excludedCustomerIds,
  };
}

async function loadVendorDisplay(vendorId, dependencies = {}) {
  const DummyVendorModel = dependencies.DummyVendorModel || DummyVendor;
  const VendorModel = dependencies.VendorModel || Vendor;
  let vendor = await DummyVendorModel.findById(vendorId).select("businessName").lean();
  if (!vendor) vendor = await VendorModel.findById(vendorId).select("businessName").lean();
  if (!vendor) {
    throw new WhatsappMarketingCampaignError("Vendor not found", "vendor_not_found", 404);
  }
  return { businessName: String(vendor.businessName || "").trim() };
}

async function resolveCampaignRecipients({
  vendorId,
  selection,
  template = null,
  offerDetails = "",
  dependencies = {},
}) {
  const normalized = normalizeSelectionInput({ selection });
  if (normalized.mode === "EXPLICIT" && !normalized.selectedCustomerIds.length) {
    return { selection: normalized, recipients: [], counts: { selected: 0, eligible: 0, ineligible: 0, excluded: 0 } };
  }
  const resolveSegment = dependencies.resolveCustomerAnalyticsSegment || resolveCustomerAnalyticsSegment;
  const queryLimit = MAX_CAMPAIGN_RECIPIENTS + 1;
  const rows = await resolveSegment({
    vendorId,
    segment: normalized.segment,
    days: normalized.filters.inactiveDays,
    threshold: normalized.filters.spendingThreshold,
    customerIds: normalized.mode === "EXPLICIT" ? normalized.selectedCustomerIds : [],
    limit: queryLimit,
  });
  if (rows.length > MAX_CAMPAIGN_RECIPIENTS) {
    throw new WhatsappMarketingCampaignError(
      `This segment exceeds the ${MAX_CAMPAIGN_RECIPIENTS}-recipient draft limit`,
      "campaign_recipient_limit_exceeded",
      409
    );
  }

  const excluded = new Set(normalized.excludedCustomerIds);
  const selectedRows = rows.filter((row) => !excluded.has(String(row.customerId)));
  const ConsentModel = dependencies.WhatsappMarketingConsentModel || WhatsappMarketingConsent;
  const consents = selectedRows.length
    ? await ConsentModel.find({
        vendorId,
        customerId: { $in: selectedRows.map((row) => row.customerId) },
      }).lean()
    : [];
  const consentMap = new Map(consents.map((entry) => [String(entry.customerId), entry]));
  const vendor = await loadVendorDisplay(vendorId, dependencies);
  const variableOrder = Array.isArray(template?.submittedSnapshot?.variableOrder)
    ? template.submittedSnapshot.variableOrder
    : [];
  const seenPhones = new Set();
  const recipients = selectedRows.map((row) => {
    const phone = normalizeWhatsappRecipientPhone(row.phone);
    const consent = consentMap.get(String(row.customerId));
    const consentStatus = String(consent?.status || "UNKNOWN");
    const exclusionReasons = [];
    if (!phone.valid) exclusionReasons.push("INVALID_PHONE");
    if (phone.valid && seenPhones.has(phone.value)) exclusionReasons.push("DUPLICATE_PHONE");
    if (phone.valid) seenPhones.add(phone.value);
    if (consentStatus === "OPTED_OUT") exclusionReasons.push("MARKETING_OPT_OUT");
    else if (consentStatus !== "OPTED_IN") exclusionReasons.push("MARKETING_CONSENT_REQUIRED");
    const personalization = {
      customer_name: String(row.name || "").trim(),
      salon_name: vendor.businessName,
      offer_details: String(offerDetails || "").trim(),
    };
    for (const variable of new Set(variableOrder)) {
      if (!personalization[variable]) exclusionReasons.push(`MISSING_${variable.toUpperCase()}`);
    }
    return {
      customerId: row.customerId,
      normalizedPhone: phone.valid ? phone.value : "",
      displayName: String(row.name || "").trim(),
      consentStatus,
      consentSource: String(consent?.source || "UNKNOWN"),
      eligible: exclusionReasons.length === 0,
      exclusionReasons: [...new Set(exclusionReasons)],
      personalization,
    };
  });
  const eligible = recipients.filter((recipient) => recipient.eligible).length;
  return {
    selection: normalized,
    recipients,
    counts: {
      selected: recipients.length,
      eligible,
      ineligible: recipients.length - eligible,
      excluded: normalized.excludedCustomerIds.length,
    },
  };
}

async function getApprovedMarketingTemplate(vendorId, templateId, dependencies = {}) {
  if (!mongoose.Types.ObjectId.isValid(String(templateId || ""))) {
    throw new WhatsappMarketingCampaignError("Select an approved template", "invalid_campaign_template");
  }
  const TemplateModel = dependencies.WhatsappMarketingTemplateModel || WhatsappMarketingTemplate;
  const template = await TemplateModel.findOne({
    _id: templateId,
    vendorId,
    status: "APPROVED",
    "metaTemplate.status": "APPROVED",
  }).lean();
  if (!template?.submittedSnapshot || !template?.metaTemplate?.templateId) {
    throw new WhatsappMarketingCampaignError(
      "The selected template is not approved for campaign use",
      "campaign_template_not_approved",
      409
    );
  }
  return template;
}

function buildCampaignTemplateSnapshot(template) {
  const snapshot = template.submittedSnapshot;
  return {
    metaTemplateId: template.metaTemplate.templateId,
    metaTemplateName: template.metaTemplate.templateName,
    language: template.metaTemplate.language || snapshot.language || "en",
    draftVersion: Number(snapshot.draftVersion || template.draftVersion || 1),
    messageBody: snapshot.messageBody,
    metaBody: snapshot.metaBody,
    variableOrder: snapshot.variableOrder || [],
    headerType: snapshot.headerType || "NONE",
    primaryMedia: snapshot.primaryMedia || null,
  };
}

function renderRecipientPreview(templateSnapshot, personalization) {
  let body = String(templateSnapshot?.messageBody || "");
  for (const [key, value] of Object.entries(personalization || {})) {
    body = body.split(`{{${key}}}`).join(String(value || ""));
  }
  return body;
}

module.exports = {
  MAX_CAMPAIGN_RECIPIENTS,
  WhatsappMarketingCampaignError,
  buildCampaignTemplateSnapshot,
  getApprovedMarketingTemplate,
  loadVendorDisplay,
  normalizeSelectionInput,
  renderRecipientPreview,
  resolveCampaignRecipients,
};

