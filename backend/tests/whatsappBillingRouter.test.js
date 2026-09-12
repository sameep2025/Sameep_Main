const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { ROUTES } = require("../services/whatsappBillingRouteResolver");
const {
  isUncertainSendError,
  isVendorMetaBillRoutingEnabled,
  sendRoutedWhatsAppBillingMessage,
} = require("../services/whatsappBillingRouter");

function createCalls() {
  return {
    msg91: [],
    meta: [],
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
      templateInstances: [
        {
          masterTemplateKey: "BILL_STANDARD",
          status: "approved",
          metaTemplateName: "ynot_bill_standard_v1",
          language: "en",
        },
      ],
      testMessage: { status: "successful" },
    },
  };
}

function payloads() {
  return {
    msg91Payload: {
      mobile: "919381520396",
      vendorName: "Vendor",
      billAmount: 1050,
      earned: 52,
      redeemed: 0,
      finalPaid: 1050,
      balance: 102,
      billUrl: "https://vendor.example/b/token",
      billPath: "/b/token",
    },
    metaPayload: {
      vendor: readyVendor(),
      recipientPhoneNumber: "919381520396",
      vendorName: "Vendor",
      billAmount: 1050,
      pointsEarned: 52,
      pointsRedeemed: 0,
      finalPaid: 1050,
      loyaltyBalance: 102,
      billUrl: "https://vendor.example/b/token",
    },
  };
}

function quietLogger() {
  return {
    log() {},
    error() {},
  };
}

test("global vendor Meta routing switch is enabled only by exact true string", () => {
  assert.equal(isVendorMetaBillRoutingEnabled({ WHATSAPP_VENDOR_META_BILL_ROUTING_ENABLED: "true" }), true);
});

test("missing global routing switch keeps vendor Meta routing off", () => {
  assert.equal(isVendorMetaBillRoutingEnabled({}), false);
});

test("empty global routing switch keeps vendor Meta routing off", () => {
  assert.equal(isVendorMetaBillRoutingEnabled({ WHATSAPP_VENDOR_META_BILL_ROUTING_ENABLED: "" }), false);
});

test("false global routing switch keeps vendor Meta routing off", () => {
  assert.equal(isVendorMetaBillRoutingEnabled({ WHATSAPP_VENDOR_META_BILL_ROUTING_ENABLED: "false" }), false);
});

test("malformed global routing switch keeps vendor Meta routing off", () => {
  assert.equal(isVendorMetaBillRoutingEnabled({ WHATSAPP_VENDOR_META_BILL_ROUTING_ENABLED: "TRUE" }), false);
});

test("global routing switch tolerates surrounding whitespace around true", () => {
  assert.equal(isVendorMetaBillRoutingEnabled({ WHATSAPP_VENDOR_META_BILL_ROUTING_ENABLED: " true " }), true);
});

test("global switch off sends existing MSG91 payload and never attempts Meta", async () => {
  const calls = createCalls();
  const data = payloads();

  const result = await sendRoutedWhatsAppBillingMessage(
    {
      vendor: readyVendor(),
      billId: "bill_1",
      ...data,
    },
    {
      env: {},
      logger: quietLogger(),
      sendMsg91: async (payload) => {
        calls.msg91.push(payload);
        return { success: true };
      },
      sendVendorMeta: async (payload) => {
        calls.meta.push(payload);
      },
      hasMsg91Balance: async () => true,
    }
  );

  assert.equal(result.route, ROUTES.YNOT_MSG91);
  assert.equal(calls.msg91.length, 1);
  assert.equal(calls.meta.length, 0);
  assert.deepEqual(calls.msg91[0], data.msg91Payload);
});

test("global switch on and resolver msg91 sends MSG91 only", async () => {
  const calls = createCalls();

  const result = await sendRoutedWhatsAppBillingMessage(
    {
      vendor: readyVendor(),
      billId: "bill_1",
      ...payloads(),
    },
    {
      env: { WHATSAPP_VENDOR_META_BILL_ROUTING_ENABLED: "true" },
      logger: quietLogger(),
      resolveRoute: () => ({ route: ROUTES.YNOT_MSG91, reason: "not_ready" }),
      sendMsg91: async (payload) => calls.msg91.push(payload),
      sendVendorMeta: async (payload) => calls.meta.push(payload),
      hasMsg91Balance: async () => true,
    }
  );

  assert.equal(result.route, ROUTES.YNOT_MSG91);
  assert.equal(calls.msg91.length, 1);
  assert.equal(calls.meta.length, 0);
});

test("ynot_msg91 with positive balance allows MSG91 send", async () => {
  const calls = createCalls();

  const result = await sendRoutedWhatsAppBillingMessage(
    { vendor: readyVendor(), billId: "bill_1", ...payloads() },
    {
      env: { WHATSAPP_VENDOR_META_BILL_ROUTING_ENABLED: "true" },
      logger: quietLogger(),
      resolveRoute: () => ({ route: ROUTES.YNOT_MSG91, reason: "not_ready" }),
      hasMsg91Balance: async () => true,
      sendMsg91: async (payload) => {
        calls.msg91.push(payload);
        return { success: true };
      },
      sendVendorMeta: async (payload) => calls.meta.push(payload),
    }
  );

  assert.equal(result.provider, ROUTES.YNOT_MSG91);
  assert.equal(result.status, "accepted");
  assert.equal(calls.msg91.length, 1);
  assert.equal(calls.meta.length, 0);
});

test("ynot_msg91 with one remaining balance allows send before existing deduction", async () => {
  const calls = createCalls();

  const result = await sendRoutedWhatsAppBillingMessage(
    { vendor: readyVendor(), billId: "bill_1", ...payloads() },
    {
      env: { WHATSAPP_VENDOR_META_BILL_ROUTING_ENABLED: "true" },
      logger: quietLogger(),
      resolveRoute: () => ({ route: ROUTES.YNOT_MSG91, reason: "not_ready" }),
      hasMsg91Balance: async () => true,
      sendMsg91: async (payload) => {
        calls.msg91.push(payload);
        return { success: true };
      },
      sendVendorMeta: async (payload) => calls.meta.push(payload),
    }
  );

  assert.equal(result.status, "accepted");
  assert.equal(calls.msg91.length, 1);
});

test("ynot_msg91 with zero balance skips MSG91 send", async () => {
  const calls = createCalls();

  const result = await sendRoutedWhatsAppBillingMessage(
    { vendor: readyVendor(), billId: "bill_1", ...payloads() },
    {
      env: { WHATSAPP_VENDOR_META_BILL_ROUTING_ENABLED: "true" },
      logger: quietLogger(),
      resolveRoute: () => ({ route: ROUTES.YNOT_MSG91, reason: "not_ready" }),
      hasMsg91Balance: async () => false,
      sendMsg91: async (payload) => calls.msg91.push(payload),
      sendVendorMeta: async (payload) => calls.meta.push(payload),
    }
  );

  assert.equal(result.provider, ROUTES.YNOT_MSG91);
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "insufficient_whatsapp_balance");
  assert.equal(calls.msg91.length, 0);
  assert.equal(calls.meta.length, 0);
});

test("ynot_msg91 with missing wallet is treated as insufficient balance", async () => {
  const calls = createCalls();

  const result = await sendRoutedWhatsAppBillingMessage(
    { vendor: readyVendor(), billId: "bill_1", ...payloads() },
    {
      env: { WHATSAPP_VENDOR_META_BILL_ROUTING_ENABLED: "true" },
      logger: quietLogger(),
      resolveRoute: () => ({ route: ROUTES.YNOT_MSG91, reason: "not_ready" }),
      hasMsg91Balance: async () => false,
      sendMsg91: async (payload) => calls.msg91.push(payload),
      sendVendorMeta: async (payload) => calls.meta.push(payload),
    }
  );

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "insufficient_whatsapp_balance");
  assert.equal(calls.msg91.length, 0);
});

test("global switch false with zero balance skips MSG91 send", async () => {
  const calls = createCalls();

  const result = await sendRoutedWhatsAppBillingMessage(
    { vendor: readyVendor(), billId: "bill_1", ...payloads() },
    {
      env: { WHATSAPP_VENDOR_META_BILL_ROUTING_ENABLED: "false" },
      logger: quietLogger(),
      hasMsg91Balance: async () => false,
      sendMsg91: async (payload) => calls.msg91.push(payload),
      sendVendorMeta: async (payload) => calls.meta.push(payload),
    }
  );

  assert.equal(result.provider, ROUTES.YNOT_MSG91);
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "insufficient_whatsapp_balance");
  assert.equal(calls.msg91.length, 0);
  assert.equal(calls.meta.length, 0);
});

test("ynot_msg91 with positive balance and MSG91 failure does not convert to skipped", async () => {
  const calls = createCalls();

  await assert.rejects(
    sendRoutedWhatsAppBillingMessage(
      { vendor: readyVendor(), billId: "bill_1", ...payloads() },
      {
        env: { WHATSAPP_VENDOR_META_BILL_ROUTING_ENABLED: "true" },
        logger: quietLogger(),
        resolveRoute: () => ({ route: ROUTES.YNOT_MSG91, reason: "not_ready" }),
        hasMsg91Balance: async () => true,
        sendMsg91: async (payload) => {
          calls.msg91.push(payload);
          throw new Error("MSG91 failed");
        },
        sendVendorMeta: async (payload) => calls.meta.push(payload),
      }
    ),
    /MSG91 failed/
  );

  assert.equal(calls.msg91.length, 1);
  assert.equal(calls.meta.length, 0);
});

test("global switch on and resolver vendor_meta sends Meta only", async () => {
  const calls = createCalls();

  const result = await sendRoutedWhatsAppBillingMessage(
    {
      vendor: readyVendor(),
      billId: "bill_1",
      ...payloads(),
    },
    {
      env: { WHATSAPP_VENDOR_META_BILL_ROUTING_ENABLED: "true" },
      logger: quietLogger(),
      resolveRoute: () => ({ route: ROUTES.VENDOR_META, reason: "ready" }),
      hasMsg91Balance: async () => {
        throw new Error("YNOT wallet must not be queried");
      },
      sendMsg91: async (payload) => calls.msg91.push(payload),
      sendVendorMeta: async (payload) => {
        calls.meta.push(payload);
        return { metaMessageId: "wamid.test" };
      },
    }
  );

  assert.equal(result.route, ROUTES.VENDOR_META);
  assert.equal(result.status, "accepted");
  assert.equal(calls.msg91.length, 0);
  assert.equal(calls.meta.length, 1);
});

test("vendor_meta success never falls back to MSG91", async () => {
  const calls = createCalls();

  await sendRoutedWhatsAppBillingMessage(
    { vendor: readyVendor(), billId: "bill_1", ...payloads() },
    {
      env: { WHATSAPP_VENDOR_META_BILL_ROUTING_ENABLED: "true" },
      logger: quietLogger(),
      resolveRoute: () => ({ route: ROUTES.VENDOR_META, reason: "ready" }),
      hasMsg91Balance: async () => {
        throw new Error("YNOT wallet must not be queried");
      },
      sendMsg91: async (payload) => calls.msg91.push(payload),
      sendVendorMeta: async (payload) => {
        calls.meta.push(payload);
        return { metaMessageId: "wamid.test" };
      },
    }
  );

  assert.equal(calls.meta.length, 1);
  assert.equal(calls.msg91.length, 0);
});

test("vendor_meta confirmed failure never falls back to MSG91", async () => {
  const calls = createCalls();
  const error = new Error("Meta rejected message");
  error.code = "meta_send_rejected";
  error.response = { status: 400 };

  const result = await sendRoutedWhatsAppBillingMessage(
    { vendor: readyVendor(), billId: "bill_1", ...payloads() },
    {
      env: { WHATSAPP_VENDOR_META_BILL_ROUTING_ENABLED: "true" },
      logger: quietLogger(),
      resolveRoute: () => ({ route: ROUTES.VENDOR_META, reason: "ready" }),
      hasMsg91Balance: async () => {
        throw new Error("YNOT wallet must not be queried");
      },
      sendMsg91: async (payload) => calls.msg91.push(payload),
      sendVendorMeta: async () => {
        throw error;
      },
    }
  );

  assert.equal(result.status, "failed");
  assert.equal(result.safeErrorCode, "meta_send_rejected");
  assert.equal(calls.msg91.length, 0);
});

test("vendor_meta timeout or uncertain failure never falls back to MSG91", async () => {
  const calls = createCalls();
  const error = new Error("timeout of 10000ms exceeded");
  error.code = "ETIMEDOUT";

  const result = await sendRoutedWhatsAppBillingMessage(
    { vendor: readyVendor(), billId: "bill_1", ...payloads() },
    {
      env: { WHATSAPP_VENDOR_META_BILL_ROUTING_ENABLED: "true" },
      logger: quietLogger(),
      resolveRoute: () => ({ route: ROUTES.VENDOR_META, reason: "ready" }),
      hasMsg91Balance: async () => {
        throw new Error("YNOT wallet must not be queried");
      },
      sendMsg91: async (payload) => calls.msg91.push(payload),
      sendVendorMeta: async () => {
        throw error;
      },
    }
  );

  assert.equal(result.status, "uncertain");
  assert.equal(calls.msg91.length, 0);
});

test("vendor_meta prep failure after route selection never falls back to MSG91", async () => {
  const calls = createCalls();
  const error = new Error("token missing");
  error.code = "vendor_meta_token_missing";

  const result = await sendRoutedWhatsAppBillingMessage(
    { vendor: readyVendor(), billId: "bill_1", ...payloads() },
    {
      env: { WHATSAPP_VENDOR_META_BILL_ROUTING_ENABLED: "true" },
      logger: quietLogger(),
      resolveRoute: () => ({ route: ROUTES.VENDOR_META, reason: "ready" }),
      hasMsg91Balance: async () => {
        throw new Error("YNOT wallet must not be queried");
      },
      sendMsg91: async (payload) => calls.msg91.push(payload),
      sendVendorMeta: async () => {
        throw error;
      },
    }
  );

  assert.equal(result.status, "failed");
  assert.equal(result.safeErrorCode, "vendor_meta_token_missing");
  assert.equal(calls.msg91.length, 0);
});

test("network errors without an HTTP response are treated as uncertain", () => {
  const error = new Error("Network Error");
  error.code = "ERR_NETWORK";

  assert.equal(isUncertainSendError(error), true);
});

test("HTTP response errors are treated as confirmed failures", () => {
  const error = new Error("Bad request");
  error.code = "ERR_BAD_REQUEST";
  error.response = { status: 400 };

  assert.equal(isUncertainSendError(error), false);
});

test("router absorbs vendor_meta send failure so bill flow can remain completed", async () => {
  const result = await sendRoutedWhatsAppBillingMessage(
    { vendor: readyVendor(), billId: "bill_1", ...payloads() },
    {
      env: { WHATSAPP_VENDOR_META_BILL_ROUTING_ENABLED: "true" },
      logger: quietLogger(),
      resolveRoute: () => ({ route: ROUTES.VENDOR_META, reason: "ready" }),
      hasMsg91Balance: async () => {
        throw new Error("YNOT wallet must not be queried");
      },
      sendMsg91: async () => {
        throw new Error("MSG91 must not be called");
      },
      sendVendorMeta: async () => {
        const error = new Error("Meta rejected message");
        error.code = "meta_send_rejected";
        error.response = { status: 400 };
        throw error;
      },
    }
  );

  assert.equal(result.status, "failed");
});

test("billing controller preserves asynchronous post-bill send boundary", () => {
  const billingControllerSource = fs.readFileSync(
    path.join(__dirname, "../controllers/billingController.js"),
    "utf8"
  );

  assert.match(billingControllerSource, /setImmediate\(async \(\) =>/);
  assert.match(billingControllerSource, /sendRoutedWhatsAppBillingMessage/);
});

test("billing controller deducts WhatsApp wallet only after accepted MSG91 send", () => {
  const billingControllerSource = fs.readFileSync(
    path.join(__dirname, "../controllers/billingController.js"),
    "utf8"
  );

  assert.match(billingControllerSource, /sendResult\?\.status === "accepted"/);
  assert.match(billingControllerSource, /sendResult\?\.provider === "ynot_msg91"/);
  assert.match(billingControllerSource, /deductWhatsApp\(billing\.vendorId, `billing:\$\{billing\._id\}`\)/);
});

test("billing controller does not deduct YNOT WhatsApp balance for accepted vendor_meta sends", () => {
  const billingControllerSource = fs.readFileSync(
    path.join(__dirname, "../controllers/billingController.js"),
    "utf8"
  );

  assert.doesNotMatch(
    billingControllerSource,
    /sendResult\?\.provider === "vendor_meta"[\s\S]{0,120}deductWhatsApp/
  );
  assert.match(
    billingControllerSource,
    /sendResult\?\.status === "accepted" && sendResult\?\.provider === "ynot_msg91"/
  );
});

test("billing controller continues using existing billLink URL generation", () => {
  const billingControllerSource = fs.readFileSync(
    path.join(__dirname, "../controllers/billingController.js"),
    "utf8"
  );

  assert.match(billingControllerSource, /buildPublicBillUrl/);
  assert.match(billingControllerSource, /buildPublicBillPath/);
  assert.doesNotMatch(billingControllerSource, /sameep\.app\/bill\/example|ynot-dev\.co\.in|ynot\.co\.in/);
});

test("vendor Meta bill sender uses centralized recipient normalizer and template payload builder", () => {
  const senderSource = fs.readFileSync(
    path.join(__dirname, "../services/vendorMetaBillSender.js"),
    "utf8"
  );

  assert.match(senderSource, /normalizeWhatsappRecipientPhone/);
  assert.match(senderSource, /buildBillStandardTemplatePayload/);
});
