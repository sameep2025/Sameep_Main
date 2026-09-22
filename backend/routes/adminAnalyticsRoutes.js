const express = require("express");
const {
  getBilling,
  getCustomerDrilldown,
  getCustomers,
  getOverview,
  getRewards,
  getSubscriptions,
  getVendors,
} = require("../controllers/adminAnalyticsController");
const { requireAdminAuth } = require("../utils/adminAuthMiddleware");

const router = express.Router();

router.use(requireAdminAuth);

router.get("/overview", getOverview);
router.get("/billing", getBilling);
router.get("/rewards", getRewards);
router.get("/customers/drilldown", getCustomerDrilldown);
router.get("/customers", getCustomers);
router.get("/vendors", getVendors);
router.get("/subscriptions", getSubscriptions);

module.exports = router;
