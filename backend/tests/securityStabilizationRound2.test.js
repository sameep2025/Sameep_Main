const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = process.env.JWT_SECRET || "round-two-test-secret";

const backendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(backendRoot, "..");
const readBackend = (relativePath) => fs.readFileSync(path.join(backendRoot, relativePath), "utf8");
const readRepo = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

const {
  assertJwtConfiguration,
  getBillLinkSecret,
  getJwtSecret,
} = require("../utils/jwtSecrets");
const {
  resolveAuthoritativeCheckout,
  resolveUnitAmountPaise,
} = require("../services/razorpayCheckoutPricingService");

const VENDOR_ID = "507f1f77bcf86cd799439011";
const CATEGORY_ID = "507f1f77bcf86cd799439012";
const ITEM_ID = "507f1f77bcf86cd799439013";

test("C-02 payment configuration owner routes require existing vendor/admin authorization", () => {
  const source = readBackend("routes/vendorPaymentConfigRoutes.js");
  assert.match(
    source,
    /router\.get\([\s\S]*"\/:vendorId"[\s\S]*requireVendorAccessFromExistingAuth/
  );
  assert.match(
    source,
    /router\.put\([\s\S]*"\/:vendorId"[\s\S]*requireVendorAccessFromExistingAuth/
  );
  assert.match(source, /router\.get\("\/public\/:vendorId"/);
  assert.match(source, /sanitizePublicPaymentConfig/);
  assert.doesNotMatch(
    source.slice(source.indexOf("function sanitizePublicPaymentConfig"), source.indexOf("function assertAllowedKeys")),
    /keySecretMasked|hasKeySecret|environments/
  );
});

test("C-02 frontend separates public capability reads from authenticated settings management", () => {
  const settings = readRepo("vendorpreview/app/Profile/PaymentSettingsModal.jsx");
  const contact = readRepo("vendorpreview/app/Contact/Contact.jsx");
  const ecommerce = readRepo("vendorpreview/app/_Explore/templates/EcommercePreviewTemplate.jsx");
  assert.match(settings, /getVendorAuthHeaders\(vendorId\)/);
  assert.match(contact, /\/api\/vendor-payment-config\/public\/\$\{vendorId\}/);
  assert.match(ecommerce, /\/api\/vendor-payment-config\/public\/\$\{vendorId\}/);
});

test("C-02 vendor middleware rejects unauthenticated and cross-vendor access but permits owner and admin", async (t) => {
  const Session = require("../models/Session");
  const DummyVendor = require("../models/DummyVendor");
  const Vendor = require("../models/Vendor");
  const { requireVendorAccessFromExistingAuth } = require("../utils/vendorWriteAuth");
  const originalSessionFind = Session.findOne;
  const originalDummyExists = DummyVendor.exists;
  const originalVendorExists = Vendor.exists;
  t.after(() => {
    Session.findOne = originalSessionFind;
    DummyVendor.exists = originalDummyExists;
    Vendor.exists = originalVendorExists;
  });

  const ownerId = "507f1f77bcf86cd799439099";
  const otherVendorId = "507f1f77bcf86cd799439098";
  Session.findOne = () => ({
    sort() { return this; },
    lean: async () => ({
      _id: "507f1f77bcf86cd799439097",
      userId: ownerId,
      vendorId: VENDOR_ID,
      isActive: true,
      expiryTime: new Date(Date.now() + 60_000),
      authMethod: "OTP",
    }),
  });
  DummyVendor.exists = async (query) =>
    String(query._id) === VENDOR_ID && String(query.customerId) === ownerId;
  Vendor.exists = async () => false;

  const run = (token, requestedVendorId) => new Promise((resolve) => {
    const req = {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      params: { vendorId: requestedVendorId },
      body: {},
    };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { resolve({ next: false, status: this.statusCode, payload }); },
    };
    requireVendorAccessFromExistingAuth((request) => request.params.vendorId)(req, res, () => {
      resolve({ next: true, status: 200, req });
    });
  });

  assert.equal((await run("", VENDOR_ID)).status, 401);
  const ownerToken = jwt.sign({ customerId: ownerId, vendorId: VENDOR_ID }, process.env.JWT_SECRET);
  assert.equal((await run(ownerToken, otherVendorId)).status, 403);
  assert.equal((await run(ownerToken, VENDOR_ID)).next, true);
  const adminToken = jwt.sign({ adminId: "admin-1" }, process.env.JWT_SECRET);
  assert.equal((await run(adminToken, otherVendorId)).next, true);
});

test("H-05 authoritative pricing uses catalog values and paise-safe discount calculation", async () => {
  assert.equal(resolveUnitAmountPaise({ price: 100, mrp: 125, discountPercent: 20 }), 10000);
  assert.equal(resolveUnitAmountPaise({ price: 125, mrp: 125, discountPercent: 20 }), 10000);

  const result = await resolveAuthoritativeCheckout({
    vendorId: VENDOR_ID,
    categoryId: CATEGORY_ID,
    claimedTotal: 200,
    cartItems: [{ itemId: ITEM_ID, itemSource: "vendor_menu_node", qty: 2, price: 100, total: 200 }],
    resolveItem: async () => ({
      source: "vendor_menu_node",
      item: { _id: ITEM_ID, name: "Service", price: 100, minQty: 1, stepQty: 1 },
    }),
  });
  assert.equal(result.amountInPaise, 20000);
  assert.equal(result.authoritativeItems[0].price, 100);
  assert.match(result.fingerprint, /^[a-f0-9]{64}$/);
});

test("H-05 rejects client amount and line-price manipulation", async () => {
  const base = {
    vendorId: VENDOR_ID,
    categoryId: CATEGORY_ID,
    resolveItem: async () => ({
      source: "vendor_menu_node",
      item: { _id: ITEM_ID, name: "Service", price: 100, minQty: 1, stepQty: 1 },
    }),
  };

  await assert.rejects(
    resolveAuthoritativeCheckout({
      ...base,
      claimedTotal: 1,
      cartItems: [{ itemId: ITEM_ID, itemSource: "vendor_menu_node", qty: 1, price: 100, total: 100 }],
    }),
    (error) => error.code === "checkout_amount_mismatch" && error.status === 409
  );
  await assert.rejects(
    resolveAuthoritativeCheckout({
      ...base,
      claimedTotal: 1,
      cartItems: [{ itemId: ITEM_ID, itemSource: "vendor_menu_node", qty: 1, price: 1, total: 1 }],
    }),
    (error) => error.code === "checkout_price_mismatch" && error.status === 409
  );
});

test("H-05 order and verification routes enforce ownership, currency, idempotency, and stored order binding", () => {
  const source = readBackend("routes/paymentRoutes.js");
  assert.match(source, /currency !== "INR"/);
  assert.match(source, /resolveAuthoritativeCheckout/);
  assert.match(source, /"meta\.submissionKey": submissionKey/);
  assert.match(source, /Submission key belongs to a different checkout/);
  assert.match(source, /storedOrderId !== String\(razorpayOrderId/);
  assert.match(source, /String\(attempt\.vendorId \|\| ""\) !== String\(vendorId\)/);
  assert.match(source, /"payment\.status": "verifying"/);
  assert.match(source, /Payment has already been applied/);
});

test("H-06 requires configured secrets and permits an explicit BILL_LINK_SECRET override", () => {
  assert.throws(() => getJwtSecret({}), (error) => error.code === "jwt_secret_missing");
  assert.throws(() => assertJwtConfiguration({}), (error) => error.code === "jwt_secret_missing");
  assert.equal(getJwtSecret({ JWT_SECRET: "configured-jwt" }), "configured-jwt");
  assert.equal(getBillLinkSecret({ JWT_SECRET: "configured-jwt" }), "configured-jwt");
  assert.equal(
    getBillLinkSecret({ JWT_SECRET: "configured-jwt", BILL_LINK_SECRET: "configured-bill" }),
    "configured-bill"
  );
});

test("H-06 application auth accepts configured JWTs and rejects missing or forged secrets", async (t) => {
  const Session = require("../models/Session");
  const { validateCustomerSession } = require("../utils/authMiddleware");
  const originalFindOne = Session.findOne;
  const originalSecret = process.env.JWT_SECRET;
  t.after(() => {
    Session.findOne = originalFindOne;
    process.env.JWT_SECRET = originalSecret;
  });

  Session.findOne = () => ({
    sort() { return this; },
    lean: async () => ({
      _id: "507f1f77bcf86cd799439095",
      userId: "507f1f77bcf86cd799439094",
      vendorId: VENDOR_ID,
      isActive: true,
      expiryTime: new Date(Date.now() + 60_000),
      authMethod: "OTP",
    }),
  });

  process.env.JWT_SECRET = "round-two-valid-secret";
  const token = jwt.sign(
    { customerId: "507f1f77bcf86cd799439094", vendorId: VENDOR_ID },
    process.env.JWT_SECRET
  );
  assert.equal((await validateCustomerSession(token)).ok, true);

  const forgedToken = jwt.sign(
    { customerId: "507f1f77bcf86cd799439094", vendorId: VENDOR_ID },
    "forged-secret"
  );
  assert.equal((await validateCustomerSession(forgedToken)).code, "invalid_token");

  delete process.env.JWT_SECRET;
  assert.equal((await validateCustomerSession(token)).code, "jwt_secret_missing");
});

test("H-06 runtime code has no literal JWT fallback and startup validates configuration", () => {
  const runtimeFiles = [
    "routes/authRoutes.js",
    "routes/customerRoutes.js",
    "routes/setupProgressRoutes.js",
    "controllers/billingController.js",
    "utils/authMiddleware.js",
    "utils/customerPortalAuth.js",
    "utils/whatsappConnectToken.js",
    "utils/billLink.js",
  ];
  runtimeFiles.forEach((file) => assert.doesNotMatch(readBackend(file), /dev_jwt_secret_change_me/));
  assert.match(readBackend("server.js"), /assertJwtConfiguration\(\)/);
});
