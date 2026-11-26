const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const Enquiry = require("../models/Enquiry");
const {
  sendVendorWhatsappForEnquiry,
} = require("../services/enquiryCreationService");
const {
  buildEnquiryOperationId,
  getYnotMetaEnquiryConfiguration,
  isYnotMetaEnquiryEnabled,
  sendYnotMetaEnquiryNotification,
} = require("../services/ynotMetaEnquirySender");
const {
  processMetaWhatsappWebhook,
  processYnotEnquiryDeliveryStatuses,
} = require("../services/metaWhatsappWebhookService");
const { deductWhatsAppForEnquiry } = require("../services/vendorWalletService");

const backendRoot = path.resolve(__dirname, "..");
const config = {
  ynotWabaId: "waba_1",
  ynotPhoneNumberId: "phone_1",
  ynotEnquiryTemplateName: "vendor_enquiry",
  ynotEnquiryTemplateLanguage: "en",
  systemUserAccessToken: "test-token",
};

function setDotted(target, values) {
  for (const [key, value] of Object.entries(values || {})) {
    const parts = key.split(".");
    let cursor = target;
    for (const part of parts.slice(0, -1)) {
      cursor[part] = cursor[part] || {};
      cursor = cursor[part];
    }
    cursor[parts.at(-1)] = value;
  }
}

function createEnquiryHarness({ failAcceptancePersistence = false } = {}) {
  const record = { _id: "enquiry_1", vendorId: "vendor_1", meta: {} };
  const updates = [];
  return {
    record,
    updates,
    Model: {
      findOneAndUpdate(filter, update) {
        const unclaimed = !record.meta.vendorWhatsappOperationId;
        if (!unclaimed) return { lean: async () => null };
        setDotted(record, update.$set);
        return { lean: async () => ({ ...record, meta: { ...record.meta } }) };
      },
      findOne() {
        return { lean: async () => ({ ...record, meta: { ...record.meta } }) };
      },
      async updateOne(filter, update) {
        updates.push({ filter, update });
        if (
          failAcceptancePersistence &&
          update?.$set?.["meta.vendorWhatsappDeliveryStatus"] === "ACCEPTED"
        ) {
          const error = new Error("database unavailable");
          error.code = "db_write_failed";
          throw error;
        }
        if (
          filter["meta.vendorWhatsappDeliveryStatus"] &&
          filter["meta.vendorWhatsappDeliveryStatus"] !== record.meta.vendorWhatsappDeliveryStatus
        ) {
          return { matchedCount: 0 };
        }
        setDotted(record, update.$set);
        return { matchedCount: 1 };
      },
    },
  };
}

const senderPayload = {
  enquiryId: "enquiry_1",
  vendorId: "vendor_1",
  recipientPhoneNumber: "9876543210",
};

test("YNOT Meta enquiry routing is independently opt-in", () => {
  assert.equal(isYnotMetaEnquiryEnabled({}), false);
  assert.equal(isYnotMetaEnquiryEnabled({ YNOT_META_ENQUIRY_ENABLED: "false" }), false);
  assert.equal(isYnotMetaEnquiryEnabled({ YNOT_META_ENQUIRY_ENABLED: "TRUE" }), false);
  assert.equal(isYnotMetaEnquiryEnabled({ YNOT_META_ENQUIRY_ENABLED: "true" }), true);
  assert.equal(buildEnquiryOperationId("abc"), "enquiry:abc:vendor-alert");
});

test("missing Meta enquiry configuration fails before sending", () => {
  assert.throws(
    () => getYnotMetaEnquiryConfiguration({ YNOT_META_ENQUIRY_ENABLED: "true" }),
    (error) =>
      error.code === "ynot_meta_enquiry_configuration_missing" &&
      error.metaRequestAttempted === false
  );
});

test("Meta enquiry sender uses the approved zero-parameter template contract", async () => {
  const harness = createEnquiryHarness();
  let request;
  let walletCharges = 0;
  const result = await sendYnotMetaEnquiryNotification(senderPayload, {
    config,
    EnquiryModel: harness.Model,
    sendMetaTemplateMessage: async (payload) => {
      request = payload;
      return { messages: [{ id: "wamid.enquiry.1" }] };
    },
    deductWhatsAppForEnquiry: async () => { walletCharges += 1; },
  });
  assert.equal(result.status, "accepted");
  assert.equal(request.phoneNumberId, "phone_1");
  assert.equal(request.templateName, "vendor_enquiry");
  assert.equal(request.languageCode, "en");
  assert.deepEqual(request.bodyParameters, []);
  assert.equal(request.headerParameter, undefined);
  assert.equal(harness.record.meta.vendorWhatsappDeliveryStatus, "ACCEPTED");
  assert.equal(harness.record.meta.vendorWhatsappMessageId, "wamid.enquiry.1");
  assert.equal(walletCharges, 1);
});

test("concurrent Meta enquiry attempts claim once and never send twice", async () => {
  const harness = createEnquiryHarness();
  let sends = 0;
  let releaseSend;
  const sendGate = new Promise((resolve) => { releaseSend = resolve; });
  const dependencies = {
    config,
    EnquiryModel: harness.Model,
    sendMetaTemplateMessage: async () => {
      sends += 1;
      await sendGate;
      return { messages: [{ id: "wamid.concurrent" }] };
    },
    deductWhatsAppForEnquiry: async () => {},
  };
  const first = sendYnotMetaEnquiryNotification(senderPayload, dependencies);
  const second = sendYnotMetaEnquiryNotification(senderPayload, dependencies);
  releaseSend();
  const results = await Promise.all([first, second]);
  assert.equal(sends, 1);
  assert.equal(results.filter((result) => result.duplicate).length, 1);
});

test("deterministic Meta rejection is FAILED and never retried", async () => {
  const harness = createEnquiryHarness();
  const error = new Error("Meta rejected request");
  error.code = "meta_test_send_failed";
  error.metaRequestAttempted = true;
  error.metaOutcomeUnknown = false;
  error.metaError = { status: 400, code: "100", subcode: "33", message: "Invalid template" };
  await assert.rejects(() => sendYnotMetaEnquiryNotification(senderPayload, {
    config,
    EnquiryModel: harness.Model,
    sendMetaTemplateMessage: async () => { throw error; },
  }));
  assert.equal(harness.record.meta.vendorWhatsappDeliveryStatus, "FAILED");
  assert.equal(harness.record.meta.vendorWhatsappHttpStatus, 400);
  assert.equal(harness.record.meta.vendorWhatsappMetaCode, "100");
});

test("ambiguous Meta timeout is UNKNOWN and blocks another send", async () => {
  const harness = createEnquiryHarness();
  let sends = 0;
  const error = new Error("timeout");
  error.code = "meta_test_send_failed";
  error.metaRequestAttempted = true;
  error.metaOutcomeUnknown = true;
  const dependencies = {
    config,
    EnquiryModel: harness.Model,
    sendMetaTemplateMessage: async () => { sends += 1; throw error; },
  };
  await assert.rejects(() => sendYnotMetaEnquiryNotification(senderPayload, dependencies));
  const duplicate = await sendYnotMetaEnquiryNotification(senderPayload, dependencies);
  assert.equal(harness.record.meta.vendorWhatsappDeliveryStatus, "UNKNOWN");
  assert.equal(duplicate.status, "skipped");
  assert.equal(sends, 1);
});

test("post-acceptance persistence failure remains UNKNOWN and is never resent", async () => {
  const harness = createEnquiryHarness({ failAcceptancePersistence: true });
  let sends = 0;
  const dependencies = {
    config,
    EnquiryModel: harness.Model,
    sendMetaTemplateMessage: async () => {
      sends += 1;
      return { messages: [{ id: "wamid.accepted" }] };
    },
  };
  await assert.rejects(
    () => sendYnotMetaEnquiryNotification(senderPayload, dependencies),
    (error) => error.metaAccepted === true && error.metaOutcomeUnknown === true
  );
  assert.equal(harness.record.meta.vendorWhatsappDeliveryStatus, "UNKNOWN");
  assert.equal(harness.record.meta.vendorWhatsappMessageId, "wamid.accepted");
  const duplicate = await sendYnotMetaEnquiryNotification(senderPayload, dependencies);
  assert.equal(duplicate.status, "skipped");
  assert.equal(sends, 1);
});

test("accepted duplicate can recover wallet charging without resending", async () => {
  const harness = createEnquiryHarness();
  let sends = 0;
  let charges = 0;
  const dependencies = {
    config,
    EnquiryModel: harness.Model,
    sendMetaTemplateMessage: async () => {
      sends += 1;
      return { messages: [{ id: "wamid.wallet" }] };
    },
    deductWhatsAppForEnquiry: async () => {
      charges += 1;
      if (charges === 1) throw new Error("wallet temporarily unavailable");
      harness.record.meta.vendorWhatsappWalletDeductedAt = new Date();
    },
  };
  const first = await sendYnotMetaEnquiryNotification(senderPayload, dependencies);
  const second = await sendYnotMetaEnquiryNotification(senderPayload, dependencies);
  assert.equal(first.status, "accepted");
  assert.equal(first.walletCharged, false);
  assert.equal(second.status, "accepted");
  assert.equal(second.walletCharged, true);
  assert.equal(sends, 1);
  assert.equal(charges, 2);
});

function serviceDependencies(env, overrides = {}) {
  const writes = [];
  return {
    writes,
    value: {
      env,
      VendorModel: { findById: () => ({ lean: async () => ({ phone: "9876543210" }) }) },
      EnquiryModel: {
        async findByIdAndUpdate(id, update) { writes.push({ id, update }); },
      },
      getWhatsAppEnquiryConfig: async () => ({ enabled: true }),
      hasAvailableWhatsAppBalance: async () => true,
      deductWhatsApp: async () => {},
      ...overrides,
    },
  };
}

test("flag OFF preserves MSG91 and never invokes Meta", async () => {
  let msg91 = 0;
  let meta = 0;
  const deps = serviceDependencies({}, {
    sendVendorEnquiryWhatsapp: async () => { msg91 += 1; return { message_id: "msg91-1" }; },
    sendYnotMetaEnquiryNotification: async () => { meta += 1; },
  });
  await sendVendorWhatsappForEnquiry({ _id: "enquiry_1" }, "vendor_1", deps.value);
  assert.equal(msg91, 1);
  assert.equal(meta, 0);
  assert.equal(deps.writes.at(-1).update.$set["meta.vendorWhatsappStatus"], "sent");
});

test("flag ON uses only Meta and enquiry failure remains non-fatal", async () => {
  let msg91 = 0;
  let meta = 0;
  const deps = serviceDependencies({ YNOT_META_ENQUIRY_ENABLED: "true" }, {
    sendVendorEnquiryWhatsapp: async () => { msg91 += 1; },
    sendYnotMetaEnquiryNotification: async () => {
      meta += 1;
      const error = new Error("rejected");
      error.code = "meta_test_send_failed";
      throw error;
    },
  });
  await assert.doesNotReject(() =>
    sendVendorWhatsappForEnquiry({ _id: "enquiry_1" }, "vendor_1", deps.value)
  );
  assert.equal(msg91, 0);
  assert.equal(meta, 1);
  assert.equal(deps.writes.at(-1).update.$set["meta.vendorWhatsappProvider"], "ynot_meta");
});

test("existing enquiry notification disablement still suppresses the Meta route", async () => {
  let meta = 0;
  const deps = serviceDependencies({ YNOT_META_ENQUIRY_ENABLED: "true" }, {
    getWhatsAppEnquiryConfig: async () => ({ enabled: false }),
    sendYnotMetaEnquiryNotification: async () => { meta += 1; },
  });
  const result = await sendVendorWhatsappForEnquiry(
    { _id: "enquiry_1" },
    "vendor_1",
    deps.value
  );
  assert.equal(meta, 0);
  assert.equal(result.status, "skipped");
  assert.equal(deps.writes.at(-1).update.$set["meta.vendorWhatsappStatus"], "skipped");
});

test("zero WhatsApp balance skips Meta before provider submission", async () => {
  let meta = 0;
  const deps = serviceDependencies({ YNOT_META_ENQUIRY_ENABLED: "true" }, {
    hasAvailableWhatsAppBalance: async () => false,
    sendYnotMetaEnquiryNotification: async () => { meta += 1; },
  });
  const result = await sendVendorWhatsappForEnquiry(
    { _id: "enquiry_1" },
    "vendor_1",
    deps.value
  );
  assert.equal(meta, 0);
  assert.equal(result.reason, "insufficient_whatsapp_balance");
  assert.equal(deps.writes.at(-1).update.$set["meta.vendorWhatsappStatus"], "skipped");
});

test("enquiry wallet charge is transactional and exactly once", async () => {
  let walletUpdates = 0;
  let ledgerCreates = 0;
  const enquiry = {
    meta: {
      vendorWhatsappDeliveryStatus: "ACCEPTED",
      vendorWhatsappWalletDeductedAt: null,
    },
    markModified() {},
    async save() {},
  };
  const session = {
    async withTransaction(callback) { await callback(); },
    async endSession() {},
  };
  const dependencies = {
    startSession: async () => session,
    EnquiryModel: { findOne: () => ({ session: async () => enquiry }) },
    WalletModel: {
      async findOneAndUpdate() { walletUpdates += 1; return { whatsappBalance: 4 }; },
    },
    LedgerModel: { async create() { ledgerCreates += 1; } },
  };
  const args = {
    vendorId: "vendor_1",
    enquiryId: "enquiry_1",
    operationId: "enquiry:enquiry_1:vendor-alert",
    dependencies,
  };
  await deductWhatsAppForEnquiry(args);
  await deductWhatsAppForEnquiry(args);
  assert.equal(walletUpdates, 1);
  assert.equal(ledgerCreates, 1);
});

test("signed global enquiry webhook transitions are monotonic", async () => {
  const updates = [];
  const Model = {
    async updateOne(filter, update) {
      updates.push({ filter, update });
      return { matchedCount: 1 };
    },
  };
  const delivered = await processYnotEnquiryDeliveryStatuses({
    phoneNumberId: "phone_1",
    value: { statuses: [{ id: "wamid.1", status: "delivered" }] },
  }, { config, EnquiryModel: Model });
  assert.equal(delivered[0].status, "DELIVERED");
  assert.deepEqual(updates[0].filter["meta.vendorWhatsappDeliveryStatus"], {
    $in: ["UNKNOWN", "ACCEPTED", "SENT"],
  });
  assert.equal(updates[0].filter["meta.vendorWhatsappSenderPhoneNumberId"], "phone_1");

  await processYnotEnquiryDeliveryStatuses({
    phoneNumberId: "phone_1",
    value: { statuses: [{ id: "wamid.1", status: "sent" }] },
  }, { config, EnquiryModel: Model });
  assert.deepEqual(updates[1].filter["meta.vendorWhatsappDeliveryStatus"], {
    $in: ["UNKNOWN", "ACCEPTED"],
  });
});

test("unsigned callbacks do not update enquiry, billing, or campaign records", async () => {
  let enquiryUpdates = 0;
  let billingUpdates = 0;
  const result = await processMetaWhatsappWebhook({
    object: "whatsapp_business_account",
    entry: [{
      id: "waba_1",
      changes: [{
        field: "messages",
        value: {
          metadata: { phone_number_id: "phone_1" },
          statuses: [{ id: "wamid.1", status: "sent" }],
        },
      }],
    }],
  }, {
    signatureVerified: false,
    config,
    EnquiryModel: { async updateOne() { enquiryUpdates += 1; } },
    WhatsappBillingDeliveryModel: { async updateOne() { billingUpdates += 1; } },
    findStandardVendor: async () => null,
    logger: { warn() {}, info() {} },
  });
  assert.equal(enquiryUpdates, 0);
  assert.equal(billingUpdates, 0);
  assert.deepEqual(result.enquiries, []);
});

test("signed enquiry callback updates only the matching global enquiry record", async () => {
  let enquiryUpdates = 0;
  let billingMatches = 0;
  const result = await processMetaWhatsappWebhook({
    object: "whatsapp_business_account",
    entry: [{
      id: "waba_1",
      changes: [{
        field: "messages",
        value: {
          metadata: { phone_number_id: "phone_1" },
          statuses: [{ id: "wamid.enquiry", status: "delivered" }],
        },
      }],
    }],
  }, {
    signatureVerified: true,
    config,
    EnquiryModel: {
      async updateOne(filter) {
        enquiryUpdates += 1;
        assert.equal(filter["meta.vendorWhatsappMessageId"], "wamid.enquiry");
        return { matchedCount: 1 };
      },
    },
    WhatsappBillingDeliveryModel: {
      async updateOne(filter) {
        billingMatches += 1;
        assert.equal(filter.metaMessageId, "wamid.enquiry");
        return { matchedCount: 0 };
      },
    },
    findStandardVendor: async () => null,
    logger: { warn() {}, info() {} },
  });
  assert.equal(enquiryUpdates, 1);
  assert.equal(billingMatches, 1);
  assert.equal(result.enquiries[0].updated, true);
  assert.equal(result.billing[0].updated, false);
  assert.deepEqual(result.marketing, []);
});

test("enquiry message lookup index is scoped to YNOT Meta notifications", () => {
  const index = Enquiry.schema.indexes().find(
    ([keys]) => keys["meta.vendorWhatsappMessageId"] === 1
  );
  assert.ok(index);
  assert.equal(index[1].unique, true);
  assert.equal(
    index[1].partialFilterExpression["meta.vendorWhatsappProvider"],
    "ynot_meta"
  );
});

test("public, appointment, and paid enquiry paths retain intended notification behavior", () => {
  const enquiryRoutes = fs.readFileSync(path.join(backendRoot, "routes/enquiryRoutes.js"), "utf8");
  const paymentRoutes = fs.readFileSync(path.join(backendRoot, "routes/paymentRoutes.js"), "utf8");
  const appointmentController = fs.readFileSync(
    path.join(backendRoot, "controllers/appointmentController.js"),
    "utf8"
  );
  assert.match(enquiryRoutes, /router\.post\('\/'[\s\S]*createEnquiryAndNotify\(payload\)/);
  assert.match(paymentRoutes, /router\.post\("\/razorpay\/verify"[\s\S]*createEnquiryAndNotify\(enquiryPayload\)/);
  assert.match(
    appointmentController,
    /vendor-created calendar entry must not trigger the public-enquiry alert[\s\S]*Enquiry\.create\(payload\)/
  );
});
