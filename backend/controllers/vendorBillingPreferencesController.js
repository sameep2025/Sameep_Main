const DummyVendor = require("../models/DummyVendor");
const {
  sanitizeBillingPreferences,
} = require("../services/vendorBillingPreferences");

function getAuthorizedVendorId(req) {
  return req.vendorWriteAuth?.vendorId || req.params?.vendorId || "";
}

async function getBillingPreferences(req, res) {
  try {
    const vendorId = getAuthorizedVendorId(req);
    const vendor = await DummyVendor.findById(vendorId).select("billingPreferences").lean();

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    return res.json({
      success: true,
      data: {
        billingPreferences: sanitizeBillingPreferences(vendor),
      },
    });
  } catch (error) {
    console.error("GET vendor billing preferences error:", error?.message || error);
    return res.status(500).json({
      success: false,
      message: "Unable to load billing preferences",
    });
  }
}

async function updateBillingPreferences(req, res) {
  try {
    const vendorId = getAuthorizedVendorId(req);
    const sendWhatsAppBill = req.body?.sendWhatsAppBill;

    if (typeof sendWhatsAppBill !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "sendWhatsAppBill must be a boolean",
        code: "invalid_send_whatsapp_bill",
      });
    }

    const vendor = await DummyVendor.findByIdAndUpdate(
      vendorId,
      {
        $set: {
          "billingPreferences.sendWhatsAppBill": sendWhatsAppBill,
        },
      },
      { new: true }
    )
      .select("billingPreferences")
      .lean();

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    return res.json({
      success: true,
      data: {
        billingPreferences: sanitizeBillingPreferences(vendor),
      },
    });
  } catch (error) {
    console.error("PATCH vendor billing preferences error:", error?.message || error);
    return res.status(500).json({
      success: false,
      message: "Unable to save billing preferences",
    });
  }
}

module.exports = {
  getBillingPreferences,
  updateBillingPreferences,
};
