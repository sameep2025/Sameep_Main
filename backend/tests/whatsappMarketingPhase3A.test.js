const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const mongoose = require("mongoose");

const WhatsappMarketingCampaign = require("../models/WhatsappMarketingCampaign");
const WhatsappMarketingConsent = require("../models/WhatsappMarketingConsent");
const {
  MAX_CAMPAIGN_RECIPIENTS,
  buildCampaignTemplateSnapshot,
  getApprovedMarketingTemplate,
  normalizeSelectionInput,
  renderRecipientPreview,
  resolveCampaignRecipients,
} = require("../services/whatsappMarketingCampaignService");

const VENDOR_ID = "692403a24d4d3a1b6a7f0ae5";
const CUSTOMER_A = "692403a24d4d3a1b6a7f0ae6";
const CUSTOMER_B = "692403a24d4d3a1b6a7f0ae7";
const CUSTOMER_C = "692403a24d4d3a1b6a7f0ae8";
const TEMPLATE_ID = "692403a24d4d3a1b6a7f0ae9";

function modelReturningVendor() {
  return {
    findById: () => ({ select: () => ({ lean: async () => ({ businessName: "Beauty Spot" }) }) }),
  };
}

function consentModel(entries) {
  return {
    find: () => ({ lean: async () => entries }),
  };
}

test("selection input preserves segment filters, explicit IDs, and individual exclusions", () => {
  assert.deepEqual(normalizeSelectionInput({
    mode: "ALL_MATCHING",
    segment: "inactive",
    filters: { inactiveDays: 60 },
    selectedCustomerIds: [],
    excludedCustomerIds: [CUSTOMER_A, CUSTOMER_A, CUSTOMER_B],
  }), {
    mode: "ALL_MATCHING",
    segment: "inactive",
    filters: { inactiveDays: 60, spendingThreshold: 500 },
    selectedCustomerIds: [],
    excludedCustomerIds: [CUSTOMER_A, CUSTOMER_B],
  });
  assert.throws(
    () => normalizeSelectionInput({
      mode: "EXPLICIT",
      segment: "top_spenders",
      selectedCustomerIds: Array(MAX_CAMPAIGN_RECIPIENTS + 1).fill(CUSTOMER_A),
    }),
    (error) => error.code === "campaign_recipient_limit_exceeded"
  );
});

test("segment selection is backend-bounded, deduplicates phones, and applies consent safely", async () => {
  let requestedLimit = 0;
  const result = await resolveCampaignRecipients({
    vendorId: VENDOR_ID,
    selection: {
      mode: "ALL_MATCHING",
      segment: "top_spenders",
      selectedCustomerIds: [],
      excludedCustomerIds: [CUSTOMER_C],
    },
    template: {
      submittedSnapshot: { variableOrder: ["customer_name", "salon_name", "offer_details"] },
    },
    offerDetails: "20% off this week",
    dependencies: {
      resolveCustomerAnalyticsSegment: async ({ limit }) => {
        requestedLimit = limit;
        return [
          { customerId: CUSTOMER_A, phone: "9666060396", name: "Priya" },
          { customerId: CUSTOMER_B, phone: "919666060396", name: "Anu" },
          { customerId: CUSTOMER_C, phone: "9999999999", name: "Excluded" },
        ];
      },
      WhatsappMarketingConsentModel: consentModel([
        { customerId: CUSTOMER_A, status: "OPTED_IN", source: "VENDOR_RECORDED" },
        { customerId: CUSTOMER_B, status: "OPTED_IN", source: "VENDOR_RECORDED" },
      ]),
      DummyVendorModel: modelReturningVendor(),
      VendorModel: modelReturningVendor(),
    },
  });
  assert.equal(requestedLimit, MAX_CAMPAIGN_RECIPIENTS + 1);
  assert.equal(result.recipients.length, 2);
  assert.equal(result.recipients[0].eligible, true);
  assert.deepEqual(result.recipients[1].exclusionReasons, ["DUPLICATE_PHONE"]);
  assert.deepEqual(result.counts, { selected: 2, eligible: 1, ineligible: 1, excluded: 1 });
});

test("unknown consent and opt-out remain ineligible without assuming billing consent", async () => {
  const result = await resolveCampaignRecipients({
    vendorId: VENDOR_ID,
    selection: {
      mode: "EXPLICIT",
      segment: "repeat",
      selectedCustomerIds: [CUSTOMER_A, CUSTOMER_B],
      excludedCustomerIds: [],
    },
    dependencies: {
      resolveCustomerAnalyticsSegment: async () => [
        { customerId: CUSTOMER_A, phone: "9666060396", name: "Priya" },
        { customerId: CUSTOMER_B, phone: "9555555555", name: "Anu" },
      ],
      WhatsappMarketingConsentModel: consentModel([
        { customerId: CUSTOMER_B, status: "OPTED_OUT", source: "META_OPT_OUT" },
      ]),
      DummyVendorModel: modelReturningVendor(),
      VendorModel: modelReturningVendor(),
    },
  });
  assert.deepEqual(result.recipients[0].exclusionReasons, ["MARKETING_CONSENT_REQUIRED"]);
  assert.deepEqual(result.recipients[1].exclusionReasons, ["MARKETING_OPT_OUT"]);
  assert.equal(result.counts.eligible, 0);
});

test("missing personalization blocks only affected recipients and preview uses frozen values", async () => {
  const snapshot = {
    messageBody: "Hi {{customer_name}}, {{offer_details}} at {{salon_name}}.",
  };
  assert.equal(
    renderRecipientPreview(snapshot, {
      customer_name: "Priya",
      offer_details: "Free consultation",
      salon_name: "Beauty Spot",
    }),
    "Hi Priya, Free consultation at Beauty Spot."
  );
  const result = await resolveCampaignRecipients({
    vendorId: VENDOR_ID,
    selection: { mode: "EXPLICIT", segment: "top_spenders", selectedCustomerIds: [CUSTOMER_A] },
    template: { submittedSnapshot: { variableOrder: ["customer_name", "offer_details"] } },
    offerDetails: "",
    dependencies: {
      resolveCustomerAnalyticsSegment: async () => [
        { customerId: CUSTOMER_A, phone: "9666060396", name: "" },
      ],
      WhatsappMarketingConsentModel: consentModel([
        { customerId: CUSTOMER_A, status: "OPTED_IN", source: "VENDOR_RECORDED" },
      ]),
      DummyVendorModel: modelReturningVendor(),
      VendorModel: modelReturningVendor(),
    },
  });
  assert.deepEqual(result.recipients[0].exclusionReasons, [
    "MISSING_CUSTOMER_NAME",
    "MISSING_OFFER_DETAILS",
  ]);
});

test("campaign templates require the same vendor and dual persisted approval status", async () => {
  let query;
  const approved = {
    _id: TEMPLATE_ID,
    metaTemplate: { templateId: "meta-1", templateName: "ynot_offer", language: "en" },
    submittedSnapshot: {
      messageBody: "Hi {{customer_name}}",
      metaBody: "Hi {{1}}",
      variableOrder: ["customer_name"],
      draftVersion: 2,
      headerType: "NONE",
    },
  };
  const result = await getApprovedMarketingTemplate(VENDOR_ID, TEMPLATE_ID, {
    WhatsappMarketingTemplateModel: {
      findOne: (value) => {
        query = value;
        return { lean: async () => approved };
      },
    },
  });
  assert.equal(result, approved);
  assert.equal(query.vendorId, VENDOR_ID);
  assert.equal(query.status, "APPROVED");
  assert.equal(query["metaTemplate.status"], "APPROVED");
  assert.equal(buildCampaignTemplateSnapshot(approved).metaTemplateId, "meta-1");
});

test("campaign and consent schemas preserve vendor isolation and draft-only status", () => {
  const campaign = new WhatsappMarketingCampaign({
    vendorId: VENDOR_ID,
    campaignName: "November Offer",
    sourceSegment: { segment: "top_spenders", filters: {} },
    selection: { mode: "EXPLICIT", selectedCustomerIds: [CUSTOMER_A] },
    templateId: TEMPLATE_ID,
    templateSnapshot: {
      metaTemplateId: "meta-1",
      metaTemplateName: "ynot_offer",
      language: "en",
      draftVersion: 1,
      messageBody: "Hi",
      metaBody: "Hi",
      headerType: "NONE",
    },
    recipients: [],
    wabaSnapshot: { wabaId: "waba-1", verifiedAt: new Date() },
  });
  assert.equal(campaign.status, "DRAFT");
  const indexes = WhatsappMarketingConsent.schema.indexes();
  assert.ok(indexes.some(([keys, options]) => (
    keys.vendorId === 1 && keys.customerId === 1 && options.unique === true
  )));
});

test("campaign drafts safely support attaching an approved template later", () => {
  const campaign = new WhatsappMarketingCampaign({
    vendorId: VENDOR_ID,
    campaignName: "Template pending",
    sourceSegment: { segment: "inactive", filters: { inactiveDays: 45 } },
    selection: { mode: "EXPLICIT", selectedCustomerIds: [CUSTOMER_A] },
    recipients: [{
      customerId: CUSTOMER_A,
      normalizedPhone: "919666060396",
      displayName: "Priya",
      consentStatus: "OPTED_IN",
      eligible: true,
    }],
  });
  const error = campaign.validateSync();
  assert.equal(error, undefined);
  assert.equal(campaign.templateId, null);
  assert.equal(campaign.status, "DRAFT");
  assert.deepEqual(campaign.selection.selectedCustomerIds.map(String), [CUSTOMER_A]);
});

test("Phase 3A routes are vendor-authenticated and contain no send endpoint or Meta message call", () => {
  const root = path.resolve(__dirname, "..");
  const routes = fs.readFileSync(path.join(root, "routes/vendorWhatsappMarketingRoutes.js"), "utf8");
  const campaignController = fs.readFileSync(
    path.join(root, "controllers/vendorWhatsappMarketingCampaignController.js"),
    "utf8"
  );
  assert.match(routes, /requireVendorAccessFromExistingAuth/);
  assert.match(routes, /requireWhatsappMarketingCapability/);
  assert.match(routes, /campaign-recipient-preview/);
  assert.match(routes, /campaign-templates/);
  assert.match(routes, /campaigns\/:campaignId/);
  assert.doesNotMatch(routes, /campaigns[^\n]*send/);
  assert.doesNotMatch(campaignController, /sendTemplateMessage|sendMetaTemplateMessage|\/messages/);
});

