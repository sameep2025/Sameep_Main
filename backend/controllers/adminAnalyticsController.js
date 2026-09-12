const { SUPPORTED_PERIODS } = require("../services/adminAnalyticsDateRanges");
const {
  getBillingAnalytics,
  getCustomerAnalytics,
  getOverviewMetrics,
  getRewardsAnalytics,
  getSubscriptionAnalytics,
  getVendorAnalytics,
} = require("../services/adminAnalyticsService");

function getValidatedPeriod(req, res) {
  const period = String(req.query.period || "today").trim();

  if (!SUPPORTED_PERIODS.has(period)) {
    res.status(400).json({
      success: false,
      code: "invalid_period",
      message: "Invalid period. Use today, thisMonth, thisYear, allTime, or month.",
    });
    return null;
  }

  return period;
}

function getAnalyticsRequestParams(req, res) {
  const period = getValidatedPeriod(req, res);
  if (!period) return null;

  return {
    period,
    month: period === "month" ? String(req.query.month || "").trim() : undefined,
  };
}

async function getOverview(req, res) {
  try {
    const params = getAnalyticsRequestParams(req, res);
    if (!params) return null;

    const overview = await getOverviewMetrics(params);

    return res.json({
      success: true,
      ...overview,
    });
  } catch (error) {
    console.error("Admin analytics overview error:", error.message || error);
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code || "admin_analytics_overview_failed",
      message: "Failed to load admin analytics overview.",
    });
  }
}

async function getBilling(req, res) {
  try {
    const params = getAnalyticsRequestParams(req, res);
    if (!params) return null;

    const billing = await getBillingAnalytics(params);

    return res.json({
      success: true,
      ...billing,
    });
  } catch (error) {
    console.error("Admin analytics billing error:", error.message || error);
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code || "admin_analytics_billing_failed",
      message: "Failed to load admin billing analytics.",
    });
  }
}

async function getRewards(req, res) {
  try {
    const params = getAnalyticsRequestParams(req, res);
    if (!params) return null;

    const rewards = await getRewardsAnalytics(params);

    return res.json({
      success: true,
      ...rewards,
    });
  } catch (error) {
    console.error("Admin analytics rewards error:", error.message || error);
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code || "admin_analytics_rewards_failed",
      message: "Failed to load admin rewards analytics.",
    });
  }
}

async function getCustomers(req, res) {
  try {
    const params = getAnalyticsRequestParams(req, res);
    if (!params) return null;

    const customers = await getCustomerAnalytics(params);

    return res.json({
      success: true,
      ...customers,
    });
  } catch (error) {
    console.error("Admin analytics customers error:", error.message || error);
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code || "admin_analytics_customers_failed",
      message: "Failed to load admin customer analytics.",
    });
  }
}

async function getVendors(req, res) {
  try {
    const params = getAnalyticsRequestParams(req, res);
    if (!params) return null;

    const vendors = await getVendorAnalytics(params);

    return res.json({
      success: true,
      ...vendors,
    });
  } catch (error) {
    console.error("Admin analytics vendors error:", error.message || error);
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code || "admin_analytics_vendors_failed",
      message: "Failed to load admin vendor analytics.",
    });
  }
}

async function getSubscriptions(req, res) {
  try {
    const params = getAnalyticsRequestParams(req, res);
    if (!params) return null;

    const subscriptions = await getSubscriptionAnalytics(params);

    return res.json({
      success: true,
      ...subscriptions,
    });
  } catch (error) {
    console.error("Admin analytics subscriptions error:", error.message || error);
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code || "admin_analytics_subscriptions_failed",
      message: "Failed to load admin subscription analytics.",
    });
  }
}

module.exports = {
  getBilling,
  getCustomers,
  getOverview,
  getRewards,
  getSubscriptions,
  getVendors,
};
