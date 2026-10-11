const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const backendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(backendRoot, "..");
const controllerSource = fs.readFileSync(
  path.join(backendRoot, "controllers", "vendorWhatsappBusinessController.js"),
  "utf8"
);
const routesSource = fs.readFileSync(
  path.join(backendRoot, "routes", "vendorWhatsappBusinessRoutes.js"),
  "utf8"
);
const whatsappConnectSource = fs.readFileSync(
  path.join(repoRoot, "vendorpreview", "app", "whatsapp-connect", "page.js"),
  "utf8"
);

function extractFunction(source, functionName) {
  const start = source.indexOf(`async function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);

  const nextFunction = source.indexOf("\nasync function ", start + 1);
  return source.slice(start, nextFunction === -1 ? source.length : nextFunction);
}

test("coexistence diagnostic endpoint is isolated and authenticated", () => {
  assert.match(routesSource, /"\/meta\/coexistence-diagnostic"/);
  assert.match(
    routesSource,
    /"\/meta\/coexistence-diagnostic"[\s\S]*requireVendorOrWhatsappConnectAccess[\s\S]*diagnoseMetaCoexistenceSignup/
  );
});

test("coexistence diagnostic is disabled unless the explicit server flag is enabled", () => {
  const handler = extractFunction(controllerSource, "diagnoseMetaCoexistenceSignup");

  assert.match(controllerSource, /META_COEXISTENCE_DIAGNOSTIC_ENABLED/);
  assert.match(handler, /!isCoexistenceDiagnosticEnabled\(\)/);
  assert.match(handler, /status\(404\)/);
});

test("coexistence diagnostic performs no vendor persistence or phone registration", () => {
  const handler = extractFunction(controllerSource, "diagnoseMetaCoexistenceSignup");

  assert.doesNotMatch(handler, /updateOne\(/);
  assert.doesNotMatch(handler, /registerPhoneNumberWithSystemUserToken/);
  assert.doesNotMatch(handler, /registerMetaPhoneNumber/);
  assert.doesNotMatch(handler, /registerWhatsappPhoneNumber/);
  assert.match(handler, /registrationCalled:\s*false/);
  assert.match(handler, /persisted:\s*false/);
});

test("coexistence diagnostic validates IDs and reads only diagnostic Meta fields", () => {
  const handler = extractFunction(controllerSource, "diagnoseMetaCoexistenceSignup");

  assert.match(handler, /meta_coexistence_payload_invalid/);
  assert.match(handler, /meta_coexistence_session_mismatch/);
  assert.match(handler, /validateConnection\(/);
  assert.match(handler, /getPhoneNumberStatus\(/);
  assert.match(handler, /fields:\s*"is_on_biz_app"/);
});

test("standard and WABA-only signup configurations remain unchanged", () => {
  assert.match(whatsappConnectSource, /extras:\s*\{\s*version:\s*"v4"\s*\}/);
  assert.match(
    whatsappConnectSource,
    /setup:\s*\{\s*featureType:\s*"waba_onboarding_only",?\s*\}/
  );
});

test("coexistence Button 2 uses the isolated diagnostic endpoint only", () => {
  assert.match(whatsappConnectSource, /SIGNUP_MODE_COEXISTENCE_TEST/);
  assert.match(
    whatsappConnectSource,
    /FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING/
  );
  assert.match(
    whatsappConnectSource,
    /\/api\/vendor\/whatsapp-business\/meta\/coexistence-diagnostic/
  );
  assert.match(
    whatsappConnectSource,
    /featureType:\s*"whatsapp_business_app_onboarding"/
  );
});
