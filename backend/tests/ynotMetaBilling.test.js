const assert = require("node:assert/strict");
const test = require("node:test");

const { buildBillingDeliveryIdentity } = require("../services/billingWhatsappSender");
const {
  getYnotMetaBillConfiguration,
  sendYnotMetaBillMessage,
} = require("../services/ynotMetaBillSender");
const {
  isYnotMetaDefaultBillingEnabled,
  resolveBillingWhatsappProvider,
  sendRoutedWhatsAppBillingMessage,
} = require("../services/whatsappBillingRouter");
const { ROUTES } = require("../services/whatsappBillingRouteResolver");
const { processYnotBillingDeliveryStatuses } = require("../services/metaWhatsappWebhookService");
const { deductWhatsAppForBillingDelivery } = require("../services/vendorWalletService");

const config = {
  ynotWabaId: "waba_1",
  ynotPhoneNumberId: "phone_1",
  ynotBillTemplateName: "ynot_bill_standard_v1",
  ynotBillTemplateLanguage: "en",
  systemUserAccessToken: "test-token",
};

const billPayload = {
  vendorId: "vendor_1",
  billId: "bill_1",
  operationId: "billing:bill_1:completion",
  sendPurpose: "AUTOMATIC_COMPLETION",
  recipientPhoneNumber: "9876543210",
  vendorName: "Salon",
  billAmount: 1000,
  pointsEarned: 50,
  pointsRedeemed: 10,
  finalPaid: 990,
  loyaltyBalance: 75,
  billUrl: "https://salon.example/b/token",
};

function createDeliveryHarness({ failAcceptancePersistence = false } = {}) {
  const records = new Map();
  let sequence = 0;
  return {
    records,
    Model: {
      async create(values) {
        if (records.has(values.operationId)) {
          const error = new Error("duplicate");
          error.code = 11000;
          throw error;
        }
        const record = { ...values, _id: `delivery_${++sequence}` };
        records.set(values.operationId, record);
        return record;
      },
      findOne({ operationId }) {
        return { lean: async () => records.get(operationId) || null };
      },
      async updateOne(filter, update) {
        const record = [...records.values()].find((entry) => entry._id === filter._id);
        if (!record) return { matchedCount: 0 };
        if (failAcceptancePersistence && update?.$set?.status === "ACCEPTED") {
          const error = new Error("database unavailable");
          error.code = "db_write_failed";
          throw error;
        }
        Object.assign(record, update.$set || {});
        return { matchedCount: 1 };
      },
    },
  };
}

function readyVendor() {
  return {
    _id: "vendor_1",
    whatsappBusiness: {
      provider: "meta",
      enabled: true,
      connectionStatus: "connected",
      phoneRegistrationStatus: "active",
      messagingReadiness: { status: "available" },
      templateInstances: [{
        masterTemplateKey: "BILL_STANDARD",
        status: "approved",
        metaTemplateName: "ynot_bill_standard_v1",
      }],
      testMessage: { status: "successful" },
    },
  };
}

test("YNOT default Meta billing flag is opt-in", () => {
  assert.equal(isYnotMetaDefaultBillingEnabled({}), false);
  assert.equal(isYnotMetaDefaultBillingEnabled({ YNOT_META_DEFAULT_BILLING_ENABLED: "false" }), false);
  assert.equal(isYnotMetaDefaultBillingEnabled({ YNOT_META_DEFAULT_BILLING_ENABLED: "TRUE" }), false);
  assert.equal(isYnotMetaDefaultBillingEnabled({ YNOT_META_DEFAULT_BILLING_ENABLED: "true" }), true);
});

test("routing preserves vendor Meta priority and otherwise selects configured default", () => {
  const bothEnabled = {
    WHATSAPP_VENDOR_META_BILL_ROUTING_ENABLED: "true",
    YNOT_META_DEFAULT_BILLING_ENABLED: "true",
  };
  assert.equal(resolveBillingWhatsappProvider({ vendor: readyVendor(), env: bothEnabled }).route, ROUTES.VENDOR_META);
  assert.equal(resolveBillingWhatsappProvider({ vendor: {}, env: bothEnabled }).route, ROUTES.YNOT_META);
  assert.equal(resolveBillingWhatsappProvider({ vendor: {}, env: {} }).route, ROUTES.YNOT_MSG91);
});

test("YNOT Meta configuration fails closed when required values are missing", () => {
  assert.throws(
    () => getYnotMetaBillConfiguration({ YNOT_META_DEFAULT_BILLING_ENABLED: "true" }),
    (error) => error.code === "ynot_meta_configuration_missing" && error.metaRequestAttempted === false
  );
});

test("YNOT Meta sender uses the exact approved seven-parameter mapping", async () => {
  const harness = createDeliveryHarness();
  let request;
  const result = await sendYnotMetaBillMessage(billPayload, {
    config,
    DeliveryModel: harness.Model,
    sendMetaTemplateMessage: async (payload) => {
      request = payload;
      return { messages: [{ id: "wamid.1" }] };
    },
  });
  assert.equal(result.status, "accepted");
  assert.equal(request.phoneNumberId, "phone_1");
  assert.equal(request.templateName, "ynot_bill_standard_v1");
  assert.equal(request.languageCode, "en");
  assert.deepEqual(request.bodyParameters, ["Salon", "1000", "50", "10", "990", "75", billPayload.billUrl]);
  assert.equal(harness.records.get(billPayload.operationId).status, "ACCEPTED");
});

test("duplicate automatic completion is claimed once and never sent twice", async () => {
  const harness = createDeliveryHarness();
  let sends = 0;
  const dependencies = {
    config,
    DeliveryModel: harness.Model,
    sendMetaTemplateMessage: async () => {
      sends += 1;
      return { messages: [{ id: "wamid.duplicate" }] };
    },
  };
  const first = await sendYnotMetaBillMessage(billPayload, dependencies);
  const second = await sendYnotMetaBillMessage(billPayload, dependencies);
  assert.equal(first.status, "accepted");
  assert.equal(second.status, "accepted");
  assert.equal(second.duplicate, true);
  assert.equal(sends, 1);
});

test("confirmed Meta HTTP errors fail without becoming ambiguous", async () => {
  const harness = createDeliveryHarness();
  const error = new Error("Meta rejected request");
  error.code = "meta_test_send_failed";
  error.metaRequestAttempted = true;
  error.metaOutcomeUnknown = false;
  error.metaError = { status: 400, code: "100", subcode: "1", message: "Invalid parameter" };
  await assert.rejects(() => sendYnotMetaBillMessage(billPayload, {
    config,
    DeliveryModel: harness.Model,
    sendMetaTemplateMessage: async () => { throw error; },
  }));
  assert.equal(harness.records.get(billPayload.operationId).status, "FAILED");
});

test("network timeout remains unknown and is not sent through MSG91", async () => {
  let msg91Sends = 0;
  const result = await sendRoutedWhatsAppBillingMessage(
    {
      vendor: {},
      vendorId: "vendor_1",
      billId: "bill_1",
      operationId: billPayload.operationId,
      sendPurpose: billPayload.sendPurpose,
      msg91Payload: {},
      metaPayload: billPayload,
      diagnosticContext: { proceed: true, diagnostic: false },
    },
    {
      env: { YNOT_META_DEFAULT_BILLING_ENABLED: "true" },
      logger: { log() {}, error() {} },
      hasMsg91Balance: async () => true,
      sendMsg91: async () => { msg91Sends += 1; },
      sendYnotMeta: async () => {
        const error = new Error("timeout");
        error.code = "meta_test_send_failed";
        error.metaRequestAttempted = true;
        error.metaOutcomeUnknown = true;
        throw error;
      },
    }
  );
  assert.equal(result.status, "uncertain");
  assert.equal(result.provider, ROUTES.YNOT_META);
  assert.equal(msg91Sends, 0);
});

test("post-acceptance persistence failure remains unknown and blocks another send", async () => {
  const harness = createDeliveryHarness({ failAcceptancePersistence: true });
  let sends = 0;
  await assert.rejects(() => sendYnotMetaBillMessage(billPayload, {
    config,
    DeliveryModel: harness.Model,
    sendMetaTemplateMessage: async () => {
      sends += 1;
      return { messages: [{ id: "wamid.accepted" }] };
    },
  }), (error) => error.metaAccepted === true && error.metaOutcomeUnknown === true);
  assert.equal(harness.records.get(billPayload.operationId).metaMessageId, "wamid.accepted");
  const duplicate = await sendYnotMetaBillMessage(billPayload, {
    config,
    DeliveryModel: harness.Model,
    sendMetaTemplateMessage: async () => { sends += 1; },
  });
  assert.equal(duplicate.status, "skipped");
  assert.equal(sends, 1);
});

test("automatic completion is stable while historical resends receive separate IDs", () => {
  assert.deepEqual(buildBillingDeliveryIdentity({ billingId: "bill_1", referencePrefix: "billing" }), {
    sendPurpose: "AUTOMATIC_COMPLETION",
    operationId: "billing:bill_1:completion",
  });
  let value = 0;
  const first = buildBillingDeliveryIdentity({
    billingId: "bill_1",
    referencePrefix: "billing-resend",
    randomUUID: () => `uuid-${++value}`,
  });
  const second = buildBillingDeliveryIdentity({
    billingId: "bill_1",
    referencePrefix: "billing-resend",
    randomUUID: () => `uuid-${++value}`,
  });
  assert.notEqual(first.operationId, second.operationId);
  assert.equal(first.sendPurpose, "HISTORICAL_RESEND");
});

test("global-sender webhook statuses update only matching billing deliveries", async () => {
  const updates = [];
  const results = await processYnotBillingDeliveryStatuses({
    phoneNumberId: "phone_1",
    value: { statuses: [{ id: "wamid.1", status: "delivered" }] },
  }, {
    config,
    WhatsappBillingDeliveryModel: {
      async updateOne(filter, update) {
        updates.push({ filter, update });
        return { matchedCount: 1 };
      },
    },
  });
  assert.equal(results[0].status, "DELIVERED");
  assert.equal(results[0].updated, true);
  assert.equal(updates[0].filter.senderPhoneNumberId, "phone_1");
  assert.equal(updates[0].filter.metaMessageId, "wamid.1");
  assert.deepEqual(updates[0].filter.status, {
    $in: ["UNKNOWN", "ACCEPTED", "SENT", "DELIVERED"],
  });
});

test("delivery-linked wallet deduction is exactly once", async () => {
  let walletUpdates = 0;
  let ledgerCreates = 0;
  const delivery = { walletDeductedAt: null, async save() {} };
  const session = {
    async withTransaction(callback) { await callback(); },
    async endSession() {},
  };
  const dependencies = {
    startSession: async () => session,
    DeliveryModel: { findOne() { return { session: async () => delivery }; } },
    WalletModel: {
      async findOneAndUpdate() {
        walletUpdates += 1;
        return { whatsappBalance: 4 };
      },
    },
    LedgerModel: { async create() { ledgerCreates += 1; } },
  };
  const args = {
    vendorId: "vendor_1",
    deliveryId: "delivery_1",
    reference: billPayload.operationId,
    dependencies,
  };
  await deductWhatsAppForBillingDelivery(args);
  await deductWhatsAppForBillingDelivery(args);
  assert.equal(walletUpdates, 1);
  assert.equal(ledgerCreates, 1);
});
