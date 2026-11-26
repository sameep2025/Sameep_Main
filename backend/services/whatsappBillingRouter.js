const { sendBillWhatsapp } = require("../utils/whatsappService");
const { hasAvailableWhatsAppBalance } = require("./vendorWalletService");
const {
  ROUTES,
  logWhatsAppBillingRouteDecision,
  resolveWhatsAppBillingRoute,
} = require("./whatsappBillingRouteResolver");
const {
  getSafeErrorCode,
  sendVendorMetaBillMessage,
} = require("./vendorMetaBillSender");
const { sendYnotMetaBillMessage } = require("./ynotMetaBillSender");
const {
  getManeaSendDiagnosticAuthorization,
  prepareManeaDiagnosticSend,
} = require("./maneaWhatsappDiagnostic");

const UNCERTAIN_ERROR_CODES = new Set([
  "ECONNABORTED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENOTFOUND",
  "ECONNREFUSED",
  "ERR_NETWORK",
]);

function isVendorMetaBillRoutingEnabled(env = process.env) {
  return String(env.WHATSAPP_VENDOR_META_BILL_ROUTING_ENABLED || "").trim() === "true";
}

function isYnotMetaDefaultBillingEnabled(env = process.env) {
  return String(env.YNOT_META_DEFAULT_BILLING_ENABLED || "").trim() === "true";
}

function isUncertainSendError(error) {
  if (typeof error?.metaOutcomeUnknown === "boolean") return error.metaOutcomeUnknown;
  const code = String(error?.code || "").trim();
  if (UNCERTAIN_ERROR_CODES.has(code)) return true;
  if (error?.response) return false;

  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("network") ||
    message.includes("socket") ||
    message.includes("connection")
  );
}

function resolveBillingWhatsappProvider({ vendor, env = process.env } = {}) {
  const ynotMetaDefaultEnabled = isYnotMetaDefaultBillingEnabled(env);
  if (!isVendorMetaBillRoutingEnabled(env)) {
    return {
      route: ynotMetaDefaultEnabled ? ROUTES.YNOT_META : ROUTES.YNOT_MSG91,
      provider: ynotMetaDefaultEnabled ? ROUTES.YNOT_META : ROUTES.YNOT_MSG91,
      reason: ynotMetaDefaultEnabled
        ? "ynot_meta_default_enabled"
        : "global_vendor_meta_routing_disabled",
    };
  }

  const diagnosticAuthorization = getManeaSendDiagnosticAuthorization({
    env,
    vendorId: vendor?._id || vendor?.id,
    whatsappBusiness: vendor?.whatsappBusiness || {},
  });
  const decision = resolveWhatsAppBillingRoute(
    { whatsappBusiness: vendor?.whatsappBusiness || {} },
    {
      phoneRegistrationReadyOverride: diagnosticAuthorization.allowed,
      ynotMetaDefaultEnabled,
    }
  );

  return {
    ...decision,
    provider: decision.route,
  };
}

function isProviderDecisionPendingMetaReadiness({ vendor, decision } = {}) {
  const whatsappBusiness = vendor?.whatsappBusiness || {};
  const checks = decision?.checks || {};
  const blockers = Array.isArray(decision?.blockers) ? decision.blockers : [];
  const readinessStatus = String(whatsappBusiness?.messagingReadiness?.status || "").trim();

  return (
    (decision?.provider === ROUTES.YNOT_MSG91 || decision?.route === ROUTES.YNOT_MSG91) &&
    whatsappBusiness.provider === "meta" &&
    whatsappBusiness.enabled === true &&
    (readinessStatus === "" || readinessStatus === "unknown") &&
    blockers.length === 1 &&
    blockers[0] === "messaging_unknown" &&
    checks.providerMeta === true &&
    checks.explicitlyEnabled === true &&
    checks.connectionReady === true &&
    checks.phoneRegistrationReady === true &&
    checks.messagingOperational === false &&
    checks.displayNameSendReady === true &&
    checks.billingTemplateApproved === true &&
    checks.testMessageSuccessful === true
  );
}

function logSafeBillingSendEvent(label, details = {}, logger = console) {
  if (!logger || typeof logger.log !== "function") return;
  logger.log(label, details);
}

function logSafeBillingSendError(label, details = {}, logger = console) {
  if (!logger || typeof logger.error !== "function") return;
  logger.error(label, details);
}

function logBillingTrace(details = {}, logger = console, level = "log") {
  const method = level === "error" ? "error" : "log";
  if (!logger || typeof logger[method] !== "function") return;
  logger[method]("[WhatsApp Billing Trace]", details);
}

async function sendRoutedWhatsAppBillingMessage(
  {
    vendor,
    vendorId: explicitVendorId,
    billId,
    msg91Payload,
    metaPayload,
    operationId,
    sendPurpose,
    diagnosticContext: suppliedDiagnosticContext,
  },
  deps = {}
) {
  const env = deps.env || process.env;
  const logger = deps.logger || console;
  const sendMsg91 = deps.sendMsg91 || sendBillWhatsapp;
  const sendVendorMeta = deps.sendVendorMeta || sendVendorMetaBillMessage;
  const sendYnotMeta = deps.sendYnotMeta || sendYnotMetaBillMessage;
  const hasMsg91Balance = deps.hasMsg91Balance || hasAvailableWhatsAppBalance;
  const resolveRoute = deps.resolveRoute || resolveWhatsAppBillingRoute;
  const prepareDiagnosticSend = deps.prepareDiagnosticSend || prepareManeaDiagnosticSend;
  const vendorId = String(explicitVendorId || vendor?._id || vendor?.id || msg91Payload?.vendorId || "");
  let diagnosticContext = suppliedDiagnosticContext;

  if (!diagnosticContext) {
    try {
      diagnosticContext = await prepareDiagnosticSend({
        env,
        vendorId,
        billId,
        recipientPhoneNumber: metaPayload?.recipientPhoneNumber,
        whatsappBusiness: vendor?.whatsappBusiness || {},
      });
    } catch (error) {
      logSafeBillingSendError("[WhatsApp Billing Diagnostic Guard Failed]", {
        vendorId,
        billId: String(billId || ""),
        code: String(error?.code || "diagnostic_claim_lookup_failed"),
      }, logger);
      return {
        provider: "",
        route: "",
        status: "skipped",
        reason: "diagnostic_claim_lookup_failed",
      };
    }
  }

  if (!diagnosticContext.proceed) {
    return {
      provider: ROUTES.VENDOR_META,
      route: ROUTES.VENDOR_META,
      status: "skipped",
      reason: diagnosticContext.reason || "diagnostic_claim_exists",
    };
  }

  const vendorMetaRoutingEnabled = isVendorMetaBillRoutingEnabled(env);
  const ynotMetaDefaultEnabled = isYnotMetaDefaultBillingEnabled(env);
  let decision = vendorMetaRoutingEnabled
    ? resolveRoute(
        { whatsappBusiness: vendor?.whatsappBusiness || {} },
        { ynotMetaDefaultEnabled }
      )
    : {
        route: ynotMetaDefaultEnabled ? ROUTES.YNOT_META : ROUTES.YNOT_MSG91,
        reason: ynotMetaDefaultEnabled
          ? "ynot_meta_default_enabled"
          : "global_vendor_meta_routing_disabled",
        checks: {},
        blockers: [],
      };

  if (vendorMetaRoutingEnabled && diagnosticContext.diagnostic) {
    decision = resolveRoute(
      { whatsappBusiness: vendor?.whatsappBusiness || {} },
      { phoneRegistrationReadyOverride: true, ynotMetaDefaultEnabled }
    );
    if (decision.route === ROUTES.VENDOR_META) {
      decision = {
        ...decision,
        reason: diagnosticContext.authorization?.reason ||
          "manea_registration_readiness_diagnostic",
      };
    }
  }
  logWhatsAppBillingRouteDecision({ vendorId, decision });
  logBillingTrace({
    stage: "route",
    vendorId,
    billId: String(billId || ""),
    route: decision.route,
    reason: decision.reason,
    checks: decision.checks || {},
    blockers: Array.isArray(decision.blockers) ? decision.blockers : [],
  }, logger);

  if (decision.route === ROUTES.YNOT_MSG91) {
    logBillingTrace({
      stage: "msg91_selected",
      vendorId,
      billId: String(billId || ""),
      reason: decision.reason,
    }, logger);
    logSafeBillingSendEvent("[WhatsApp Billing Send Route]", {
      vendorId,
      billId: String(billId || ""),
      selectedProvider: ROUTES.YNOT_MSG91,
      reason: decision.reason,
    }, logger);

    if (!(await hasMsg91Balance(vendorId))) {
      logBillingTrace({
        stage: "msg91_skipped",
        vendorId,
        billId: String(billId || ""),
        reason: "insufficient_whatsapp_balance",
      }, logger);
      return {
        provider: ROUTES.YNOT_MSG91,
        route: ROUTES.YNOT_MSG91,
        status: "skipped",
        reason: "insufficient_whatsapp_balance",
        routeDecision: decision,
      };
    }

    const result = await sendMsg91(msg91Payload);
    logBillingTrace({
      stage: "msg91_completed",
      vendorId,
      billId: String(billId || ""),
    }, logger);
    return {
      provider: ROUTES.YNOT_MSG91,
      route: ROUTES.YNOT_MSG91,
      status: "accepted",
      reason: decision.reason,
      routeDecision: decision,
      result,
    };
  }

  if (decision.route === ROUTES.YNOT_META) {
    logSafeBillingSendEvent("[WhatsApp Billing Send Route]", {
      vendorId,
      billId: String(billId || ""),
      selectedProvider: ROUTES.YNOT_META,
      reason: decision.reason,
    }, logger);
    if (!(await hasMsg91Balance(vendorId))) {
      return {
        provider: ROUTES.YNOT_META,
        route: ROUTES.YNOT_META,
        status: "skipped",
        reason: "insufficient_whatsapp_balance",
        routeDecision: decision,
      };
    }
    try {
      const result = await sendYnotMeta({
        ...metaPayload,
        vendorId,
        billId,
        operationId,
        sendPurpose,
      });
      return {
        provider: ROUTES.YNOT_META,
        route: ROUTES.YNOT_META,
        status: result?.status || "accepted",
        reason: result?.reason || decision.reason,
        routeDecision: decision,
        result,
      };
    } catch (error) {
      const safeErrorCode = getSafeErrorCode(error);
      const status = isUncertainSendError(error) ? "uncertain" : "failed";
      const metaError = error?.metaError || {};
      logBillingTrace({
        stage: status === "uncertain" ? "ynot_meta_uncertain" : "ynot_meta_failed",
        vendorId,
        billId: String(billId || ""),
        status,
        safeErrorCode,
        httpStatus: metaError.status || null,
        metaCode: metaError.code || "",
        metaSubcode: metaError.subcode || "",
        traceId: metaError.fbtraceId || "",
      }, logger, "error");
      return {
        provider: ROUTES.YNOT_META,
        route: ROUTES.YNOT_META,
        status,
        reason: decision.reason,
        safeErrorCode,
        deliveryId: error?.deliveryId || null,
        routeDecision: decision,
        attemptedAt: new Date(),
      };
    }
  }

  // Once vendor_meta is selected, never fallback to MSG91. A retry/fallback could
  // deliver the same customer bill twice through two WhatsApp providers.
  try {
    logSafeBillingSendEvent("[WhatsApp Billing Send Route]", {
      vendorId,
      billId: String(billId || ""),
      selectedProvider: ROUTES.VENDOR_META,
      reason: decision.reason,
    }, logger);

    const result = await sendVendorMeta(metaPayload);
    logBillingTrace({
      stage: "meta_accepted",
      vendorId,
      billId: String(billId || ""),
      metaMessageId: result?.metaMessageId || "",
      status: "accepted",
    }, logger);
    logSafeBillingSendEvent("[WhatsApp Billing Vendor Meta Send Accepted]", {
      vendorId,
      billId: String(billId || ""),
      metaMessageId: result?.metaMessageId || "",
    }, logger);

    return {
      provider: ROUTES.VENDOR_META,
      route: ROUTES.VENDOR_META,
      status: "accepted",
      reason: decision.reason,
      routeDecision: decision,
      result,
    };
  } catch (error) {
    const safeErrorCode = getSafeErrorCode(error);
    const status = isUncertainSendError(error) ? "uncertain" : "failed";
    const metaError = error?.metaError || {};
    logBillingTrace({
      stage: status === "uncertain" ? "meta_uncertain" : "meta_failed",
      vendorId,
      billId: String(billId || ""),
      status,
      safeErrorCode,
      httpStatus: metaError.status || null,
      metaCode: metaError.code || metaError.errorCode || "",
      metaSubcode: metaError.subcode || metaError.errorSubcode || "",
      metaMessage: metaError.message || "",
    }, logger, "error");

    logSafeBillingSendError("[WhatsApp Billing Vendor Meta Send Failed]", {
      vendorId,
      billId: String(billId || ""),
      status,
      safeErrorCode,
    }, logger);

    return {
      provider: ROUTES.VENDOR_META,
      route: ROUTES.VENDOR_META,
      status,
      reason: decision.reason,
      safeErrorCode,
      routeDecision: decision,
      attemptedAt: new Date(),
    };
  }
}

module.exports = {
  isProviderDecisionPendingMetaReadiness,
  isUncertainSendError,
  isVendorMetaBillRoutingEnabled,
  isYnotMetaDefaultBillingEnabled,
  resolveBillingWhatsappProvider,
  sendRoutedWhatsAppBillingMessage,
};
