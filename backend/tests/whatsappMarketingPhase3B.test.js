const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const WhatsappMarketingTestSend = require("../models/WhatsappMarketingTestSend");
const { sendMetaTemplateMessage } = require("../services/metaWhatsAppService");
const {
  assertAuthorizedMarketingTestRecipient,
  buildMarketingTestSendPayload,
  mapMarketingTestDeliveryStatus,
  parseAuthorizedMarketingTestRecipients,
} = require("../services/whatsappMarketingTestSendService");
const {
  processMarketingTestDeliveryStatuses,
} = require("../services/metaWhatsappWebhookService");

const VENDOR_ID = "692403a24d4d3a1b6a7f0ae5";
const OTHER_VENDOR_ID = "692403a24d4d3a1b6a7f0ae6";
const TEMPLATE_ID = "692403a24d4d3a1b6a7f0ae9";

function approvedTemplate(headerType = "NONE") {
  return {
    _id: TEMPLATE_ID,
    draftVersion: 2,
    metaTemplate: {
      templateId: "meta-template-1",
      templateName: "ynot_festive_offer",
      language: "en",
      status: "APPROVED",
    },
    submittedSnapshot: {
      draftVersion: 2,
      messageBody: "Hi {{customer_name}}, {{offer_details}} at {{salon_name}}.",
      metaBody: "Hi {{1}}, {{2}} at {{3}}.",
      variableOrder: ["customer_name", "offer_details", "salon_name"],
      headerType,
      primaryMedia: headerType === "NONE" ? null : {
        url: headerType === "IMAGE" ? "https://cdn.example/offer.webp" : "https://cdn.example/offer.pdf",
        originalName: headerType === "DOCUMENT" ? "offer.pdf" : "offer.webp",
      },
    },
  };
}

test("test recipients require an exact vendor-scoped server allowlist entry", () => {
  const env = { WHATSAPP_MARKETING_TEST_RECIPIENTS: `${VENDOR_ID}:+919666060396` };
  const parsed = parseAuthorizedMarketingTestRecipients(env.WHATSAPP_MARKETING_TEST_RECIPIENTS);
  assert.equal(parsed.get(VENDOR_ID).has("919666060396"), true);
  assert.equal(assertAuthorizedMarketingTestRecipient({ vendorId: VENDOR_ID, phone: "9666060396", env }), "919666060396");
  assert.throws(
    () => assertAuthorizedMarketingTestRecipient({ vendorId: OTHER_VENDOR_ID, phone: "9666060396", env }),
    (error) => error.code === "marketing_test_recipient_not_authorized" && error.statusCode === 403
  );
  assert.throws(
    () => assertAuthorizedMarketingTestRecipient({ vendorId: VENDOR_ID, phone: "123", env }),
    (error) => error.code === "marketing_test_recipient_invalid"
  );
});

test("TEXT, IMAGE, and DOCUMENT test payloads preserve approved personalization and media", () => {
  for (const headerType of ["NONE", "IMAGE", "DOCUMENT"]) {
    const result = buildMarketingTestSendPayload({
      template: approvedTemplate(headerType),
      customerName: "Priya",
      offerDetails: "20% off",
      salonName: "Beauty Spot",
    });
    assert.deepEqual(result.bodyParameters, ["Priya", "20% off", "Beauty Spot"]);
    assert.equal(result.preview, "Hi Priya, 20% off at Beauty Spot.");
    assert.equal(result.headerParameter?.type || "NONE", headerType);
  }
  assert.throws(
    () => buildMarketingTestSendPayload({
      template: approvedTemplate(), customerName: "", offerDetails: "20% off", salonName: "Beauty Spot",
    }),
    (error) => error.code === "marketing_test_personalization_missing"
  );
});

test("Meta test sender emits one template message with selected document header", async () => {
  let request;
  const response = await sendMetaTemplateMessage({
    phoneNumberId: "phone-1",
    accessToken: "secret",
    recipientPhoneNumber: "+919666060396",
    templateName: "ynot_festive_offer",
    bodyParameters: ["Priya", "20% off", "Beauty Spot"],
    headerParameter: { type: "DOCUMENT", link: "https://cdn.example/offer.pdf", filename: "offer.pdf" },
    httpClient: {
      post: async (url, payload, options) => {
        request = { url, payload, options };
        return { data: { messages: [{ id: "wamid.test" }] } };
      },
    },
  });
  assert.equal(response.messages[0].id, "wamid.test");
  assert.equal(request.payload.to, "919666060396");
  assert.equal(request.payload.template.components[0].parameters[0].type, "document");
  assert.equal(request.payload.template.components[1].parameters.length, 3);
  assert.match(request.options.headers.Authorization, /^Bearer /);
});

test("Meta provider failures are sanitized and do not expose access tokens", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    await assert.rejects(
      sendMetaTemplateMessage({
        phoneNumberId: "phone-1",
        accessToken: "secret-token",
        recipientPhoneNumber: "+919666060396",
        templateName: "ynot_festive_offer",
        httpClient: {
          post: async () => {
            const error = new Error("network failure");
            error.response = { status: 400, data: { error: { code: 131026, message: "Undeliverable" } } };
            throw error;
          },
        },
      }),
      (error) => (
        error.code === "meta_test_send_failed" &&
        error.metaError.code === 131026 &&
        !JSON.stringify(error).includes("secret-token")
      )
    );
  } finally {
    console.error = originalError;
  }
});

test("signed delivery status reconciliation is vendor-scoped and does not regress terminal progress", async () => {
  let query;
  let mutation;
  const results = await processMarketingTestDeliveryStatuses(
    { value: { statuses: [{ id: "wamid.test", status: "delivered" }] } },
    VENDOR_ID,
    {
      WhatsappMarketingTestSendModel: {
        updateOne: async (nextQuery, nextMutation) => {
          query = nextQuery;
          mutation = nextMutation;
          return { matchedCount: 1 };
        },
      },
    }
  );
  assert.equal(query.vendorId, VENDOR_ID);
  assert.equal(query.metaMessageId, "wamid.test");
  assert.deepEqual(query.status.$in, ["ACCEPTED", "SENT", "DELIVERED"]);
  assert.equal(mutation.$set.status, "DELIVERED");
  assert.equal(results[0].updated, true);
  assert.equal(mapMarketingTestDeliveryStatus("read"), "READ");
  assert.equal(mapMarketingTestDeliveryStatus("unknown"), "");
});

test("test-send records are separate from campaign delivery data and never store a raw phone", () => {
  const record = new WhatsappMarketingTestSend({
    vendorId: VENDOR_ID,
    templateId: TEMPLATE_ID,
    metaTemplateId: "meta-template-1",
    metaTemplateName: "ynot_festive_offer",
    recipientHash: "a".repeat(64),
    recipientMasked: "+91******0396",
    headerType: "IMAGE",
  });
  assert.equal(record.status, "SUBMITTING");
  assert.equal(WhatsappMarketingTestSend.schema.path("recipientPhoneNumber"), undefined);
  assert.ok(WhatsappMarketingTestSend.schema.indexes().some(([keys, options]) => (
    keys.metaMessageId === 1 && options.unique === true
  )));
});

test("Phase 3B routes remain vendor-authenticated and expose no campaign send endpoint", () => {
  const root = path.resolve(__dirname, "..");
  const routes = fs.readFileSync(path.join(root, "routes/vendorWhatsappMarketingRoutes.js"), "utf8");
  const controller = fs.readFileSync(path.join(root, "controllers/vendorWhatsappMarketingTestSendController.js"), "utf8");
  assert.match(routes, /requireVendorAccessFromExistingAuth/);
  assert.match(routes, /requireWhatsappMarketingCapability/);
  assert.match(routes, /marketing-test-sends/);
  assert.doesNotMatch(routes, /campaigns[^\n]*send/);
  assert.match(controller, /confirmedAuthorized !== true/);
  assert.match(controller, /getApprovedMarketingTemplate/);
  assert.match(controller, /sendMetaTemplateMessage/);
  assert.doesNotMatch(controller, /MSG91|sendWhatsappMessage|selectedCustomerIds/);
});
