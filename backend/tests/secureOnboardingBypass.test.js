const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const backendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(backendRoot, "..");
const source = (relativePath) => fs.readFileSync(path.join(backendRoot, relativePath), "utf8");
const repoSource = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
const Session = require("../models/Session");
const AppConfig = require("../models/AppConfig");
const { onboardingBypassLimiter } = require("../utils/securityLimiters");
const { resetRateLimitersForTests } = require("../utils/securityRateLimit");
const { requireVendorCreationAccess } = require("../utils/vendorWriteAuth");
const {
  getAdminPasscodeStatus,
  setAdminPasscode,
  verifyAdminPasscode,
} = require("../services/adminPasscodeService");
const {
  AUTHORIZATION_TTL_MS,
  consumeOnboardingBypassAuthorization,
  createOnboardingBypassAuthorization,
  finalizeOnboardingBypassSession,
  isOnboardingBypassEnabled,
  verifyOnboardingBypassPasscode,
} = require("../services/onboardingBypassService");

function withEnvironment(t, values) {
  const originals = {};
  for (const [key, value] of Object.entries(values)) {
    originals[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

function mockAdminPasscodeStore(t, initialValue = null) {
  const originalFindOne = AppConfig.findOne;
  const originalFindOneAndUpdate = AppConfig.findOneAndUpdate;
  let value = initialValue;
  t.after(() => {
    AppConfig.findOne = originalFindOne;
    AppConfig.findOneAndUpdate = originalFindOneAndUpdate;
  });
  AppConfig.findOne = () => ({
    lean: async () => (value == null ? null : { key: "adminPasscode", value }),
  });
  AppConfig.findOneAndUpdate = (filter, update) => ({
    lean: async () => {
      if (Object.prototype.hasOwnProperty.call(filter, "value") && filter.value !== value) {
        return null;
      }
      value = update?.$set?.value ?? update?.value ?? value;
      return { key: "adminPasscode", value };
    },
  });
  return { get value() { return value; } };
}

test("central admin passcode is bcrypt-only and bypass requires explicit enablement", async (t) => {
  const store = mockAdminPasscodeStore(t);
  withEnvironment(t, {
    ONBOARDING_OTP_BYPASS_ENABLED: "true",
    NODE_ENV: "production",
  });

  assert.deepEqual(await getAdminPasscodeStatus(), { configured: false });
  await setAdminPasscode("4826");
  assert.equal(typeof store.value.passcodeHash, "string");
  assert.equal(store.value.passcodeHash.includes("4826"), false);
  assert.equal(await bcrypt.compare("4826", store.value.passcodeHash), true);
  assert.deepEqual(await getAdminPasscodeStatus(), { configured: true });
  assert.equal(isOnboardingBypassEnabled(), true);
  assert.ok(await verifyOnboardingBypassPasscode("4826"));
  assert.equal(await verifyOnboardingBypassPasscode("0000"), null);
  process.env.ONBOARDING_OTP_BYPASS_ENABLED = "false";
  assert.equal(isOnboardingBypassEnabled(), false);
  assert.equal(await verifyOnboardingBypassPasscode("4826"), false);
});

test("a valid legacy plaintext credential is upgraded without returning it", async (t) => {
  const store = mockAdminPasscodeStore(t, "4826");
  assert.deepEqual(await getAdminPasscodeStatus(), { configured: true });
  assert.equal(typeof store.value, "object");
  assert.equal(store.value.passcodeHash.includes("4826"), false);
  assert.equal(await verifyAdminPasscode("0000"), null);
  const verified = await verifyAdminPasscode("4826");
  assert.ok(verified?.credentialVersion);
});

test("authorization is hashed, mobile-bound, expiring, and atomically single-use", async (t) => {
  const store = mockAdminPasscodeStore(t);
  withEnvironment(t, { ONBOARDING_OTP_BYPASS_ENABLED: "true" });
  await setAdminPasscode("4826");
  const credential = await verifyAdminPasscode("4826");
  const originalCreate = Session.create;
  const originalFindOneAndUpdate = Session.findOneAndUpdate;
  let persisted;
  let consumed = false;
  t.after(() => {
    Session.create = originalCreate;
    Session.findOneAndUpdate = originalFindOneAndUpdate;
  });

  Session.create = async (payload) => {
    persisted = { _id: "507f1f77bcf86cd799439011", ...payload };
    return persisted;
  };
  Session.findOneAndUpdate = async (filter) => {
    if (consumed || filter.token !== persisted.token || filter.expiryTime.$gt >= persisted.expiryTime) {
      return null;
    }
    consumed = true;
    return { ...persisted, token: "", isActive: true };
  };

  const now = new Date("2030-01-01T00:00:00.000Z");
  const issued = await createOnboardingBypassAuthorization({
    customerId: "507f1f77bcf86cd799439010",
    countryCode: "91",
    phone: "9876543210",
    credentialVersion: credential.credentialVersion,
    now,
  });
  assert.equal(persisted.token.includes(issued.authorization), false);
  assert.equal(persisted.isActive, false);
  assert.equal(issued.expiresAt.getTime() - now.getTime(), AUTHORIZATION_TTL_MS);

  assert.equal(await consumeOnboardingBypassAuthorization({
    authorization: issued.authorization,
    countryCode: "91",
    phone: "9999999999",
    now,
  }), null);
  assert.equal(await consumeOnboardingBypassAuthorization({
    authorization: issued.authorization,
    countryCode: "91",
    phone: "9876543210",
    now: issued.expiresAt,
  }), null);
  assert.ok(await consumeOnboardingBypassAuthorization({
    authorization: issued.authorization,
    countryCode: "91",
    phone: "9876543210",
    now,
  }));
  assert.equal(await consumeOnboardingBypassAuthorization({
    authorization: issued.authorization,
    countryCode: "91",
    phone: "9876543210",
    now,
  }), null);
});

test("rotating the configured credential revokes outstanding authorizations", async (t) => {
  mockAdminPasscodeStore(t);
  withEnvironment(t, { ONBOARDING_OTP_BYPASS_ENABLED: "true" });
  await setAdminPasscode("4826");
  const credential = await verifyAdminPasscode("4826");
  const originalCreate = Session.create;
  const originalFindOneAndUpdate = Session.findOneAndUpdate;
  let persisted;
  t.after(() => {
    Session.create = originalCreate;
    Session.findOneAndUpdate = originalFindOneAndUpdate;
  });
  Session.create = async (payload) => {
    persisted = { _id: "507f1f77bcf86cd799439011", ...payload };
    return persisted;
  };
  Session.findOneAndUpdate = async (filter) =>
    filter.token === persisted.token ? persisted : null;

  const issued = await createOnboardingBypassAuthorization({
    customerId: "507f1f77bcf86cd799439010",
    countryCode: "91",
    phone: "9876543210",
    credentialVersion: credential.credentialVersion,
  });
  await setAdminPasscode("7391");
  assert.equal(await verifyAdminPasscode("4826"), null);
  assert.ok(await verifyAdminPasscode("7391"));

  assert.equal(await consumeOnboardingBypassAuthorization({
    authorization: issued.authorization,
    countryCode: "91",
    phone: "9876543210",
  }), null);
});

test("successful vendor creation finalizes only a vendor-scoped bypass session", async (t) => {
  withEnvironment(t, { JWT_SECRET: "secure-onboarding-bypass-test-secret" });
  const originalUpdateOne = Session.updateOne;
  const originalFindOne = AppConfig.findOne;
  let update;
  t.after(() => {
    Session.updateOne = originalUpdateOne;
    AppConfig.findOne = originalFindOne;
  });
  AppConfig.findOne = () => ({ lean: async () => null });
  Session.updateOne = async (filter, value) => { update = { filter, value }; };

  const result = await finalizeOnboardingBypassSession({
    session: {
      _id: "507f1f77bcf86cd799439011",
      userId: "507f1f77bcf86cd799439010",
    },
    vendorId: "507f1f77bcf86cd799439012",
    categoryId: "507f1f77bcf86cd799439013",
  });
  const decoded = jwt.verify(result.token, process.env.JWT_SECRET);
  assert.equal(decoded.authMethod, "BYPASS");
  assert.equal(decoded.vendorId, "507f1f77bcf86cd799439012");
  assert.equal(decoded.customerId, "507f1f77bcf86cd799439010");
  assert.equal(update.filter.authMethod, "BYPASS");
  assert.equal(update.value.$set.vendorId, "507f1f77bcf86cd799439012");
});

test("routes preserve normal OTP and expose no passcode or hash", () => {
  const customerRoutes = source("routes/customerRoutes.js");
  const configRoutes = source("routes/appConfigRoutes.js");
  const passcodeService = source("services/adminPasscodeService.js");
  const vendorRoutes = source("routes/dummyVendorRoutes.js");
  const creationAuth = source("utils/vendorWriteAuth.js");
  const adminConfigPage = repoSource("frontend/src/pages/AppConfigurationsPage.jsx");
  const onboarding = repoSource("ynot/web/src/app/onboarding/page.js");
  const onboardingApi = repoSource("ynot/web/src/services/onboardingApi.js");

  assert.match(customerRoutes, /router\.post\("\/request-otp", otpRequestLimiter/);
  assert.match(customerRoutes, /router\.post\("\/verify-otp", otpVerifyLimiter/);
  assert.match(customerRoutes, /router\.post\("\/onboarding-bypass\/authorize", onboardingBypassLimiter/);
  assert.doesNotMatch(customerRoutes, /router\.post\("\/bypass-otp"/);
  assert.match(customerRoutes, /Existing vendor accounts must use normal login/);
  assert.match(creationAuth, /consumeOnboardingBypassAuthorization/);
  assert.match(vendorRoutes, /finalizeOnboardingBypassSession/);
  assert.match(onboarding, /<span>Bypass OTP<\/span>/);
  assert.match(onboardingApi, /\/api\/customers\/onboarding-bypass\/authorize/);
  assert.doesNotMatch(onboarding, /fetchAdminPasscode|expectedPasscode/);
  assert.doesNotMatch(onboardingApi, /admin-passcode/);
  assert.doesNotMatch(customerRoutes, /PASSCODE_HASH[^\n]*res\.json|passcodeHash[^\n]*res\.json/i);
  assert.match(configRoutes, /router\.get\("\/admin-passcode", requireAdminAuth/);
  assert.match(configRoutes, /router\.post\("\/admin-passcode", requireAdminAuth/);
  assert.match(configRoutes, /res\.json\(\{ configured: true \}\)/);
  assert.doesNotMatch(configRoutes, /res\.json\(\{ adminPasscode/);
  assert.match(passcodeService, /bcrypt\.hash\(code, BCRYPT_ROUNDS\)/);
  assert.doesNotMatch(passcodeService, /ONBOARDING_OTP_BYPASS_PASSCODE_HASH/);
  assert.match(adminConfigPage, /type="password"/);
  assert.match(adminConfigPage, /res\.data\?\.configured/);
  assert.doesNotMatch(adminConfigPage, /res\.data\?\.adminPasscode/);
});

test("bypass attempts are audited without passcodes or authorization tokens", () => {
  const customerRoutes = source("routes/customerRoutes.js");
  assert.match(customerRoutes, /onboarding_otp_bypass_failed/);
  assert.match(customerRoutes, /onboarding_otp_bypass_authorized/);
  assert.match(customerRoutes, /onboardingMobileFingerprint/);
  assert.doesNotMatch(customerRoutes, /meta:\s*\{[^}]*passcode|meta:\s*\{[^}]*authorization/);
});

test("repeated bypass attempts are rate limited per IP and mobile", () => {
  resetRateLimitersForTests();
  const req = {
    ip: "127.0.0.1",
    body: { countryCode: "91", phone: "9876543210" },
  };
  let statusCode = 200;
  let responseBody;
  const res = {
    setHeader() {},
    status(value) {
      statusCode = value;
      return this;
    },
    json(value) {
      responseBody = value;
      return value;
    },
  };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    let continued = false;
    onboardingBypassLimiter(req, res, () => { continued = true; });
    assert.equal(continued, true);
  }
  onboardingBypassLimiter(req, res, () => assert.fail("sixth attempt must be blocked"));
  assert.equal(statusCode, 429);
  assert.equal(responseBody.code, "rate_limited");
  resetRateLimitersForTests();
});

test("vendor creation derives customer identity from a valid phone-bound authorization", async (t) => {
  mockAdminPasscodeStore(t);
  withEnvironment(t, { ONBOARDING_OTP_BYPASS_ENABLED: "true" });
  await setAdminPasscode("4826");
  const originalFindOneAndUpdate = Session.findOneAndUpdate;
  t.after(() => { Session.findOneAndUpdate = originalFindOneAndUpdate; });
  Session.findOneAndUpdate = async (filter) => {
    if (!filter.token.startsWith("onboarding-bypass:")) return null;
    return {
      _id: "507f1f77bcf86cd799439011",
      userId: "507f1f77bcf86cd799439010",
      authMethod: "BYPASS",
      isActive: true,
    };
  };

  const req = {
    headers: {},
    body: {
      customerId: "attacker-controlled-id",
      phone: "9876543210",
      onboardingCountryCode: "91",
      onboardingAuthorization: "one-time-authorization",
    },
  };
  let nextCalled = false;
  const res = {
    status() { return this; },
    json() { assert.fail("valid authorization must reach vendor creation"); },
  };

  await requireVendorCreationAccess(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(req.body.customerId, "507f1f77bcf86cd799439010");
  assert.equal(req.body.onboardingAuthorization, undefined);
  assert.equal(req.vendorWriteAuth.authType, "onboarding_bypass");
});
