const VendorSubscription = require("../models/VendorSubscription");

const WHATSAPP_MARKETING_FEATURE_FLAG = "WHATSAPP_MARKETING_ENABLED";

function isWhatsappMarketingEnabled(env = process.env) {
  return String(env?.[WHATSAPP_MARKETING_FEATURE_FLAG] || "").trim().toLowerCase() === "true";
}

async function getWhatsappMarketingCapability(vendorId, { env = process.env, now = new Date() } = {}) {
  if (!isWhatsappMarketingEnabled(env)) {
    return { enabled: false, eligible: false, reason: "feature_disabled" };
  }

  const subscription = await VendorSubscription.findOne({ vendorId }).populate("planId");
  const plan = subscription?.planId;
  if (!subscription || !plan) {
    return { enabled: true, eligible: false, reason: "subscription_missing" };
  }
  if (subscription.active !== true || plan.active === false) {
    return { enabled: true, eligible: false, reason: "subscription_inactive" };
  }
  if (subscription.expiryDate && new Date(subscription.expiryDate) < now) {
    return { enabled: true, eligible: false, reason: "subscription_expired" };
  }
  return { enabled: true, eligible: true, reason: "eligible" };
}

function requireWhatsappMarketingCapability() {
  return async (req, res, next) => {
    try {
      const vendorId = String(req.vendorWriteAuth?.vendorId || req.params?.vendorId || "").trim();
      const capability = await getWhatsappMarketingCapability(vendorId);
      req.whatsappMarketingCapability = capability;
      if (!capability.eligible) {
        return res.status(403).json({
          success: false,
          message:
            capability.reason === "feature_disabled"
              ? "WhatsApp Marketing is not enabled"
              : "WhatsApp Marketing requires an active subscription",
          code: capability.reason,
        });
      }
      return next();
    } catch (error) {
      console.error("WhatsApp Marketing capability check failed", {
        code: error?.code || "whatsapp_marketing_capability_failed",
      });
      return res.status(500).json({
        success: false,
        message: "Unable to verify WhatsApp Marketing access",
        code: "whatsapp_marketing_capability_failed",
      });
    }
  };
}

module.exports = {
  WHATSAPP_MARKETING_FEATURE_FLAG,
  getWhatsappMarketingCapability,
  isWhatsappMarketingEnabled,
  requireWhatsappMarketingCapability,
};
