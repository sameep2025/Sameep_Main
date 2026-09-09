const crypto = require("crypto");
const mongoose = require("mongoose");
const DummyVendor = require("../models/DummyVendor");
const Vendor = require("../models/Vendor");
const { getDefaultWhatsappBusinessConfig } = require("../models/whatsappBusinessConfigSchema");
const { getPublicMetaWhatsAppConfig } = require("../config/metaWhatsAppConfig");
const {
  decryptMetaAccessToken,
  decryptMetaRegistrationPin,
  encryptMetaAccessToken,
  encryptMetaRegistrationPin,
} = require("../services/metaTokenStorage");
const { createWhatsappConnectToken } = require("../utils/whatsappConnectToken");
const {
  getBillStandardSampleData,
  getMasterTemplate,
  getTemplateBodyParameterTexts,
  getTemplateVariablesInOrder,
  listMasterTemplates,
} = require("../services/whatsappTemplates/masterTemplateLibrary");
const {
  buildMetaTemplatePayload,
  createTemplate,
  exchangeEmbeddedSignupCode,
  getPhoneNumberReadinessWithSystemUserToken,
  getPhoneNumberStatusWithSystemUserToken,
  getTemplateStatus,
  findTemplateByName,
  registerPhoneNumberWithSystemUserToken,
  runMetaConfigurationDiagnostics,
  runMetaPhoneReadinessComparisonDiagnostics,
  runMetaSystemUserAssetDiagnostics,
  sendTemplateMessage,
  validateConnection,
} = require("../services/metaWhatsAppService");
const {
  applyPhoneRegistrationReadiness,
  buildMessagingReadiness,
} = require("../services/metaWhatsAppReadiness");
const {
  buildActivatedWhatsappBusinessConfig,
  buildActivationEligibility,
  buildBillingActivationState,
  buildDeactivatedWhatsappBusinessConfig,
  buildFailedTestMessageState,
  buildSuccessfulTestMessageState,
  normalizeTestMessageState,
} = require("../services/whatsappBillingActivationEligibility");
const { normalizeWhatsappRecipientPhone } = require("../utils/whatsappRecipientPhone");

const REELOOK_DIAGNOSTIC_WABA_ID = "1074343041678320";
const REELOOK_DIAGNOSTIC_PHONE_NUMBER_ID = "1336796569515966";

function normalizeVendorId(value) {
  const id = String(value || "").trim();
  return mongoose.Types.ObjectId.isValid(id) ? id : "";
}

async function findVendorRecord(vendorId) {
  const normalizedVendorId = normalizeVendorId(vendorId);
  if (!normalizedVendorId) return null;

  const dummyVendor = await DummyVendor.findById(normalizedVendorId).lean();
  if (dummyVendor) {
    return { Model: DummyVendor, vendor: dummyVendor };
  }

  const vendor = await Vendor.findById(normalizedVendorId).lean();
  if (vendor) {
    return { Model: Vendor, vendor };
  }

  return null;
}

async function findReelookWhatsappDiagnosticRecord() {
  const query = {
    "whatsappBusiness.wabaId": REELOOK_DIAGNOSTIC_WABA_ID,
    "whatsappBusiness.phoneNumberId": REELOOK_DIAGNOSTIC_PHONE_NUMBER_ID,
  };
  const dummyVendor = await DummyVendor.findOne(query).lean();
  if (dummyVendor) {
    return { Model: DummyVendor, vendor: dummyVendor };
  }

  const vendor = await Vendor.findOne(query).lean();
  if (vendor) {
    return { Model: Vendor, vendor };
  }

  return null;
}

function getAuthorizedVendorId(req) {
  return normalizeVendorId(
    req.vendorWriteAuth?.vendorId ||
      req.whatsappConnectAuth?.vendorId ||
      req.body?.vendorId ||
      req.query?.vendorId
  );
}

function normalizeWhatsappBusinessConfig(config) {
  return {
    ...getDefaultWhatsappBusinessConfig(),
    ...(config && typeof config.toObject === "function" ? config.toObject() : config || {}),
  };
}

function normalizePhoneRegistrationLifecycleStatus(value) {
  const status = String(value || "").trim();
  if (status === "active") return "active";
  if (status === "registration_submitted") return "registration_submitted";
  if (status === "not_registered") return "not_registered";
  if (status === "registration_required") return "registration_required";
  if (status === "error") return "error";

  // Older code wrote "registered" from code_verification_status=VERIFIED.
  // That does not prove Cloud API messaging readiness, so keep it actionable.
  if (status === "registered") return "registration_required";

  return "registration_required";
}

function sanitizeWhatsappBusinessConfig(config) {
  const normalized = normalizeWhatsappBusinessConfig(config);
  const phoneRegistrationStatus = normalizePhoneRegistrationLifecycleStatus(
    normalized.phoneRegistrationStatus
  );
  const messagingReadiness = normalized.messagingReadiness || buildMessagingReadiness(null);
  const testMessage = normalizeTestMessageState(normalized.testMessage);
  const activationEligibility = buildActivationEligibility(
    {
      ...normalized,
      phoneRegistrationStatus,
      testMessage,
    },
    messagingReadiness
  );
  const activationState = buildBillingActivationState(normalized, activationEligibility);

  return {
    enabled: Boolean(normalized.enabled),
    activation: {
      activatedAt: normalized.activation?.activatedAt || null,
      deactivatedAt: normalized.activation?.deactivatedAt || null,
    },
    provider: normalized.provider === "meta" ? "meta" : "msg91",
    connectionStatus: normalized.connectionStatus || "not_connected",
    displayPhoneNumber: normalized.displayPhoneNumber || "",
    displayName: normalized.displayName || "",
    templateStatus: normalized.templateStatus || "",
    phoneRegistrationStatus,
    phoneRegisteredAt: normalized.phoneRegisteredAt || null,
    messagingReadiness,
    testMessage,
    activationEligibility,
    activationState,
    phoneRegistrationLastError: normalized.phoneRegistrationLastError
      ? "Phone registration needs attention. Please contact YNOT support."
      : "",
    connectedAt: normalized.connectedAt || null,
    lastError: normalized.lastError
      ? "Connection needs attention. Please contact YNOT support."
      : "",
  };
}

async function refreshMetaPhoneReadinessForResponse(record) {
  const config = normalizeWhatsappBusinessConfig(record.vendor.whatsappBusiness);
  if (
    config.provider !== "meta" ||
    !config.phoneNumberId ||
    (config.phoneRegistrationStatus !== "registration_submitted" &&
      config.phoneRegistrationStatus !== "active")
  ) {
    return config;
  }

  try {
    const phoneStatus = await getPhoneNumberReadinessWithSystemUserToken({
      phoneNumberId: config.phoneNumberId,
    });
    const readinessResult = applyPhoneRegistrationReadiness({
      config,
      phoneStatus,
    });
    const refreshedConfig = {
      ...readinessResult.config,
      messagingReadiness: buildMessagingReadiness(phoneStatus?.health_status || null),
    };

    if (readinessResult.changed) {
      await record.Model.updateOne(
        {
          _id: record.vendor._id,
          "whatsappBusiness.phoneRegistrationStatus": "registration_submitted",
        },
        {
          $set: {
            "whatsappBusiness.phoneRegistrationStatus": "active",
            "whatsappBusiness.phoneRegisteredAt": refreshedConfig.phoneRegisteredAt,
            "whatsappBusiness.phoneRegistrationLastError": "",
          },
        }
      );
    }

    return refreshedConfig;
  } catch (error) {
    console.error("[Meta Phone Readiness Refresh Error]", {
      vendorId: String(record.vendor._id),
      phoneNumberId: String(config.phoneNumberId || ""),
      code: error.code || "",
      metaCode: error.metaError?.code || "",
      metaSubcode: error.metaError?.subcode || "",
      metaMessage: error.metaError?.message || error.message || "",
    });
    return {
      ...config,
      messagingReadiness: buildMessagingReadiness(null),
    };
  }
}

function formatTemplateStatus(value) {
  const status = String(value || "").trim().toUpperCase();
  if (status === "APPROVED") return "approved";
  if (status === "REJECTED") return "rejected";
  if (status === "PENDING" || status === "IN_APPEAL" || status === "PENDING_DELETION") {
    return "pending";
  }
  if (!status) return "not_configured";
  return "error";
}

function getTemplateStatusDates(status, previous = {}) {
  const now = new Date();
  return {
    approvedAt: status === "approved" ? previous.approvedAt || now : previous.approvedAt || null,
    rejectedAt: status === "rejected" ? previous.rejectedAt || now : previous.rejectedAt || null,
  };
}

function getTemplateInstance(config, masterTemplateKey) {
  const instances = Array.isArray(config?.templateInstances) ? config.templateInstances : [];
  return (
    instances.find((instance) => instance.masterTemplateKey === masterTemplateKey) ||
    null
  );
}

function sanitizeTemplateInstance(instance) {
  const source = instance && typeof instance.toObject === "function" ? instance.toObject() : instance;
  if (!source) return null;

  return {
    masterTemplateKey: source.masterTemplateKey || "",
    metaTemplateName: source.metaTemplateName || "",
    metaTemplateId: source.metaTemplateId || "",
    metaCategory: source.metaCategory || "",
    language: source.language || "en",
    status: source.status || "not_configured",
    submittedAt: source.submittedAt || null,
    approvedAt: source.approvedAt || null,
    rejectedAt: source.rejectedAt || null,
    lastError: source.lastError || "",
    isActive: Boolean(source.isActive),
  };
}

function makeTemplateInstance({ template, metaTemplateName, metaTemplate, previous = {} }) {
  const rawStatus = String(metaTemplate?.status || previous.status || "").trim();
  const status = formatTemplateStatus(rawStatus);
  const statusDates = getTemplateStatusDates(status, previous);

  return {
    masterTemplateKey: template.key,
    metaTemplateName,
    metaTemplateId: String(metaTemplate?.id || previous.metaTemplateId || ""),
    metaCategory: String(metaTemplate?.category || previous.metaCategory || template.metaCategory || ""),
    language: String(metaTemplate?.language || previous.language || template.language || "en"),
    status,
    submittedAt: previous.submittedAt || new Date(),
    approvedAt: statusDates.approvedAt,
    rejectedAt: statusDates.rejectedAt,
    lastError:
      status === "rejected"
        ? String(metaTemplate?.rejected_reason || previous.lastError || "")
        : status === "error" && rawStatus
        ? `Meta returned template status: ${rawStatus}`
        : "",
    isActive: Boolean(previous.isActive),
    createdAt: previous.createdAt || new Date(),
    updatedAt: new Date(),
  };
}

function upsertTemplateInstance(config, instance) {
  const instances = Array.isArray(config.templateInstances)
    ? config.templateInstances.map((item) =>
        item && typeof item.toObject === "function" ? item.toObject() : item
      )
    : [];
  const index = instances.findIndex(
    (item) => item.masterTemplateKey === instance.masterTemplateKey
  );

  if (index >= 0) {
    instances[index] = { ...instances[index], ...instance };
  } else {
    instances.push(instance);
  }

  return instances;
}

function getTemplateName(template) {
  return `ynot_${String(template.key || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")}_v${template.version || 1}`;
}

function maskPhoneNumber(value) {
  const phone = String(value || "").trim();
  if (!phone) return "";
  const prefix = phone.startsWith("+") ? "+" : "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return `${prefix}****`;
  const countryHint = digits.length > 10 ? digits.slice(0, digits.length - 10) : "";
  return `${prefix}${countryHint}${"*".repeat(Math.max(digits.length - countryHint.length - 4, 4))}${digits.slice(-4)}`;
}

function getSampleDataForTemplate(template, config = {}, vendor = {}) {
  if (template.key === "BILL_STANDARD") {
    return getBillStandardSampleData({
      vendorName: config.displayName || vendor.businessName,
    });
  }

  return {};
}

function getTemplatePreview(template, sampleData = null) {
  const body = template.components.find((component) => component.type === "BODY") || {};
  const sampleValues = sampleData
    ? getTemplateBodyParameterTexts(template.key, sampleData)
    : body.example?.body_text?.[0] || [];
  const message = sampleValues.reduce(
    (text, value, index) => text.replace(`{{${index + 1}}}`, value),
    body.text || ""
  );

  return {
    sampleData: sampleData || {},
    sampleMessage: message,
    variables: getTemplateVariablesInOrder(template.key),
  };
}

function assertConnectedMetaConfig(config) {
  if (config.provider !== "meta" || config.connectionStatus !== "connected") {
    const error = new Error("Connect WhatsApp Business before setting up templates");
    error.code = "meta_whatsapp_not_connected";
    throw error;
  }

  if (!config.wabaId || !config.metaAuth?.accessTokenEncrypted) {
    const error = new Error("Meta WhatsApp connection is missing required setup details");
    error.code = "meta_whatsapp_connection_incomplete";
    throw error;
  }
}

function getDecryptedMetaToken(config) {
  return decryptMetaAccessToken(config.metaAuth?.accessTokenEncrypted || "");
}

function sendTemplateError(res, error) {
  const status =
    error.code === "meta_whatsapp_not_connected" ||
    error.code === "meta_whatsapp_connection_incomplete" ||
    error.code === "master_template_not_found" ||
    error.code === "meta_template_not_approved" ||
    error.code === "recipient_phone_invalid"
      ? 400
      : 500;

  return res.status(status).json({
    success: false,
    code: error.code || "whatsapp_template_error",
    message:
      error.code === "meta_whatsapp_not_connected"
        ? "Please connect WhatsApp Business before setting up templates."
        : error.code === "master_template_not_found"
        ? "The selected WhatsApp template is not available."
        : error.code === "meta_template_not_approved"
        ? "This WhatsApp template must be approved before sending a test message."
        : error.code === "recipient_phone_invalid"
        ? "Enter a valid WhatsApp number in international format, for example +919381520396."
        : "Unable to update WhatsApp template setup. Please try again.",
  });
}

function formatSafeMetaForResponse(metaError) {
  if (!metaError || typeof metaError !== "object") return null;

  return {
    status: metaError.status || null,
    type: metaError.type || "",
    code: metaError.code || "",
    subcode: metaError.subcode || "",
    message: metaError.message || "",
    userTitle: metaError.errorUserTitle || "",
    userMessage: metaError.errorUserMessage || "",
    fbtraceId: metaError.fbtraceId || "",
    hasErrorData: Boolean(metaError.hasErrorData),
  };
}

function mapPhoneRegistrationStatus(phoneStatus, fallback = "unknown") {
  const normalizedFallback = normalizePhoneRegistrationLifecycleStatus(fallback);
  const codeVerificationStatus = String(phoneStatus?.code_verification_status || "")
    .trim()
    .toUpperCase();

  if (normalizedFallback === "active") {
    return normalizedFallback;
  }

  if (!phoneStatus) {
    return normalizedFallback || "unknown";
  }

  if (codeVerificationStatus === "PENDING" || codeVerificationStatus === "NOT_VERIFIED") {
    return "registration_required";
  }

  if (codeVerificationStatus === "EXPIRED") {
    return "not_registered";
  }

  return normalizedFallback || "registration_required";
}

function getSubmittedPhoneRegistrationStatus() {
  return "registration_submitted";
}

function generateSixDigitPin() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function getOrCreateRegistrationPin(config) {
  const encryptedPin = config.metaRegistration?.pinEncrypted || "";
  if (encryptedPin) {
    return {
      pin: decryptMetaRegistrationPin(encryptedPin),
      pinEncrypted: encryptedPin,
    };
  }

  const pin = generateSixDigitPin();
  return {
    pin,
    pinEncrypted: encryptMetaRegistrationPin(pin),
  };
}

function sendTestMessageError(res, error, data = null) {
  const meta = formatSafeMetaForResponse(error.metaError);
  const status =
    error.code === "meta_test_send_failed" ||
    error.code === "meta_token_encryption_missing"
      ? 500
      : 400;

  return res.status(status).json({
    success: false,
    code: error.code || "meta_test_send_error",
    message:
      error.code === "recipient_phone_invalid"
        ? "Enter a valid WhatsApp number in international format, for example +919381520396."
      : error.code === "meta_template_not_approved"
        ? "This WhatsApp template must be approved before sending a test message."
        : error.code === "meta_token_encryption_missing"
        ? "WhatsApp test messaging is not configured correctly. Please contact YNOT support."
        : "Unable to send test WhatsApp message.",
    ...(data ? { data } : {}),
    ...(meta ? { meta } : {}),
  });
}

function sendPhoneRegistrationError(res, error) {
  const meta = formatSafeMetaForResponse(error.metaError);
  const status =
    error.code === "meta_token_encryption_missing" ||
    error.code === "meta_system_user_token_missing" ||
    error.code === "meta_phone_registration_failed" ||
    error.code === "meta_phone_status_failed"
      ? 500
      : 400;

  return res.status(status).json({
    success: false,
    code: error.code || "meta_phone_registration_error",
    message:
      error.code === "meta_whatsapp_not_connected"
        ? "Please connect WhatsApp Business before registering the phone number."
        : error.code === "meta_whatsapp_connection_incomplete"
        ? "WhatsApp Business connection details are incomplete."
        : error.code === "meta_token_encryption_missing"
        ? "WhatsApp phone registration is not configured correctly. Please contact YNOT support."
        : error.code === "meta_system_user_token_missing"
        ? "WhatsApp phone registration is not configured correctly. Please contact YNOT support."
        : "Unable to register WhatsApp number.",
    ...(meta ? { meta } : {}),
  });
}

function sendVendorNotFound(res) {
  return res.status(404).json({
    success: false,
    message: "Vendor not found",
  });
}

function isDevelopmentDiagnosticsAllowed() {
  const env = String(process.env.NODE_ENV || "development").toLowerCase();
  return env !== "production";
}

async function getWhatsappBusinessConfig(req, res) {
  try {
    const record = await findVendorRecord(getAuthorizedVendorId(req));
    if (!record) return sendVendorNotFound(res);
    const whatsappBusiness = await refreshMetaPhoneReadinessForResponse(record);

    return res.json({
      success: true,
      data: sanitizeWhatsappBusinessConfig(whatsappBusiness),
    });
  } catch (error) {
    console.error("Failed to fetch WhatsApp Business config:", error.message || error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch WhatsApp Business configuration",
    });
  }
}

async function activateWhatsappBusinessBilling(req, res) {
  try {
    const record = await findVendorRecord(getAuthorizedVendorId(req));
    if (!record) return sendVendorNotFound(res);

    const current = await refreshMetaPhoneReadinessForResponse(record);
    const sanitizedCurrent = sanitizeWhatsappBusinessConfig(current);

    if (current.enabled) {
      return res.json({
        success: true,
        data: sanitizedCurrent,
        message: "WhatsApp billing activation is already enabled.",
      });
    }

    if (!sanitizedCurrent.activationEligibility?.eligible) {
      return res.status(400).json({
        success: false,
        code: "whatsapp_billing_not_eligible",
        data: sanitizedCurrent,
        checks: sanitizedCurrent.activationEligibility?.checks || {},
        blockers: sanitizedCurrent.activationEligibility?.blockers || [],
        message: "WhatsApp billing is not ready to activate yet.",
      });
    }

    const whatsappBusiness = buildActivatedWhatsappBusinessConfig(current);
    await record.Model.updateOne(
      { _id: record.vendor._id },
      {
        $set: {
          "whatsappBusiness.enabled": true,
          "whatsappBusiness.activation": whatsappBusiness.activation,
        },
      }
    );

    return res.json({
      success: true,
      data: sanitizeWhatsappBusinessConfig(whatsappBusiness),
      message: "WhatsApp billing activation preference has been saved.",
    });
  } catch (error) {
    console.error("Failed to activate WhatsApp billing:", error.code || error.message || error);
    return res.status(500).json({
      success: false,
      code: "whatsapp_billing_activation_failed",
      message: "Unable to activate WhatsApp billing preference.",
    });
  }
}

async function deactivateWhatsappBusinessBilling(req, res) {
  try {
    const record = await findVendorRecord(getAuthorizedVendorId(req));
    if (!record) return sendVendorNotFound(res);

    const current = normalizeWhatsappBusinessConfig(record.vendor.whatsappBusiness);
    const whatsappBusiness = buildDeactivatedWhatsappBusinessConfig(current);

    await record.Model.updateOne(
      { _id: record.vendor._id },
      {
        $set: {
          "whatsappBusiness.enabled": false,
          "whatsappBusiness.activation": whatsappBusiness.activation,
        },
      }
    );

    return res.json({
      success: true,
      data: sanitizeWhatsappBusinessConfig(whatsappBusiness),
      message: current.enabled
        ? "WhatsApp billing activation preference has been turned off."
        : "WhatsApp billing activation preference is already off.",
    });
  } catch (error) {
    console.error("Failed to deactivate WhatsApp billing:", error.code || error.message || error);
    return res.status(500).json({
      success: false,
      code: "whatsapp_billing_deactivation_failed",
      message: "Unable to deactivate WhatsApp billing preference.",
    });
  }
}

async function getMetaEmbeddedSignupConfig(req, res) {
  try {
    return res.json({
      success: true,
      data: {
        ...getPublicMetaWhatsAppConfig(),
        returnUrl: req.whatsappConnectAuth?.returnUrl || "",
      },
    });
  } catch (error) {
    console.error("Failed to load Meta WhatsApp config:", error.message || error);
    return res.status(500).json({
      success: false,
      message: "Failed to load WhatsApp setup configuration",
    });
  }
}

async function getMetaDiagnostics(req, res) {
  if (!isDevelopmentDiagnosticsAllowed()) {
    return res.status(404).json({
      success: false,
      message: "Not found",
    });
  }

  try {
    const diagnostics = await runMetaConfigurationDiagnostics();
    return res.json({
      success: true,
      data: diagnostics,
    });
  } catch (error) {
    console.error("Meta WhatsApp diagnostics failed:", error.code || error.message || error);
    return res.status(500).json({
      success: false,
      message: "Failed to run Meta WhatsApp diagnostics",
    });
  }
}

async function getMetaSystemUserAssetDiagnostics(req, res) {
  try {
    const diagnostics = await runMetaSystemUserAssetDiagnostics();
    return res.json(diagnostics);
  } catch (error) {
    console.error(
      "Meta system-user asset diagnostics failed:",
      error.code || error.message || error
    );
    return res.status(500).json({
      success: false,
      code: "meta_system_user_asset_diagnostics_failed",
      message: "Failed to run Meta system-user asset diagnostics",
    });
  }
}

async function getMetaPhoneReadinessComparisonDiagnostics(req, res) {
  try {
    const diagnostics = await runMetaPhoneReadinessComparisonDiagnostics();
    return res.json(diagnostics);
  } catch (error) {
    console.error(
      "Meta phone readiness diagnostics failed:",
      error.code || error.message || error
    );
    return res.status(500).json({
      success: false,
      code: "meta_phone_readiness_diagnostics_failed",
      message: "Failed to run Meta phone readiness diagnostics",
    });
  }
}

async function runSystemUserPhoneRegistrationDiagnostic(req, res) {
  const diagnosticContext = {
    diagnostic: "system_user_phone_registration",
    phoneNumberId: REELOOK_DIAGNOSTIC_PHONE_NUMBER_ID,
    wabaId: REELOOK_DIAGNOSTIC_WABA_ID,
    tokenSource: "system_user",
  };

  try {
    const record = await findReelookWhatsappDiagnosticRecord();
    if (!record) {
      return res.status(404).json({
        success: false,
        ...diagnosticContext,
        code: "reelook_whatsapp_connection_not_found",
        registrationRequestAccepted: false,
        message: "Reelook WhatsApp connection was not found.",
      });
    }

    const config = normalizeWhatsappBusinessConfig(record.vendor.whatsappBusiness);
    const encryptedPin = config.metaRegistration?.pinEncrypted || "";
    console.log("[Meta System User Phone Registration Diagnostic]", {
      ...diagnosticContext,
      systemUserTokenPresent: Boolean(process.env.META_SYSTEM_USER_ACCESS_TOKEN),
      storedRegistrationPinPresent: Boolean(encryptedPin),
    });

    if (!encryptedPin) {
      return res.status(400).json({
        success: false,
        ...diagnosticContext,
        code: "meta_registration_pin_missing",
        registrationRequestAccepted: false,
        message: "Stored registration PIN was not found for this diagnostic.",
      });
    }

    let pin = "";
    try {
      pin = decryptMetaRegistrationPin(encryptedPin);
    } catch (error) {
      return res.status(500).json({
        success: false,
        ...diagnosticContext,
        code: error.code || "meta_registration_pin_decrypt_failed",
        registrationRequestAccepted: false,
        message: "Stored registration PIN could not be decrypted.",
      });
    }

    if (!/^\d{6}$/.test(pin)) {
      return res.status(400).json({
        success: false,
        ...diagnosticContext,
        code: "meta_registration_pin_invalid",
        registrationRequestAccepted: false,
        message: "Stored registration PIN is not valid for this diagnostic.",
      });
    }

    console.log("[Meta System User Phone Registration Diagnostic] request started", {
      ...diagnosticContext,
    });

    const result = await registerPhoneNumberWithSystemUserToken({
      phoneNumberId: REELOOK_DIAGNOSTIC_PHONE_NUMBER_ID,
      pin,
    });

    console.log("[Meta System User Phone Registration Diagnostic] response", {
      ...diagnosticContext,
      registrationSuccess: Boolean(result?.success),
    });

    return res.json({
      success: Boolean(result?.success),
      ...diagnosticContext,
      registrationRequestAccepted: Boolean(result?.success),
    });
  } catch (error) {
    const meta = formatSafeMetaForResponse(error.metaError);
    console.error("[Meta System User Phone Registration Diagnostic Error]", {
      ...diagnosticContext,
      systemUserTokenPresent: Boolean(process.env.META_SYSTEM_USER_ACCESS_TOKEN),
      httpStatus: meta?.status || null,
      metaType: meta?.type || "",
      metaCode: meta?.code || "",
      metaSubcode: meta?.subcode || "",
      metaMessage: meta?.message || "",
      fbtraceId: meta?.fbtraceId || "",
      code: error.code || "",
    });

    const status = error.code === "meta_system_user_token_missing" ? 500 : 400;
    return res.status(status).json({
      success: false,
      ...diagnosticContext,
      code: error.code || "meta_system_user_phone_registration_failed",
      registrationRequestAccepted: false,
      ...(meta ? { meta } : {}),
      message: "System-user phone registration diagnostic failed.",
    });
  }
}

async function createMetaConnectSession(req, res) {
  try {
    const vendorId = getAuthorizedVendorId(req);
    if (!vendorId) {
      return res.status(400).json({
        success: false,
        message: "Vendor ID is required",
      });
    }

    const token = createWhatsappConnectToken({
      vendorId,
      customerId: req.vendorWriteAuth?.customerId || "",
      returnUrl: req.body?.returnUrl || "",
    });

    return res.json({
      success: true,
      data: {
        connectToken: token,
        expiresInSeconds: 15 * 60,
      },
    });
  } catch (error) {
    console.error("Failed to create Meta connect session:", error.message || error);
    return res.status(500).json({
      success: false,
      message: "Failed to start WhatsApp Business setup",
    });
  }
}

async function updateWhatsappBusinessConfig(req, res) {
  try {
    const record = await findVendorRecord(getAuthorizedVendorId(req));
    if (!record) return sendVendorNotFound(res);

    const current = normalizeWhatsappBusinessConfig(record.vendor.whatsappBusiness);
    const whatsappBusiness = {
      ...current,
      displayName:
        typeof req.body?.displayName === "string"
          ? req.body.displayName.trim()
          : current.displayName,
      displayPhoneNumber:
        typeof req.body?.displayPhoneNumber === "string"
          ? req.body.displayPhoneNumber.trim()
          : current.displayPhoneNumber,
    };

    await record.Model.updateOne(
      { _id: record.vendor._id },
      { $set: { whatsappBusiness } }
    );

    return res.json({
      success: true,
      data: sanitizeWhatsappBusinessConfig(whatsappBusiness),
    });
  } catch (error) {
    console.error("Failed to update WhatsApp Business config:", error.message || error);
    return res.status(500).json({
      success: false,
      message: "Failed to update WhatsApp Business configuration",
    });
  }
}

async function getWhatsappTemplateLibrary(req, res) {
  try {
    const record = await findVendorRecord(getAuthorizedVendorId(req));
    if (!record) return sendVendorNotFound(res);

    const config = normalizeWhatsappBusinessConfig(record.vendor.whatsappBusiness);
    const templates = listMasterTemplates({ activeOnly: true }).map((template) => ({
      ...template,
      preview: getTemplatePreview(template, getSampleDataForTemplate(template, config, record.vendor)),
      vendorTemplate: sanitizeTemplateInstance(getTemplateInstance(config, template.key)),
    }));

    return res.json({
      success: true,
      data: {
        templates,
      },
    });
  } catch (error) {
    console.error("Failed to fetch WhatsApp template library:", error.code || error.message || error);
    return sendTemplateError(res, error);
  }
}

async function getWhatsappTemplatePreview(req, res) {
  try {
    const template = getMasterTemplate(req.params.masterTemplateKey);
    if (!template) {
      const error = new Error("Template not found");
      error.code = "master_template_not_found";
      throw error;
    }

    const record = await findVendorRecord(getAuthorizedVendorId(req));
    if (!record) return sendVendorNotFound(res);

    const config = normalizeWhatsappBusinessConfig(record.vendor.whatsappBusiness);
    const sampleData = getSampleDataForTemplate(template, config, record.vendor);

    return res.json({
      success: true,
      data: {
        template,
        preview: getTemplatePreview(template, sampleData),
        vendorTemplate: sanitizeTemplateInstance(getTemplateInstance(config, template.key)),
      },
    });
  } catch (error) {
    console.error("Failed to fetch WhatsApp template preview:", error.code || error.message || error);
    return sendTemplateError(res, error);
  }
}

async function submitWhatsappTemplate(req, res) {
  try {
    const template = getMasterTemplate(req.params.masterTemplateKey);
    if (!template) {
      const error = new Error("Template not found");
      error.code = "master_template_not_found";
      throw error;
    }

    const record = await findVendorRecord(getAuthorizedVendorId(req));
    if (!record) return sendVendorNotFound(res);

    const config = normalizeWhatsappBusinessConfig(record.vendor.whatsappBusiness);
    assertConnectedMetaConfig(config);

    const existing = getTemplateInstance(config, template.key);
    const metaTemplateName = existing?.metaTemplateName || getTemplateName(template);
    const accessToken = getDecryptedMetaToken(config);

    let metaTemplate = null;
    if (existing?.metaTemplateName) {
      metaTemplate = await findTemplateByName({
        wabaId: config.wabaId,
        accessToken,
        name: existing.metaTemplateName,
      });
    }

    if (!metaTemplate) {
      metaTemplate = await findTemplateByName({
        wabaId: config.wabaId,
        accessToken,
        name: metaTemplateName,
      });
    }

    if (!metaTemplate) {
      const payload = buildMetaTemplatePayload({
        name: metaTemplateName,
        template,
      });
      metaTemplate = await createTemplate({
        wabaId: config.wabaId,
        accessToken,
        payload,
      });
    }

    const templateInstance = makeTemplateInstance({
      template,
      metaTemplateName,
      metaTemplate,
      previous: existing || {},
    });
    const whatsappBusiness = {
      ...config,
      enabled: false,
      provider: "meta",
      templateStatus: templateInstance.status,
      templateInstances: upsertTemplateInstance(config, templateInstance),
    };

    await record.Model.updateOne(
      { _id: record.vendor._id },
      { $set: { whatsappBusiness } }
    );

    return res.json({
      success: true,
      data: {
        template,
        preview: getTemplatePreview(template, getSampleDataForTemplate(template, config, record.vendor)),
        vendorTemplate: sanitizeTemplateInstance(templateInstance),
      },
      message: "Standard Bill template submitted to Meta for approval.",
    });
  } catch (error) {
    console.error("Failed to submit WhatsApp template:", error.code || error.message || error);
    return sendTemplateError(res, error);
  }
}

async function checkWhatsappTemplateStatus(req, res) {
  try {
    const template = getMasterTemplate(req.params.masterTemplateKey);
    if (!template) {
      const error = new Error("Template not found");
      error.code = "master_template_not_found";
      throw error;
    }

    const record = await findVendorRecord(getAuthorizedVendorId(req));
    if (!record) return sendVendorNotFound(res);

    const config = normalizeWhatsappBusinessConfig(record.vendor.whatsappBusiness);
    assertConnectedMetaConfig(config);

    const existing = getTemplateInstance(config, template.key);
    const metaTemplateName = existing?.metaTemplateName || getTemplateName(template);
    const accessToken = getDecryptedMetaToken(config);
    const metaTemplate = await getTemplateStatus({
      wabaId: config.wabaId,
      accessToken,
      name: metaTemplateName,
    });

    if (!metaTemplate) {
      const templateInstance = existing || {
        masterTemplateKey: template.key,
        metaTemplateName,
        metaCategory: template.metaCategory,
        language: template.language,
        status: "not_configured",
      };

      return res.json({
        success: true,
        data: {
          template,
          preview: getTemplatePreview(template, getSampleDataForTemplate(template, config, record.vendor)),
          vendorTemplate: sanitizeTemplateInstance(templateInstance),
        },
        message: "Template has not been submitted to Meta yet.",
      });
    }

    const templateInstance = makeTemplateInstance({
      template,
      metaTemplateName,
      metaTemplate,
      previous: existing || {},
    });
    const whatsappBusiness = {
      ...config,
      enabled: false,
      provider: "meta",
      templateStatus: templateInstance.status,
      templateInstances: upsertTemplateInstance(config, templateInstance),
    };

    await record.Model.updateOne(
      { _id: record.vendor._id },
      { $set: { whatsappBusiness } }
    );

    return res.json({
      success: true,
      data: {
        template,
        preview: getTemplatePreview(template, getSampleDataForTemplate(template, config, record.vendor)),
        vendorTemplate: sanitizeTemplateInstance(templateInstance),
      },
      message: "Template status refreshed from Meta.",
    });
  } catch (error) {
    console.error("Failed to refresh WhatsApp template status:", error.code || error.message || error);
    return sendTemplateError(res, error);
  }
}

async function sendWhatsappTemplateTestMessage(req, res) {
  let record = null;
  let config = null;
  let template = null;
  let logContext = {
    vendorId: "",
    templateKey: req.params.masterTemplateKey || "",
    templateName: "",
    phoneNumberIdPresent: false,
    recipientMasked: "",
  };

  try {
    template = getMasterTemplate(req.params.masterTemplateKey);
    if (!template) {
      const error = new Error("Template not found");
      error.code = "master_template_not_found";
      throw error;
    }

    const recipient = normalizeWhatsappRecipientPhone(req.body?.recipientPhoneNumber, {
      defaultCountry: "IN",
    });
    if (!recipient.valid) {
      const error = new Error("Recipient phone number must use international format");
      error.code = "recipient_phone_invalid";
      throw error;
    }
    const recipientPhoneNumber = recipient.value;

    record = await findVendorRecord(getAuthorizedVendorId(req));
    if (!record) return sendVendorNotFound(res);

    config = normalizeWhatsappBusinessConfig(record.vendor.whatsappBusiness);
    assertConnectedMetaConfig(config);

    const existing = getTemplateInstance(config, template.key);
    if (!existing || existing.status !== "approved" || !existing.metaTemplateName) {
      const error = new Error("Approved template instance is required before test send");
      error.code = "meta_template_not_approved";
      throw error;
    }

    const accessToken = getDecryptedMetaToken(config);
    const sampleData = getBillStandardSampleData({
      vendorName: config.displayName || record.vendor.businessName,
    });
    const bodyParameters = getTemplateBodyParameterTexts(template.key, sampleData);
    const recipientMasked = maskPhoneNumber(recipientPhoneNumber);
    logContext = {
      vendorId: String(record.vendor._id),
      templateKey: template.key,
      templateName: existing.metaTemplateName,
      phoneNumberIdPresent: Boolean(config.phoneNumberId),
      recipientMasked,
    };

    console.log("[Meta Test Send]", {
      ...logContext,
      templateStatus: existing.status,
    });

    const result = await sendTemplateMessage({
      phoneNumberId: config.phoneNumberId,
      accessToken,
      recipientPhoneNumber,
      templateName: existing.metaTemplateName,
      languageCode: existing.language || template.language,
      bodyParameters,
    });
    const metaMessageId = String(result?.messages?.[0]?.id || "");
    const testMessage = buildSuccessfulTestMessageState(config.testMessage);
    const whatsappBusiness = {
      ...config,
      enabled: false,
      testMessage,
    };

    await record.Model.updateOne(
      { _id: record.vendor._id },
      { $set: { whatsappBusiness } }
    );

    console.log("[Meta Test Send Success]", {
      vendorId: String(record.vendor._id),
      templateKey: template.key,
      messageId: metaMessageId,
      recipientMasked,
    });

    return res.json({
      success: true,
      status: "submitted",
      data: sanitizeWhatsappBusinessConfig(whatsappBusiness),
      messageId: metaMessageId,
      message: "Test message submitted successfully.",
    });
  } catch (error) {
    let responseConfig = null;
    console.error("Failed to send WhatsApp test message:", error.code || error.message || error);
    if (error.code === "meta_test_send_failed") {
      const meta = formatSafeMetaForResponse(error.metaError);
      console.error("[Meta Test Send Error]", {
        ...logContext,
        httpStatus: meta?.status || null,
        metaType: meta?.type || "",
        metaCode: meta?.code || "",
        metaSubcode: meta?.subcode || "",
        metaMessage: meta?.message || "",
        metaUserTitle: meta?.userTitle || "",
        metaUserMessage: meta?.userMessage || "",
        fbtraceId: meta?.fbtraceId || "",
        hasErrorData: Boolean(meta?.hasErrorData),
      });

      if (record && config) {
        const testMessage = buildFailedTestMessageState(config.testMessage, error);
        const whatsappBusiness = {
          ...config,
          enabled: false,
          testMessage,
        };
        responseConfig = sanitizeWhatsappBusinessConfig(whatsappBusiness);

        await record.Model.updateOne(
          { _id: record.vendor._id },
          { $set: { whatsappBusiness } }
        ).catch((updateError) => {
          console.error(
            "Failed to persist WhatsApp test message failure:",
            updateError.message || updateError
          );
        });
      }
    }
    return sendTestMessageError(res, error, responseConfig);
  }
}

async function registerWhatsappPhoneNumber(req, res) {
  let logContext = {
    vendorId: "",
    phoneNumberId: "",
  };

  try {
    const record = await findVendorRecord(getAuthorizedVendorId(req));
    if (!record) return sendVendorNotFound(res);

    const config = normalizeWhatsappBusinessConfig(record.vendor.whatsappBusiness);
    assertConnectedMetaConfig(config);

    if (!config.phoneNumberId) {
      const error = new Error("Meta phone number ID is required");
      error.code = "meta_whatsapp_connection_incomplete";
      throw error;
    }

    logContext = {
      vendorId: String(record.vendor._id),
      phoneNumberId: String(config.phoneNumberId),
    };

    const hadStoredPin = Boolean(config.metaRegistration?.pinEncrypted);
    const { pin, pinEncrypted } = getOrCreateRegistrationPin(config);
    if (!hadStoredPin) {
      await record.Model.updateOne(
        { _id: record.vendor._id },
        { $set: { "whatsappBusiness.metaRegistration.pinEncrypted": pinEncrypted } }
      );
      config.metaRegistration = {
        ...(config.metaRegistration || {}),
        pinEncrypted,
      };
    }
    let statusBefore = null;

    try {
      statusBefore = await getPhoneNumberStatusWithSystemUserToken({
        phoneNumberId: config.phoneNumberId,
      });
    } catch (error) {
      statusBefore = null;
    }

    const beforeRegistrationStatus = mapPhoneRegistrationStatus(
      statusBefore,
      config.phoneRegistrationStatus || "unknown"
    );
    let registrationResult = null;

    if (
      beforeRegistrationStatus !== "registration_submitted" &&
      beforeRegistrationStatus !== "active"
    ) {
      registrationResult = await registerPhoneNumberWithSystemUserToken({
        phoneNumberId: config.phoneNumberId,
        pin,
      });
    }

    const statusAfter = await getPhoneNumberStatusWithSystemUserToken({
      phoneNumberId: config.phoneNumberId,
    });
    const submittedStatus = registrationResult?.success
      ? getSubmittedPhoneRegistrationStatus()
      : beforeRegistrationStatus;
    const mappedStatus = mapPhoneRegistrationStatus(statusAfter, submittedStatus);
    const readinessResult = applyPhoneRegistrationReadiness({
      config: {
        ...config,
        phoneRegistrationStatus: mappedStatus,
      },
      phoneStatus: statusAfter,
    });
    const registrationStatus = readinessResult.config.phoneRegistrationStatus;
    const registeredAt =
      registrationStatus === "active"
        ? readinessResult.config.phoneRegisteredAt || config.phoneRegisteredAt || new Date()
        : config.phoneRegisteredAt || null;
    const whatsappBusiness = {
      ...config,
      enabled: false,
      phoneRegistrationStatus: registrationStatus,
      phoneRegisteredAt: registeredAt,
      phoneRegistrationLastError: "",
      metaRegistration: {
        ...(config.metaRegistration || {}),
        pinEncrypted,
      },
    };
    const responseWhatsappBusiness = {
      ...whatsappBusiness,
      messagingReadiness: buildMessagingReadiness(statusAfter?.health_status || null),
    };

    await record.Model.updateOne(
      { _id: record.vendor._id },
      { $set: { whatsappBusiness } }
    );

    console.log("[Meta Phone Registration Success]", {
      ...logContext,
      registrationStatus,
      registeredAt,
    });

    return res.json({
      success: true,
      data: sanitizeWhatsappBusinessConfig(responseWhatsappBusiness),
      phoneStatus: {
        displayPhoneNumber: statusAfter?.display_phone_number || "",
        verifiedName: statusAfter?.verified_name || "",
        codeVerificationStatus: statusAfter?.code_verification_status || "",
        qualityRating: statusAfter?.quality_rating || "",
        platformType: statusAfter?.platform_type || "",
        throughput: statusAfter?.throughput || null,
      },
      message: "WhatsApp number registration request completed.",
    });
  } catch (error) {
    const meta = formatSafeMetaForResponse(error.metaError);
    console.error("Failed to register WhatsApp phone number:", error.code || error.message || error);
    if (error.metaError) {
      console.error("[Meta Phone Registration Error]", {
        ...logContext,
        httpStatus: meta?.status || null,
        metaType: meta?.type || "",
        metaCode: meta?.code || "",
        metaSubcode: meta?.subcode || "",
        metaMessage: meta?.message || "",
        metaUserTitle: meta?.userTitle || "",
        metaUserMessage: meta?.userMessage || "",
        fbtraceId: meta?.fbtraceId || "",
      });
    }
    return sendPhoneRegistrationError(res, error);
  }
}

async function prepareWhatsappBusinessConnect(req, res) {
  try {
    const record = await findVendorRecord(getAuthorizedVendorId(req));
    if (!record) return sendVendorNotFound(res);

    const current = normalizeWhatsappBusinessConfig(record.vendor.whatsappBusiness);
    const whatsappBusiness = {
      ...current,
      enabled: false,
      provider: "msg91",
      connectionStatus: "connecting",
      templateStatus: current.templateStatus || "not_started",
      lastError: "",
    };

    await record.Model.updateOne(
      { _id: record.vendor._id },
      { $set: { whatsappBusiness } }
    );

    return res.json({
      success: true,
      data: sanitizeWhatsappBusinessConfig(whatsappBusiness),
      message: "WhatsApp Business connection setup has been started",
    });
  } catch (error) {
    console.error("Failed to prepare WhatsApp Business connection:", error.message || error);
    return res.status(500).json({
      success: false,
      message: "Failed to start WhatsApp Business connection setup",
    });
  }
}

function getMetaSignupValue(signupData, keys) {
  const source = signupData && typeof signupData === "object" ? signupData : {};
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
}

function getTokenExpiryDate(expiresIn) {
  const seconds = Number(expiresIn);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(Date.now() + seconds * 1000);
}

async function completeMetaWhatsappConnection(req, res) {
  let record = null;

  try {
    record = await findVendorRecord(getAuthorizedVendorId(req));
    if (!record) return sendVendorNotFound(res);

    const current = normalizeWhatsappBusinessConfig(record.vendor.whatsappBusiness);
    await record.Model.updateOne(
      { _id: record.vendor._id },
      {
        $set: {
          whatsappBusiness: {
            ...current,
            enabled: false,
            provider: "msg91",
            connectionStatus: "connecting",
            lastError: "",
          },
        },
      }
    );

    const signupData = req.body?.signupData || {};
    const code = String(req.body?.code || req.body?.authCode || "").trim();
    const requestedWabaId = String(req.body?.wabaId || "").trim();
    const requestedPhoneNumberId = String(req.body?.phoneNumberId || "").trim();

    if (!code || !requestedWabaId || !requestedPhoneNumberId) {
      const error = new Error("Meta authorization code, WABA ID, and Phone Number ID are required");
      error.code = "meta_completion_payload_invalid";
      throw error;
    }

    const tokenResult = await exchangeEmbeddedSignupCode(code);
    const accessToken = String(tokenResult?.access_token || "").trim();

    const businessId = getMetaSignupValue(signupData, [
      "business_id",
      "businessId",
      "businessID",
    ]);
    const wabaId = requestedWabaId || getMetaSignupValue(signupData, [
      "waba_id",
      "wabaId",
      "whatsapp_business_account_id",
    ]);
    const phoneNumberId = requestedPhoneNumberId || getMetaSignupValue(signupData, [
      "phone_number_id",
      "phoneNumberId",
      "phoneID",
    ]);

    const validation = await validateConnection({
      accessToken,
      wabaId,
      phoneNumberId,
    });

    if (!validation.isValid) {
      const error = new Error("Meta WhatsApp connection could not be validated");
      error.code = "meta_connection_validation_failed";
      throw error;
    }

    const selectedPhone = validation.selectedPhone || {};
    const account = validation.account || {};
    const whatsappBusiness = {
      ...current,
      enabled: false,
      provider: "meta",
      connectionStatus: "connected",
      businessId,
      wabaId: String(account.id || wabaId),
      phoneNumberId: String(selectedPhone.id || phoneNumberId),
      displayPhoneNumber: selectedPhone.display_phone_number || "",
      displayName: selectedPhone.verified_name || account.name || "",
      templateStatus: "not_configured",
      connectedAt: new Date(),
      lastError: "",
      metaAuth: {
        accessTokenEncrypted: encryptMetaAccessToken(accessToken),
        tokenType: tokenResult?.token_type || "bearer",
        expiresAt: getTokenExpiryDate(tokenResult?.expires_in),
      },
    };

    await record.Model.updateOne(
      { _id: record.vendor._id },
      { $set: { whatsappBusiness } }
    );

    return res.json({
      success: true,
      data: sanitizeWhatsappBusinessConfig(whatsappBusiness),
      returnUrl: req.whatsappConnectAuth?.returnUrl || "",
      message: "WhatsApp Business connection completed",
    });
  } catch (error) {
    console.error("Failed to complete Meta WhatsApp connection:", error.code || error.message || error);

    if (record) {
      const current = normalizeWhatsappBusinessConfig(record.vendor.whatsappBusiness);
      await record.Model.updateOne(
        { _id: record.vendor._id },
        {
          $set: {
            whatsappBusiness: {
              ...current,
              enabled: false,
              provider: "msg91",
              connectionStatus: "error",
              lastError: error.code || error.message || "meta_connection_failed",
            },
          },
        }
      ).catch((updateError) => {
        console.error("Failed to persist Meta connection error:", updateError.message || updateError);
      });
    }

    const status = error.code === "meta_not_configured" ? 503 : 400;
    return res.status(status).json({
      success: false,
      message:
        "Your WhatsApp Business connection could not be completed. YNOT will continue sending bills from the YNOT WhatsApp number.",
      code: error.code || "meta_connection_failed",
    });
  }
}

async function disconnectWhatsappBusiness(req, res) {
  try {
    const record = await findVendorRecord(getAuthorizedVendorId(req));
    if (!record) return sendVendorNotFound(res);

    const whatsappBusiness = getDefaultWhatsappBusinessConfig();
    await record.Model.updateOne(
      { _id: record.vendor._id },
      { $set: { whatsappBusiness } }
    );

    return res.json({
      success: true,
      data: sanitizeWhatsappBusinessConfig(whatsappBusiness),
      message: "WhatsApp Business connection has been disconnected",
    });
  } catch (error) {
    console.error("Failed to disconnect WhatsApp Business:", error.message || error);
    return res.status(500).json({
      success: false,
      message: "Failed to disconnect WhatsApp Business",
    });
  }
}

module.exports = {
  activateWhatsappBusinessBilling,
  checkWhatsappTemplateStatus,
  deactivateWhatsappBusinessBilling,
  disconnectWhatsappBusiness,
  completeMetaWhatsappConnection,
  createMetaConnectSession,
  getMetaDiagnostics,
  getMetaPhoneReadinessComparisonDiagnostics,
  getMetaSystemUserAssetDiagnostics,
  getMetaEmbeddedSignupConfig,
  getWhatsappTemplateLibrary,
  getWhatsappTemplatePreview,
  getWhatsappBusinessConfig,
  prepareWhatsappBusinessConnect,
  registerWhatsappPhoneNumber,
  runSystemUserPhoneRegistrationDiagnostic,
  sendWhatsappTemplateTestMessage,
  submitWhatsappTemplate,
  updateWhatsappBusinessConfig,
};
