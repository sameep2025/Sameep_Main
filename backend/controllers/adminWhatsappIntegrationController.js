const mongoose = require("mongoose");
const DummyVendor = require("../models/DummyVendor");
const Vendor = require("../models/Vendor");
const {
  buildAdminSnapshot,
  buildStoredPinValidationOutcome,
  readLiveMetaStatus,
  validateStoredPin,
} = require("../services/adminWhatsappIntegrationService");

async function findExactVendor(vendorId) {
  const id = String(vendorId || "").trim();
  if (!mongoose.Types.ObjectId.isValid(id)) return { status: "invalid", matches: [] };

  const projection = "businessName whatsappBusiness";
  const [vendors, dummyVendors] = await Promise.all([
    Vendor.find({ _id: id }).select(projection).lean(),
    DummyVendor.find({ _id: id }).select(projection).lean(),
  ]);
  const matches = [...vendors, ...dummyVendors];
  return { status: matches.length === 1 ? "matched" : "ambiguous", matches };
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
      data: buildAdminSnapshot({ vendor, liveMeta }),
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
  getAdminWhatsappIntegration,
  validateAdminStoredWhatsappPin,
};
