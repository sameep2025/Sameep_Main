const {
  GST_PRICING_MODES,
  getDefaultGstSettings,
} = require("../models/gstSettingsSchema");

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const SAC_PATTERN = /^\d{4,8}$/;
const STATE_CODES = new Set([
  ...Array.from({ length: 38 }, (_, index) => String(index + 1).padStart(2, "0")),
  "97",
  "99",
]);
const EDITABLE_FIELDS = new Set([
  "enabled",
  "gstin",
  "legalBusinessName",
  "registeredAddress",
  "registeredStateCode",
  "defaultGstRateBps",
  "defaultSac",
  "pricingMode",
]);

class GstSettingsValidationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "GstSettingsValidationError";
    this.code = code;
  }
}

function normalizeText(value, field, maxLength, { uppercase = false } = {}) {
  if (typeof value !== "string") {
    throw new GstSettingsValidationError(`${field} must be a string`, `invalid_${field}`);
  }
  const normalized = (uppercase ? value.toUpperCase() : value).trim();
  if (normalized.length > maxLength || /[\u0000-\u001F\u007F]/.test(normalized)) {
    throw new GstSettingsValidationError(`${field} is invalid`, `invalid_${field}`);
  }
  return normalized;
}

function sanitizeGstSettings(vendor = {}) {
  const defaults = getDefaultGstSettings();
  const source = vendor.gstSettings || vendor || {};
  return {
    ...defaults,
    enabled: source.enabled === true,
    gstin: typeof source.gstin === "string" ? source.gstin : defaults.gstin,
    legalBusinessName:
      typeof source.legalBusinessName === "string"
        ? source.legalBusinessName
        : defaults.legalBusinessName,
    registeredAddress:
      typeof source.registeredAddress === "string"
        ? source.registeredAddress
        : defaults.registeredAddress,
    registeredStateCode:
      typeof source.registeredStateCode === "string"
        ? source.registeredStateCode
        : defaults.registeredStateCode,
    defaultGstRateBps: Number.isInteger(source.defaultGstRateBps)
      ? source.defaultGstRateBps
      : defaults.defaultGstRateBps,
    defaultSac: typeof source.defaultSac === "string" ? source.defaultSac : defaults.defaultSac,
    pricingMode: GST_PRICING_MODES.includes(source.pricingMode)
      ? source.pricingMode
      : defaults.pricingMode,
    updatedAt: source.updatedAt || null,
  };
}

function isGstDraftConfigured(vendor = {}) {
  const settings = sanitizeGstSettings(vendor);
  const updatedAt = settings.updatedAt ? new Date(settings.updatedAt) : null;
  return Boolean(
    updatedAt &&
    !Number.isNaN(updatedAt.getTime()) &&
    GSTIN_PATTERN.test(settings.gstin) &&
    STATE_CODES.has(settings.registeredStateCode) &&
    settings.gstin.slice(0, 2) === settings.registeredStateCode &&
    settings.legalBusinessName.trim() &&
    settings.registeredAddress.trim() &&
    Number.isInteger(settings.defaultGstRateBps) &&
    settings.defaultGstRateBps >= 0 &&
    settings.defaultGstRateBps <= 10000 &&
    GST_PRICING_MODES.includes(settings.pricingMode)
  );
}

function validateGstSettingsPatch(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new GstSettingsValidationError("GST settings must be an object", "invalid_gst_settings");
  }

  const unknownField = Object.keys(input).find((field) => !EDITABLE_FIELDS.has(field));
  if (unknownField) {
    throw new GstSettingsValidationError(
      `Unsupported GST settings field: ${unknownField}`,
      "unsupported_gst_settings_field"
    );
  }
  if (Object.keys(input).length === 0) {
    throw new GstSettingsValidationError("At least one GST setting is required", "empty_gst_settings");
  }
  if (input.enabled !== undefined && typeof input.enabled !== "boolean") {
    throw new GstSettingsValidationError(
      "enabled must be a boolean",
      "invalid_gst_enabled"
    );
  }

  const patch = {};
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  if (input.gstin !== undefined) {
    patch.gstin = normalizeText(input.gstin, "gstin", 15, { uppercase: true });
    if (patch.gstin && !GSTIN_PATTERN.test(patch.gstin)) {
      throw new GstSettingsValidationError("GSTIN format is invalid", "invalid_gstin");
    }
  }
  if (input.legalBusinessName !== undefined) {
    patch.legalBusinessName = normalizeText(
      input.legalBusinessName,
      "legal_business_name",
      150
    );
  }
  if (input.registeredAddress !== undefined) {
    patch.registeredAddress = normalizeText(
      input.registeredAddress,
      "registered_address",
      500
    );
  }
  if (input.registeredStateCode !== undefined) {
    patch.registeredStateCode = normalizeText(
      input.registeredStateCode,
      "registered_state_code",
      2
    );
    if (patch.registeredStateCode && !STATE_CODES.has(patch.registeredStateCode)) {
      throw new GstSettingsValidationError(
        "Registered state code is invalid",
        "invalid_registered_state_code"
      );
    }
  }
  if (input.defaultGstRateBps !== undefined) {
    if (
      !Number.isInteger(input.defaultGstRateBps) ||
      input.defaultGstRateBps < 0 ||
      input.defaultGstRateBps > 10000
    ) {
      throw new GstSettingsValidationError(
        "defaultGstRateBps must be an integer from 0 to 10000",
        "invalid_default_gst_rate_bps"
      );
    }
    patch.defaultGstRateBps = input.defaultGstRateBps;
  }
  if (input.defaultSac !== undefined) {
    patch.defaultSac = normalizeText(input.defaultSac, "default_sac", 8);
    if (patch.defaultSac && !SAC_PATTERN.test(patch.defaultSac)) {
      throw new GstSettingsValidationError(
        "Default SAC must contain 4 to 8 digits",
        "invalid_default_sac"
      );
    }
  }
  if (input.pricingMode !== undefined) {
    if (!GST_PRICING_MODES.includes(input.pricingMode)) {
      throw new GstSettingsValidationError(
        "pricingMode must be inclusive or exclusive",
        "invalid_pricing_mode"
      );
    }
    patch.pricingMode = input.pricingMode;
  }

  const gstin = patch.gstin || "";
  const stateCode = patch.registeredStateCode || "";
  if (gstin && stateCode && gstin.slice(0, 2) !== stateCode) {
    throw new GstSettingsValidationError(
      "GSTIN state code does not match registered state code",
      "gstin_state_code_mismatch"
    );
  }

  return patch;
}

module.exports = {
  GSTIN_PATTERN,
  STATE_CODES,
  GstSettingsValidationError,
  isGstDraftConfigured,
  sanitizeGstSettings,
  validateGstSettingsPatch,
};
