const {
  BILLING_TEMPLATE_KEY,
  buildActivationEligibility,
} = require("./whatsappBillingActivationEligibility");

const ROUTES = {
  VENDOR_META: "vendor_meta",
  YNOT_MSG91: "ynot_msg91",
};

const BILL_STANDARD_TEMPLATE_NAME = "ynot_bill_standard_v1";
const BILL_STANDARD_LANGUAGE = "en";

function normalizeWhatsappBusiness(value) {
  return value && typeof value === "object" ? value : {};
}

function resolveWhatsAppBillingRoute(vendorContext = {}) {
  const whatsappBusiness = normalizeWhatsappBusiness(
    vendorContext.whatsappBusiness || vendorContext
  );
  const messagingReadiness =
    vendorContext.messagingReadiness || whatsappBusiness.messagingReadiness || {};
  const eligibility = buildActivationEligibility(whatsappBusiness, messagingReadiness);
  const checks = {
    providerMeta: whatsappBusiness.provider === "meta",
    explicitlyEnabled: whatsappBusiness.enabled === true,
    connectionReady: Boolean(eligibility.checks.accountConnected),
    phoneRegistrationReady: Boolean(eligibility.checks.phoneRegistrationReady),
    messagingOperational: Boolean(eligibility.checks.messagingNotBlocked),
    billingTemplateApproved: Boolean(eligibility.checks.billingTemplateApproved),
    testMessageSuccessful: Boolean(eligibility.checks.testMessageSuccessful),
  };
  const route =
    checks.providerMeta &&
    checks.explicitlyEnabled &&
    checks.connectionReady &&
    checks.phoneRegistrationReady &&
    checks.messagingOperational &&
    checks.billingTemplateApproved &&
    checks.testMessageSuccessful
      ? ROUTES.VENDOR_META
      : ROUTES.YNOT_MSG91;

  const reason =
    route === ROUTES.VENDOR_META
      ? "vendor_meta_enabled_and_ready"
      : checks.providerMeta && eligibility.eligible && !checks.explicitlyEnabled
      ? "vendor_meta_ready_but_not_enabled"
      : "vendor_meta_not_available";

  return {
    route,
    reason,
    checks,
    blockers:
      route === ROUTES.VENDOR_META
        ? []
        : [
            ...(!checks.explicitlyEnabled ? ["not_explicitly_enabled"] : []),
            ...(Array.isArray(eligibility.blockers) ? eligibility.blockers : []),
          ],
  };
}

function buildBillStandardTemplatePayload({
  vendorName,
  billAmount,
  pointsEarned,
  pointsRedeemed,
  finalPaid,
  loyaltyBalance,
  billUrl,
} = {}) {
  return {
    templateName: BILL_STANDARD_TEMPLATE_NAME,
    language: BILL_STANDARD_LANGUAGE,
    masterTemplateKey: BILLING_TEMPLATE_KEY,
    bodyParameters: [
      vendorName,
      billAmount,
      pointsEarned,
      pointsRedeemed,
      finalPaid,
      loyaltyBalance,
      billUrl,
    ].map((value) => String(value ?? "")),
  };
}

function logWhatsAppBillingRouteDecision({ vendorId, decision }) {
  if (process.env.WHATSAPP_BILLING_ROUTE_DIAGNOSTICS !== "true") return;

  console.log("[WhatsApp Billing Route Decision]", {
    vendorId: String(vendorId || ""),
    selectedRoute: decision?.route || ROUTES.YNOT_MSG91,
    reason: decision?.reason || "",
    checks: decision?.checks || {},
  });
}

module.exports = {
  BILL_STANDARD_LANGUAGE,
  BILL_STANDARD_TEMPLATE_NAME,
  ROUTES,
  buildBillStandardTemplatePayload,
  logWhatsAppBillingRouteDecision,
  resolveWhatsAppBillingRoute,
};
