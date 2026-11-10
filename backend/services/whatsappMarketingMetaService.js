const {
  createTemplate,
  findTemplateByName,
  getTemplateById,
  uploadTemplateMediaSample,
} = require("./metaWhatsAppService");
const { getS3ObjectByKey } = require("../utils/s3Upload");

const MARKETING_SAMPLE_VALUES = {
  customer_name: "Priya",
  offer_details: "20% off this week",
  salon_name: "Your Salon",
};
const SUPPORTED_META_STATUSES = new Set([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "PAUSED",
  "DISABLED",
]);
const PLACEHOLDER_PATTERN = /{{([^{}]+)}}/g;

class WhatsappMarketingMetaError extends Error {
  constructor(message, code, statusCode = 400) {
    super(message);
    this.name = "WhatsappMarketingMetaError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function normalizeMetaMarketingTemplateName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}

function buildMarketingMetaTemplateName({ vendorId, internalName, draftVersion }) {
  const vendorSuffix = String(vendorId || "").replace(/[^a-zA-Z0-9]/g, "").slice(-8);
  const name = normalizeMetaMarketingTemplateName(internalName) || "template";
  return `ynot_mkt_${vendorSuffix}_${name}_v${Math.max(1, Number(draftVersion) || 1)}`;
}

function convertMarketingPlaceholders(messageBody) {
  const variableOrder = [];
  const sampleValues = [];
  const metaBody = String(messageBody || "").replace(PLACEHOLDER_PATTERN, (match, rawName) => {
    const name = String(rawName || "").trim();
    if (!Object.hasOwn(MARKETING_SAMPLE_VALUES, name) || match !== `{{${name}}}`) {
      throw new WhatsappMarketingMetaError(
        `Unsupported marketing placeholder: ${match}`,
        "invalid_marketing_placeholder"
      );
    }
    variableOrder.push(name);
    sampleValues.push(MARKETING_SAMPLE_VALUES[name]);
    return `{{${variableOrder.length}}}`;
  });
  if (!metaBody.trim()) {
    throw new WhatsappMarketingMetaError("Message body is required", "marketing_message_required");
  }
  return { metaBody, variableOrder, sampleValues };
}

function getSelectedPrimaryMedia(template) {
  const media = template?.media || {};
  const primaryType = String(media.primary?.type || "NONE").toUpperCase();
  const primaryKey = String(media.primary?.key || "");
  if (primaryType === "NONE") return { headerType: "NONE", item: null };
  if (primaryType === "IMAGE") {
    const item = Array.isArray(media.images)
      ? media.images.find((image) => String(image?.key || "") === primaryKey)
      : null;
    if (item) return { headerType: "IMAGE", item };
  }
  if (primaryType === "DOCUMENT" && String(media.brochure?.key || "") === primaryKey) {
    return { headerType: "DOCUMENT", item: media.brochure };
  }
  throw new WhatsappMarketingMetaError(
    "Selected primary media is missing from the template",
    "invalid_primary_media"
  );
}

function mapMetaMarketingStatus(value, fallback = "SUBMITTING") {
  const status = String(value || "").trim().toUpperCase();
  return SUPPORTED_META_STATUSES.has(status) ? status : fallback;
}

function buildMarketingSubmissionSnapshot(template) {
  const converted = convertMarketingPlaceholders(template.messageBody);
  const selected = getSelectedPrimaryMedia(template);
  return {
    internalName: template.internalName || "",
    messageBody: template.messageBody || "",
    metaBody: converted.metaBody,
    variableOrder: converted.variableOrder,
    sampleValues: converted.sampleValues,
    language: template.language || "en",
    draftVersion: Number(template.draftVersion || 1),
    primaryMedia: selected.item || null,
    headerType: selected.headerType,
  };
}

function buildMarketingMetaPayload({ name, snapshot, headerHandle = "" }) {
  const components = [];
  if (snapshot.headerType !== "NONE") {
    if (!headerHandle) {
      throw new WhatsappMarketingMetaError(
        "Meta media sample handle is required",
        "meta_media_handle_required"
      );
    }
    components.push({
      type: "HEADER",
      format: snapshot.headerType,
      example: { header_handle: [headerHandle] },
    });
  }
  const body = { type: "BODY", text: snapshot.metaBody };
  if (snapshot.sampleValues.length) {
    body.example = { body_text: [snapshot.sampleValues] };
  }
  components.push(body);
  return {
    name: normalizeMetaMarketingTemplateName(name),
    language: snapshot.language,
    category: "MARKETING",
    components,
  };
}

async function submitMarketingTemplateToMeta({
  template,
  vendorId,
  wabaId,
  accessToken,
  dependencies = {},
}) {
  const create = dependencies.createTemplate || createTemplate;
  const findByName = dependencies.findTemplateByName || findTemplateByName;
  const uploadSample = dependencies.uploadTemplateMediaSample || uploadTemplateMediaSample;
  const readS3 = dependencies.getS3ObjectByKey || getS3ObjectByKey;
  const snapshot = buildMarketingSubmissionSnapshot(template);
  const name = buildMarketingMetaTemplateName({
    vendorId,
    internalName: template.internalName,
    draftVersion: template.draftVersion,
  });

  const existing = await findByName({ wabaId, accessToken, name });
  if (existing) {
    return { metaTemplate: existing, name, snapshot, reused: true, payload: null };
  }

  let headerHandle = "";
  if (snapshot.primaryMedia) {
    const object = await readS3(snapshot.primaryMedia.key, {
      maxBytes: Number(snapshot.primaryMedia.sizeBytes || 10 * 1024 * 1024),
    });
    if (
      object.contentType &&
      String(object.contentType).toLowerCase() !== String(snapshot.primaryMedia.mimeType).toLowerCase()
    ) {
      throw new WhatsappMarketingMetaError(
        "Stored media type does not match the template",
        "marketing_media_type_mismatch"
      );
    }
    const upload = await uploadSample({
      accessToken,
      fileName: snapshot.primaryMedia.originalName || "marketing-media",
      fileType: snapshot.primaryMedia.mimeType,
      buffer: object.buffer,
    });
    headerHandle = upload.handle;
  }

  const payload = buildMarketingMetaPayload({ name, snapshot, headerHandle });
  const metaTemplate = await create({ wabaId, accessToken, payload });
  return { metaTemplate, name, snapshot, reused: false, payload };
}

async function readMarketingTemplateStatus({ template, accessToken, wabaId, dependencies = {} }) {
  const byId = dependencies.getTemplateById || getTemplateById;
  const byName = dependencies.findTemplateByName || findTemplateByName;
  if (template?.metaTemplate?.templateId) {
    return byId({ templateId: template.metaTemplate.templateId, accessToken });
  }
  return byName({
    wabaId,
    accessToken,
    name: template?.metaTemplate?.templateName,
  });
}

module.exports = {
  MARKETING_SAMPLE_VALUES,
  WhatsappMarketingMetaError,
  buildMarketingMetaPayload,
  buildMarketingMetaTemplateName,
  buildMarketingSubmissionSnapshot,
  convertMarketingPlaceholders,
  getSelectedPrimaryMedia,
  mapMetaMarketingStatus,
  normalizeMetaMarketingTemplateName,
  readMarketingTemplateStatus,
  submitMarketingTemplateToMeta,
};
