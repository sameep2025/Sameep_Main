const express = require('express');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const multer = require('multer');
const mime = require('mime-types');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();
const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-south-1';
const hasStaticCreds = Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
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
  limits: { fileSize: (Number(process.env.MAX_UPLOAD_MB) || 5) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'image/heic', 'image/heif'];
    if (!allowed.includes(file.mimetype)) return cb(new Error('Invalid file type'), false);
    cb(null, true);
  }
});

// POST /api/upload  (multipart/form-data)
// fields: file (File), folderType (vendor|category|master|newvendor|newcategory)
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!hasStaticCreds && !process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI && !process.env.AWS_PROFILE) {
      console.warn('AWS credentials not found in env; relying on default provider chain (instance role or shared config).');
    }
    const folderType = (req.body.folderType || req.query.folderType || '').toLowerCase();
    const validFolders = ['vendor', 'category', 'master', 'newvendor', 'newcategory'];
    if (!validFolders.includes(folderType)) {
      return res.status(400).json({ error: 'Invalid folderType' });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (!process.env.S3_BUCKET_NAME) return res.status(500).json({ error: 'S3 bucket not configured' });

    const extension = mime.extension(req.file.mimetype) || 'bin';

    const readMaybeArray = (v) => Array.isArray(v) ? v : (v ? [v] : []);
    let segments = [];
    const b = req.body || {};
    const q = req.query || {};
    let rawHierarchy = b.hierarchy ?? q.hierarchy;
    if (typeof rawHierarchy === 'string') {
      try {
        const parsed = JSON.parse(rawHierarchy);
        if (Array.isArray(parsed)) segments = parsed;
        else segments = String(rawHierarchy).split('/');
      } catch {
        segments = String(rawHierarchy).split('/');
      }
    } else if (Array.isArray(rawHierarchy)) {
      segments = rawHierarchy;
    }
    if (!segments.length) {
      const pathStr = b.path || q.path || b.folderPath || q.folderPath || '';
      if (pathStr) segments = String(pathStr).split('/');
    }
    if (!segments.length) {
      const alt = readMaybeArray(b.segments || q.segments);
      if (alt.length) segments = alt;
    }
    if (!segments.length) {
      const levels = ['level1','level2','level3','level4','level5'].map(k => b[k] || q[k]).filter(Boolean);
      if (levels.length) segments = levels;
    }
    segments = (segments || []).map(s => String(s || '').replace(/^\/+|\/+$/g,'').trim()).filter(Boolean);

    const rawLabel = (b.labelName || q.labelName || '').toString();
    const leafLabel = segments.length ? segments[segments.length - 1] : rawLabel;
    const baseForFile = leafLabel || uuidv4();
    const slug = baseForFile
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9\-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    const fileName = `${slug}.${extension}`;
    const dirPath = segments.length ? segments.join('/') + '/' : '';
    const Key = `${folderType}/${dirPath}${fileName}`;

    await s3.send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      CacheControl: 'public, max-age=31536000, immutable'
    }));

    const url = `https://${process.env.S3_BUCKET_NAME}.s3.${REGION}.amazonaws.com/${Key}`;
    return res.json({ key: Key, url, fileName });
  } catch (err) {
  console.error("❌ Upload error:", err);
  return res.status(500).json({ 
    error: "Upload failed", 
    message: err.message, 
    stack: err.stack 
  });
}

});

module.exports = router;
