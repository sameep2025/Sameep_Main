const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const backendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(backendRoot, "..");
const readBackend = (relativePath) => fs.readFileSync(path.join(backendRoot, relativePath), "utf8");
const readRepo = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

const Session = require("../models/Session");
const DummyVendor = require("../models/DummyVendor");
const Vendor = require("../models/Vendor");
const {
  HANDOFF_TTL_MS,
  createAdminImpersonationHandoff,
  consumeAdminImpersonationHandoff,
} = require("../services/adminImpersonationHandoffService");
const jwt = require("jsonwebtoken");

test("admin passcode is no longer public and handoff creation requires admin auth", () => {
  const configRoutes = readBackend("routes/appConfigRoutes.js");
  const passcodeService = readBackend("services/adminPasscodeService.js");
  const adminRoutes = readBackend("routes/adminRoutes.js");
  assert.match(configRoutes, /router\.get\("\/admin-passcode", requireAdminAuth/);
  assert.doesNotMatch(configRoutes, /res\.json\(\{ adminPasscode/);
  assert.match(passcodeService, /bcrypt\.hash/);
  assert.match(adminRoutes, /router\.post\("\/impersonation-handoffs", requireAdminAuth/);
});

test("impersonation exchange no longer accepts passcodes or caller-selected vendor identity", () => {
  const source = readBackend("routes/customerRoutes.js");
  const start = source.indexOf('router.post("/admin-impersonate"');
  const end = source.indexOf('router.post("/vendor-passcode"', start);
  const section = source.slice(start, end);
  assert.match(section, /consumeAdminImpersonationHandoff\(handoffCode/);
  assert.doesNotMatch(section, /getAdminPasscode|passcode\s*:/);
  assert.doesNotMatch(section, /Session\.find\(sessFilter\)|isActive:\s*false, expiryTime: logoutTime/);
});

test("admin handoff stores only a hash in an inactive short-lived existing Session", async (t) => {
  const originalVendorFind = Vendor.findById;
  const originalDummyFind = DummyVendor.findById;
  const originalCreate = Session.create;
  let created;
  t.after(() => {
    Vendor.findById = originalVendorFind;
    DummyVendor.findById = originalDummyFind;
    Session.create = originalCreate;
  });

  Vendor.findById = () => ({ select() { return this; }, lean: async () => null });
  DummyVendor.findById = () => ({
    select() { return this; },
    lean: async () => ({ customerId: "507f1f77bcf86cd799439012" }),
  });
  Session.create = async (payload) => { created = payload; return payload; };

  const now = new Date("2030-01-01T00:00:00.000Z");
  const result = await createAdminImpersonationHandoff({
    adminId: "admin-1",
    vendorId: "507f1f77bcf86cd799439011",
    categoryId: "category-1",
    now,
  });

  assert.equal(created.isActive, false);
  assert.equal(created.authMethod, "ADMIN_IMPERSONATION");
  assert.match(created.token, /^admin-handoff:[a-f0-9]{64}$/);
  assert.equal(created.token.includes(result.code), false);
  assert.equal(result.expiresAt.getTime() - now.getTime(), HANDOFF_TTL_MS);
});

test("handoff consumption is atomic, bounded by expiry, and single-use", async (t) => {
  const originalFindOneAndUpdate = Session.findOneAndUpdate;
  const seen = new Set();
  t.after(() => { Session.findOneAndUpdate = originalFindOneAndUpdate; });

  Session.findOneAndUpdate = async (filter, update) => {
    assert.deepEqual(filter.expiryTime, { $gt: new Date("2030-01-01T00:00:00.000Z") });
    assert.equal(filter.isActive, false);
    assert.equal(update.$set.isActive, true);
    if (seen.has(filter.token)) return null;
    seen.add(filter.token);
    return { _id: "session-1", token: update.$set.token, isActive: true };
  };

  const options = {
    now: new Date("2030-01-01T00:00:00.000Z"),
    sessionExpiresAt: new Date("2030-01-01T04:00:00.000Z"),
  };
  assert.ok(await consumeAdminImpersonationHandoff("single-use-code", options));
  assert.equal(await consumeAdminImpersonationHandoff("single-use-code", options), null);
});

test("normal vendor OTP/passcode login remains and onboarding bypass is server-authorized", () => {
  const customerRoutes = readBackend("routes/customerRoutes.js");
  const vendorCustomerRoutes = readBackend("routes/vendorCustomerRoutes.js");
  const onboarding = readRepo("ynot/web/src/app/onboarding/page.js");
  const categoryModal = readRepo("vendorpreview/app/Header/CategoryModal.jsx");
  const explore = readRepo("vendorpreview/app/_Explore/Explore.jsx");
  const billingScreen = readRepo("vendorpreview/app/Billing/components/BillingScreen.jsx");
  const legacyPreview = readRepo("preview-site/pages/preview/[vendorId]/[categoryId].jsx");
  assert.match(customerRoutes, /router\.post\("\/verify-otp"/);
  assert.match(customerRoutes, /router\.post\("\/vendor-passcode-login"/);
  assert.match(customerRoutes, /router\.post\("\/onboarding-bypass\/authorize", onboardingBypassLimiter/);
  assert.match(onboarding, /authorizeOnboardingBypass/);
  assert.match(onboarding, /Bypass OTP/);
  assert.doesNotMatch(onboarding, /fetchAdminPasscode|expectedPasscode/);
  assert.doesNotMatch(categoryModal, /\/api\/customers\/bypass-otp|Bypass OTP|adminPasscode/);
  assert.match(
    vendorCustomerRoutes,
    /router\.post\([\s\S]*"\/customer\/resolve"[\s\S]*requireVendorAccessFromExistingAuth/
  );
  assert.doesNotMatch(explore, /\/api\/customers\/bypass-otp/);
  assert.match(explore, /\/api\/vendor\/dashboard\/customer\/resolve/);
  assert.doesNotMatch(billingScreen, /\/api\/customers\/bypass-otp/);
  assert.match(billingScreen, /\/api\/vendor\/dashboard\/customer\/resolve/);
  assert.doesNotMatch(legacyPreview, /\/api\/customers\/bypass-otp|Bypass OTP/);
});

test("Admin Console creates handoff and VendorPreview exchanges it without URL JWTs", () => {
  const adminPage = readRepo("frontend/src/pages/DummyVendorStatusListPage.jsx");
  const explore = readRepo("vendorpreview/app/_Explore/Explore.jsx");
  const sessionHelper = readRepo("vendorpreview/app/utils/adminVendorSession.mjs");
  assert.match(adminPage, /API\.post\("\/api\/admin\/impersonation-handoffs"/);
  assert.match(adminPage, /searchParams\.set\("adminHandoff", handoffCode\)/);
  assert.doesNotMatch(adminPage, /searchParams\.set\([^\n]*(token|jwt)/i);
  assert.match(explore, /exchangeAdminHandoff\(\{[\s\S]*handoffCode: adminHandoffCode/);
  assert.match(sessionHelper, /body: JSON\.stringify\(\{ handoffCode: code \}\)/);
  assert.match(explore, /setShowVendorLogin\(false\);[\s\S]*persistViewMode\("new-dashboard"\)/);
  assert.match(explore, /searchParams\.delete\("adminHandoff"\)/);
});

test("admin handoff sessions retain operational vendor scope", async (t) => {
  const originalJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "admin-handoff-session-test-secret";
  const {
    requireVendorAccessFromExistingAuth,
    requireVendorParamWriteAccess,
  } = require("../utils/vendorWriteAuth");
  const originalSessionFind = Session.findOne;
  const originalDummyExists = DummyVendor.exists;
  const originalVendorExists = Vendor.exists;
  t.after(() => {
    Session.findOne = originalSessionFind;
    DummyVendor.exists = originalDummyExists;
    Vendor.exists = originalVendorExists;
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
  });

  const customerId = "507f1f77bcf86cd799439090";
  const selectedVendorId = "507f1f77bcf86cd799439091";
  const otherVendorId = "507f1f77bcf86cd799439092";
  const sessionId = "507f1f77bcf86cd799439093";
  Session.findOne = () => ({
    sort() { return this; },
    lean: async () => ({
      _id: sessionId,
      userId: customerId,
      vendorId: selectedVendorId,
      isActive: true,
      expiryTime: new Date(Date.now() + 60_000),
      authMethod: "ADMIN_IMPERSONATION",
    }),
  });
  DummyVendor.exists = async (query) =>
    String(query._id) === selectedVendorId && String(query.customerId) === customerId;
  Vendor.exists = async () => false;

  const token = jwt.sign(
    { customerId, vendorId: selectedVendorId, sessionId, authMethod: "ADMIN_IMPERSONATION" },
    process.env.JWT_SECRET
  );
  const authorize = (requestedVendorId, suppliedToken = token) => new Promise((resolve) => {
    const req = {
      headers: suppliedToken ? { authorization: `Bearer ${suppliedToken}` } : {},
      query: { vendorId: requestedVendorId },
      body: { vendorId: requestedVendorId },
    };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { resolve({ next: false, status: this.statusCode, payload }); },
    };
    requireVendorAccessFromExistingAuth(() => requestedVendorId)(req, res, () => {
      resolve({ next: true, status: 200, req });
    });
  });

  // Dashboard reads, price mutations, and billing use this shared vendor-scoped guard.
  assert.equal((await authorize(selectedVendorId)).next, true);
  assert.equal((await authorize(otherVendorId)).status, 403);
  assert.equal((await authorize(selectedVendorId, "")).status, 401);

  const authorizePriceMutation = (requestedVendorId) => new Promise((resolve) => {
    const req = {
      headers: { authorization: `Bearer ${token}` },
      params: { vendorId: requestedVendorId },
      body: {},
    };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { resolve({ next: false, status: this.statusCode, payload }); },
    };
    requireVendorParamWriteAccess()(req, res, () => resolve({ next: true, status: 200, req }));
  });
  assert.equal((await authorizePriceMutation(selectedVendorId)).next, true);
  assert.equal((await authorizePriceMutation(otherVendorId)).status, 403);

  const dashboardRoutes = readBackend("routes/vendorDashboardRoutes.js");
  const pricingRoutes = readBackend("routes/vendorFlowRoutes.js");
  const billingRoutes = readBackend("routes/billingRoutes.js");
  assert.match(dashboardRoutes, /requireVendorAccessFromExistingAuth/);
  assert.match(pricingRoutes, /requireVendorParamWriteAccess/);
  assert.match(billingRoutes, /requireVendorAccessFromExistingAuth/);
});
