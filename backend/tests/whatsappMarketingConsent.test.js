const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  recordVendorMarketingPermission,
} = require("../services/whatsappMarketingConsentService");
const {
  resolveCampaignRecipients,
} = require("../services/whatsappMarketingCampaignService");

const VENDOR_ID = "692403a24d4d3a1b6a7f0ae5";
const CUSTOMER_ID = "692403a24d4d3a1b6a7f0ae6";
const CAPTURED_AT = new Date("2026-11-21T12:00:00.000Z");

function relationshipDependencies(overrides = {}) {
  return {
    ProfileModel: { exists: async () => true },
    BillingSessionModel: { exists: async () => false },
    ...overrides,
  };
}

test("vendor-recorded permission persists once with source and timestamp", async () => {
  let mutation;
  const consent = {
    vendorId: VENDOR_ID,
    customerId: CUSTOMER_ID,
    status: "OPTED_IN",
    source: "VENDOR_RECORDED",
    capturedAt: CAPTURED_AT,
  };
  const result = await recordVendorMarketingPermission({
    vendorId: VENDOR_ID,
    customerId: CUSTOMER_ID,
    permissionConfirmed: true,
    now: CAPTURED_AT,
    dependencies: relationshipDependencies({
      ConsentModel: {
        findOne: async () => null,
        findOneAndUpdate: async (query, update, options) => {
          mutation = { query, update, options };
          return consent;
        },
      },
    }),
  });
  assert.equal(result, consent);
  assert.deepEqual(mutation.query, {
    vendorId: VENDOR_ID,
    customerId: CUSTOMER_ID,
    status: { $ne: "OPTED_OUT" },
  });
  assert.deepEqual(mutation.update.$set, {
    status: "OPTED_IN",
    source: "VENDOR_RECORDED",
    capturedAt: CAPTURED_AT,
  });
  assert.equal(mutation.options.upsert, true);
});

test("existing permission is reusable and does not reset its capture timestamp", async () => {
  const existing = {
    vendorId: VENDOR_ID,
    customerId: CUSTOMER_ID,
    status: "OPTED_IN",
    source: "VENDOR_RECORDED",
    capturedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
  let writes = 0;
  const result = await recordVendorMarketingPermission({
    vendorId: VENDOR_ID,
    customerId: CUSTOMER_ID,
    permissionConfirmed: true,
    dependencies: relationshipDependencies({
      ConsentModel: {
        findOne: async () => existing,
        findOneAndUpdate: async () => { writes += 1; },
      },
    }),
  });
  assert.equal(result, existing);
  assert.equal(writes, 0);
});

test("vendor recording cannot overwrite an existing customer opt-out", async () => {
  await assert.rejects(
    recordVendorMarketingPermission({
      vendorId: VENDOR_ID,
      customerId: CUSTOMER_ID,
      permissionConfirmed: true,
      dependencies: relationshipDependencies({
        ConsentModel: {
          findOne: async () => ({ status: "OPTED_OUT", source: "META_OPT_OUT" }),
        },
      }),
    }),
    (error) => error.code === "marketing_consent_opted_out" && error.statusCode === 409
  );
});

test("permission recording requires confirmation and a vendor-customer relationship", async () => {
  await assert.rejects(
    recordVendorMarketingPermission({
      vendorId: VENDOR_ID,
      customerId: CUSTOMER_ID,
      permissionConfirmed: false,
    }),
    (error) => error.code === "marketing_consent_confirmation_required"
  );
  await assert.rejects(
    recordVendorMarketingPermission({
      vendorId: VENDOR_ID,
      customerId: CUSTOMER_ID,
      permissionConfirmed: true,
      dependencies: relationshipDependencies({
        ProfileModel: { exists: async () => false },
        BillingSessionModel: { exists: async () => false },
      }),
    }),
    (error) => error.code === "marketing_consent_customer_not_found" && error.statusCode === 404
  );
});

test("recorded permission makes an existing campaign recipient eligible without changing selection", async () => {
  let storedConsent = null;
  const selection = {
    mode: "EXPLICIT",
    segment: "top_spenders",
    selectedCustomerIds: [CUSTOMER_ID],
    excludedCustomerIds: [],
  };
  await recordVendorMarketingPermission({
    vendorId: VENDOR_ID,
    customerId: CUSTOMER_ID,
    permissionConfirmed: true,
    now: CAPTURED_AT,
    dependencies: relationshipDependencies({
      ConsentModel: {
        findOne: async () => storedConsent,
        findOneAndUpdate: async (_query, update) => {
          storedConsent = {
            vendorId: VENDOR_ID,
            customerId: CUSTOMER_ID,
            ...update.$set,
          };
          return storedConsent;
        },
      },
    }),
  });

  const result = await resolveCampaignRecipients({
    vendorId: VENDOR_ID,
    selection,
    template: { submittedSnapshot: { variableOrder: ["customer_name"] } },
    dependencies: {
      resolveCustomerAnalyticsSegment: async () => [{
        customerId: CUSTOMER_ID,
        phone: "9666060396",
        name: "Priya",
      }],
      WhatsappMarketingConsentModel: {
        find: () => ({ lean: async () => [storedConsent] }),
      },
      DummyVendorModel: {
        findById: () => ({
          select: () => ({ lean: async () => ({ businessName: "Beauty Spot" }) }),
        }),
      },
      VendorModel: {
        findById: () => ({ select: () => ({ lean: async () => null }) }),
      },
    },
  });

  assert.deepEqual(result.selection.selectedCustomerIds, selection.selectedCustomerIds);
  assert.deepEqual(result.selection.excludedCustomerIds, selection.excludedCustomerIds);
  assert.equal(result.counts.eligible, 1);
  assert.equal(result.recipients[0].consentSource, "VENDOR_RECORDED");
  assert.deepEqual(result.recipients[0].exclusionReasons, []);
});

test("marketing consent route remains behind vendor authentication and capability checks", () => {
  const routes = fs.readFileSync(
    path.join(__dirname, "../routes/vendorWhatsappMarketingRoutes.js"),
    "utf8"
  );
  assert.match(routes, /requireVendorAccessFromExistingAuth/);
  assert.match(routes, /requireWhatsappMarketingCapability/);
  assert.match(routes, /marketing-consents\/:customerId/);
  assert.match(routes, /recordMarketingPermission/);
});
