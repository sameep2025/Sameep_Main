const express = require("express");
const router = express.Router();
const dashboard = require("../controllers/vendorDashboardController");
const { requireVendorAccessFromExistingAuth } = require("../utils/vendorWriteAuth");

const requireDashboardAccess = requireVendorAccessFromExistingAuth((req) => req.query.vendorId);

router.get("/summary", requireDashboardAccess, dashboard.getDashboardSummary);
router.get("/fy-monthly", requireDashboardAccess, dashboard.getFinancialYearMonthly);
router.get("/top-services", requireDashboardAccess, dashboard.getTopServices);
router.get("/daily-trend", requireDashboardAccess, dashboard.getDailyTrend);
router.get("/bills-summary", requireDashboardAccess, dashboard.getBillsSummary);
router.get("/bills", requireDashboardAccess, dashboard.getBillsDrilldown);
router.get("/stylist-performance", requireDashboardAccess, dashboard.getStylistPerformance);

module.exports = router;
