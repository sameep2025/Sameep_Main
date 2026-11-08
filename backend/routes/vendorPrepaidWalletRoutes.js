const express = require("express");
const controller = require("../controllers/vendorPrepaidWalletController");
const { requireVendorAccessFromExistingAuth } = require("../utils/vendorWriteAuth");

const router = express.Router();
router.use("/:vendorId", requireVendorAccessFromExistingAuth((req) => req.params.vendorId));
router.get("/:vendorId/capabilities", controller.getCapabilities);
router.get("/:vendorId/customer/:customerId", controller.getAvailableWallet);
router.post("/:vendorId/authorizations/prepare", controller.prepareAuthorization);
router.post("/:vendorId/authorizations/:authorizationId/verify", controller.verifyAuthorization);

module.exports = router;
