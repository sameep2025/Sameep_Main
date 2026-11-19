const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const BillingSession = require("../models/BillingSession");
const Vendor = require("../models/DummyVendor");
const { getWhatsAppBillingConfig } = require("./whatsappBillingConfig");
const { getBillLinkSecret } = require("./jwtSecrets");

function generateShortCode() {
  return crypto
    .randomBytes(6)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function createBillAccessToken({ billingId }) {
  const config = await getWhatsAppBillingConfig();
  const ttlDays =
    Number.isFinite(Number(config.ttlDays)) && Number(config.ttlDays) > 0
      ? Number(config.ttlDays)
      : 30;
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

  const existing = await BillingSession.findById(billingId)
    .select("publicAccessCode publicAccessExpiresAt")
    .lean();

  if (
    existing?.publicAccessCode &&
    existing?.publicAccessExpiresAt &&
    new Date(existing.publicAccessExpiresAt).getTime() > Date.now()
  ) {
    return existing.publicAccessCode;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateShortCode();

    try {
      const updated = await BillingSession.findOneAndUpdate(
        {
          _id: billingId,
          $or: [
            { publicAccessCode: { $exists: false } },
            { publicAccessCode: null },
            { publicAccessExpiresAt: { $lte: new Date() } },
            { publicAccessExpiresAt: null },
          ],
        },
        {
          $set: {
            publicAccessCode: code,
            publicAccessExpiresAt: expiresAt,
          },
        },
        {
          new: true,
          select: "publicAccessCode",
        }
      ).lean();

      if (updated?.publicAccessCode) {
        return updated.publicAccessCode;
      }

      const fallback = await BillingSession.findById(billingId)
        .select("publicAccessCode publicAccessExpiresAt")
        .lean();

      if (
        fallback?.publicAccessCode &&
        fallback?.publicAccessExpiresAt &&
        new Date(fallback.publicAccessExpiresAt).getTime() > Date.now()
      ) {
        return fallback.publicAccessCode;
      }
    } catch (err) {
      if (err?.code !== 11000) {
        throw err;
      }
    }
  }

  throw new Error("Failed to generate bill access code");
}

function verifyBillAccessToken(token) {
  return jwt.verify(token, getBillLinkSecret());
}

async function findBillingIdByCode(code) {
  if (!code) return "";

  const bill = await BillingSession.findOne({
    publicAccessCode: String(code).trim(),
    publicAccessExpiresAt: { $gt: new Date() },
  })
    .select("_id")
    .lean();

  return bill?._id ? String(bill._id) : "";
}

async function buildPublicBillUrl({ token }) {
  const config = await getWhatsAppBillingConfig();
  const baseUrl = String(config.publicBillBaseUrl || "").trim().replace(/\/$/, "");
  if (!baseUrl || !token) return "";

  let resolvedBaseUrl = baseUrl;
  const bill = await BillingSession.findOne({ publicAccessCode: String(token).trim() })
    .select("vendorId")
    .lean();

  if (bill?.vendorId) {
    const vendor = await Vendor.findById(bill.vendorId).select("subdomain").lean();
    const subdomain = String(vendor?.subdomain || "").trim().toLowerCase();

    if (subdomain) {
      resolvedBaseUrl = resolvedBaseUrl.replace("://", `://${subdomain}.`);
    }
  }

  return `${resolvedBaseUrl}/b/${encodeURIComponent(String(token))}`;
}

function buildPublicBillPath({ token }) {
  if (!token) return "";
  return encodeURIComponent(String(token));
}

module.exports = {
  buildPublicBillPath,
  buildPublicBillUrl,
  createBillAccessToken,
  findBillingIdByCode,
  verifyBillAccessToken,
};
