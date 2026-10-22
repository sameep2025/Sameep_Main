const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  buildActivationEligibility,
} = require("../services/whatsappBillingActivationEligibility");
const {
  ROUTES,
  resolveWhatsAppBillingRoute,
} = require("../services/whatsappBillingRouteResolver");

const backendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(backendRoot, "..");
const connectPageSource = fs.readFileSync(
  path.join(repoRoot, "vendorpreview", "app", "whatsapp-connect", "page.js"),
  "utf8"
);
const connectParserSource = fs.readFileSync(
  path.join(repoRoot, "vendorpreview", "app", "utils", "whatsappEmbeddedSignup.js"),
  "utf8"
);
const routesSource = fs.readFileSync(
  path.join(backendRoot, "routes", "vendorWhatsappBusinessRoutes.js"),
  "utf8"
);
const controllerSource = fs.readFileSync(
  path.join(backendRoot, "controllers", "vendorWhatsappBusinessController.js"),
  "utf8"
);
const metaServiceSource = fs.readFileSync(
  path.join(backendRoot, "services", "metaWhatsAppService.js"),
  "utf8"
);

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

function standardReadyConfig(overrides = {}) {
  return {
    provider: "meta",
    enabled: true,
    connectionStatus: "connected",
    phoneRegistrationStatus: "active",
    messagingReadiness: { status: "limited" },
    displayNameReadiness: { status: "send_eligible", canSend: true },
    templateInstances: [
      { masterTemplateKey: "BILL_STANDARD", status: "approved" },
    ],
    testMessage: { status: "successful" },
    ...overrides,
  };
}

test("Option 1 button remains explicitly mapped to standard signup", () => {
  assert.match(
    connectPageSource,
    /onClick=\{\(\) => startMetaSignup\(SIGNUP_MODE_STANDARD\)\}[\s\S]*?Connect New WhatsApp Number/
  );
});

test("standard Embedded Signup keeps its existing Meta launch configuration", () => {
  const loginOptions = sourceBetween(
    connectPageSource,
    "const loginOptions =",
    "logMetaEmbeddedSignupDiagnostic"
  );

  assert.match(
    loginOptions,
    /:\s*\{\s*config_id:\s*metaConfig\.embeddedSignupConfigId,\s*response_type:\s*"code",\s*override_default_response_type:\s*true,\s*extras:\s*\{\s*version:\s*"v4"\s*\},\s*\};/
  );
});

test("standard FINISH event still supplies session details to Option 1", () => {
  const messageHandler = sourceBetween(
    connectPageSource,
    "const handleMessage = (event) =>",
    "window.addEventListener(\"message\", handleMessage)"
  );

  assert.match(
    messageHandler,
    /if \(payload\.event === "FINISH"\) \{\s*const nextSessionInfo = extractEmbeddedSignupSessionInfo\(payload\);\s*setSessionInfo\(nextSessionInfo\);/
  );
  assert.match(
    connectParserSource,
    /META_EMBEDDED_SIGNUP_ORIGIN = "https:\/\/www\.facebook\.com"/
  );
  assert.match(connectParserSource, /event\?\.origin !== META_EMBEDDED_SIGNUP_ORIGIN/);
  assert.match(connectParserSource, /payload\?\.type === META_EMBEDDED_SIGNUP_EVENT_TYPE/);
});

test("standard callback stores its authorization code after diagnostic branches return", () => {
  const callback = sourceBetween(
    connectPageSource,
    "fb.login(",
    "loginOptions\n      );"
  );

  assert.match(callback, /if \(signupMode === SIGNUP_MODE_COEXISTENCE_TEST\)[\s\S]*?return;/);
  assert.match(callback, /if \(signupMode === SIGNUP_MODE_WABA_ONLY_DIAGNOSTIC\)[\s\S]*?return;/);
  assert.match(callback, /if \(!code\)[\s\S]*?return;[\s\S]*?setAuthCode\(code\);/);
});

test("Option 1 completion API contract remains code, WABA, phone, and signup data", () => {
  const completion = sourceBetween(
    connectPageSource,
    "async function completeConnection()",
    "completeConnection();"
  );

  assert.match(
    completion,
    /\/api\/vendor\/whatsapp-business\/meta\/complete/
  );
  assert.match(completion, /method:\s*"POST"/);
  assert.match(completion, /connectToken,\s*code:\s*authCode,\s*wabaId:\s*sessionInfo\.wabaId,\s*phoneNumberId:\s*sessionInfo\.phoneNumberId,\s*signupData:\s*sessionInfo/);
});

test("standard completion route remains authenticated and mapped to its controller", () => {
  assert.match(
    routesSource,
    /"\/meta\/complete",\s*requireVendorOrWhatsappConnectAccess,\s*completeMetaWhatsappConnection/
  );
});

test("standard completion still exchanges, validates, persists Meta, and starts disabled", () => {
  const completion = sourceBetween(
    controllerSource,
    "async function completeMetaWhatsappConnection",
    "async function diagnoseMetaCoexistenceSignup"
  );

  assert.match(completion, /exchangeEmbeddedSignupCode\(code\)/);
  assert.match(completion, /validateConnection\(\{\s*accessToken,\s*wabaId,\s*phoneNumberId/);
  assert.match(completion, /enabled:\s*false,\s*provider:\s*"meta",\s*connectionStatus:\s*"connected"/);
  assert.match(completion, /applyReconnectRegistrationLifecycle\(/);
  assert.match(completion, /record\.Model\.updateOne\([\s\S]*?\$set:\s*\{\s*whatsappBusiness\s*\}/);
});

test("standard phone registration keeps the six-digit PIN /register contract", () => {
  const registration = sourceBetween(
    metaServiceSource,
    "async function registerMetaPhoneNumber",
    "async function registerPhoneNumber"
  );

  assert.match(registration, /\^\\d\{6\}\$/);
  assert.match(registration, /graphUrl\(`\$\{id\}\/register`\)/);
  assert.match(registration, /messaging_product:\s*"whatsapp",\s*pin:\s*registrationPin/);
  assert.match(registration, /response\?\.data\?\.success === true/);
});

test("standard activation remains fail-closed unless every existing check passes", () => {
  const eligible = buildActivationEligibility(
    standardReadyConfig(),
    { status: "limited" }
  );
  assert.equal(eligible.eligible, true);

  for (const config of [
    standardReadyConfig({ connectionStatus: "error" }),
    standardReadyConfig({ phoneRegistrationStatus: "registration_required" }),
    standardReadyConfig({ messagingReadiness: { status: "unknown" } }),
    standardReadyConfig({ displayNameReadiness: { status: "pending", canSend: false } }),
    standardReadyConfig({ templateInstances: [] }),
    standardReadyConfig({ testMessage: { status: "failed" } }),
  ]) {
    assert.equal(
      buildActivationEligibility(config, config.messagingReadiness).eligible,
      false
    );
  }
});

test("standard activated vendor routes through Meta and disabled vendor falls back to MSG91", () => {
  assert.equal(
    resolveWhatsAppBillingRoute({ whatsappBusiness: standardReadyConfig() }).route,
    ROUTES.VENDOR_META
  );
  assert.equal(
    resolveWhatsAppBillingRoute({
      whatsappBusiness: standardReadyConfig({ enabled: false }),
    }).route,
    ROUTES.YNOT_MSG91
  );
  assert.equal(
    resolveWhatsAppBillingRoute({
      whatsappBusiness: standardReadyConfig({ phoneRegistrationStatus: "error" }),
    }).route,
    ROUTES.YNOT_MSG91
  );
});

test("Options 2 and 3 remain isolated from standard completion", () => {
  assert.match(
    connectPageSource,
    /startMetaSignup\(SIGNUP_MODE_COEXISTENCE_TEST\)[\s\S]*?Connect Existing WhatsApp Business Number/
  );
  assert.match(
    connectPageSource,
    /\/api\/vendor\/whatsapp-business\/meta\/coexistence\/complete/
  );
  assert.match(
    connectPageSource,
    /startMetaSignup\(SIGNUP_MODE_WABA_ONLY_DIAGNOSTIC\)[\s\S]*?TEST . WABA-Only Signup/
  );

  const wabaHandler = sourceBetween(
    connectPageSource,
    "if (activeSignupModeRef.current === SIGNUP_MODE_WABA_ONLY_DIAGNOSTIC)",
    "if (\n        activeSignupModeRef.current === SIGNUP_MODE_COEXISTENCE_TEST"
  );
  assert.match(wabaHandler, /No backend call was made/);
  assert.match(wabaHandler, /return;/);
});
