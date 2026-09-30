const express = require("express");
const {
  getBillingPreferences,
  updateBillingPreferences,
} = require("../controllers/vendorBillingPreferencesController");
const {
  requireVendorAccessFromExistingAuth,
  requireVendorParamWriteAccess,
} = require("../utils/vendorWriteAuth");

const router = express.Router();

router.get(
  "/:vendorId",
  requireVendorAccessFromExistingAuth((req) => req.params.vendorId),
  getBillingPreferences
);

router.patch("/:vendorId", requireVendorParamWriteAccess(), updateBillingPreferences);

module.exports = router;
