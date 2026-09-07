const express = require("express");
const { requireVendorAccessFromExistingAuth } = require("../utils/vendorWriteAuth");
const { verifyWhatsappConnectToken } = require("../utils/whatsappConnectToken");
const {
  checkWhatsappTemplateStatus,
  disconnectWhatsappBusiness,
  completeMetaWhatsappConnection,
  createMetaConnectSession,
  getMetaDiagnostics,
  getMetaEmbeddedSignupConfig,
  getWhatsappTemplateLibrary,
  getWhatsappTemplatePreview,
  getWhatsappBusinessConfig,
  prepareWhatsappBusinessConnect,
  sendWhatsappTemplateTestMessage,
  submitWhatsappTemplate,
  updateWhatsappBusinessConfig,
} = require("../controllers/vendorWhatsappBusinessController");

const router = express.Router();

const resolveRequestedVendorId = (req) => req.body?.vendorId || req.query?.vendorId;

function requireDevelopmentDiagnostics(req, res, next) {
  const env = String(process.env.NODE_ENV || "development").toLowerCase();
  if (env === "production") {
    return res.status(404).json({
      success: false,
      message: "Not found",
    });
  }

  return next();
}

function requireVendorOrWhatsappConnectAccess(req, res, next) {
  const token =
    req.body?.connectToken ||
    req.query?.connectToken ||
    req.headers["x-whatsapp-connect-token"];
  const result = verifyWhatsappConnectToken(token);

  if (result.ok) {
    req.whatsappConnectAuth = result;
    req.vendorWriteAuth = {
      ok: true,
      authType: "whatsapp_connect",
      vendorId: result.vendorId,
      customerId: result.customerId,
    };
    return next();
  }

  return requireVendorAccessFromExistingAuth(resolveRequestedVendorId)(req, res, next);
}

router.get(
  "/",
  requireVendorAccessFromExistingAuth(resolveRequestedVendorId),
  getWhatsappBusinessConfig
);

router.get(
  "/meta/config",
  requireVendorOrWhatsappConnectAccess,
  getMetaEmbeddedSignupConfig
);

router.get(
  "/meta/diagnostics",
  requireDevelopmentDiagnostics,
  requireVendorAccessFromExistingAuth(resolveRequestedVendorId),
  getMetaDiagnostics
);

router.get(
  "/templates",
  requireVendorAccessFromExistingAuth(resolveRequestedVendorId),
  getWhatsappTemplateLibrary
);

router.get(
  "/templates/:masterTemplateKey",
  requireVendorAccessFromExistingAuth(resolveRequestedVendorId),
  getWhatsappTemplatePreview
);

router.post(
  "/templates/:masterTemplateKey/submit",
  requireVendorAccessFromExistingAuth(resolveRequestedVendorId),
  submitWhatsappTemplate
);

router.post(
  "/templates/:masterTemplateKey/check-status",
  requireVendorAccessFromExistingAuth(resolveRequestedVendorId),
  checkWhatsappTemplateStatus
);

router.post(
  "/meta/templates/:masterTemplateKey/test-send",
  requireVendorAccessFromExistingAuth(resolveRequestedVendorId),
  sendWhatsappTemplateTestMessage
);

router.post(
  "/meta/connect-session",
  requireVendorAccessFromExistingAuth(resolveRequestedVendorId),
  createMetaConnectSession
);

router.patch(
  "/",
  requireVendorAccessFromExistingAuth(resolveRequestedVendorId),
  updateWhatsappBusinessConfig
);

router.post(
  "/connect",
  requireVendorAccessFromExistingAuth(resolveRequestedVendorId),
  prepareWhatsappBusinessConnect
);

router.post(
  "/meta/complete",
  requireVendorOrWhatsappConnectAccess,
  completeMetaWhatsappConnection
);

router.post(
  "/disconnect",
  requireVendorAccessFromExistingAuth(resolveRequestedVendorId),
  disconnectWhatsappBusiness
);

module.exports = router;
