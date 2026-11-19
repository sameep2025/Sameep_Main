import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const page = fs.readFileSync(path.join(root, "src/app/onboarding/page.js"), "utf8");
const api = fs.readFileSync(path.join(root, "src/services/onboardingApi.js"), "utf8");

test("onboarding restores bypass UX without exposing or comparing the passcode", () => {
  assert.match(page, /<span>Bypass OTP<\/span>/);
  assert.match(page, /type="password"/);
  assert.match(page, /authorizeOnboardingBypass/);
  assert.doesNotMatch(page, /fetchAdminPasscode|expectedPasscode/);
  assert.doesNotMatch(api, /admin-passcode/);
});

test("bypass authorization is passed once to vendor creation and replaced by scoped session", () => {
  assert.match(page, /onboardingAuthorization: data\.authorization/);
  assert.match(page, /onboardingCountryCode: countryCode/);
  assert.match(page, /vendorData\?\.onboardingSessionToken/);
  assert.match(page, /scopeCustomerSession/);
});

test("normal OTP request and verification remain available", () => {
  assert.match(api, /\/api\/customers\/request-otp/);
  assert.match(api, /\/api\/customers\/verify-otp/);
  assert.match(page, /onClick=\{handleVerifyOtp\}/);
});
