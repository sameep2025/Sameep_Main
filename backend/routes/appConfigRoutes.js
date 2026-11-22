const express = require("express");
const router = express.Router();
const AppConfig = require("../models/AppConfig");
const { requireAdminAuth } = require("../utils/adminAuthMiddleware");
const {
  getAdminPasscodeStatus,
  setAdminPasscode,
} = require("../services/adminPasscodeService");
const {
  getAllowedTemplateProfiles,
  getStoredWhatsAppBillingConfig,
  normalizeWhatsAppBillingConfig,
} = require("../utils/whatsappBillingConfig");
const {
  getStoredWhatsAppEnquiryConfig,
  normalizeWhatsAppEnquiryConfig,
} = require("../utils/whatsappEnquiryConfig");
const { deleteS3ObjectByKey } = require("../utils/s3Upload");
const {
  buildPublicPromotionalPosters,
  collectRemovedPosterKeys,
  isManagedPosterKey,
  normalizePromotionalPosters,
} = require("../services/promotionalPosterConfig");

// Helper to get a config value by key, or null if not set
async function getConfigValue(key) {
  const doc = await AppConfig.findOne({ key }).lean();
  return doc ? doc.value : null;
}

function normalizePublicSiteContact(value) {
  const config = value && typeof value === "object" ? value : {};

  return {
    addressLine1:
      typeof config.addressLine1 === "string" ? config.addressLine1.trim() : "",
    addressLine2:
      typeof config.addressLine2 === "string" ? config.addressLine2.trim() : "",
    phone: typeof config.phone === "string" ? config.phone.trim() : "",
  };
}

function normalizeWhatsAppBillingInput(value) {
  const config = normalizeWhatsAppBillingConfig(value);

  return {
    templateProfile: getAllowedTemplateProfiles().includes(config.templateProfile)
      ? config.templateProfile
      : "legacy_7_param",
    templateName: config.templateName,
    language: config.language,
    buttonIndex:
      Number.isFinite(config.buttonIndex) && config.buttonIndex >= 0
        ? config.buttonIndex
        : 0,
    publicBillBaseUrl: config.publicBillBaseUrl,
    ttlDays:
      Number.isFinite(config.ttlDays) && config.ttlDays > 0
        ? Math.floor(config.ttlDays)
        : 30,
    bodyVariables: Array.isArray(config.bodyVariables) ? config.bodyVariables : [],
    buttonUrlVariable: config.buttonUrlVariable || "",
  };
}

function normalizeWhatsAppEnquiryInput(value) {
  const config = normalizeWhatsAppEnquiryConfig(value);

  return {
    enabled: config.enabled === undefined ? true : Boolean(config.enabled),
    templateName: config.templateName,
    language: config.language || "en",
    body: config.body,
  };
}

// GET current session validity config
// Returns: { availableHours: number[], selectedHour: number | null }
router.get("/session-validity", async (req, res) => {
  try {
    const config = (await getConfigValue("sessionValidity")) || {};
    const availableHours = Array.isArray(config.availableHours)
      ? config.availableHours
      : [];
    const selectedHour = typeof config.selectedHour === "number"
      ? config.selectedHour
      : null;

    res.json({ availableHours, selectedHour });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Returns configuration state only; credentials never leave the backend.
router.get("/admin-passcode", requireAdminAuth, async (req, res) => {
  try {
    res.json(await getAdminPasscodeStatus());
  } catch (err) {
    res.status(500).json({ message: "Failed to load admin passcode status" });
  }
});

// GET public site contact details
// Returns: { addressLine1: string, addressLine2: string, phone: string }
router.get("/public-site-contact", async (req, res) => {
  try {
    const value = await getConfigValue("publicSiteContact");
    res.json(normalizePublicSiteContact(value));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/promotional-posters/public", async (req, res) => {
  try {
    const value = await getConfigValue("promotionalPosters");
    return res.json({ posters: buildPublicPromotionalPosters(value) });
  } catch (err) {
    return res.status(500).json({ message: "Failed to load promotional posters" });
  }
});

router.get("/promotional-posters", requireAdminAuth, async (req, res) => {
  try {
    const value = await getConfigValue("promotionalPosters");
    return res.json({
      posters: normalizePromotionalPosters(Array.isArray(value) ? value : []),
    });
  } catch (err) {
    return res.status(500).json({ message: "Failed to load promotional poster configuration" });
  }
});

router.put("/promotional-posters", requireAdminAuth, async (req, res) => {
  try {
    const previousValue = await getConfigValue("promotionalPosters");
    const posters = normalizePromotionalPosters(req.body?.posters, { createIds: true });
    const removedKeys = collectRemovedPosterKeys(previousValue, posters);

    await AppConfig.findOneAndUpdate(
      { key: "promotionalPosters" },
      { key: "promotionalPosters", value: posters },
      { new: true, upsert: true, runValidators: true }
    ).lean();

    const cleanupResults = await Promise.allSettled(
      removedKeys.map((key) => deleteS3ObjectByKey(key))
    );
    const cleanupFailed = cleanupResults.filter((result) => result.status === "rejected").length;

    return res.json({ posters, cleanupFailed });
  } catch (err) {
    return res.status(400).json({
      message: err?.message || "Failed to save promotional posters",
    });
  }
});

router.delete("/promotional-posters/upload", requireAdminAuth, async (req, res) => {
  try {
    const key = String(req.body?.key || "").trim();
    if (!isManagedPosterKey(key)) {
      return res.status(400).json({ message: "Invalid promotional poster object key" });
    }
    const configuredPosters = await getConfigValue("promotionalPosters");
    if (
      Array.isArray(configuredPosters) &&
      configuredPosters.some((poster) => String(poster?.key || "").trim() === key)
    ) {
      return res.status(409).json({
        message: "Configured promotional posters must be removed through poster management",
      });
    }
    await deleteS3ObjectByKey(key);
    return res.json({ removed: true });
  } catch (err) {
    return res.status(500).json({ message: "Failed to remove promotional poster upload" });
  }
});

router.get("/whatsapp-billing", async (req, res) => {
  try {
    const value = await getStoredWhatsAppBillingConfig();
    res.json(
      normalizeWhatsAppBillingInput({
        templateProfile: value.templateProfile,
        templateName: value.templateName,
        language: value.language || "en",
        buttonIndex: value.buttonIndex,
        publicBillBaseUrl: value.publicBillBaseUrl,
        ttlDays: value.ttlDays,
        bodyVariables: value.bodyVariables,
        buttonUrlVariable: value.buttonUrlVariable,
      })
    );
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/whatsapp-enquiry", async (req, res) => {
  try {
    const value = await getStoredWhatsAppEnquiryConfig();
    res.json(
      normalizeWhatsAppEnquiryInput({
        enabled: value.enabled,
        templateName: value.templateName,
        language: value.language || "en",
        body: value.body,
      })
    );
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST to update admin passcode
// Body: { adminPasscode: string } (must be 4-digit string)
router.post("/admin-passcode", requireAdminAuth, async (req, res) => {
  try {
    const { adminPasscode } = req.body || {};
    const code = typeof adminPasscode === "string" ? adminPasscode.trim() : "";

    if (!/^\d{4}$/.test(code)) {
      return res
        .status(400)
        .json({ message: "adminPasscode must be a 4-digit numeric code" });
    }

    await setAdminPasscode(code);
    res.json({ configured: true });
  } catch (err) {
    res.status(400).json({ message: err.message || "Failed to save admin passcode" });
  }
});

// POST to update public site contact details
// Body: { addressLine1?: string, addressLine2?: string, phone?: string }
router.post("/public-site-contact", requireAdminAuth, async (req, res) => {
  try {
    const value = normalizePublicSiteContact(req.body);

    const updated = await AppConfig.findOneAndUpdate(
      { key: "publicSiteContact" },
      { key: "publicSiteContact", value },
      { new: true, upsert: true }
    ).lean();

    res.json(normalizePublicSiteContact(updated.value));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post("/whatsapp-billing", requireAdminAuth, async (req, res) => {
  try {
    const value = normalizeWhatsAppBillingInput(req.body);

    if (!value.templateName) {
      return res.status(400).json({ message: "templateName is required" });
    }

    if (value.templateProfile === "view_bill_dynamic_url" && !value.publicBillBaseUrl) {
      return res.status(400).json({ message: "publicBillBaseUrl is required" });
    }

    if (!Array.isArray(value.bodyVariables) || value.bodyVariables.length === 0) {
      return res.status(400).json({ message: "At least one body variable is required" });
    }

    const updated = await AppConfig.findOneAndUpdate(
      { key: "whatsAppBillingConfig" },
      { key: "whatsAppBillingConfig", value },
      { new: true, upsert: true }
    ).lean();

    res.json(normalizeWhatsAppBillingInput(updated.value));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post("/whatsapp-enquiry", requireAdminAuth, async (req, res) => {
  try {
    const value = normalizeWhatsAppEnquiryInput(req.body);

    if (!value.templateName) {
      return res.status(400).json({ message: "templateName is required" });
    }

    if (!value.body) {
      return res.status(400).json({ message: "body is required" });
    }

    const updated = await AppConfig.findOneAndUpdate(
      { key: "whatsAppEnquiryConfig" },
      { key: "whatsAppEnquiryConfig", value },
      { new: true, upsert: true }
    ).lean();

    res.json(normalizeWhatsAppEnquiryInput(updated.value));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// POST to update session validity config
// Body: { availableHours: number[], selectedHour: number | null }
router.post("/session-validity", requireAdminAuth, async (req, res) => {
  try {
    let { availableHours, selectedHour } = req.body;

    if (!Array.isArray(availableHours)) {
      availableHours = [];
    }
    // normalize to numbers and unique sorted list
    const normalized = Array.from(
      new Set(
        availableHours
          .map((v) => Number(v))
          .filter((v) => Number.isFinite(v) && v > 0)
      )
    ).sort((a, b) => a - b);

    let finalSelected = null;
    if (selectedHour != null) {
      const num = Number(selectedHour);
      if (normalized.includes(num)) {
        finalSelected = num;
      }
    }

    const value = {
      availableHours: normalized,
      selectedHour: finalSelected,
    };

    const updated = await AppConfig.findOneAndUpdate(
      { key: "sessionValidity" },
      { key: "sessionValidity", value },
      { new: true, upsert: true }
    ).lean();

    res.json(updated.value);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
