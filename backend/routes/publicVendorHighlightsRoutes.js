const express = require("express");
const {
  getPublicVendorHighlights,
} = require("../controllers/publicVendorHighlightsController");
const {
  getPublicVendorSubscriptionStatus,
} = require("../controllers/vendorSubscriptionController");

const router = express.Router();

router.get("/:vendorId/highlights", getPublicVendorHighlights);
router.get("/:vendorId/subscription-status", getPublicVendorSubscriptionStatus);

module.exports = router;
