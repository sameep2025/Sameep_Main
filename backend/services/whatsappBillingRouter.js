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

function isUncertainSendError(error) {
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
  { vendor, vendorId: explicitVendorId, billId, msg91Payload, metaPayload },
  deps = {}
) {
  const env = deps.env || process.env;
  const logger = deps.logger || console;
  const sendMsg91 = deps.sendMsg91 || sendBillWhatsapp;
  const sendVendorMeta = deps.sendVendorMeta || sendVendorMetaBillMessage;
  const hasMsg91Balance = deps.hasMsg91Balance || hasAvailableWhatsAppBalance;
  const resolveRoute = deps.resolveRoute || resolveWhatsAppBillingRoute;
  const vendorId = String(explicitVendorId || vendor?._id || vendor?.id || msg91Payload?.vendorId || "");

  if (!isVendorMetaBillRoutingEnabled(env)) {
    logBillingTrace({
      stage: "route",
      vendorId,
      billId: String(billId || ""),
      route: ROUTES.YNOT_MSG91,
      reason: "global_vendor_meta_routing_disabled",
    }, logger);
    logBillingTrace({
      stage: "msg91_selected",
      vendorId,
      billId: String(billId || ""),
      reason: "global_vendor_meta_routing_disabled",
    }, logger);
    logSafeBillingSendEvent("[WhatsApp Billing Send Route]", {
      vendorId,
      billId: String(billId || ""),
      selectedProvider: ROUTES.YNOT_MSG91,
      reason: "global_vendor_meta_routing_disabled",
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
      reason: "global_vendor_meta_routing_disabled",
      result,
    };
  }

  const decision = resolveRoute({
    whatsappBusiness: vendor?.whatsappBusiness || {},
  });
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

  if (decision.route !== ROUTES.VENDOR_META) {
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
  isUncertainSendError,
  isVendorMetaBillRoutingEnabled,
  sendRoutedWhatsAppBillingMessage,
};
