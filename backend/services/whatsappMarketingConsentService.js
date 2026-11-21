const mongoose = require("mongoose");
const BillingSession = require("../models/BillingSession");
const VendorCustomerProfile = require("../models/VendorCustomerProfile");
const WhatsappMarketingConsent = require("../models/WhatsappMarketingConsent");
const {
  WhatsappMarketingCampaignError,
} = require("./whatsappMarketingCampaignService");

function isCanonicalObjectId(value) {
  const id = String(value || "").trim();
  return mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id;
}

async function assertVendorCustomerRelationship(vendorId, customerId, dependencies = {}) {
  const ProfileModel = dependencies.ProfileModel || VendorCustomerProfile;
  const BillingSessionModel = dependencies.BillingSessionModel || BillingSession;
  const [profile, completedBill] = await Promise.all([
    ProfileModel.exists({ vendorId, customerId }),
    BillingSessionModel.exists({ vendorId, customerId, status: "COMPLETED" }),
  ]);
  if (!profile && !completedBill) {
    throw new WhatsappMarketingCampaignError(
      "Customer is not available to this vendor",
      "marketing_consent_customer_not_found",
      404
    );
  }
}

function optedOutError() {
  return new WhatsappMarketingCampaignError(
    "This customer has opted out of WhatsApp Marketing",
    "marketing_consent_opted_out",
    409
  );
}

async function recordVendorMarketingPermission({
  vendorId,
  customerId,
  permissionConfirmed,
  now = new Date(),
  dependencies = {},
}) {
  if (!isCanonicalObjectId(vendorId) || !isCanonicalObjectId(customerId)) {
    throw new WhatsappMarketingCampaignError(
      "Valid vendor and customer IDs are required",
      "invalid_marketing_consent_target"
    );
  }
  if (permissionConfirmed !== true) {
    throw new WhatsappMarketingCampaignError(
      "Confirm that the customer has already granted WhatsApp marketing permission",
      "marketing_consent_confirmation_required"
    );
  }

  await assertVendorCustomerRelationship(vendorId, customerId, dependencies);
  const ConsentModel = dependencies.ConsentModel || WhatsappMarketingConsent;
  const existing = await ConsentModel.findOne({ vendorId, customerId });
  if (existing?.status === "OPTED_OUT") throw optedOutError();
  if (existing?.status === "OPTED_IN") return existing;

  try {
    const consent = await ConsentModel.findOneAndUpdate(
      { vendorId, customerId, status: { $ne: "OPTED_OUT" } },
      {
        $set: {
          status: "OPTED_IN",
          source: "VENDOR_RECORDED",
          capturedAt: now,
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    if (!consent) throw optedOutError();
    return consent;
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const current = await ConsentModel.findOne({ vendorId, customerId });
    if (current?.status === "OPTED_OUT") throw optedOutError();
    if (current?.status === "OPTED_IN") return current;
    throw error;
  }
}

module.exports = {
  assertVendorCustomerRelationship,
  isCanonicalObjectId,
  recordVendorMarketingPermission,
};
