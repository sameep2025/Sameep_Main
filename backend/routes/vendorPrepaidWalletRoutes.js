const express = require("express");
const controller = require("../controllers/vendorPrepaidWalletController");
const { requireVendorAccessFromExistingAuth } = require("../utils/vendorWriteAuth");
const { otpRequestLimiter, otpVerifyLimiter } = require("../utils/securityLimiters");

const router = express.Router();
router.use("/:vendorId", requireVendorAccessFromExistingAuth((req) => req.params.vendorId));
router.get("/:vendorId/capabilities", controller.getCapabilities);
router.get("/:vendorId/customer/:customerId", controller.getAvailableWallet);
router.post("/:vendorId/authorizations/prepare", otpRequestLimiter, controller.prepareAuthorization);
router.post(
  "/:vendorId/authorizations/:authorizationId/verify",
  otpVerifyLimiter,
  controller.verifyAuthorization
);

module.exports = router;
