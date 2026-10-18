const express = require("express");
const { requireAdminAuth } = require("../utils/adminAuthMiddleware");
const {
  createAdminWhatsappRecoveryChallenge,
  getAdminWhatsappIntegration,
  getAdminWhatsappRecoveryHistory,
  recoverAdminWhatsappRegistration,
  validateAdminStoredWhatsappPin,
} = require("../controllers/adminWhatsappIntegrationController");

const router = express.Router();

router.use(requireAdminAuth);
router.get("/vendors/:vendorId/whatsapp-integration", getAdminWhatsappIntegration);
router.post(
  "/vendors/:vendorId/whatsapp-integration/pin-preflight",
  validateAdminStoredWhatsappPin
);
router.post(
  "/vendors/:vendorId/whatsapp-integration/recovery-challenge",
  createAdminWhatsappRecoveryChallenge
);
router.post(
  "/vendors/:vendorId/whatsapp-integration/recover-registration",
  recoverAdminWhatsappRegistration
);
router.get(
  "/vendors/:vendorId/whatsapp-integration/recovery-history",
  getAdminWhatsappRecoveryHistory
);

module.exports = router;
