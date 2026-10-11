const express = require("express");
const {
  getPublicVendorHighlights,
} = require("../controllers/publicVendorHighlightsController");

const router = express.Router();

router.get("/:vendorId/highlights", getPublicVendorHighlights);

module.exports = router;
