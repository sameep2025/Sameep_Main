const express = require("express");
const mongoose = require("mongoose");
const DummyVendor = require("../models/DummyVendor");
const VendorPaymentConfig = require("../models/VendorPaymentConfig");
const { requireVendorAccessFromExistingAuth } = require("../utils/vendorWriteAuth");

const router = express.Router();

function maskSecret(value) {
  const secret = String(value || "").trim();
  if (!secret) return "";
  if (secret.length <= 4) return "****";
  return `${"*".repeat(Math.max(0, secret.length - 4))}${secret.slice(-4)}`;
}

function getModeScopedCredentials(config, modeOverride = "") {
  const mode = String(modeOverride || config?.razorpay?.mode || "test").trim().toLowerCase() === "live" ? "live" : "test";
  const scoped = config?.razorpay?.[mode] || {};
  const fallbackKeyId = String(config?.razorpay?.keyId || "").trim();
  const fallbackKeySecret = String(config?.razorpay?.keySecret || "").trim();

  return {
    mode,
    keyId: String(scoped?.keyId || fallbackKeyId || ""),
    keySecret: String(scoped?.keySecret || fallbackKeySecret || ""),
  };
}

function sanitizePaymentConfig(doc) {
  const config = doc && typeof doc.toObject === "function" ? doc.toObject() : doc || {};
  const active = getModeScopedCredentials(config);
  const test = getModeScopedCredentials(config, "test");
  const live = getModeScopedCredentials(config, "live");

  return {
    paymentEnabled: Boolean(config.paymentEnabled),
    provider: String(config.provider || ""),
    razorpay: {
      accountName: String(config?.razorpay?.accountName || ""),
      mode: active.mode,
      keyId: active.keyId,
      keySecretMasked: maskSecret(active.keySecret),
      hasKeySecret: Boolean(active.keySecret),
      environments: {
        test: {
          keyId: test.keyId,
          keySecretMasked: maskSecret(test.keySecret),
          hasKeySecret: Boolean(test.keySecret),
        },
        live: {
          keyId: live.keyId,
          keySecretMasked: maskSecret(live.keySecret),
          hasKeySecret: Boolean(live.keySecret),
        },
      },
    },
    updatedAt: config?.updatedAt || null,
  };
}

function sanitizePublicPaymentConfig(doc) {
  const config = doc && typeof doc.toObject === "function" ? doc.toObject() : doc || {};
  const active = getModeScopedCredentials(config);
  const enabled = Boolean(
    config.paymentEnabled &&
    config.provider === "razorpay" &&
    active.keyId &&
    active.keySecret
  );

  return {
    paymentEnabled: enabled,
    provider: enabled ? "razorpay" : "",
    razorpay: {
      accountName: enabled ? String(config?.razorpay?.accountName || "") : "",
      mode: active.mode,
      keyId: enabled ? active.keyId : "",
    },
  };
}

function assertAllowedKeys(value, allowed, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length) {
    const error = new Error(`${fieldName} contains unsupported fields`);
    error.status = 400;
    throw error;
  }
}

function validateCredential(value, fieldName, maxLength) {
  const normalized = String(value || "").trim();
  if (normalized.length > maxLength || /[\u0000-\u001f\u007f]/.test(normalized)) {
    const error = new Error(`${fieldName} is invalid`);
    error.status = 400;
    throw error;
  }
  return normalized;
}

async function loadVendor(vendorId) {
  if (!mongoose.Types.ObjectId.isValid(vendorId)) {
    const error = new Error("Invalid vendorId");
    error.status = 400;
    throw error;
  }
  const vendor = await DummyVendor.findById(vendorId).lean();
  if (!vendor) {
    const error = new Error("Vendor not found");
    error.status = 404;
    throw error;
  }
  return vendor;
}

router.get("/public/:vendorId", async (req, res) => {
  try {
    const { vendorId } = req.params;
    await loadVendor(vendorId);
    const config = await VendorPaymentConfig.findOne({ vendorId }).lean();
    return res.json({ success: true, vendorId, config: sanitizePublicPaymentConfig(config) });
  } catch (err) {
    return res.status(err.status || 500).json({
      success: false,
      message: err.status ? err.message : "Server error",
    });
  }
});

router.get(
  "/:vendorId",
  requireVendorAccessFromExistingAuth((req) => req.params.vendorId),
  async (req, res) => {
  try {
    const { vendorId } = req.params;
    await loadVendor(vendorId);

    const config = await VendorPaymentConfig.findOne({ vendorId }).lean();
    return res.json({
      success: true,
      vendorId,
      config: sanitizePaymentConfig(config),
    });
  } catch (err) {
    console.error("GET /vendor-payment-config/:vendorId error:", err);
    return res.status(err.status || 500).json({
      success: false,
      message: err.status ? err.message : "Server error",
    });
  }
});

router.put(
  "/:vendorId",
  requireVendorAccessFromExistingAuth((req) => req.params.vendorId),
  async (req, res) => {
  try {
    const { vendorId } = req.params;
    await loadVendor(vendorId);

    assertAllowedKeys(req.body, ["paymentEnabled", "provider", "razorpay"], "Payment configuration");
    assertAllowedKeys(req.body?.razorpay, ["accountName", "mode", "environments"], "Razorpay configuration");
    assertAllowedKeys(req.body?.razorpay?.environments, ["test", "live"], "Razorpay environments");
    assertAllowedKeys(req.body?.razorpay?.environments?.test, ["keyId", "keySecret"], "Razorpay test credentials");
    assertAllowedKeys(req.body?.razorpay?.environments?.live, ["keyId", "keySecret"], "Razorpay live credentials");

    if (typeof req.body?.paymentEnabled !== "boolean") {
      return res.status(400).json({ success: false, message: "paymentEnabled must be boolean" });
    }
    if (!["", "razorpay"].includes(String(req.body?.provider || "").trim().toLowerCase())) {
      return res.status(400).json({ success: false, message: "Unsupported payment provider" });
    }
    if (!["test", "live"].includes(String(req.body?.razorpay?.mode || "").trim().toLowerCase())) {
      return res.status(400).json({ success: false, message: "Razorpay mode must be test or live" });
    }

    const paymentEnabled = Boolean(req.body?.paymentEnabled);
    const provider = String(req.body?.provider || "").trim().toLowerCase() === "razorpay" ? "razorpay" : "";
    const accountName = validateCredential(req.body?.razorpay?.accountName, "Razorpay account name", 120);
    const mode = String(req.body?.razorpay?.mode || "").trim().toLowerCase() === "live" ? "live" : "test";
    const incomingTestKeyId = validateCredential(req.body?.razorpay?.environments?.test?.keyId, "Razorpay test key ID", 200);
    const incomingTestKeySecret = validateCredential(req.body?.razorpay?.environments?.test?.keySecret, "Razorpay test key secret", 500);
    const incomingLiveKeyId = validateCredential(req.body?.razorpay?.environments?.live?.keyId, "Razorpay live key ID", 200);
    const incomingLiveKeySecret = validateCredential(req.body?.razorpay?.environments?.live?.keySecret, "Razorpay live key secret", 500);

    const existing = await VendorPaymentConfig.findOne({ vendorId });
    const nextDoc = existing || new VendorPaymentConfig({ vendorId });
    const existingTest = getModeScopedCredentials(existing || {}, "test");
    const existingLive = getModeScopedCredentials(existing || {}, "live");
    const activeKeyId = mode === "live" ? incomingLiveKeyId || existingLive.keyId : incomingTestKeyId || existingTest.keyId;
    const activeKeySecret = mode === "live"
      ? incomingLiveKeySecret || existingLive.keySecret
      : incomingTestKeySecret || existingTest.keySecret;
    if (paymentEnabled && provider === "razorpay" && (!activeKeyId || !activeKeySecret)) {
      return res.status(400).json({
        success: false,
        message: `Complete Razorpay ${mode} credentials before enabling payments`,
      });
    }

    nextDoc.paymentEnabled = paymentEnabled;
    nextDoc.provider = provider;
    nextDoc.razorpay = {
      accountName,
      mode,
      test: {
        keyId: incomingTestKeyId,
        keySecret: incomingTestKeySecret || existingTest.keySecret,
      },
      live: {
        keyId: incomingLiveKeyId,
        keySecret: incomingLiveKeySecret || existingLive.keySecret,
      },
    };

    await nextDoc.save();

    return res.json({
      success: true,
      vendorId,
      config: sanitizePaymentConfig(nextDoc),
    });
  } catch (err) {
    console.error("PUT /vendor-payment-config/:vendorId error:", err);
    return res.status(err.status || 500).json({
      success: false,
      message: err.status ? err.message : "Server error",
    });
  }
});

module.exports = router;
