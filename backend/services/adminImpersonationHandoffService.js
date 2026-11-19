const crypto = require("crypto");
const Session = require("../models/Session");
const DummyVendor = require("../models/DummyVendor");
const Vendor = require("../models/Vendor");

const HANDOFF_TTL_MS = 2 * 60 * 1000;
const HANDOFF_TOKEN_PREFIX = "admin-handoff:";

function hashHandoffCode(code) {
  return crypto.createHash("sha256").update(String(code || "")).digest("hex");
}

async function resolveVendorCustomerId(vendorId) {
  const vendor = await Vendor.findById(vendorId).select("customerId").lean().catch(() => null);
  if (vendor?.customerId) return vendor.customerId;
  const dummyVendor = await DummyVendor.findById(vendorId).select("customerId").lean().catch(() => null);
  return dummyVendor?.customerId || null;
}

async function createAdminImpersonationHandoff({ adminId, vendorId, categoryId = "", now = new Date() }) {
  const customerId = await resolveVendorCustomerId(vendorId);
  if (!customerId) {
    const error = new Error("No customer linked to this vendor for admin impersonation");
    error.statusCode = 400;
    error.code = "vendor_customer_missing";
    throw error;
  }

  const code = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + HANDOFF_TTL_MS);
  await Session.create({
    userId: customerId,
    vendorId: String(vendorId),
    categoryId: String(categoryId || ""),
    authMethod: "ADMIN_IMPERSONATION",
    loginTime: now,
    expiryTime: expiresAt,
    isActive: false,
    token: `${HANDOFF_TOKEN_PREFIX}${hashHandoffCode(code)}`,
    deviceInfo: `Admin handoff created by ${String(adminId)}`,
  });

  return { code, expiresAt };
}

async function consumeAdminImpersonationHandoff(code, { sessionExpiresAt, now = new Date() }) {
  const normalizedCode = String(code || "").trim();
  if (!normalizedCode) return null;

  return Session.findOneAndUpdate(
    {
      token: `${HANDOFF_TOKEN_PREFIX}${hashHandoffCode(normalizedCode)}`,
      authMethod: "ADMIN_IMPERSONATION",
      isActive: false,
      expiryTime: { $gt: now },
    },
    {
      $set: {
        isActive: true,
        loginTime: now,
        expiryTime: sessionExpiresAt,
        token: "",
      },
    },
    { new: true }
  );
}

module.exports = {
  HANDOFF_TTL_MS,
  createAdminImpersonationHandoff,
  consumeAdminImpersonationHandoff,
};
