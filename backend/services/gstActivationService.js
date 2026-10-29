const { isGstDraftConfigured } = require("./vendorGstSettings");

function isTestRuntime(env = process.env) {
  return String(env.YNOT_RUNTIME_ENVIRONMENT || "").trim().toLowerCase() !== "production";
}

function getGstActivationState({ vendor }) {
  return {
    enabled: vendor?.gstSettings?.enabled === true,
    configurationComplete: isGstDraftConfigured(vendor),
  };
}

function resolveGstInvoiceMode(vendor, env = process.env) {
  if (vendor?.gstSettings?.enabled !== true) return "NONE";
  return isTestRuntime(env) ? "TEST" : "LIVE";
}

module.exports = {
  getGstActivationState,
  isTestRuntime,
  resolveGstInvoiceMode,
};
