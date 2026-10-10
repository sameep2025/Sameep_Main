const express = require("express");
const router = express.Router();
const {
  getCustomerAnalytics,
  getCustomerAnalyticsSummary,
  getCustomerAnalyticsCustomers,
  getCustomerAnalyticsItems,
} = require("../controllers/customerAnalyticsController");
const { requireVendorAccessFromExistingAuth } = require("../utils/vendorWriteAuth");

const resolveVendorQueryId = (req) => req.query?.vendorId;

router.get(
  "/customer-analytics/summary",
  requireVendorAccessFromExistingAuth(resolveVendorQueryId),
  getCustomerAnalyticsSummary
);
router.get(
  "/customer-analytics/customers",
  requireVendorAccessFromExistingAuth(resolveVendorQueryId),
  getCustomerAnalyticsCustomers
);
router.get(
  "/customer-analytics/items",
  requireVendorAccessFromExistingAuth(resolveVendorQueryId),
  getCustomerAnalyticsItems
);

router.get("/customers", getCustomerAnalytics);

module.exports = router;
