const express = require("express");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");

const { validateAdminTokenFromRequest } = require("../utils/adminAuthMiddleware");
const { validateVendorRequestFromExistingAuth } = require("../utils/vendorWriteAuth");
const { buildSafeObjectKey, validateImageUpload } = require("../utils/uploadSecurity");

const router = express.Router();
const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "ap-south-1";
const hasStaticCreds = Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
const configuredUploadMb = Number(process.env.MAX_UPLOAD_MB);
const maxUploadMb = Math.min(Math.max(Number.isFinite(configuredUploadMb) ? configuredUploadMb : 5, 1), 10);
const maxUploadBytes = maxUploadMb * 1024 * 1024;
const allowedDeclaredTypes = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

const s3 = new S3Client({
  region: REGION,
  credentials: hasStaticCreds
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxUploadBytes, files: 1 },
  fileFilter: (req, file, callback) => {
    if (!allowedDeclaredTypes.has(String(file.mimetype || "").toLowerCase())) {
      const error = new Error("Unsupported image type");
      error.code = "UNSUPPORTED_UPLOAD_TYPE";
      return callback(error, false);
    }
    return callback(null, true);
  },
});

async function requireUploadAccess(req, res, next) {
  const adminResult = validateAdminTokenFromRequest(req);
  if (adminResult.ok) {
    req.uploadAuth = { authType: "admin", admin: adminResult.admin, vendorId: "" };
    return next();
  }

  const vendorId = String(req.query?.vendorId || "").trim();
  const vendorResult = await validateVendorRequestFromExistingAuth(req, vendorId);
  if (!vendorResult.ok) {
    return res.status(vendorResult.status || 403).json({
      error: vendorResult.message || "Upload access denied",
      code: vendorResult.code || "forbidden",
    });
  }

  req.uploadAuth = vendorResult;
  return next();
}

function parseSingleUpload(req, res, next) {
  upload.single("file")(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: `File exceeds the ${maxUploadMb} MB limit` });
    }
    return res.status(400).json({
      error: "Unsupported or invalid upload",
      code: error.code || "invalid_upload",
    });
  });
}

function readSegments(body = {}, query = {}) {
  let rawHierarchy = body.hierarchy ?? query.hierarchy;
  if (typeof rawHierarchy === "string") {
    try {
      const parsed = JSON.parse(rawHierarchy);
      rawHierarchy = Array.isArray(parsed) ? parsed : rawHierarchy.split("/");
    } catch {
      rawHierarchy = rawHierarchy.split("/");
    }
  }
  if (Array.isArray(rawHierarchy)) return rawHierarchy;

  const pathValue = body.path || query.path || body.folderPath || query.folderPath;
  if (pathValue) return String(pathValue).split("/");

  const rawSegments = body.segments || query.segments;
  if (Array.isArray(rawSegments)) return rawSegments;
  if (typeof rawSegments === "string") {
    try {
      const parsed = JSON.parse(rawSegments);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return rawSegments.split("/");
    }
  }

  return ["level1", "level2", "level3", "level4", "level5"]
    .map((key) => body[key] || query[key])
    .filter(Boolean);
}

router.post("/upload", requireUploadAccess, parseSingleUpload, async (req, res) => {
  try {
    const folderType = String(req.body?.folderType || req.query?.folderType || "").toLowerCase();
    const validFolders = new Set(["vendor", "category", "master", "newvendor", "newcategory"]);
    if (!validFolders.has(folderType)) {
      return res.status(400).json({ error: "Invalid folderType" });
    }
    if (req.uploadAuth?.authType !== "admin" && !["vendor", "newvendor"].includes(folderType)) {
      return res.status(403).json({ error: "Vendor uploads must use a vendor folder" });
    }
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    if (!process.env.S3_BUCKET_NAME) return res.status(500).json({ error: "S3 bucket not configured" });

    const validation = validateImageUpload(req.file);
    if (!validation.ok) {
      return res.status(400).json({
        error: "Uploaded file content is not a permitted image",
        code: validation.code,
      });
    }

    const key = buildSafeObjectKey({
      folderType,
      segments: readSegments(req.body, req.query),
      labelName: req.body?.labelName || req.query?.labelName,
      vendorId: req.uploadAuth?.authType === "vendor" ? req.uploadAuth.vendorId : "",
      extension: validation.extension,
      uniqueId: uuidv4(),
    });

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: key,
        Body: req.file.buffer,
        ContentType: validation.mimeType,
        CacheControl: "public, max-age=31536000, immutable",
      })
    );

    const url = `https://${process.env.S3_BUCKET_NAME}.s3.${REGION}.amazonaws.com/${key}`;
    return res.json({ key, url, fileName: key.split("/").at(-1) });
  } catch (error) {
    console.error("Upload error:", error?.message || error);
    return res.status(500).json({ error: "Upload failed" });
  }
});

module.exports = router;
module.exports.requireUploadAccess = requireUploadAccess;
module.exports.maxUploadBytes = maxUploadBytes;
