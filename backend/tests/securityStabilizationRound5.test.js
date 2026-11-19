const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const uploadRoutes = require("../routes/uploadRoutes");
const { sanitizeAuditValue } = require("../routes/auditLogRoutes");
const {
  buildSafeObjectKey,
  detectImageContent,
  validateImageUpload,
} = require("../utils/uploadSecurity");

const backendRoot = path.join(__dirname, "..");
const repoRoot = path.join(backendRoot, "..");

function source(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function responseRecorder() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

test("H-04 recognizes permitted image signatures and rejects spoofed or SVG content", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const webp = Buffer.from("RIFF0000WEBP", "ascii");

  assert.deepEqual(detectImageContent(png), { mimeType: "image/png", extension: "png" });
  assert.deepEqual(detectImageContent(jpeg), { mimeType: "image/jpeg", extension: "jpg" });
  assert.deepEqual(detectImageContent(webp), { mimeType: "image/webp", extension: "webp" });
  assert.equal(validateImageUpload({ buffer: png, mimetype: "image/png" }).ok, true);
  assert.deepEqual(validateImageUpload({ buffer: png, mimetype: "image/jpeg" }), {
    ok: false,
    code: "file_type_mismatch",
  });
  assert.deepEqual(
    validateImageUpload({ buffer: Buffer.from("<svg><script>alert(1)</script></svg>"), mimetype: "image/svg+xml" }),
    { ok: false, code: "unsupported_file_content" }
  );
});

test("H-04 generates vendor-scoped non-overwriting keys without unsafe path segments", () => {
  const first = buildSafeObjectKey({
    folderType: "newvendor",
    vendorId: "Vendor-123",
    segments: ["../profiles", "Vendor-123", "Logo / Main"],
    labelName: "../../Salon Logo",
    extension: "png",
    uniqueId: "first-id",
  });
  const second = buildSafeObjectKey({
    folderType: "newvendor",
    vendorId: "Vendor-123",
    segments: ["../profiles", "Vendor-123", "Logo / Main"],
    labelName: "../../Salon Logo",
    extension: "png",
    uniqueId: "second-id",
  });

  assert.match(first, /^newvendor\/vendor-123\//);
  assert.doesNotMatch(first, /\.\.|\\/);
  assert.notEqual(first, second);
});

test("H-04 generic uploads authenticate before parsing and enforce bounded image-only uploads", async () => {
  const routeSource = source("backend/routes/uploadRoutes.js");
  assert.match(routeSource, /router\.post\("\/upload", requireUploadAccess, parseSingleUpload/);
  assert.match(routeSource, /limits: \{ fileSize: maxUploadBytes, files: 1 \}/);
  assert.doesNotMatch(routeSource, /image\/svg\+xml/);
  assert.ok(uploadRoutes.maxUploadBytes <= 10 * 1024 * 1024);

  const req = { headers: {}, query: {}, body: {} };
  const res = responseRecorder();
  let nextCalled = false;
  await uploadRoutes.requireUploadAccess(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test("H-07 and M-04 diagnostic endpoints are not mounted publicly", () => {
  const serverSource = source("backend/server.js");
  const diagnosticSource = source("backend/routes/test.js");
  assert.doesNotMatch(serverSource, /app\.use\("\/api\/test"/);
  assert.doesNotMatch(serverSource, /app\.get\("\/api\/_debug\/db"/);
  assert.doesNotMatch(diagnosticSource, /sendBillWhatsapp/);
  assert.match(diagnosticSource, /status\(410\)/);
  assert.match(serverSource, /app\.use\("\/api\/webhooks\/meta"/);
  assert.match(serverSource, /app\.use\("\/api\/billing"/);
});

test("H-08 audit logs require admin authentication and redact sensitive values", () => {
  const routeSource = source("backend/routes/auditLogRoutes.js");
  assert.match(routeSource, /router\.get\("\/", requireAdminAuth/);

  const sanitized = sanitizeAuditValue({
    token: "secret-token",
    nested: { password: "secret-password", safe: "visible" },
    note: "Bearer abc.def.ghi",
    callback: "https://example.test/callback?token=private-value",
  });
  assert.equal(sanitized.token, "[REDACTED]");
  assert.equal(sanitized.nested.password, "[REDACTED]");
  assert.equal(sanitized.nested.safe, "visible");
  assert.equal(sanitized.note, "[REDACTED]");
  assert.equal(sanitized.callback, "[REDACTED]");
});

test("active vendor upload callers send vendor identity and established authentication", () => {
  for (const relativePath of [
    "vendorpreview/app/Profile/AboutFounderModal.jsx",
    "vendorpreview/app/Profile/BrandingContactModal.jsx",
    "vendorpreview/app/Profile/ShowcaseSectionModal.jsx",
    "vendorpreview/app/PackagesPortal/PackagesPortal.jsx",
  ]) {
    const callerSource = source(relativePath);
    assert.match(callerSource, /api\/upload\?vendorId=/, relativePath);
    assert.match(callerSource, /getVendorAuthHeaders\(vendorId\)/, relativePath);
  }

  const adminApiSource = source("frontend/src/api.js");
  assert.match(adminApiSource, /window\.fetch =/);
  assert.match(adminApiSource, /Authorization/);
});
