const express = require("express");
const multer = require("multer");
const {
  createTemplate,
  deleteUploadedMedia,
  deleteTemplate,
  getCapability,
  getTemplate,
  listTemplates,
  refreshTemplateApprovalStatus,
  reviseRejectedTemplate,
  submitTemplateForApproval,
  updateTemplate,
  uploadTemplateMedia,
} = require("../controllers/vendorWhatsappMarketingController");
const {
  requireWhatsappMarketingCapability,
} = require("../services/whatsappMarketingCapability");
const {
  MARKETING_MEDIA_MIME_TYPES,
} = require("../services/whatsappMarketingImageService");
const { requireVendorAccessFromExistingAuth } = require("../utils/vendorWriteAuth");

const router = express.Router();
const resolveVendorId = (req) => req.params.vendorId;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    if (!MARKETING_MEDIA_MIME_TYPES.has(file.mimetype)) {
      const error = new Error("Use a JPEG, PNG, WebP, or PDF file");
      error.code = "invalid_marketing_media_type";
      return callback(error);
    }
    return callback(null, true);
  },
});

function parseMarketingImage(req, res, next) {
  upload.fields([{ name: "media", maxCount: 1 }, { name: "image", maxCount: 1 }])(req, res, (error) => {
    if (!error) {
      req.file = req.files?.media?.[0] || req.files?.image?.[0] || null;
      return next();
    }
    const tooLarge = error.code === "LIMIT_FILE_SIZE";
    return res.status(400).json({
      success: false,
      message: tooLarge
        ? "Marketing media cannot exceed 10 MB"
        : error.message || "Invalid marketing media",
      code: tooLarge ? "marketing_media_too_large" : "invalid_marketing_media",
    });
  });
}

router.use("/:vendorId", requireVendorAccessFromExistingAuth(resolveVendorId));
router.get("/:vendorId/capability", getCapability);
router.use("/:vendorId", requireWhatsappMarketingCapability());

router.get("/:vendorId/templates", listTemplates);
router.post("/:vendorId/templates", createTemplate);
router.post("/:vendorId/media", parseMarketingImage, uploadTemplateMedia);
router.delete("/:vendorId/media", express.json(), deleteUploadedMedia);
router.post("/:vendorId/images", parseMarketingImage, uploadTemplateMedia);
router.get("/:vendorId/templates/:templateId", getTemplate);
router.patch("/:vendorId/templates/:templateId", updateTemplate);
router.delete("/:vendorId/templates/:templateId", deleteTemplate);
router.post("/:vendorId/templates/:templateId/submit", submitTemplateForApproval);
router.post("/:vendorId/templates/:templateId/refresh-status", refreshTemplateApprovalStatus);
router.post("/:vendorId/templates/:templateId/revise", reviseRejectedTemplate);

module.exports = router;
module.exports.parseMarketingImage = parseMarketingImage;
