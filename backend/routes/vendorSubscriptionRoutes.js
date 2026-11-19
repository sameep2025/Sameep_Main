const express = require("express");
const { getVendorOwnedSubscription } = require("../controllers/vendorSubscriptionController");
const { requireVendorAccessFromExistingAuth } = require("../utils/vendorWriteAuth");

const router = express.Router();

router.get(
  "/:vendorId",
  requireVendorAccessFromExistingAuth((req) => req.params.vendorId),
  getVendorOwnedSubscription
);

module.exports = router;
