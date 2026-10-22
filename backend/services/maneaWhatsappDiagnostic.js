const mongoose = require("mongoose");
const ManeaWhatsappDiagnosticUse = require("../models/ManeaWhatsappDiagnosticUse");

const MANEA_VENDOR_ID = "69d3a74c7f444571dd02ae3d";
const MANEA_WABA_ID = "4402848216525508";
const MANEA_PHONE_NUMBER_ID = "1335446439659507";
const REQUIRED_RUNTIME_ENVIRONMENT = "production";

function exactTrue(value) {
  return String(value || "").trim() === "true";
}

function normalizeId(value) {
  return String(value || "").trim();
}

function getDiagnosticConfiguration(env = process.env) {
  const runtimeEnvironment = normalizeId(env.YNOT_RUNTIME_ENVIRONMENT).toLowerCase();
  const vendorId = normalizeId(env.MANEA_WHATSAPP_DIAGNOSTIC_VENDOR_ID);
  const wabaId = normalizeId(env.MANEA_WHATSAPP_DIAGNOSTIC_WABA_ID);
  const phoneNumberId = normalizeId(env.MANEA_WHATSAPP_DIAGNOSTIC_PHONE_NUMBER_ID);
  const enabled = exactTrue(env.MANEA_WHATSAPP_DIAGNOSTIC_ENABLED);
  const identityConfigured = Boolean(
    runtimeEnvironment === REQUIRED_RUNTIME_ENVIRONMENT &&
      vendorId === MANEA_VENDOR_ID &&
      wabaId === MANEA_WABA_ID &&
      phoneNumberId === MANEA_PHONE_NUMBER_ID
  );

  return {
    enabled,
    valid: enabled && identityConfigured,
    identityConfigured,
    runtimeEnvironment,
    vendorId,
    wabaId,
    phoneNumberId,
  };
}

function matchesManeaIdentity({ configuration, vendorId, whatsappBusiness }) {
  const config = whatsappBusiness || {};
  return Boolean(
    configuration.identityConfigured &&
      normalizeId(vendorId) === MANEA_VENDOR_ID &&
      normalizeId(config.wabaId) === MANEA_WABA_ID &&
      normalizeId(config.phoneNumberId) === MANEA_PHONE_NUMBER_ID
  );
}

function getManeaRegistrationDiagnosticAuthorization({
  env = process.env,
  vendorId,
  whatsappBusiness,
} = {}) {
  const configuration = getDiagnosticConfiguration(env);
  const allowed = Boolean(
    configuration.valid &&
      matchesManeaIdentity({ configuration, vendorId, whatsappBusiness })
  );

  return {
    allowed,
    reason: allowed
      ? "manea_registration_readiness_diagnostic"
      : "diagnostic_not_authorized",
    configuration,
  };
}

function getManeaActivationDiagnosticAuthorization(args = {}) {
  return getManeaRegistrationDiagnosticAuthorization(args);
}

function getManeaSendDiagnosticAuthorization(args = {}) {
  return getManeaRegistrationDiagnosticAuthorization(args);
}

function getDiagnosticUseId(billingSessionId) {
  const id = normalizeId(billingSessionId);
  return mongoose.Types.ObjectId.isValid(id)
    ? `manea-whatsapp-diagnostic:${id}`
    : "";
}

async function findManeaDiagnosticUse({
  billingSessionId,
  UseModel = ManeaWhatsappDiagnosticUse,
} = {}) {
  const id = getDiagnosticUseId(billingSessionId);
  if (!id) return null;
  const query = UseModel.findById(id);
  return typeof query?.lean === "function" ? query.lean() : query;
}

async function prepareManeaDiagnosticSend({
  env = process.env,
  vendorId,
  billId,
  whatsappBusiness,
  UseModel = ManeaWhatsappDiagnosticUse,
} = {}) {
  const configuration = getDiagnosticConfiguration(env);
  const identityMatches = matchesManeaIdentity({
    configuration,
    vendorId,
    whatsappBusiness,
  });

  if (!identityMatches) {
    return { proceed: true, diagnostic: false, reason: "diagnostic_not_authorized" };
  }

  // The former one-session diagnostic may have durable claims in a deployed DB.
  // Keep those bills blocked from provider fallback while creating no new claims.
  const existingClaim = await findManeaDiagnosticUse({ billingSessionId: billId, UseModel });
  if (existingClaim) {
    return {
      proceed: false,
      diagnostic: false,
      reason: "legacy_diagnostic_claim_exists",
      existingClaim,
    };
  }

  const authorization = getManeaSendDiagnosticAuthorization({
    env,
    vendorId,
    whatsappBusiness,
  });

  return {
    proceed: true,
    diagnostic: authorization.allowed,
    authorization,
    reason: authorization.reason,
  };
}

module.exports = {
  MANEA_PHONE_NUMBER_ID,
  MANEA_VENDOR_ID,
  MANEA_WABA_ID,
  findManeaDiagnosticUse,
  getDiagnosticConfiguration,
  getDiagnosticUseId,
  getManeaActivationDiagnosticAuthorization,
  getManeaRegistrationDiagnosticAuthorization,
  getManeaSendDiagnosticAuthorization,
  prepareManeaDiagnosticSend,
};
