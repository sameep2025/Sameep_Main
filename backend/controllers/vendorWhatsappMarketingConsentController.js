const {
  WhatsappMarketingCampaignError,
} = require("../services/whatsappMarketingCampaignService");
const {
  recordVendorMarketingPermission,
} = require("../services/whatsappMarketingConsentService");

function serializeConsent(consent) {
  const source = typeof consent?.toObject === "function" ? consent.toObject() : consent;
  return {
    customerId: String(source.customerId),
    status: source.status,
    source: source.source,
    capturedAt: source.capturedAt || null,
  };
}

async function recordMarketingPermission(req, res) {
  try {
    const consent = await recordVendorMarketingPermission({
      vendorId: String(req.vendorWriteAuth?.vendorId || req.params.vendorId || "").trim(),
      customerId: req.params.customerId,
      permissionConfirmed: req.body?.permissionConfirmed === true,
    });
    return res.json({
      success: true,
      message: "WhatsApp marketing permission recorded",
      data: { consent: serializeConsent(consent) },
    });
  } catch (error) {
    if (error instanceof WhatsappMarketingCampaignError || error?.statusCode) {
      return res.status(error.statusCode || 400).json({
        success: false,
        message: error.message,
        code: error.code || "whatsapp_marketing_consent_error",
      });
    }
    console.error("Unable to record WhatsApp marketing permission", {
      code: error?.code || "whatsapp_marketing_consent_failed",
    });
    return res.status(500).json({
      success: false,
      message: "Unable to record WhatsApp marketing permission",
    });
  }
}

module.exports = {
  recordMarketingPermission,
  serializeConsent,
};
