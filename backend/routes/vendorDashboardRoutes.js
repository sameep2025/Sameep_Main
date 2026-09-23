const express = require("express");
const router = express.Router();
const dashboard = require("../controllers/vendorDashboardController");

router.get("/summary", dashboard.getDashboardSummary);
router.get("/fy-monthly", dashboard.getFinancialYearMonthly);
router.get("/top-services", dashboard.getTopServices);
router.get("/daily-trend", dashboard.getDailyTrend);
router.get("/bills-summary", dashboard.getBillsSummary);
router.get("/bills", dashboard.getBillsDrilldown);
router.get("/stylist-performance", dashboard.getStylistPerformance);

module.exports = router;
