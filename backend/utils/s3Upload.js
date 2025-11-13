const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const mime = require('mime-types');

const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-south-1';
const s3 = new S3Client({
  region: REGION,
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined,
});

function slugifyLabel(label) {
  return String(label || '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeSegments(opts) {
  if (!opts) return [];
  const readMaybeArray = (v) => Array.isArray(v) ? v : (v ? [v] : []);
  let segments = [];
  const hierarchy = opts.hierarchy;
  if (typeof hierarchy === 'string') {
    try {
      const parsed = JSON.parse(hierarchy);
      if (Array.isArray(parsed)) segments = parsed;
      else segments = String(hierarchy).split('/');
    } catch {
      segments = String(hierarchy).split('/');
    }
  } else if (Array.isArray(hierarchy)) {
    segments = hierarchy;
  }
  if (!segments.length) {
    const pathStr = opts.path || opts.folderPath || '';
    if (pathStr) segments = String(pathStr).split('/');
  }
  if (!segments.length) {
    const alt = readMaybeArray(opts.segments);
    if (alt.length) segments = alt;
  }
  if (!segments.length) {
    const levels = Array.isArray(opts.levels) ? opts.levels : ['level1','level2','level3','level4','level5'].map(k => opts[k]).filter(Boolean);
    if (levels.length) segments = levels;
  }
  return (segments || []).map(s => String(s || '').replace(/^\/+|\/+$/g,'').trim()).filter(Boolean);
}

async function uploadBufferToS3(buffer, mimetype, folderType, options = null) {
  if (!buffer || !mimetype) throw new Error('Missing buffer or mimetype');
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'image/heic', 'image/heif'];
  if (!allowed.includes(mimetype)) throw new Error(`Invalid file type: ${mimetype}`);
  if (!process.env.S3_BUCKET_NAME) throw new Error('S3 bucket not configured');
  const ext = mime.extension(mimetype) || 'bin';
  const segments = normalizeSegments(options || {});
  const baseForFile = (segments.length ? segments[segments.length - 1] : (options && options.labelName)) || uuidv4();
  const fileSlug = slugifyLabel(baseForFile);
  const dirPath = segments.length ? segments.join('/') + '/' : '';
  const key = `${folderType}/${dirPath}${fileSlug}.${ext}`;
  await s3.send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: mimetype,
    CacheControl: 'public, max-age=31536000, immutable'
  }));
  const url = `https://${process.env.S3_BUCKET_NAME}.s3.${REGION}.amazonaws.com/${key}`;
  return { key, url };
}

async function uploadBufferToS3WithLabel(buffer, mimetype, folderType, labelName, options = null) {
  if (!buffer || !mimetype) throw new Error('Missing buffer or mimetype');
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'image/heic', 'image/heif'];
  if (!allowed.includes(mimetype)) throw new Error(`Invalid file type: ${mimetype}`);
  if (!process.env.S3_BUCKET_NAME) throw new Error('S3 bucket not configured');
  const ext = mime.extension(mimetype) || 'bin';
  const segs = normalizeSegments(options || {});
  const base = labelName ? slugifyLabel(labelName) : (segs.length ? slugifyLabel(segs[segs.length - 1]) : uuidv4());
  const dirPath = segs.length ? segs.join('/') + '/' : '';
  const key = `${folderType}/${dirPath}${base}.${ext}`;
  await s3.send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: mimetype,
    CacheControl: 'public, max-age=31536000, immutable'
  }));
  const url = `https://${process.env.S3_BUCKET_NAME}.s3.${REGION}.amazonaws.com/${key}`;
  return { key, url };
}

function extractKeyFromUrl(url) {
  try {
    const u = new URL(url);
    return u.pathname.replace(/^\//, '');
  } catch {
    return null;
  }
}

async function deleteS3ObjectByKey(key) {
  if (!key) return;
  await s3.send(new DeleteObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key,
  }));
}

async function deleteS3ObjectByUrl(url) {
  const key = extractKeyFromUrl(url);
  if (key) {
    try { await deleteS3ObjectByKey(key); } catch {}
  }
}

module.exports = { uploadBufferToS3, uploadBufferToS3WithLabel, deleteS3ObjectByUrl, deleteS3ObjectByKey, extractKeyFromUrl };
