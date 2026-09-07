const mongoose = require("mongoose");
const DummyVendor = require("../models/DummyVendor");
const Vendor = require("../models/Vendor");
const { getDefaultWhatsappBusinessConfig } = require("../models/whatsappBusinessConfigSchema");
const { getPublicMetaWhatsAppConfig } = require("../config/metaWhatsAppConfig");
const { decryptMetaAccessToken, encryptMetaAccessToken } = require("../services/metaTokenStorage");
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
  getTemplateStatus,
  findTemplateByName,
  runMetaConfigurationDiagnostics,
  sendTemplateMessage,
  validateConnection,
} = require("../services/metaWhatsAppService");

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

function sanitizeWhatsappBusinessConfig(config) {
  const normalized = normalizeWhatsappBusinessConfig(config);

  return {
    enabled: Boolean(normalized.enabled),
    provider: normalized.provider === "meta" ? "meta" : "msg91",
    connectionStatus: normalized.connectionStatus || "not_connected",
    displayPhoneNumber: normalized.displayPhoneNumber || "",
    displayName: normalized.displayName || "",
    templateStatus: normalized.templateStatus || "",
    connectedAt: normalized.connectedAt || null,
    lastError: normalized.lastError
      ? "Connection needs attention. Please contact YNOT support."
      : "",
  };
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

function normalizeInternationalPhone(value) {
  return String(value || "").trim().replace(/[\s()-]/g, "");
}

function isValidInternationalPhone(value) {
  return /^\+[1-9]\d{7,14}$/.test(normalizeInternationalPhone(value));
}

function maskPhoneNumber(value) {
  const phone = normalizeInternationalPhone(value);
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

    return res.json({
      success: true,
      data: sanitizeWhatsappBusinessConfig(record.vendor.whatsappBusiness),
    });
  } catch (error) {
    console.error("Failed to fetch WhatsApp Business config:", error.message || error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch WhatsApp Business configuration",
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
  try {
    const template = getMasterTemplate(req.params.masterTemplateKey);
    if (!template) {
      const error = new Error("Template not found");
      error.code = "master_template_not_found";
      throw error;
    }

    const recipientPhoneNumber = normalizeInternationalPhone(req.body?.recipientPhoneNumber);
    if (!isValidInternationalPhone(recipientPhoneNumber)) {
      const error = new Error("Recipient phone number must use international format");
      error.code = "recipient_phone_invalid";
      throw error;
    }

    const record = await findVendorRecord(getAuthorizedVendorId(req));
    if (!record) return sendVendorNotFound(res);

    const config = normalizeWhatsappBusinessConfig(record.vendor.whatsappBusiness);
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

    console.log("[Meta Test Send]", {
      vendorId: String(record.vendor._id),
      phoneNumberIdPresent: Boolean(config.phoneNumberId),
      templateKey: template.key,
      templateName: existing.metaTemplateName,
      templateStatus: existing.status,
      recipientMasked,
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
    const lastTestSend = {
      templateKey: template.key,
      recipientMasked,
      sentAt: new Date(),
      metaMessageId,
    };
    const whatsappBusiness = {
      ...config,
      enabled: false,
      lastTestSend,
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
      messageId: metaMessageId,
      message: "Test message submitted successfully.",
    });
  } catch (error) {
    console.error("Failed to send WhatsApp test message:", error.code || error.message || error);
    return sendTemplateError(res, error);
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
  checkWhatsappTemplateStatus,
  disconnectWhatsappBusiness,
  completeMetaWhatsappConnection,
  createMetaConnectSession,
  getMetaDiagnostics,
  getMetaEmbeddedSignupConfig,
  getWhatsappTemplateLibrary,
  getWhatsappTemplatePreview,
  getWhatsappBusinessConfig,
  prepareWhatsappBusinessConnect,
  sendWhatsappTemplateTestMessage,
  submitWhatsappTemplate,
  updateWhatsappBusinessConfig,
};
