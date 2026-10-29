const express = require("express");
const {
  getGstSettings,
  updateGstSettings,
} = require("../controllers/vendorGstSettingsController");
const {
  requireVendorAccessFromExistingAuth,
  requireVendorParamWriteAccess,
} = require("../utils/vendorWriteAuth");

const router = express.Router();

router.get(
  "/:vendorId",
  requireVendorAccessFromExistingAuth((req) => req.params.vendorId),
  getGstSettings
);
router.patch("/:vendorId", requireVendorParamWriteAccess(), updateGstSettings);

module.exports = router;
