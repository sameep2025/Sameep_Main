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

async function uploadBufferToS3(buffer, mimetype, folderType) {
  if (!buffer || !mimetype) throw new Error('Missing buffer or mimetype');
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowed.includes(mimetype)) throw new Error('Invalid file type');
  const ext = mime.extension(mimetype) || 'bin';
  const key = `${folderType}/${uuidv4()}.${ext}`;
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

module.exports = { uploadBufferToS3, deleteS3ObjectByUrl, deleteS3ObjectByKey, extractKeyFromUrl };
