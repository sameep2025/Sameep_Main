const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  BILL_STANDARD_LANGUAGE,
  BILL_STANDARD_TEMPLATE_NAME,
  ROUTES,
  buildBillStandardTemplatePayload,
  resolveWhatsAppBillingRoute,
} = require("../services/whatsappBillingRouteResolver");

function readyWhatsappBusiness(overrides = {}) {
  return {
    provider: "meta",
    enabled: true,
    connectionStatus: "connected",
    phoneRegistrationStatus: "active",
    messagingReadiness: { status: "limited" },
    templateInstances: [
      {
        masterTemplateKey: "BILL_STANDARD",
        status: "approved",
      },
    ],
    testMessage: {
      status: "successful",
    },
    ...overrides,
  };
}

function resolve(overrides = {}) {
  return resolveWhatsAppBillingRoute({
    whatsappBusiness: readyWhatsappBusiness(overrides),
  });
}

test("provider meta, enabled true, and all ready resolves to vendor_meta", () => {
  assert.equal(resolve().route, ROUTES.VENDOR_META);
});

test("provider meta and enabled false resolves to ynot_msg91", () => {
  assert.equal(resolve({ enabled: false }).route, ROUTES.YNOT_MSG91);
});

test("provider msg91 resolves to ynot_msg91", () => {
  assert.equal(resolve({ provider: "msg91" }).route, ROUTES.YNOT_MSG91);
});

test("disconnected account resolves to ynot_msg91", () => {
  assert.equal(resolve({ connectionStatus: "not_connected" }).route, ROUTES.YNOT_MSG91);
});

test("inactive phone registration resolves to ynot_msg91", () => {
  assert.equal(resolve({ phoneRegistrationStatus: "registration_required" }).route, ROUTES.YNOT_MSG91);
});

test("blocked messaging resolves to ynot_msg91", () => {
  assert.equal(resolve({ messagingReadiness: { status: "blocked" } }).route, ROUTES.YNOT_MSG91);
});

test("unknown messaging resolves to ynot_msg91", () => {
  assert.equal(resolve({ messagingReadiness: { status: "unknown" } }).route, ROUTES.YNOT_MSG91);
});

test("limited messaging allows vendor_meta", () => {
  assert.equal(resolve({ messagingReadiness: { status: "limited" } }).route, ROUTES.VENDOR_META);
});

test("available messaging allows vendor_meta", () => {
  assert.equal(resolve({ messagingReadiness: { status: "available" } }).route, ROUTES.VENDOR_META);
});

test("pending template resolves to ynot_msg91", () => {
  assert.equal(
    resolve({ templateInstances: [{ masterTemplateKey: "BILL_STANDARD", status: "pending" }] }).route,
    ROUTES.YNOT_MSG91
  );
});

test("rejected template resolves to ynot_msg91", () => {
  assert.equal(
    resolve({ templateInstances: [{ masterTemplateKey: "BILL_STANDARD", status: "rejected" }] }).route,
    ROUTES.YNOT_MSG91
  );
});

test("approved template passes template check", () => {
  assert.equal(resolve().checks.billingTemplateApproved, true);
});

test("not-tested test message resolves to ynot_msg91", () => {
  assert.equal(resolve({ testMessage: { status: "not_tested" } }).route, ROUTES.YNOT_MSG91);
});

test("failed test message resolves to ynot_msg91", () => {
  assert.equal(resolve({ testMessage: { status: "failed" } }).route, ROUTES.YNOT_MSG91);
});

test("successful test message passes test-message check", () => {
  assert.equal(resolve().checks.testMessageSuccessful, true);
});

test("missing whatsappBusiness resolves to ynot_msg91", () => {
  assert.equal(resolveWhatsAppBillingRoute({}).route, ROUTES.YNOT_MSG91);
});

test("legacy vendor resolves to ynot_msg91", () => {
  assert.equal(
    resolveWhatsAppBillingRoute({
      whatsappBusiness: { provider: "msg91", enabled: false },
    }).route,
    ROUTES.YNOT_MSG91
  );
});

test("missing messaging state resolves to ynot_msg91", () => {
  assert.equal(resolve({ messagingReadiness: undefined }).route, ROUTES.YNOT_MSG91);
});

test("enabled true plus eligibility false resolves to ynot_msg91", () => {
  assert.equal(resolve({ enabled: true, phoneRegistrationStatus: "unknown" }).route, ROUTES.YNOT_MSG91);
});

test("resolver does not mutate input", () => {
  const input = {
    whatsappBusiness: readyWhatsappBusiness({
      templateInstances: [{ masterTemplateKey: "BILL_STANDARD", status: "approved" }],
    }),
  };
  const before = JSON.stringify(input);

  resolveWhatsAppBillingRoute(input);

  assert.equal(JSON.stringify(input), before);
});

test("resolver performs no DB writes, Meta calls, or MSG91 calls", () => {
  const resolverSource = fs.readFileSync(
    path.join(__dirname, "../services/whatsappBillingRouteResolver.js"),
    "utf8"
  );

  assert.equal(/updateOne|findOneAndUpdate|save\(/.test(resolverSource), false);
  assert.equal(/axios|fetch|\/messages|sendTemplateMessage|sendBillWhatsapp/.test(resolverSource), false);
});

test("existing billing controller uses guarded WhatsApp billing router", () => {
  const billingControllerSource = fs.readFileSync(
    path.join(__dirname, "../controllers/billingController.js"),
    "utf8"
  );

  assert.match(billingControllerSource, /sendRoutedWhatsAppBillingMessage/);
  assert.match(billingControllerSource, /isVendorMetaBillRoutingEnabled/);
});

test("BILL_STANDARD payload builder uses exact template name", () => {
  assert.equal(buildBillStandardTemplatePayload().templateName, BILL_STANDARD_TEMPLATE_NAME);
  assert.equal(BILL_STANDARD_TEMPLATE_NAME, "ynot_bill_standard_v1");
});

test("BILL_STANDARD payload builder uses English language", () => {
  assert.equal(buildBillStandardTemplatePayload().language, BILL_STANDARD_LANGUAGE);
  assert.equal(BILL_STANDARD_LANGUAGE, "en");
});

test("BILL_STANDARD payload builder uses exact approved parameter order", () => {
  const payload = buildBillStandardTemplatePayload({
    vendorName: "Vendor",
    billAmount: 1050,
    pointsEarned: 52,
    pointsRedeemed: 0,
    finalPaid: 1050,
    loyaltyBalance: 102,
    billUrl: "https://vendor.example/b/abc",
  });

  assert.deepEqual(payload.bodyParameters, [
    "Vendor",
    "1050",
    "52",
    "0",
    "1050",
    "102",
    "https://vendor.example/b/abc",
  ]);
});

test("BILL_STANDARD payload builder passes bill URL through from caller", () => {
  const billUrl = "https://custom.example/b/token";
  const payload = buildBillStandardTemplatePayload({ billUrl });

  assert.equal(payload.bodyParameters[6], billUrl);
});

test("BILL_STANDARD payload builder converts numeric values safely", () => {
  const payload = buildBillStandardTemplatePayload({
    billAmount: 1050,
    pointsEarned: 52,
    pointsRedeemed: 0,
    finalPaid: 1050,
    loyaltyBalance: 102,
  });

  assert.deepEqual(payload.bodyParameters.slice(1, 6), ["1050", "52", "0", "1050", "102"]);
});

test("BILL_STANDARD payload builder does not hardcode sample bill URL", () => {
  const payload = buildBillStandardTemplatePayload({});

  assert.notEqual(payload.bodyParameters[6], "https://sameep.app/bill/example");
});

test("BILL_STANDARD payload builder has no send side effect", () => {
  const resolverSource = fs.readFileSync(
    path.join(__dirname, "../services/whatsappBillingRouteResolver.js"),
    "utf8"
  );

  assert.equal(/axios|fetch|sendTemplateMessage|sendBillWhatsapp|\/messages/.test(resolverSource), false);
});
