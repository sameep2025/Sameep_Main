const jwt = require("jsonwebtoken");

const MARKETING_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MARKETING_DOCUMENT_MIME_TYPES = new Set(["application/pdf"]);
const MARKETING_MEDIA_MIME_TYPES = new Set([
  ...MARKETING_IMAGE_MIME_TYPES,
  ...MARKETING_DOCUMENT_MIME_TYPES,
]);
const MARKETING_IMAGE_TOKEN_AUDIENCE = "whatsapp-marketing-image";
const MAX_MARKETING_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_MARKETING_DOCUMENT_BYTES = 10 * 1024 * 1024;

function getMarketingImagePrefix(vendorId) {
  return `newvendor/whatsapp-marketing/${String(vendorId || "").trim()}/`;
}

function hasValidMarketingImageSignature(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
  if (mimeType === "image/jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (mimeType === "image/webp") {
    return buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP";
  }
  return false;
}

function hasValidMarketingDocumentSignature(buffer, mimeType) {
  if (mimeType !== "application/pdf" || !Buffer.isBuffer(buffer) || buffer.length < 10) {
    return false;
  }
  const header = buffer.subarray(0, 5).toString("ascii");
  const trailer = buffer.subarray(Math.max(0, buffer.length - 1024)).toString("ascii");
  return header === "%PDF-" && trailer.includes("%%EOF");
}

function hasValidMarketingMediaSignature(buffer, mimeType) {
  return MARKETING_IMAGE_MIME_TYPES.has(mimeType)
    ? hasValidMarketingImageSignature(buffer, mimeType)
    : hasValidMarketingDocumentSignature(buffer, mimeType);
}

function getMarketingMediaSizeLimit(mimeType) {
  return MARKETING_DOCUMENT_MIME_TYPES.has(mimeType)
    ? MAX_MARKETING_DOCUMENT_BYTES
    : MAX_MARKETING_IMAGE_BYTES;
}

function createMarketingImageUploadToken({ vendorId, image }, env = process.env) {
  const secret = String(env.JWT_SECRET || "").trim();
  if (!secret) throw new Error("JWT_SECRET is required for marketing image ownership");
  return jwt.sign(
    {
      vendorId: String(vendorId),
      key: image.key,
      url: image.url,
      mimeType: image.mimeType,
      sizeBytes: image.sizeBytes,
      originalName: image.originalName || "",
    },
    secret,
    { expiresIn: "1h", audience: MARKETING_IMAGE_TOKEN_AUDIENCE }
  );
}

function verifyMarketingImageUpload({ vendorId, image }, env = process.env) {
  if (!image || typeof image !== "object") return null;
  const secret = String(env.JWT_SECRET || "").trim();
  const token = String(image.uploadToken || "").trim();
  if (!secret || !token) return null;

  try {
    const payload = jwt.verify(token, secret, { audience: MARKETING_IMAGE_TOKEN_AUDIENCE });
    const normalized = {
      url: String(payload.url || "").trim(),
      key: String(payload.key || "").trim(),
      mimeType: String(payload.mimeType || "").trim(),
      sizeBytes: Number(payload.sizeBytes || 0),
      originalName: String(payload.originalName || "").trim().slice(0, 180),
    };
    if (
      String(payload.vendorId || "") !== String(vendorId || "") ||
      !normalized.key.startsWith(getMarketingImagePrefix(vendorId)) ||
      normalized.url !== String(image.url || "").trim() ||
      normalized.key !== String(image.key || "").trim() ||
      !MARKETING_MEDIA_MIME_TYPES.has(normalized.mimeType) ||
      !Number.isSafeInteger(normalized.sizeBytes) ||
      normalized.sizeBytes <= 0 ||
      normalized.sizeBytes > getMarketingMediaSizeLimit(normalized.mimeType)
    ) {
      return null;
    }
    return normalized;
  } catch {
    return null;
  }
}

module.exports = {
  MARKETING_DOCUMENT_MIME_TYPES,
  MARKETING_IMAGE_MIME_TYPES,
  MARKETING_MEDIA_MIME_TYPES,
  MAX_MARKETING_DOCUMENT_BYTES,
  MAX_MARKETING_IMAGE_BYTES,
  createMarketingImageUploadToken,
  getMarketingMediaSizeLimit,
  getMarketingImagePrefix,
  hasValidMarketingDocumentSignature,
  hasValidMarketingImageSignature,
  hasValidMarketingMediaSignature,
  verifyMarketingImageUpload,
};
