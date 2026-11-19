const path = require("path");

const MIME_EXTENSIONS = Object.freeze({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
});

const DECLARED_MIME_ALIASES = Object.freeze({
  "image/jpeg": new Set(["image/jpeg", "image/jpg"]),
  "image/png": new Set(["image/png"]),
  "image/webp": new Set(["image/webp"]),
  "image/gif": new Set(["image/gif"]),
  "image/heic": new Set(["image/heic", "image/heif"]),
  "image/heif": new Set(["image/heic", "image/heif"]),
});

function detectImageContent(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: "image/jpeg", extension: MIME_EXTENSIONS["image/jpeg"] };
  }
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mimeType: "image/png", extension: MIME_EXTENSIONS["image/png"] };
  }

  const prefix = buffer.subarray(0, 6).toString("ascii");
  if (prefix === "GIF87a" || prefix === "GIF89a") {
    return { mimeType: "image/gif", extension: MIME_EXTENSIONS["image/gif"] };
  }
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { mimeType: "image/webp", extension: MIME_EXTENSIONS["image/webp"] };
  }
  if (buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buffer.subarray(8, 12).toString("ascii").toLowerCase();
    if (["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs"].includes(brand)) {
      return { mimeType: "image/heic", extension: MIME_EXTENSIONS["image/heic"] };
    }
    if (["mif1", "msf1"].includes(brand)) {
      return { mimeType: "image/heif", extension: MIME_EXTENSIONS["image/heif"] };
    }
  }

  return null;
}

function validateImageUpload(file) {
  const detected = detectImageContent(file?.buffer);
  if (!detected) return { ok: false, code: "unsupported_file_content" };

  const declaredMime = String(file?.mimetype || "").toLowerCase();
  if (!DECLARED_MIME_ALIASES[detected.mimeType]?.has(declaredMime)) {
    return { ok: false, code: "file_type_mismatch" };
  }

  return { ok: true, ...detected };
}

function sanitizeKeySegment(value) {
  return String(value || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function buildSafeObjectKey({ folderType, segments, labelName, vendorId, extension, uniqueId }) {
  const folder = sanitizeKeySegment(folderType);
  const scopedVendor = sanitizeKeySegment(vendorId);
  const safeSegments = (Array.isArray(segments) ? segments : [])
    .slice(0, 8)
    .map(sanitizeKeySegment)
    .filter(Boolean)
    .filter((segment) => segment !== scopedVendor);
  const baseName = sanitizeKeySegment(labelName || safeSegments.at(-1)) || "upload";
  const suffix = sanitizeKeySegment(uniqueId);
  const safeExtension = String(extension || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const directory = [folder, scopedVendor, ...safeSegments].filter(Boolean);

  return path.posix.join(...directory, `${baseName}-${suffix}.${safeExtension}`);
}

module.exports = {
  buildSafeObjectKey,
  detectImageContent,
  sanitizeKeySegment,
  validateImageUpload,
};
