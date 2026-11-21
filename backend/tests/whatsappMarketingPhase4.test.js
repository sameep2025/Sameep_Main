const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const WhatsappMarketingCampaign = require("../models/WhatsappMarketingCampaign");
const WhatsappMarketingCampaignRecipient = require("../models/WhatsappMarketingCampaignRecipient");
const {
  buildCampaignSendPayload,
  classifyCampaignSendFailure,
  processClaimedCampaignRecipient,
  queueCampaignExecution,
  recoverExpiredRecipientClaims,
  refreshCampaignDeliverySummary,
} = require("../services/whatsappMarketingCampaignExecutionService");
const {
  getCampaignWorkerConfig,
  initializeWhatsappMarketingCampaignWorker,
} = require("../services/whatsappMarketingCampaignWorker");
const {
  processMarketingCampaignDeliveryStatuses,
} = require("../services/metaWhatsappWebhookService");
const {
  loadVendorMetaConnection,
} = require("../controllers/vendorWhatsappMarketingController");

const VENDOR_ID = "692403a24d4d3a1b6a7f0ae5";
const CAMPAIGN_ID = "692403a24d4d3a1b6a7f0ae6";
const CUSTOMER_ID = "692403a24d4d3a1b6a7f0ae7";
const TEMPLATE_ID = "692403a24d4d3a1b6a7f0ae8";

function campaignDraft() {
  return {
    _id: CAMPAIGN_ID,
    vendorId: VENDOR_ID,
    campaignName: "November offer",
    status: "DRAFT",
    sourceSegment: { segment: "inactive", filters: { inactiveDays: 45 } },
    selection: {
      mode: "EXPLICIT",
      selectedCustomerIds: [CUSTOMER_ID],
      excludedCustomerIds: [],
    },
    templateId: TEMPLATE_ID,
    offerDetails: "20% off",
    counts: { selected: 1, eligible: 0, ineligible: 1, excluded: 0 },
  };
}

function approvedTemplate() {
  return {
    _id: TEMPLATE_ID,
    metaTemplate: {
      templateId: "meta-template-1",
      templateName: "ynot_offer",
      language: "en",
      status: "APPROVED",
    },
    submittedSnapshot: {
      messageBody: "Hi {{customer_name}}, {{offer_details}} at {{salon_name}}.",
      metaBody: "Hi {{1}}, {{2}} at {{3}}.",
      variableOrder: ["customer_name", "offer_details", "salon_name"],
      headerType: "IMAGE",
      primaryMedia: { url: "https://cdn.example/offer.webp", originalName: "offer.webp" },
    },
  };
}

function recipient() {
  return {
    _id: "692403a24d4d3a1b6a7f0ae9",
    vendorId: VENDOR_ID,
    campaignId: CAMPAIGN_ID,
    runId: "run-1",
    customerId: CUSTOMER_ID,
    normalizedPhone: "919666060396",
    personalization: {
      customer_name: "Priya",
      offer_details: "20% off",
      salon_name: "Beauty Spot",
    },
    status: "PROCESSING",
    attemptCount: 1,
    leaseToken: "lease-1",
  };
}

test("campaign and recipient schemas provide durable lifecycle and duplicate-send indexes", () => {
  const campaign = new WhatsappMarketingCampaign({
    ...campaignDraft(),
    status: "QUEUED",
    execution: { runId: "run-1", queuedAt: new Date() },
  });
  assert.equal(campaign.validateSync(), undefined);
  assert.ok(WhatsappMarketingCampaign.schema.path("status").enumValues.includes("PARTIALLY_FAILED"));
  const indexes = WhatsappMarketingCampaignRecipient.schema.indexes();
  assert.ok(indexes.some(([keys, options]) => keys.campaignId === 1 && keys.customerId === 1 && options.unique));
  assert.ok(indexes.some(([keys, options]) => keys.campaignId === 1 && keys.normalizedPhone === 1 && options.unique));
  assert.ok(indexes.some(([keys, options]) => keys.metaMessageId === 1 && options.unique));
});

test("concurrent Run Campaign requests atomically allow only one execution", async () => {
  let lockCalls = 0;
  let materializations = 0;
  const CampaignModel = {
    findOne: () => ({ lean: async () => campaignDraft() }),
    findOneAndUpdate: async (_query, update) => {
      lockCalls += 1;
      return lockCalls === 1
        ? { ...campaignDraft(), ...update.$set, execution: update.$set.execution }
        : null;
    },
    updateOne: async () => ({ matchedCount: 1 }),
  };
  const dependencies = {
    CampaignModel,
    RecipientModel: {
      bulkWrite: async () => { materializations += 1; },
    },
    getApprovedMarketingTemplate: async () => approvedTemplate(),
    resolveCampaignRecipients: async () => ({
      recipients: [{
        customerId: CUSTOMER_ID,
        normalizedPhone: "919666060396",
        displayName: "Priya",
        consentStatus: "OPTED_IN",
        eligible: true,
        personalization: recipient().personalization,
      }],
      counts: { selected: 1, eligible: 1, ineligible: 0, excluded: 0 },
    }),
    loadVendorMetaConnection: async () => ({ wabaId: "waba-1", phoneNumberId: "phone-1" }),
  };
  const results = await Promise.allSettled([
    queueCampaignExecution({ vendorId: VENDOR_ID, campaignId: CAMPAIGN_ID, confirmed: true, dependencies }),
    queueCampaignExecution({ vendorId: VENDOR_ID, campaignId: CAMPAIGN_ID, confirmed: true, dependencies }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.reason?.code === "campaign_run_conflict").length, 1);
  assert.equal(materializations, 1);
  const queued = results.find((result) => result.status === "fulfilled").value;
  assert.equal(queued.counts.eligible, 1);
  assert.equal(queued.recipients[0].customerId, CUSTOMER_ID);
});

test("send payload uses the frozen approved personalization and selected media", () => {
  const payload = buildCampaignSendPayload(
    { templateSnapshot: { ...approvedTemplate().submittedSnapshot, metaTemplateName: "ynot_offer" } },
    recipient()
  );
  assert.deepEqual(payload.bodyParameters, ["Priya", "20% off", "Beauty Spot"]);
  assert.equal(payload.headerParameter.type, "IMAGE");
});

test("worker rechecks opt-out and never calls Meta for an ineligible recipient", async () => {
  let sendCalls = 0;
  let mutation;
  const result = await processClaimedCampaignRecipient(recipient(), {
    dependencies: {
      CampaignModel: {
        findOne: () => ({ lean: async () => ({
          ...campaignDraft(),
          status: "RUNNING",
          execution: { runId: "run-1", phoneNumberId: "phone-1" },
          templateSnapshot: { metaTemplateId: "meta-template-1" },
        }) }),
      },
      RecipientModel: { updateOne: async (_query, update) => { mutation = update; } },
      ConsentModel: { findOne: () => ({ lean: async () => ({ status: "OPTED_OUT" }) }) },
      TemplateModel: { findOne: () => ({ lean: async () => approvedTemplate() }) },
      sendMetaTemplateMessage: async () => { sendCalls += 1; },
    },
  });
  assert.equal(result.status, "CANCELLED");
  assert.equal(mutation.$set.failureCode, "MARKETING_OPT_OUT");
  assert.equal(sendCalls, 0);
});

test("known safe Meta failures retry but ambiguous timeouts never do", () => {
  assert.equal(classifyCampaignSendFailure({ metaError: { status: 503 } }, 1, 3).retry, true);
  const ambiguous = classifyCampaignSendFailure({ code: "ETIMEDOUT" }, 1, 3);
  assert.equal(ambiguous.retry, false);
  assert.equal(ambiguous.ambiguous, true);
  assert.equal(ambiguous.code, "META_REQUEST_OUTCOME_UNKNOWN");
});

test("restart recovery marks expired in-flight requests ambiguous instead of requeueing", async () => {
  let query;
  let update;
  await recoverExpiredRecipientClaims({
    now: new Date("2026-11-21T00:00:00.000Z"),
    dependencies: {
      RecipientModel: {
        updateMany: async (nextQuery, nextUpdate) => {
          query = nextQuery;
          update = nextUpdate;
          return { modifiedCount: 1 };
        },
      },
    },
  });
  assert.equal(query.status, "PROCESSING");
  assert.equal(update.$set.status, "FAILED");
  assert.equal(update.$set.ambiguousFailure, true);
});

test("signed webhook campaign updates are vendor-scoped and refresh campaign totals", async () => {
  let query;
  let refreshedCampaignId = "";
  const result = await processMarketingCampaignDeliveryStatuses(
    { value: { statuses: [{ id: "wamid.campaign", status: "delivered" }] } },
    VENDOR_ID,
    {
      WhatsappMarketingCampaignRecipientModel: {
        findOneAndUpdate: (nextQuery) => {
          query = nextQuery;
          return { select: async () => ({ campaignId: CAMPAIGN_ID }) };
        },
      },
      refreshCampaignDeliverySummary: async (campaignId) => { refreshedCampaignId = String(campaignId); },
    }
  );
  assert.equal(query.vendorId, VENDOR_ID);
  assert.equal(query.metaMessageId, "wamid.campaign");
  assert.equal(result[0].updated, true);
  assert.equal(refreshedCampaignId, CAMPAIGN_ID);
});

test("late webhook failures replace a premature completed campaign status", async () => {
  let mutation;
  const result = await refreshCampaignDeliverySummary(CAMPAIGN_ID, {
    RecipientModel: {
      aggregate: async () => [
        { _id: "DELIVERED", count: 1 },
        { _id: "FAILED", count: 1 },
      ],
    },
    CampaignModel: {
      findById: () => ({
        select: () => ({ lean: async () => ({ status: "COMPLETED", execution: {} }) }),
      }),
      updateOne: async (_query, update) => { mutation = update; },
    },
  });
  assert.equal(result.status, "PARTIALLY_FAILED");
  assert.equal(mutation.$set.status, "PARTIALLY_FAILED");
  assert.equal(mutation.$set["execution.completedAt"], undefined);
});

test("worker limits are configurable and bounded", () => {
  const config = getCampaignWorkerConfig({
    WHATSAPP_MARKETING_ENABLED: "true",
    WHATSAPP_MARKETING_CAMPAIGN_CONCURRENCY: "99",
    WHATSAPP_MARKETING_CAMPAIGN_RATE_PER_SECOND: "0",
  });
  assert.equal(config.enabled, true);
  assert.equal(config.concurrency, 10);
  assert.equal(config.ratePerSecond, 1);
  assert.equal(typeof initializeWhatsappMarketingCampaignWorker, "function");
});

test("worker credential reload skips repeated live WABA verification", async () => {
  let accountLookups = 0;
  const connection = await loadVendorMetaConnection(VENDOR_ID, {
    DummyVendorModel: {
      findById: () => ({
        select: () => ({
          lean: async () => ({
            whatsappBusiness: {
              provider: "meta",
              connectionStatus: "connected",
              wabaId: "waba-1",
              phoneNumberId: "phone-1",
              metaAuth: { accessTokenEncrypted: "encrypted-token" },
            },
          }),
        }),
      }),
    },
    decryptMetaAccessToken: () => "decrypted-token",
    getWhatsAppBusinessAccount: async () => {
      accountLookups += 1;
      return { id: "waba-1" };
    },
    verifyAccount: false,
  });
  assert.equal(connection.phoneNumberId, "phone-1");
  assert.equal(connection.accessToken, "decrypted-token");
  assert.equal(accountLookups, 0);
});

test("Phase 4 routes are authenticated and campaign execution never uses MSG91", () => {
  const root = path.resolve(__dirname, "..");
  const routes = fs.readFileSync(path.join(root, "routes/vendorWhatsappMarketingRoutes.js"), "utf8");
  const service = fs.readFileSync(
    path.join(root, "services/whatsappMarketingCampaignExecutionService.js"),
    "utf8"
  );
  assert.match(routes, /requireVendorAccessFromExistingAuth/);
  assert.match(routes, /campaigns\/:campaignId\/run/);
  assert.match(routes, /campaigns\/:campaignId\/cancel/);
  assert.match(service, /sendMetaTemplateMessage/);
  assert.doesNotMatch(service, /MSG91|sendWhatsappMessage|whatsappBillingRouter/);
});
