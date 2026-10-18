const express = require("express");
const { requireAdminAuth } = require("../utils/adminAuthMiddleware");
const {
  getAdminWhatsappIntegration,
  validateAdminStoredWhatsappPin,
} = require("../controllers/adminWhatsappIntegrationController");

const router = express.Router();

router.use(requireAdminAuth);
router.get("/vendors/:vendorId/whatsapp-integration", getAdminWhatsappIntegration);
router.post(
  "/vendors/:vendorId/whatsapp-integration/pin-preflight",
  validateAdminStoredWhatsappPin
);

module.exports = router;
