const path = require("path");
const { v4: uuidv4 } = require("uuid");
const DummyVendor = require("../models/DummyVendor");
const Vendor = require("../models/Vendor");
const WhatsappMarketingTemplate = require("../models/WhatsappMarketingTemplate");
const {
  WhatsappMarketingValidationError,
  validateMarketingTemplateInput,
} = require("../services/whatsappMarketingTemplateService");
const {
  getWhatsappMarketingCapability,
} = require("../services/whatsappMarketingCapability");
const {
  MARKETING_DOCUMENT_MIME_TYPES,
  MARKETING_IMAGE_MIME_TYPES,
  MARKETING_MEDIA_MIME_TYPES,
  createMarketingImageUploadToken,
  getMarketingMediaSizeLimit,
  hasValidMarketingMediaSignature,
  verifyMarketingImageUpload,
} = require("../services/whatsappMarketingImageService");
const {
  deleteS3ObjectByKey,
  uploadBufferToS3WithLabel,
} = require("../utils/s3Upload");
const { decryptMetaAccessToken } = require("../services/metaTokenStorage");
const { getWhatsAppBusinessAccount } = require("../services/metaWhatsAppService");
const {
  WhatsappMarketingMetaError,
  mapMetaMarketingStatus,
  readMarketingTemplateStatus,
  submitMarketingTemplateToMeta,
} = require("../services/whatsappMarketingMetaService");

const CONNECTED_META_STATUSES = new Set(["connected", "template_pending", "ready"]);

function getAuthorizedVendorId(req) {
  return String(req.vendorWriteAuth?.vendorId || req.params?.vendorId || "").trim();
}

function serializeMediaItem(item) {
  if (!item) return null;
  return {
    url: item.url || "",
    key: item.key || "",
    mimeType: item.mimeType || "",
    sizeBytes: Number(item.sizeBytes || 0),
    originalName: item.originalName || "",
  };
}

function getStoredMedia(source) {
  const storedImages = Array.isArray(source?.media?.images)
    ? source.media.images.filter(Boolean)
    : [];
  const images = storedImages.length
    ? storedImages
    : source?.image
      ? [source.image]
      : [];
  const brochure = source?.media?.brochure || null;
  const storedPrimary = source?.media?.primary;
  const hasStoredLibrary = storedImages.length > 0 || Boolean(brochure);
  const primary = hasStoredLibrary && storedPrimary?.type
    ? { type: storedPrimary.type, key: storedPrimary.key || "" }
    : source?.image
      ? { type: "IMAGE", key: source.image.key || "" }
      : { type: "NONE", key: "" };
  return { images, brochure, primary };
}

function serializeMedia(source) {
  const media = getStoredMedia(source);
  return {
    images: media.images.map(serializeMediaItem),
    brochure: serializeMediaItem(media.brochure),
    primary: {
      type: ["NONE", "IMAGE", "DOCUMENT"].includes(media.primary.type)
        ? media.primary.type
        : "NONE",
      key: media.primary.key || "",
    },
  };
}

function serializeTemplate(template) {
  if (!template) return null;
  const source = typeof template.toObject === "function" ? template.toObject() : template;
  const media = serializeMedia(source);
  const primaryImage = media.primary.type === "IMAGE"
    ? media.images.find((item) => item.key === media.primary.key) || null
    : null;
  return {
    id: String(source._id),
    vendorId: String(source.vendorId),
    internalName: source.internalName || "",
    purpose: source.purpose || "GENERAL_MARKETING",
    messageBody: source.messageBody || "",
    variables: Array.isArray(source.variables) ? source.variables : [],
    image: primaryImage,
    media,
    language: source.language || "en",
    draftVersion: Number(source.draftVersion || 1),
    status: source.status || "DRAFT",
    metaTemplate: {
      templateId: source.metaTemplate?.templateId || "",
      templateName: source.metaTemplate?.templateName || "",
      category: source.metaTemplate?.category || "",
      language: source.metaTemplate?.language || "",
      status: source.metaTemplate?.status || "NOT_SUBMITTED",
      submittedAt: source.metaTemplate?.submittedAt || null,
      lastSyncedAt: source.metaTemplate?.lastSyncedAt || null,
      reviewedAt: source.metaTemplate?.reviewedAt || null,
      rejectionReason: source.metaTemplate?.rejectionReason || "",
      lastSubmissionError: source.metaTemplate?.lastSubmissionError || "",
    },
    submittedSnapshot: source.submittedSnapshot
      ? {
          internalName: source.submittedSnapshot.internalName || "",
          messageBody: source.submittedSnapshot.messageBody || "",
          metaBody: source.submittedSnapshot.metaBody || "",
          variableOrder: source.submittedSnapshot.variableOrder || [],
          sampleValues: source.submittedSnapshot.sampleValues || [],
          language: source.submittedSnapshot.language || "en",
          draftVersion: Number(source.submittedSnapshot.draftVersion || 1),
          primaryMedia: serializeMediaItem(source.submittedSnapshot.primaryMedia),
          headerType: source.submittedSnapshot.headerType || "NONE",
        }
      : null,
    approvalHistory: Array.isArray(source.approvalHistory)
      ? source.approvalHistory.map((entry) => ({
          status: entry.status || "",
          reason: entry.reason || "",
          snapshot: entry.snapshot
            ? {
                internalName: entry.snapshot.internalName || "",
                messageBody: entry.snapshot.messageBody || "",
                metaBody: entry.snapshot.metaBody || "",
                variableOrder: entry.snapshot.variableOrder || [],
                sampleValues: entry.snapshot.sampleValues || [],
                language: entry.snapshot.language || "en",
                draftVersion: Number(entry.snapshot.draftVersion || 1),
                primaryMedia: serializeMediaItem(entry.snapshot.primaryMedia),
                headerType: entry.snapshot.headerType || "NONE",
              }
            : null,
          recordedAt: entry.recordedAt || null,
        }))
      : [],
    createdAt: source.createdAt || null,
    updatedAt: source.updatedAt || null,
  };
}

function sendError(res, error, fallbackMessage) {
  if (error instanceof WhatsappMarketingValidationError) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message,
      code: error.code,
    });
  }
  if (error?.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "A template with this name already exists",
      code: "marketing_template_name_conflict",
    });
  }
  if (error instanceof WhatsappMarketingMetaError || error?.statusCode) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || fallbackMessage,
      code: error.code || "whatsapp_marketing_meta_error",
    });
  }
  console.error(fallbackMessage, { code: error?.code || "whatsapp_marketing_error" });
  return res.status(500).json({ success: false, message: fallbackMessage });
}

function createMarketingControllerError(message, code, statusCode) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

async function loadVendorMetaConnection(vendorId, dependencies = {}) {
  const DummyVendorModel = dependencies.DummyVendorModel || DummyVendor;
  const VendorModel = dependencies.VendorModel || Vendor;
  const decryptToken = dependencies.decryptMetaAccessToken || decryptMetaAccessToken;
  const getAccount = dependencies.getWhatsAppBusinessAccount || getWhatsAppBusinessAccount;
  let vendor = await DummyVendorModel.findById(vendorId).select("whatsappBusiness").lean();
  if (!vendor) vendor = await VendorModel.findById(vendorId).select("whatsappBusiness").lean();
  if (!vendor) {
    throw createMarketingControllerError("Vendor not found", "vendor_not_found", 404);
  }

  const config = vendor.whatsappBusiness || {};
  const wabaId = String(config.wabaId || "").trim();
  const encryptedToken = String(config.metaAuth?.accessTokenEncrypted || "").trim();
  if (
    config.provider !== "meta" ||
    !CONNECTED_META_STATUSES.has(String(config.connectionStatus || "")) ||
    !wabaId ||
    !encryptedToken
  ) {
    throw createMarketingControllerError(
      "Connect your WhatsApp Business account before submitting templates to Meta",
      "meta_whatsapp_not_connected",
      409
    );
  }

  let accessToken = "";
  try {
    accessToken = decryptToken(encryptedToken);
  } catch (_error) {
    throw createMarketingControllerError(
      "The WhatsApp Business connection must be reconnected",
      "meta_whatsapp_token_unavailable",
      409
    );
  }
  if (!accessToken) {
    throw createMarketingControllerError(
      "The WhatsApp Business connection must be reconnected",
      "meta_whatsapp_token_unavailable",
      409
    );
  }

  const account = await getAccount(wabaId, accessToken);
  if (!account || String(account.id || "") !== wabaId) {
    throw createMarketingControllerError(
      "Unable to verify the connected WhatsApp Business account",
      "meta_waba_verification_failed",
      409
    );
  }
  return {
    wabaId,
    accessToken,
    phoneNumberId: String(config.phoneNumberId || "").trim(),
  };
}

function getMetaRejectionReason(metaTemplate) {
  return String(
    metaTemplate?.rejected_reason ||
      metaTemplate?.rejection_reason ||
      metaTemplate?.reason ||
      ""
  ).trim();
}

function resolveMediaItem({ vendorId, incoming, existingByKey, kind }) {
  const key = String(incoming?.key || "");
  const existing = existingByKey.get(key);
  const verified = existing || verifyMarketingImageUpload({ vendorId, image: incoming });
  const validKind = kind === "image"
    ? MARKETING_IMAGE_MIME_TYPES.has(verified?.mimeType)
    : MARKETING_DOCUMENT_MIME_TYPES.has(verified?.mimeType);
  if (!verified || !validKind) {
    throw new WhatsappMarketingValidationError(
      `Upload the marketing ${kind} again before saving`,
      "invalid_marketing_media_ownership"
    );
  }
  return serializeMediaItem(verified);
}

function resolveMediaForWrite({ vendorId, incomingMedia, existingSource = null }) {
  if (!incomingMedia || typeof incomingMedia !== "object" || Array.isArray(incomingMedia)) {
    throw new WhatsappMarketingValidationError(
      "Provide a valid marketing media library",
      "invalid_marketing_media"
    );
  }
  const incomingImages = Array.isArray(incomingMedia.images) ? incomingMedia.images : [];
  if (incomingImages.length > 5) {
    throw new WhatsappMarketingValidationError(
      "A template can contain up to 5 offer images",
      "marketing_image_limit_exceeded"
    );
  }

  const existingMedia = getStoredMedia(existingSource || {});
  const existingByKey = new Map(
    [...existingMedia.images, existingMedia.brochure]
      .filter(Boolean)
      .map((item) => [String(item.key || ""), item])
  );
  const images = incomingImages.map((item) => resolveMediaItem({
    vendorId,
    incoming: item,
    existingByKey,
    kind: "image",
  }));
  const imageKeys = new Set(images.map((item) => item.key));
  if (imageKeys.size !== images.length) {
    throw new WhatsappMarketingValidationError(
      "The same offer image cannot be added twice",
      "duplicate_marketing_media"
    );
  }

  const brochure = incomingMedia.brochure
    ? resolveMediaItem({
        vendorId,
        incoming: incomingMedia.brochure,
        existingByKey,
        kind: "brochure",
      })
    : null;
  const primaryType = String(incomingMedia.primary?.type || "NONE").toUpperCase();
  const primaryKey = String(incomingMedia.primary?.key || "");
  if (!["NONE", "IMAGE", "DOCUMENT"].includes(primaryType)) {
    throw new WhatsappMarketingValidationError("Select valid primary media", "invalid_primary_media");
  }
  if (
    (primaryType === "NONE" && primaryKey) ||
    (primaryType === "IMAGE" && !imageKeys.has(primaryKey)) ||
    (primaryType === "DOCUMENT" && (!brochure || brochure.key !== primaryKey))
  ) {
    throw new WhatsappMarketingValidationError(
      "Selected primary media is not in this template",
      "invalid_primary_media"
    );
  }
  return {
    images,
    brochure,
    primary: { type: primaryType, key: primaryType === "NONE" ? "" : primaryKey },
  };
}

function collectMediaKeys(source) {
  const media = getStoredMedia(source || {});
  return new Set(
    [...media.images, media.brochure, source?.image]
      .filter(Boolean)
      .map((item) => String(item.key || ""))
      .filter(Boolean)
  );
}

async function getCapability(req, res) {
  try {
    const capability = await getWhatsappMarketingCapability(getAuthorizedVendorId(req));
    return res.json({ success: true, data: capability });
  } catch (error) {
    return sendError(res, error, "Unable to verify WhatsApp Marketing access");
  }
}

async function listTemplates(req, res) {
  try {
    const vendorId = getAuthorizedVendorId(req);
    const templates = await WhatsappMarketingTemplate.find({ vendorId })
      .sort({ updatedAt: -1, _id: -1 })
      .lean();
    return res.json({ success: true, data: { templates: templates.map(serializeTemplate) } });
  } catch (error) {
    return sendError(res, error, "Unable to load WhatsApp Marketing templates");
  }
}

async function getTemplate(req, res) {
  try {
    const template = await WhatsappMarketingTemplate.findOne({
      _id: req.params.templateId,
      vendorId: getAuthorizedVendorId(req),
    }).lean();
    if (!template) {
      return res.status(404).json({ success: false, message: "Template not found" });
    }
    return res.json({ success: true, data: { template: serializeTemplate(template) } });
  } catch (error) {
    if (error?.name === "CastError") {
      return res.status(404).json({ success: false, message: "Template not found" });
    }
    return sendError(res, error, "Unable to load WhatsApp Marketing template");
  }
}

async function createTemplate(req, res) {
  try {
    const vendorId = getAuthorizedVendorId(req);
    const values = validateMarketingTemplateInput(req.body);
    const incomingMedia = Object.hasOwn(values, "media")
      ? values.media
      : values.image
        ? {
            images: [values.image],
            brochure: null,
            primary: { type: "IMAGE", key: values.image.key },
          }
        : { images: [], brochure: null, primary: { type: "NONE", key: "" } };
    values.media = resolveMediaForWrite({ vendorId, incomingMedia });
    values.image = values.media.primary.type === "IMAGE"
      ? values.media.images.find((item) => item.key === values.media.primary.key) || null
      : null;
    const template = await WhatsappMarketingTemplate.create({
      vendorId,
      ...values,
      status: "DRAFT",
      draftVersion: 1,
    });
    return res.status(201).json({
      success: true,
      message: "Marketing template draft saved",
      data: { template: serializeTemplate(template) },
    });
  } catch (error) {
    return sendError(res, error, "Unable to create WhatsApp Marketing template");
  }
}

async function updateTemplate(req, res) {
  try {
    const vendorId = getAuthorizedVendorId(req);
    const template = await WhatsappMarketingTemplate.findOne({
      _id: req.params.templateId,
      vendorId,
    });
    if (!template) {
      return res.status(404).json({ success: false, message: "Template not found" });
    }
    if (template.status !== "DRAFT") {
      return res.status(409).json({
        success: false,
        message: "Only draft templates can be edited",
        code: "marketing_template_not_draft",
      });
    }

    const values = validateMarketingTemplateInput(req.body, { partial: true });
    const previousMediaKeys = collectMediaKeys(template);
    if (Object.hasOwn(values, "media") || Object.hasOwn(values, "image")) {
      const incomingMedia = Object.hasOwn(values, "media")
        ? values.media
        : values.image
          ? {
              images: [values.image],
              brochure: null,
              primary: { type: "IMAGE", key: values.image.key },
            }
          : { images: [], brochure: null, primary: { type: "NONE", key: "" } };
      values.media = resolveMediaForWrite({
        vendorId,
        incomingMedia,
        existingSource: template,
      });
      values.image = values.media.primary.type === "IMAGE"
        ? values.media.images.find((item) => item.key === values.media.primary.key) || null
        : null;
    }
    Object.assign(template, values);
    template.draftVersion = Number(template.draftVersion || 1) + 1;
    await template.save();

    const nextMediaKeys = collectMediaKeys(template);
    for (const key of previousMediaKeys) {
      if (!nextMediaKeys.has(key)) deleteS3ObjectByKey(key).catch(() => {});
    }
    return res.json({
      success: true,
      message: "Marketing template draft updated",
      data: { template: serializeTemplate(template) },
    });
  } catch (error) {
    if (error?.name === "CastError") {
      return res.status(404).json({ success: false, message: "Template not found" });
    }
    return sendError(res, error, "Unable to update WhatsApp Marketing template");
  }
}

async function deleteTemplate(req, res) {
  try {
    const template = await WhatsappMarketingTemplate.findOne({
      _id: req.params.templateId,
      vendorId: getAuthorizedVendorId(req),
    });
    if (!template) {
      return res.status(404).json({ success: false, message: "Template not found" });
    }
    if (template.status !== "DRAFT") {
      return res.status(409).json({
        success: false,
        message: "Only draft templates can be deleted",
        code: "marketing_template_not_draft",
      });
    }
    const mediaKeys = collectMediaKeys(template);
    await template.deleteOne();
    for (const key of mediaKeys) deleteS3ObjectByKey(key).catch(() => {});
    return res.json({ success: true, message: "Marketing template draft deleted" });
  } catch (error) {
    if (error?.name === "CastError") {
      return res.status(404).json({ success: false, message: "Template not found" });
    }
    return sendError(res, error, "Unable to delete WhatsApp Marketing template");
  }
}

async function uploadTemplateMedia(req, res) {
  try {
    const vendorId = getAuthorizedVendorId(req);
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, message: "Select an image or PDF to upload" });
    }
    if (
      !MARKETING_MEDIA_MIME_TYPES.has(file.mimetype) ||
      !hasValidMarketingMediaSignature(file.buffer, file.mimetype)
    ) {
      return res.status(400).json({
        success: false,
        message: "Use a valid JPEG, PNG, WebP, or PDF file",
        code: "invalid_marketing_media",
      });
    }
    if (file.size > getMarketingMediaSizeLimit(file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: MARKETING_DOCUMENT_MIME_TYPES.has(file.mimetype)
          ? "PDF brochure cannot exceed 10 MB"
          : "Offer image cannot exceed 5 MB",
        code: "marketing_media_too_large",
      });
    }

    const uploaded = await uploadBufferToS3WithLabel(
      file.buffer,
      file.mimetype,
      "newvendor",
      uuidv4(),
      { segments: ["whatsapp-marketing", vendorId] }
    );
    const media = {
      ...uploaded,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      originalName: path.basename(String(file.originalname || "")).slice(0, 180),
    };
    return res.status(201).json({
      success: true,
      data: {
        media: {
          ...media,
          uploadToken: createMarketingImageUploadToken({ vendorId, image: media }),
        },
      },
    });
  } catch (error) {
    return sendError(res, error, "Unable to upload WhatsApp Marketing media");
  }
}

async function deleteUploadedMedia(req, res) {
  try {
    const vendorId = getAuthorizedVendorId(req);
    const media = verifyMarketingImageUpload({ vendorId, image: req.body?.media });
    if (!media) {
      return res.status(400).json({
        success: false,
        message: "Media ownership could not be verified",
        code: "invalid_marketing_media_ownership",
      });
    }
    const referenced = await WhatsappMarketingTemplate.exists({
      vendorId,
      $or: [
        { "media.images.key": media.key },
        { "media.brochure.key": media.key },
        { "image.key": media.key },
      ],
    });
    if (referenced) {
      return res.status(409).json({
        success: false,
        message: "Save the template without this media before deleting it",
        code: "marketing_media_in_use",
      });
    }
    await deleteS3ObjectByKey(media.key);
    return res.json({ success: true, message: "Unused marketing media deleted" });
  } catch (error) {
    return sendError(res, error, "Unable to delete WhatsApp Marketing media");
  }
}

async function submitTemplateForApproval(req, res) {
  const vendorId = getAuthorizedVendorId(req);
  let lockedTemplate = null;
  try {
    lockedTemplate = await WhatsappMarketingTemplate.findOneAndUpdate(
      { _id: req.params.templateId, vendorId, status: "DRAFT" },
      {
        $set: {
          status: "SUBMITTING",
          "metaTemplate.status": "SUBMITTING",
          "metaTemplate.lastSubmissionError": "",
        },
        $inc: { "metaTemplate.submissionAttempt": 1 },
      },
      { new: true, runValidators: true }
    );
    if (!lockedTemplate) {
      const existing = await WhatsappMarketingTemplate.findOne({
        _id: req.params.templateId,
        vendorId,
      }).select("status").lean();
      if (!existing) {
        return res.status(404).json({ success: false, message: "Template not found" });
      }
      return res.status(409).json({
        success: false,
        message: "Only a draft template can be submitted",
        code: "marketing_template_not_draft",
      });
    }

    const connection = await loadVendorMetaConnection(vendorId);
    const result = await submitMarketingTemplateToMeta({
      template: lockedTemplate.toObject(),
      vendorId,
      ...connection,
    });
    const now = new Date();
    const status = mapMetaMarketingStatus(result.metaTemplate?.status, "SUBMITTING");
    const rejectionReason = getMetaRejectionReason(result.metaTemplate);
    const metaTemplateId = String(result.metaTemplate?.id || "");
    const updateResult = await WhatsappMarketingTemplate.updateOne(
      { _id: lockedTemplate._id, vendorId, status: "SUBMITTING" },
      {
        $set: {
          status,
          submittedSnapshot: result.snapshot,
          "metaTemplate.templateId": metaTemplateId,
          "metaTemplate.templateName": result.name,
          "metaTemplate.category": String(result.metaTemplate?.category || "MARKETING"),
          "metaTemplate.language": String(
            result.metaTemplate?.language || result.snapshot.language || "en"
          ),
          "metaTemplate.status": status,
          "metaTemplate.submittedAt": lockedTemplate.metaTemplate?.submittedAt || now,
          "metaTemplate.lastSyncedAt": now,
          "metaTemplate.reviewedAt": ["APPROVED", "REJECTED"].includes(status) ? now : null,
          "metaTemplate.rejectionReason": rejectionReason,
          "metaTemplate.lastSubmissionError": "",
        },
        $push: {
          approvalHistory: {
            status,
            metaTemplateId,
            metaTemplateName: result.name,
            reason: rejectionReason,
            snapshot: result.snapshot,
            recordedAt: now,
          },
        },
      },
      { runValidators: true }
    );
    if (updateResult.modifiedCount !== 1) {
      throw createMarketingControllerError(
        "Template state changed while it was being submitted",
        "marketing_template_submission_conflict",
        409
      );
    }
    const saved = await WhatsappMarketingTemplate.findById(lockedTemplate._id).lean();
    return res.json({
      success: true,
      message: result.reused
        ? "Existing Meta submission synchronized"
        : "Template submitted to Meta for review",
      data: { template: serializeTemplate(saved) },
    });
  } catch (error) {
    if (lockedTemplate?._id) {
      const reason = String(error?.message || "Meta submission failed").slice(0, 1000);
      await WhatsappMarketingTemplate.updateOne(
        { _id: lockedTemplate._id, vendorId, status: "SUBMITTING" },
        {
          $set: {
            status: "DRAFT",
            "metaTemplate.status": "NOT_SUBMITTED",
            "metaTemplate.lastSubmissionError": reason,
          },
          $push: {
            approvalHistory: {
              status: "SUBMISSION_FAILED",
              reason,
              recordedAt: new Date(),
            },
          },
        }
      ).catch(() => {});
    }
    if (error?.name === "CastError") {
      return res.status(404).json({ success: false, message: "Template not found" });
    }
    return sendError(res, error, "Unable to submit template to Meta");
  }
}

async function refreshTemplateApprovalStatus(req, res) {
  try {
    const vendorId = getAuthorizedVendorId(req);
    const template = await WhatsappMarketingTemplate.findOne({
      _id: req.params.templateId,
      vendorId,
    });
    if (!template) {
      return res.status(404).json({ success: false, message: "Template not found" });
    }
    if (!template.metaTemplate?.templateId && !template.metaTemplate?.templateName) {
      return res.status(409).json({
        success: false,
        message: "Submit this draft before checking Meta status",
        code: "marketing_template_not_submitted",
      });
    }

    const connection = await loadVendorMetaConnection(vendorId);
    const metaTemplate = await readMarketingTemplateStatus({
      template: template.toObject(),
      ...connection,
    });
    if (!metaTemplate) {
      throw createMarketingControllerError(
        "Meta could not find this template submission",
        "meta_marketing_template_not_found",
        404
      );
    }
    const status = mapMetaMarketingStatus(metaTemplate.status, "");
    if (!status) {
      throw createMarketingControllerError(
        "Meta returned an unsupported template status",
        "unsupported_meta_template_status",
        502
      );
    }
    const now = new Date();
    const rejectionReason = getMetaRejectionReason(metaTemplate);
    const previousStatus = template.status;
    const previousReason = template.metaTemplate?.rejectionReason || "";
    template.status = status;
    template.metaTemplate.templateId = String(
      metaTemplate.id || template.metaTemplate.templateId || ""
    );
    template.metaTemplate.templateName = String(
      metaTemplate.name || template.metaTemplate.templateName || ""
    );
    template.metaTemplate.category = String(
      metaTemplate.category || template.metaTemplate.category || "MARKETING"
    );
    template.metaTemplate.language = String(
      metaTemplate.language || template.metaTemplate.language || template.language || "en"
    );
    template.metaTemplate.status = status;
    template.metaTemplate.lastSyncedAt = now;
    template.metaTemplate.rejectionReason = rejectionReason;
    if (["APPROVED", "REJECTED"].includes(status)) template.metaTemplate.reviewedAt = now;
    if (status !== previousStatus || rejectionReason !== previousReason) {
      template.approvalHistory.push({
        status,
        metaTemplateId: template.metaTemplate.templateId,
        metaTemplateName: template.metaTemplate.templateName,
        reason: rejectionReason,
        recordedAt: now,
      });
    }
    await template.save();
    return res.json({
      success: true,
      message: "Meta template status refreshed",
      data: { template: serializeTemplate(template) },
    });
  } catch (error) {
    if (error?.name === "CastError") {
      return res.status(404).json({ success: false, message: "Template not found" });
    }
    return sendError(res, error, "Unable to refresh Meta template status");
  }
}

async function reviseRejectedTemplate(req, res) {
  try {
    const vendorId = getAuthorizedVendorId(req);
    const template = await WhatsappMarketingTemplate.findOneAndUpdate(
      { _id: req.params.templateId, vendorId, status: "REJECTED" },
      {
        $set: {
          status: "DRAFT",
          "metaTemplate.status": "NOT_SUBMITTED",
          "metaTemplate.lastSubmissionError": "",
        },
        $inc: { draftVersion: 1 },
        $push: {
          approvalHistory: {
            status: "REVISION_STARTED",
            recordedAt: new Date(),
          },
        },
      },
      { new: true, runValidators: true }
    );
    if (!template) {
      const existing = await WhatsappMarketingTemplate.findOne({
        _id: req.params.templateId,
        vendorId,
      }).select("status").lean();
      if (!existing) {
        return res.status(404).json({ success: false, message: "Template not found" });
      }
      return res.status(409).json({
        success: false,
        message: "Only a rejected template can be revised",
        code: "marketing_template_not_rejected",
      });
    }
    return res.json({
      success: true,
      message: "Rejected template is ready for correction",
      data: { template: serializeTemplate(template) },
    });
  } catch (error) {
    if (error?.name === "CastError") {
      return res.status(404).json({ success: false, message: "Template not found" });
    }
    return sendError(res, error, "Unable to revise rejected template");
  }
}

module.exports = {
  createTemplate,
  deleteUploadedMedia,
  deleteTemplate,
  getCapability,
  getTemplate,
  listTemplates,
  loadVendorMetaConnection,
  refreshTemplateApprovalStatus,
  resolveMediaForWrite,
  reviseRejectedTemplate,
  serializeTemplate,
  submitTemplateForApproval,
  updateTemplate,
  uploadTemplateMedia,
};
