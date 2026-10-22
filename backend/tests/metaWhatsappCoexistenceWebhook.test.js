const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const MetaWhatsappCoexistenceEvent = require("../models/MetaWhatsappCoexistenceEvent");
const {
  buildCoexistenceDeduplicationKey,
  extractCoexistenceIdentity,
  hasCoexistenceWebhookEvents,
  processCoexistenceWebhookItem,
  processMetaWhatsappWebhook,
  verifyWebhookSignature,
} = require("../services/metaWhatsappWebhookService");
const {
  ROUTES,
  resolveWhatsAppBillingRoute,
} = require("../services/whatsappBillingRouteResolver");

const routeSource = fs.readFileSync(
  path.join(__dirname, "../routes/metaWhatsappWebhookRoutes.js"),
  "utf8"
);
const standardBaselineSource = fs.readFileSync(
  path.join(__dirname, "../../vendorpreview/app/whatsapp-connect/page.js"),
  "utf8"
);

const NOW = new Date("2026-10-22T08:00:00.000Z");

function coexistenceItem(field = "history", value = {}) {
  return {
    object: "whatsapp_business_account",
    entryId: "waba-1",
    wabaId: "waba-1",
    field,
    value,
  };
}

function candidate(id = "vendor-1", phoneNumberId = "phone-1", collection = "DummyVendor") {
  return {
    collection,
    vendor: {
      _id: id,
      whatsappBusiness: {
        wabaId: "waba-1",
        phoneNumberId,
      },
    },
  };
}

function dependencies(overrides = {}) {
  const records = new Map();
  return {
    config: { appSecret: "test-app-secret" },
    now: () => NOW,
    loadCandidates: async () => [candidate()],
    EventModel: {
      updateOne: async (filter, update) => {
        if (records.has(filter.deduplicationKey)) return { upsertedCount: 0 };
        records.set(filter.deduplicationKey, update.$setOnInsert);
        return { upsertedCount: 1 };
      },
    },
    records,
    ...overrides,
  };
}

test("valid and invalid webhook signatures are distinguished in constant-time format", (t) => {
  const previous = process.env.META_APP_SECRET;
  t.after(() => {
    if (previous === undefined) delete process.env.META_APP_SECRET;
    else process.env.META_APP_SECRET = previous;
  });
  process.env.META_APP_SECRET = "test-app-secret";
  const rawBody = Buffer.from('{"object":"whatsapp_business_account"}');
  const validSignature = `sha256=${crypto
    .createHmac("sha256", "test-app-secret")
    .update(rawBody)
    .digest("hex")}`;

  assert.equal(verifyWebhookSignature({ rawBody, signature: validSignature }).verified, true);
  assert.equal(
    verifyWebhookSignature({ rawBody, signature: `sha256=${"0".repeat(64)}` }).verified,
    false
  );
  assert.equal(verifyWebhookSignature({ rawBody, signature: "invalid" }).verified, false);
});

test("only the three supported Coexistence fields enter the strict route", () => {
  for (const field of ["history", "smb_app_state_sync", "smb_message_echoes"]) {
    assert.equal(
      hasCoexistenceWebhookEvents({ entry: [{ id: "waba-1", changes: [{ field }] }] }),
      true
    );
  }
  assert.equal(
    hasCoexistenceWebhookEvents({ entry: [{ id: "waba-1", changes: [{ field: "messages" }] }] }),
    false
  );
  assert.match(routeSource, /hasCoexistenceEvents && !signatureResult\.verified/);
  assert.match(routeSource, /Meta WhatsApp Coexistence webhook processing failed/);
});

test("verified Coexistence events persist only sanitized identity and tracking metadata", async () => {
  const deps = dependencies();
  const result = await processCoexistenceWebhookItem(
    coexistenceItem("history", {
      metadata: { phone_number_id: "phone-1" },
      messages: [{ from: "15551234567", text: { body: "private conversation" } }],
    }),
    deps
  );

  assert.equal(result.processed, true);
  assert.equal(deps.records.size, 1);
  const stored = [...deps.records.values()][0];
  assert.deepEqual(Object.keys(stored).sort(), [
    "deduplicationKey",
    "eventType",
    "phoneNumberId",
    "processedAt",
    "processingStatus",
    "receivedAt",
    "vendorCollection",
    "vendorId",
    "wabaId",
  ]);
  assert.equal(JSON.stringify(stored).includes("private conversation"), false);
  assert.equal(JSON.stringify(stored).includes("15551234567"), false);
});

test("standard webhook events never access the Coexistence event store", async () => {
  let standardLookups = 0;
  const result = await processMetaWhatsappWebhook(
    {
      entry: [
        {
          id: "standard-waba",
          changes: [{ field: "messages", value: { metadata: { phone_number_id: "phone-s" } } }],
        },
      ],
    },
    {
      signatureVerified: true,
      findStandardVendor: async () => {
        standardLookups += 1;
        return { collection: "DummyVendor", vendor: { _id: "standard-vendor" } };
      },
      EventModel: { updateOne: async () => assert.fail("Coexistence store was accessed") },
      logger: { info: () => {}, warn: () => {} },
    }
  );

  assert.equal(result.processed, 1);
  assert.equal(standardLookups, 1);
  assert.deepEqual(result.coexistence, []);
});

test("an unverified Coexistence event is not resolved or persisted", async () => {
  let candidateLookups = 0;
  const result = await processMetaWhatsappWebhook(
    { entry: [{ id: "waba-1", changes: [{ field: "history", value: {} }] }] },
    {
      signatureVerified: false,
      loadCandidates: async () => {
        candidateLookups += 1;
        return [candidate()];
      },
    }
  );

  assert.equal(candidateLookups, 0);
  assert.equal(result.coexistence[0].reason, "signature_unverified");
});

test("WABA and phone mismatches are rejected without event persistence", async () => {
  const mismatchedWaba = extractCoexistenceIdentity(
    coexistenceItem("history", { waba_id: "other-waba" })
  );
  assert.deepEqual(mismatchedWaba.wabaIds.sort(), ["other-waba", "waba-1"]);

  const deps = dependencies({
    loadCandidates: async () => [candidate("vendor-1", "other-phone")],
  });
  const result = await processCoexistenceWebhookItem(
    coexistenceItem("history", { metadata: { phone_number_id: "phone-1" } }),
    deps
  );
  assert.equal(result.processed, false);
  assert.equal(result.reason, "meta_coexistence_phone_mismatch");
  assert.equal(deps.records.size, 0);
});

test("WABA-only events require exactly one verified Coexistence phone", async () => {
  const deps = dependencies({
    loadCandidates: async () => [candidate("vendor-1"), candidate("vendor-2", "phone-2")],
  });
  const result = await processCoexistenceWebhookItem(coexistenceItem("history"), deps);

  assert.equal(result.processed, false);
  assert.equal(result.reason, "meta_coexistence_vendor_ambiguous");
  assert.equal(deps.records.size, 0);
});

test("missing identifiers and malformed payloads fail closed", async () => {
  let candidateLookups = 0;
  const deps = dependencies({
    loadCandidates: async () => {
      candidateLookups += 1;
      return [candidate()];
    },
  });
  const result = await processCoexistenceWebhookItem(
    { field: "history", value: {} },
    deps
  );
  assert.equal(result.processed, false);
  assert.equal(result.reason, "meta_coexistence_identity_ambiguous");
  assert.equal(candidateLookups, 0);

  const malformed = await processMetaWhatsappWebhook(null, {
    signatureVerified: true,
    findStandardVendor: async () => assert.fail("Malformed payload performed a lookup"),
  });
  assert.equal(malformed.processed, 0);
});

test("duplicate delivery is atomically idempotent for every supported event type", async () => {
  for (const field of ["history", "smb_app_state_sync", "smb_message_echoes"]) {
    const deps = dependencies();
    const item = coexistenceItem(field, { metadata: { phone_number_id: "phone-1" }, id: "e-1" });
    const first = await processCoexistenceWebhookItem(item, deps);
    const retry = await processCoexistenceWebhookItem(item, deps);

    assert.equal(first.processed, true);
    assert.equal(retry.processed, false);
    assert.equal(retry.duplicate, true);
    assert.equal(deps.records.size, 1);
  }
});

test("out-of-order distinct events are recorded independently without state mutation", async () => {
  const deps = dependencies();
  const newer = coexistenceItem("smb_app_state_sync", {
    metadata: { phone_number_id: "phone-1" },
    sequence: 2,
  });
  const older = coexistenceItem("smb_app_state_sync", {
    metadata: { phone_number_id: "phone-1" },
    sequence: 1,
  });

  assert.equal((await processCoexistenceWebhookItem(newer, deps)).processed, true);
  assert.equal((await processCoexistenceWebhookItem(older, deps)).processed, true);
  assert.equal(deps.records.size, 2);
});

test("cross-vendor ambiguity fails closed across vendor collections", async () => {
  const deps = dependencies({
    loadCandidates: async () => [
      candidate("vendor-1", "phone-1", "DummyVendor"),
      candidate("vendor-2", "phone-1", "Vendor"),
    ],
  });
  const result = await processCoexistenceWebhookItem(
    coexistenceItem("smb_message_echoes", {
      metadata: { phone_number_id: "phone-1" },
    }),
    deps
  );
  assert.equal(result.reason, "meta_coexistence_vendor_ambiguous");
  assert.equal(deps.records.size, 0);
});

test("deduplication is deterministic but does not store the source payload", () => {
  const args = {
    item: coexistenceItem("history", { b: 2, a: 1 }),
    wabaId: "waba-1",
    phoneNumberId: "phone-1",
    secret: "test-app-secret",
  };
  const reordered = {
    ...args,
    item: coexistenceItem("history", { a: 1, b: 2 }),
  };
  assert.equal(buildCoexistenceDeduplicationKey(args), buildCoexistenceDeduplicationKey(reordered));
  assert.match(buildCoexistenceDeduplicationKey(args), /^[a-f0-9]{64}$/);
});

test("event schema contains no raw payload or conversation fields", () => {
  const paths = Object.keys(MetaWhatsappCoexistenceEvent.schema.paths);
  for (const forbidden of ["payload", "rawPayload", "message", "messages", "conversation", "body"] ) {
    assert.equal(paths.includes(forbidden), false);
  }
  assert.equal(MetaWhatsappCoexistenceEvent.schema.path("deduplicationKey").options.unique, true);
});

test("webhook foundation does not change billing routing or Options 1 and 3", () => {
  const standardReady = {
    provider: "meta",
    enabled: true,
    connectionStatus: "connected",
    phoneRegistrationStatus: "active",
    messagingReadiness: { status: "limited" },
    displayNameReadiness: { status: "send_eligible", canSend: true },
    templateInstances: [{ masterTemplateKey: "BILL_STANDARD", status: "approved" }],
    testMessage: { status: "successful" },
  };
  assert.equal(
    resolveWhatsAppBillingRoute({ whatsappBusiness: standardReady }).route,
    ROUTES.VENDOR_META
  );
  assert.match(standardBaselineSource, /startMetaSignup\(SIGNUP_MODE_STANDARD\)/);
  assert.match(standardBaselineSource, /startMetaSignup\(SIGNUP_MODE_WABA_ONLY_DIAGNOSTIC\)/);
});
