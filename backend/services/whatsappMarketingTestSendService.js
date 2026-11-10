const crypto = require("crypto");
const { normalizeWhatsappRecipientPhone } = require("../utils/whatsappRecipientPhone");
const {
  WhatsappMarketingCampaignError,
  buildCampaignTemplateSnapshot,
  renderRecipientPreview,
} = require("./whatsappMarketingCampaignService");

function parseAuthorizedMarketingTestRecipients(value) {
  const entries = new Map();
  for (const rawEntry of String(value || "").split(",")) {
    const entry = rawEntry.trim();
    if (!entry) continue;
    const separator = entry.indexOf(":");
    if (separator <= 0) continue;
    const vendorId = entry.slice(0, separator).trim();
    const phone = normalizeWhatsappRecipientPhone(entry.slice(separator + 1).trim());
    if (!vendorId || !phone.valid) continue;
    if (!entries.has(vendorId)) entries.set(vendorId, new Set());
    entries.get(vendorId).add(phone.value);
  }
  return entries;
}

function assertAuthorizedMarketingTestRecipient({ vendorId, phone, env = process.env }) {
  const normalized = normalizeWhatsappRecipientPhone(phone);
  if (!normalized.valid) {
    throw new WhatsappMarketingCampaignError(
      "Enter a valid international test recipient number",
      "marketing_test_recipient_invalid"
    );
  }
  const allowlist = parseAuthorizedMarketingTestRecipients(
    env.WHATSAPP_MARKETING_TEST_RECIPIENTS
  );
  if (!allowlist.get(String(vendorId))?.has(normalized.value)) {
    throw new WhatsappMarketingCampaignError(
      "This number is not authorized for WhatsApp Marketing test messages",
      "marketing_test_recipient_not_authorized",
      403
    );
  }
  return normalized.value;
}

function maskMarketingTestRecipient(phone) {
  const value = String(phone || "");
  return value.length > 6
    ? `+${value.slice(0, 2)}${"*".repeat(Math.max(value.length - 6, 4))}${value.slice(-4)}`
    : "****";
}

function hashMarketingTestRecipient(phone, env = process.env) {
  const secret = String(env.JWT_SECRET || env.META_APP_SECRET || "");
  if (!secret) {
    throw new WhatsappMarketingCampaignError(
      "Test recipient hashing is not configured",
      "marketing_test_hashing_not_configured",
      500
    );
  }
  return crypto.createHmac("sha256", secret).update(String(phone)).digest("hex");
}

function buildMarketingTestSendPayload({ template, customerName, offerDetails, salonName }) {
  const snapshot = buildCampaignTemplateSnapshot(template);
  const personalization = {
    customer_name: String(customerName || "").trim(),
    salon_name: String(salonName || "").trim(),
    offer_details: String(offerDetails || "").trim(),
  };
  const bodyParameters = snapshot.variableOrder.map((variable) => {
    const value = personalization[variable];
    if (!value) {
      throw new WhatsappMarketingCampaignError(
        `Provide ${variable.replaceAll("_", " ")} before sending`,
        "marketing_test_personalization_missing"
      );
    }
    return value;
  });
  let headerParameter = null;
  if (["IMAGE", "DOCUMENT"].includes(snapshot.headerType)) {
    if (!snapshot.primaryMedia?.url) {
      throw new WhatsappMarketingCampaignError(
        "The approved template media is unavailable",
        "marketing_test_media_unavailable",
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
  return {
    snapshot,
    personalization,
    bodyParameters,
    headerParameter,
    preview: renderRecipientPreview(snapshot, personalization),
  };
}

function mapMarketingTestDeliveryStatus(value) {
  const status = String(value || "").toLowerCase();
  return {
    sent: "SENT",
    delivered: "DELIVERED",
    read: "READ",
    failed: "FAILED",
  }[status] || "";
}

module.exports = {
  assertAuthorizedMarketingTestRecipient,
  buildMarketingTestSendPayload,
  hashMarketingTestRecipient,
  mapMarketingTestDeliveryStatus,
  maskMarketingTestRecipient,
  parseAuthorizedMarketingTestRecipients,
};

