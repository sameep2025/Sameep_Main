const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const axios = require("axios");

const {
  getDefaultWhatsappBusinessConfig,
  whatsappBusinessConfigSchema,
} = require("../models/whatsappBusinessConfigSchema");
const {
  completeCoexistenceOnboarding,
  COEXISTENCE_FINISH_EVENT,
  isCoexistenceOnboardingEnabled,
} = require("../services/metaWhatsappCoexistenceOnboarding");
const {
  getSubscribedAppIds,
  subscribeAppToWaba,
  validateCoexistenceConnection,
} = require("../services/metaWhatsAppService");
const {
  ROUTES,
  resolveWhatsAppBillingRoute,
} = require("../services/whatsappBillingRouteResolver");

const controllerSource = fs.readFileSync(
  path.join(__dirname, "../controllers/vendorWhatsappBusinessController.js"),
  "utf8"
);
const routesSource = fs.readFileSync(
  path.join(__dirname, "../routes/vendorWhatsappBusinessRoutes.js"),
  "utf8"
);
const metaConfigSource = fs.readFileSync(
  path.join(__dirname, "../config/metaWhatsAppConfig.js"),
  "utf8"
);
const connectPageSource = fs.readFileSync(
  path.join(__dirname, "../../vendorpreview/app/whatsapp-connect/page.js"),
  "utf8"
);

function account(id = "waba-1") {
  return { id, name: "Test WABA" };
}

function coexistencePhone(id = "phone-1", overrides = {}) {
  return {
    id,
    display_phone_number: "+15550000001",
    verified_name: "Test Business",
    name_status: "APPROVED",
    is_on_biz_app: true,
    platform_type: "CLOUD_API",
    status: "CONNECTED",
    ...overrides,
  };
}

function orchestrationDeps(overrides = {}) {
  return {
    config: { appId: "app-1" },
    now: () => new Date("2026-10-21T08:00:00.000Z"),
    exchangeCode: async () => ({
      access_token: "mock-access-token",
      token_type: "bearer",
      expires_in: 3600,
    }),
    validateConnection: async ({ wabaId, phoneNumberId }) => ({
      account: account(wabaId),
      selectedPhone: coexistencePhone(phoneNumberId || "resolved-phone-1"),
    }),
    subscribeWaba: async () => ({ success: true, verified: true }),
    ...overrides,
  };
}

test("connection mode schema is additive and legacy-safe", () => {
  const defaults = getDefaultWhatsappBusinessConfig();
  const modePath = whatsappBusinessConfigSchema.path("connectionMode");

  assert.equal(defaults.connectionMode, "legacy_unknown");
  assert.deepEqual(modePath.enumValues, [
    "standard_cloud_api",
    "coexistence",
    "legacy_unknown",
  ]);
  assert.equal(defaults.coexistenceEvidence.isOnBizApp, null);
});

test("Coexistence feature flag is disabled by default and exact-true only", () => {
  assert.equal(isCoexistenceOnboardingEnabled({}), false);
  assert.equal(
    isCoexistenceOnboardingEnabled({
      META_WHATSAPP_COEXISTENCE_ONBOARDING_ENABLED: "true",
    }),
    true
  );
  assert.equal(
    isCoexistenceOnboardingEnabled({
      META_WHATSAPP_COEXISTENCE_ONBOARDING_ENABLED: "yes",
    }),
    false
  );
});

test("WABA-only completion resolves one verified Business App phone", async () => {
  let validationInput = null;
  const result = await completeCoexistenceOnboarding(
    {
      code: "one-time-code",
      wabaId: "waba-1",
      eventType: COEXISTENCE_FINISH_EVENT,
    },
    orchestrationDeps({
      validateConnection: async (input) => {
        validationInput = input;
        return {
          account: account(input.wabaId),
          selectedPhone: coexistencePhone("resolved-phone-1"),
        };
      },
    })
  );

  assert.equal(validationInput.phoneNumberId, "");
  assert.equal(result.evidence.phoneNumberId, "resolved-phone-1");
  assert.equal(result.evidence.isOnBizApp, true);
  assert.equal(result.evidence.appSubscriptionVerified, true);
});

test("exact phone ID resolution selects only the requested WABA phone", async (t) => {
  const originalGet = axios.get;
  t.after(() => {
    axios.get = originalGet;
  });
  axios.get = async (url) => {
    if (url.endsWith("/waba-1")) return { data: account() };
    if (url.endsWith("/waba-1/phone_numbers")) {
      return { data: { data: [coexistencePhone("phone-1"), coexistencePhone("phone-2")] } };
    }
    throw new Error("Unexpected Meta request");
  };

  const result = await validateCoexistenceConnection({
    accessToken: "mock-access-token",
    wabaId: "waba-1",
    phoneNumberId: "phone-2",
  });
  assert.equal(result.selectedPhone.id, "phone-2");
});

test("WABA-only phone resolution rejects multiple Coexistence phones", async (t) => {
  const originalGet = axios.get;
  t.after(() => {
    axios.get = originalGet;
  });
  axios.get = async (url) => {
    if (url.endsWith("/waba-1")) return { data: account() };
    return { data: { data: [coexistencePhone("phone-1"), coexistencePhone("phone-2")] } };
  };

  await assert.rejects(
    validateCoexistenceConnection({
      accessToken: "mock-access-token",
      wabaId: "waba-1",
    }),
    { code: "meta_coexistence_phone_ambiguous" }
  );
});

test("is_on_biz_app=false is rejected", async (t) => {
  const originalGet = axios.get;
  t.after(() => {
    axios.get = originalGet;
  });
  axios.get = async (url) => {
    if (url.endsWith("/waba-1")) return { data: account() };
    return {
      data: {
        data: [coexistencePhone("phone-1", { is_on_biz_app: false })],
      },
    };
  };

  await assert.rejects(
    validateCoexistenceConnection({
      accessToken: "mock-access-token",
      wabaId: "waba-1",
      phoneNumberId: "phone-1",
    }),
    { code: "meta_coexistence_not_on_business_app" }
  );
});

test("token exchange failure stops before validation and subscription", async () => {
  let validationCalls = 0;
  let subscriptionCalls = 0;
  await assert.rejects(
    completeCoexistenceOnboarding(
      {
        code: "one-time-code",
        wabaId: "waba-1",
        eventType: COEXISTENCE_FINISH_EVENT,
      },
      orchestrationDeps({
        exchangeCode: async () => {
          throw Object.assign(new Error("exchange failed"), {
            code: "meta_code_exchange_failed",
          });
        },
        validateConnection: async () => {
          validationCalls += 1;
        },
        subscribeWaba: async () => {
          subscriptionCalls += 1;
        },
      })
    ),
    { code: "meta_code_exchange_failed" }
  );
  assert.equal(validationCalls, 0);
  assert.equal(subscriptionCalls, 0);
});

test("verified asset ownership is established before WABA subscription", async () => {
  const calls = [];
  await completeCoexistenceOnboarding(
    {
      code: "one-time-code",
      wabaId: "waba-1",
      phoneNumberId: "phone-1",
      eventType: COEXISTENCE_FINISH_EVENT,
    },
    orchestrationDeps({
      validateConnection: async ({ wabaId, phoneNumberId }) => {
        calls.push("validate");
        return {
          account: account(wabaId),
          selectedPhone: coexistencePhone(phoneNumberId),
        };
      },
      beforeWabaSubscription: async ({ wabaId, phoneNumberId }) => {
        calls.push(`reserve:${wabaId}:${phoneNumberId}`);
      },
      subscribeWaba: async () => {
        calls.push("subscribe");
        return { success: true, verified: true };
      },
    })
  );

  assert.deepEqual(calls, ["validate", "reserve:waba-1:phone-1", "subscribe"]);
});

test("ownership conflict prevents any WABA subscription attempt", async () => {
  let subscriptionCalls = 0;
  await assert.rejects(
    completeCoexistenceOnboarding(
      {
        code: "one-time-code",
        wabaId: "waba-1",
        phoneNumberId: "phone-1",
        eventType: COEXISTENCE_FINISH_EVENT,
      },
      orchestrationDeps({
        beforeWabaSubscription: async () => {
          throw Object.assign(new Error("already owned"), {
            code: "meta_asset_ownership_conflict",
          });
        },
        subscribeWaba: async () => {
          subscriptionCalls += 1;
          return { success: true, verified: true };
        },
      })
    ),
    { code: "meta_asset_ownership_conflict" }
  );
  assert.equal(subscriptionCalls, 0);
});

test("Meta subscription failure occurs only after ownership protection", async () => {
  const calls = [];
  await assert.rejects(
    completeCoexistenceOnboarding(
      {
        code: "one-time-code",
        wabaId: "waba-1",
        phoneNumberId: "phone-1",
        eventType: COEXISTENCE_FINISH_EVENT,
      },
      orchestrationDeps({
        beforeWabaSubscription: async () => {
          calls.push("reserve");
        },
        subscribeWaba: async () => {
          calls.push("subscribe");
          throw Object.assign(new Error("Meta unavailable"), {
            code: "meta_waba_subscription_failed",
          });
        },
      })
    ),
    { code: "meta_waba_subscription_failed" }
  );
  assert.deepEqual(calls, ["reserve", "subscribe"]);
});

test("WABA subscription rejects an incorrect direct App ID", async (t) => {
  const originalPost = axios.post;
  const originalGet = axios.get;
  t.after(() => {
    axios.post = originalPost;
    axios.get = originalGet;
  });
  axios.post = async () => ({ status: 200, data: { success: true } });
  axios.get = async () => ({ data: { data: [{ id: "another-app" }] } });

  await assert.rejects(
    subscribeAppToWaba(
      {
        wabaId: "waba-1",
        accessToken: "mock-access-token",
        appId: "app-1",
      },
      {
        verificationAttempts: 1,
        sleep: async () => {},
      }
    ),
    { code: "meta_waba_subscription_verification_failed" }
  );
});

test("WABA subscription verifies a direct App ID", async (t) => {
  const originalPost = axios.post;
  const originalGet = axios.get;
  const calls = [];
  t.after(() => {
    axios.post = originalPost;
    axios.get = originalGet;
  });
  axios.post = async (url, body, options) => {
    calls.push({ method: "POST", url, body, options });
    return { status: 200, data: { success: true } };
  };
  axios.get = async (url, options) => {
    calls.push({ method: "GET", url, options });
    return { data: { data: [{ id: "app-1", name: "YNOT" }] } };
  };

  const result = await subscribeAppToWaba({
    wabaId: "waba-1",
    accessToken: "mock-access-token",
    appId: "app-1",
  });

  assert.equal(result.verified, true);
  assert.deepEqual(calls.map((call) => call.method), ["POST", "GET"]);
  assert.equal(calls.every((call) => call.url.endsWith("/waba-1/subscribed_apps")), true);
  assert.deepEqual(calls[0].body, {});
  assert.equal(calls[1].options.params, undefined);
});

test("WABA subscription verifies Meta's nested WhatsApp app identity envelope", async () => {
  let postCalls = 0;
  let getCalls = 0;
  const httpClient = {
    post: async () => {
      postCalls += 1;
      return { status: 200, data: { success: true } };
    },
    get: async () => {
      getCalls += 1;
      return {
        status: 200,
        data: {
          data: [
            {
              whatsapp_business_api_data: {
                id: "app-1",
                name: "YNOT",
              },
            },
          ],
        },
      };
    },
  };

  const result = await subscribeAppToWaba(
    {
      wabaId: "waba-1",
      accessToken: "mock-access-token",
      appId: "app-1",
    },
    { httpClient }
  );

  assert.equal(result.verified, true);
  assert.equal(postCalls, 1);
  assert.equal(getCalls, 1);
  assert.deepEqual(
    getSubscribedAppIds({
      id: "direct",
      whatsapp_business_api_data: { id: "nested" },
    }),
    ["direct", "nested"]
  );
});

test("WABA subscription retries GET-only verification for delayed visibility", async () => {
  let postCalls = 0;
  let getCalls = 0;
  const delays = [];
  const httpClient = {
    post: async () => {
      postCalls += 1;
      return { data: { success: true } };
    },
    get: async () => {
      getCalls += 1;
      return getCalls < 3
        ? { data: { data: [] } }
        : { data: { data: [{ whatsapp_business_api_data: { id: "app-1" } }] } };
    },
  };

  const result = await subscribeAppToWaba(
    {
      wabaId: "waba-1",
      accessToken: "mock-access-token",
      appId: "app-1",
    },
    {
      httpClient,
      verificationAttempts: 3,
      verificationDelayMs: 10,
      sleep: async (delay) => delays.push(delay),
    }
  );

  assert.equal(result.verified, true);
  assert.equal(postCalls, 1);
  assert.equal(getCalls, 3);
  assert.deepEqual(delays, [10, 20]);
});

test("WABA subscription fails closed after bounded verification without retrying POST", async () => {
  let postCalls = 0;
  let getCalls = 0;
  const httpClient = {
    post: async () => {
      postCalls += 1;
      return { data: { success: true } };
    },
    get: async () => {
      getCalls += 1;
      return {
        data: {
          data: [
            { id: "wrong-direct-app" },
            { whatsapp_business_api_data: { id: "wrong-nested-app" } },
          ],
        },
      };
    },
  };

  await assert.rejects(
    subscribeAppToWaba(
      {
        wabaId: "waba-1",
        accessToken: "mock-access-token",
        appId: "app-1",
      },
      {
        httpClient,
        verificationAttempts: 2,
        sleep: async () => {},
      }
    ),
    (error) => {
      assert.equal(error.code, "meta_waba_subscription_verification_failed");
      assert.deepEqual(error.verification, {
        attempts: 2,
        entryCount: 2,
        directIdEntries: 1,
        nestedIdEntries: 1,
      });
      return true;
    }
  );
  assert.equal(postCalls, 1);
  assert.equal(getCalls, 2);
});

test("dedicated completion route is authenticated and separate from standard", () => {
  assert.match(
    routesSource,
    /"\/meta\/coexistence\/complete",\s*requireVendorOrWhatsappConnectAccess,\s*completeMetaWhatsappCoexistenceConnection/
  );
  assert.match(
    routesSource,
    /"\/meta\/complete",\s*requireVendorOrWhatsappConnectAccess,\s*completeMetaWhatsappConnection/
  );
});

test("controller prevents overwrite and persists only disabled verified Coexistence", () => {
  assert.match(
    controllerSource,
    /isCoexistenceEmbeddedSignupConfigured[\s\S]*isTokenExchangeConfigured[\s\S]*isTokenStorageConfigured/
  );
  assert.match(
    controllerSource,
    /completeMetaWhatsappCoexistenceConnection[\s\S]*hasExistingWhatsappConnection\(current\)[\s\S]*meta_coexistence_existing_connection/
  );
  assert.match(
    controllerSource,
    /connectionMode:\s*"coexistence",\s*connectionStatus:\s*"connected"/
  );
  assert.match(controllerSource, /enabled:\s*false,\s*provider:\s*"meta"/);
  assert.match(
    controllerSource,
    /metaRegistration:\s*\{\s*pinEncrypted:\s*""\s*\}/
  );
  assert.match(controllerSource, /writeResult\?\.matchedCount !== 1/);
  const completion = controllerSource.slice(
    controllerSource.indexOf("async function completeMetaWhatsappCoexistenceConnection"),
    controllerSource.indexOf("async function diagnoseMetaCoexistenceSignup")
  );
  assert.match(
    completion,
    /beforeWabaSubscription:[\s\S]*reserveMetaWhatsappAssets[\s\S]*commitMetaWhatsappAssetReservation/
  );
  assert.ok(
    completion.indexOf("beforeWabaSubscription") < completion.indexOf("record.Model.updateOne")
  );
});

test("verified Coexistence is guarded from every controller /register call", () => {
  assert.match(
    controllerSource,
    /function assertStandardPhoneRegistrationAllowed[\s\S]*meta_coexistence_registration_not_applicable/
  );
  assert.equal(
    (controllerSource.match(/assertStandardPhoneRegistrationAllowed\(config\)/g) || []).length,
    3
  );
  const coexistenceController = controllerSource.slice(
    controllerSource.indexOf("async function completeMetaWhatsappCoexistenceConnection"),
    controllerSource.indexOf("async function diagnoseMetaCoexistenceSignup")
  );
  assert.doesNotMatch(coexistenceController, /getOrCreateRegistrationPin|registerPhoneNumber/);
});

test("Coexistence remains disabled and therefore routes through MSG91", () => {
  const config = {
    ...getDefaultWhatsappBusinessConfig(),
    provider: "meta",
    connectionMode: "coexistence",
    connectionStatus: "connected",
    phoneRegistrationStatus: "registered",
    coexistenceEvidence: {
      ...getDefaultWhatsappBusinessConfig().coexistenceEvidence,
      isOnBizApp: true,
      appSubscriptionVerified: true,
    },
  };
  assert.equal(
    resolveWhatsAppBillingRoute({ whatsappBusiness: config }).route,
    ROUTES.YNOT_MSG91
  );
});

test("Option 2 is independently flagged and supports omitted Phone Number ID", () => {
  assert.match(metaConfigSource, /META_WHATSAPP_COEXISTENCE_ONBOARDING_ENABLED/);
  assert.match(connectPageSource, /isCoexistenceOnboardingEnabled/);
  assert.match(connectPageSource, /meta\/coexistence\/complete/);
  assert.doesNotMatch(
    connectPageSource,
    /Meta did not return a phone number ID, so the TEST backend diagnostic was not run/
  );
});
