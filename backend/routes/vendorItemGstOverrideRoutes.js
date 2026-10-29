const express = require("express");
const controller = require("../controllers/vendorItemGstOverrideController");
const {
  requireVendorAccessFromExistingAuth,
  requireVendorParamWriteAccess,
} = require("../utils/vendorWriteAuth");

const router = express.Router();
const readAuth = requireVendorAccessFromExistingAuth((req) => req.params.vendorId);

router.get("/:vendorId", readAuth, controller.list);
router.get("/:vendorId/item/:itemSource/:itemId", readAuth, controller.get);
router.post("/:vendorId", requireVendorParamWriteAccess(), controller.create);
router.patch("/:vendorId/:overrideId", requireVendorParamWriteAccess(), controller.update);
router.delete("/:vendorId/:overrideId", requireVendorParamWriteAccess(), controller.remove);

module.exports = router;
