const DummyVendor = require("../models/DummyVendor");
const {
  GstSettingsValidationError,
  isGstDraftConfigured,
  sanitizeGstSettings,
  validateGstSettingsPatch,
} = require("../services/vendorGstSettings");
const {
  getGstActivationState,
} = require("../services/gstActivationService");

function getAuthorizedVendorId(req) {
  return req.vendorWriteAuth?.vendorId || req.params?.vendorId || "";
}

async function getGstSettings(req, res) {
  try {
    const vendor = await DummyVendor.findById(getAuthorizedVendorId(req))
      .select("gstSettings")
      .lean();
    if (!vendor) {
      return res.status(404).json({ success: false, message: "Vendor not found" });
    }
    return res.json({
      success: true,
      data: {
        gstSettings: sanitizeGstSettings(vendor),
        draftConfigured: isGstDraftConfigured(vendor),
        activation: getGstActivationState({ vendor }),
      },
    });
  } catch (error) {
    console.error("GET vendor GST settings error:", error?.message || error);
    return res.status(500).json({ success: false, message: "Unable to load GST settings" });
  }
}

async function updateGstSettings(req, res) {
  try {
    const vendorId = getAuthorizedVendorId(req);
    const existing = await DummyVendor.findById(vendorId).select("gstSettings").lean();
    if (!existing) {
      return res.status(404).json({ success: false, message: "Vendor not found" });
    }

    const patch = validateGstSettingsPatch(req.body);
    const merged = { ...sanitizeGstSettings(existing), ...patch };
    if (merged.enabled && !isGstDraftConfigured({ gstSettings: merged })) {
      throw new GstSettingsValidationError(
        "Complete and save valid GST settings before activation",
        "invalid_gst_configuration"
      );
    }
    if (
      merged.gstin &&
      merged.registeredStateCode &&
      merged.gstin.slice(0, 2) !== merged.registeredStateCode
    ) {
      throw new GstSettingsValidationError(
        "GSTIN state code does not match registered state code",
        "gstin_state_code_mismatch"
      );
    }

    const update = {
      "gstSettings.enabled": existing?.gstSettings?.enabled === true,
      "gstSettings.updatedAt": new Date(),
    };
    for (const [field, value] of Object.entries(patch)) {
      update[`gstSettings.${field}`] = value;
    }
    const vendor = await DummyVendor.findByIdAndUpdate(
      vendorId,
      { $set: update },
      { new: true, runValidators: true }
    )
      .select("gstSettings")
      .lean();

    return res.json({
      success: true,
      data: {
        gstSettings: sanitizeGstSettings(vendor),
        draftConfigured: isGstDraftConfigured(vendor),
        activation: getGstActivationState({ vendor }),
      },
    });
  } catch (error) {
    if (error instanceof GstSettingsValidationError) {
      return res.status(400).json({ success: false, message: error.message, code: error.code });
    }
    console.error("PATCH vendor GST settings error:", error?.message || error);
    return res.status(500).json({ success: false, message: "Unable to save GST settings" });
  }
}

module.exports = { getGstSettings, updateGstSettings };
