const express = require("express");
const {
  getGstTestInvoiceItems,
  previewGstBill,
  previewGstTestInvoice,
} = require("../controllers/vendorGstPreviewController");
const { requireVendorAccessFromExistingAuth } = require("../utils/vendorWriteAuth");

const router = express.Router();

router.get(
  "/:vendorId/test-invoice/items",
  requireVendorAccessFromExistingAuth((req) => req.params.vendorId),
  getGstTestInvoiceItems
);
router.post(
  "/:vendorId/test-invoice",
  requireVendorAccessFromExistingAuth((req) => req.params.vendorId),
  previewGstTestInvoice
);

router.post(
  "/:vendorId",
  requireVendorAccessFromExistingAuth((req) => req.params.vendorId),
  previewGstBill
);

module.exports = router;
