const express = require("express");
const router = express.Router();

const loyaltyController = require("../controllers/loyaltyController");
const { requireVendorAccessFromExistingAuth } = require("../utils/vendorWriteAuth");

router.post(
  "/vendor-rule",
  requireVendorAccessFromExistingAuth((req) => req.body?.vendorId),
  loyaltyController.upsertVendorRule
);
router.get(
  "/vendor-rule/:vendorId",
  loyaltyController.getVendorRule
);
router.get(
  "/wallet",
  requireVendorAccessFromExistingAuth((req) => req.query?.vendorId),
  loyaltyController.getWallet
);

module.exports = router;
