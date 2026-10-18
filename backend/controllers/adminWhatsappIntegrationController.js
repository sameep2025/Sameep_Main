const {
  buildAdminSnapshot,
  buildStoredPinValidationOutcome,
  findExactVendorById,
  readLiveMetaStatus,
  validateStoredPin,
} = require("../services/adminWhatsappIntegrationService");
const {
  buildRecoveryCapability,
  createRecoveryChallenge,
  executeRecovery,
  listRecoveryHistory,
} = require("../services/adminWhatsappRecoveryService");
const AdminUser = require("../models/AdminUser");

async function findExactVendor(vendorId) {
  return findExactVendorById(vendorId);
}

async function getAdminCapability(adminId) {
  const admin = await AdminUser.findById(adminId).select("permissions").lean();
  return buildRecoveryCapability(admin);
}

async function getAdminWhatsappIntegration(req, res) {
  try {
    const result = await findExactVendor(req.params.vendorId);
    if (result.status === "invalid") {
      return res.status(400).json({ success: false, code: "vendor_id_invalid" });
    }
    if (result.matches.length !== 1) {
      return res.status(result.matches.length ? 409 : 404).json({
        success: false,
        code: result.matches.length ? "vendor_identity_ambiguous" : "vendor_not_found",
      });
    }

    const vendor = result.matches[0];
    const liveMeta = await readLiveMetaStatus(vendor.whatsappBusiness || {});
    return res.json({
      success: true,
      data: {
        ...buildAdminSnapshot({ vendor, liveMeta }),
        recoveryCapability: await getAdminCapability(req.admin.id),
      },
    });
  } catch (error) {
    console.error("[Admin WhatsApp Integration Read Error]", {
      adminId: String(req.admin?.id || ""),
      vendorId: String(req.params.vendorId || ""),
      code: String(error?.code || "admin_whatsapp_integration_read_failed"),
    });
    return res.status(500).json({
      success: false,
      code: "admin_whatsapp_integration_read_failed",
    });
  }
}

async function createAdminWhatsappRecoveryChallenge(req, res) {
  try {
    const result = await createRecoveryChallenge({
      adminId: req.admin.id,
      vendorId: req.params.vendorId,
      password: req.body?.password,
    });
    if (!result.ok) return res.status(result.status || 409).json(result);
    return res.json(result);
  } catch (error) {
    console.error("[Admin WhatsApp Recovery Challenge Error]", {
      adminId: String(req.admin?.id || ""),
      vendorId: String(req.params.vendorId || ""),
      code: String(error?.code || "recovery_challenge_failed"),
    });
    return res.status(500).json({ ok: false, code: "recovery_challenge_failed" });
  }
}

async function recoverAdminWhatsappRegistration(req, res) {
  try {
    const result = await executeRecovery({
      adminId: req.admin.id,
      vendorId: req.params.vendorId,
      challengeToken: req.body?.challengeToken,
      confirmation: req.body?.confirmation,
    });
    return res.status(result.ok ? 200 : result.status || 409).json(result);
  } catch (error) {
    console.error("[Admin WhatsApp Recovery Error]", {
      adminId: String(req.admin?.id || ""),
      vendorId: String(req.params.vendorId || ""),
      code: String(error?.code || "registration_recovery_failed"),
    });
    return res.status(500).json({ ok: false, code: "registration_recovery_failed" });
  }
}

async function getAdminWhatsappRecoveryHistory(req, res) {
  try {
    const capability = await getAdminCapability(req.admin.id);
    if (!capability.authorized) {
      return res.status(403).json({ success: false, code: "recovery_permission_required" });
    }
    const vendor = await findExactVendor(req.params.vendorId);
    if (vendor.matches.length !== 1) {
      return res.status(vendor.matches.length ? 409 : 404).json({
        success: false,
        code: vendor.matches.length ? "vendor_identity_ambiguous" : "vendor_not_found",
      });
    }
    const data = await listRecoveryHistory({
      vendorId: req.params.vendorId,
      page: req.query.page,
      limit: req.query.limit,
    });
    return res.json({ success: true, data });
  } catch (error) {
    console.error("[Admin WhatsApp Recovery History Error]", {
      adminId: String(req.admin?.id || ""),
      vendorId: String(req.params.vendorId || ""),
      code: String(error?.code || "recovery_history_failed"),
    });
    return res.status(500).json({ success: false, code: "recovery_history_failed" });
  }
}

async function validateAdminStoredWhatsappPin(req, res) {
  try {
    const result = await findExactVendor(req.params.vendorId);
    if (result.status === "invalid") {
      return res.status(400).json({ result: "BLOCKED", code: "vendor_id_invalid" });
    }
    if (result.matches.length !== 1) {
      return res.status(result.matches.length ? 409 : 404).json({
        result: "BLOCKED",
        code: result.matches.length ? "vendor_identity_ambiguous" : "vendor_not_found",
      });
    }

    const config = result.matches[0].whatsappBusiness || {};
    if (
      config.provider !== "meta" ||
      !String(config.wabaId || "").trim() ||
      !String(config.phoneNumberId || "").trim()
    ) {
      return res.status(409).json({
        result: "BLOCKED",
        code: "meta_connection_identifiers_missing",
      });
    }

    const storedPinResult = validateStoredPin(config);
    const liveMeta = storedPinResult.code === "encrypted_pin_missing"
      ? await readLiveMetaStatus(config)
      : null;
    return res.json(buildStoredPinValidationOutcome(storedPinResult, liveMeta));
  } catch (error) {
    console.error("[Admin WhatsApp PIN Preflight Error]", {
      adminId: String(req.admin?.id || ""),
      vendorId: String(req.params.vendorId || ""),
      code: String(error?.code || "stored_pin_validation_failed"),
    });
    return res.status(500).json({
      result: "BLOCKED",
      code: "stored_pin_validation_failed",
    });
  }
}

module.exports = {
  createAdminWhatsappRecoveryChallenge,
  getAdminWhatsappIntegration,
  getAdminWhatsappRecoveryHistory,
  recoverAdminWhatsappRegistration,
  validateAdminStoredWhatsappPin,
};
