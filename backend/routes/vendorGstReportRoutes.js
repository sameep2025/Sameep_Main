const express = require("express");
const {
  exportGstReportCsv,
  exportGstReportExcel,
  getGstReport,
} = require("../controllers/vendorGstReportController");
const { requireVendorAccessFromExistingAuth } = require("../utils/vendorWriteAuth");

const router = express.Router();
const requireReportAccess = requireVendorAccessFromExistingAuth((req) => req.params.vendorId);

router.get("/:vendorId/export.xlsx", requireReportAccess, exportGstReportExcel);
router.get("/:vendorId/export.csv", requireReportAccess, exportGstReportCsv);
router.get("/:vendorId", requireReportAccess, getGstReport);

module.exports = router;
