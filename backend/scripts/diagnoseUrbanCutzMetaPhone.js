require("dotenv").config();

const axios = require("axios");
const mongoose = require("mongoose");

const connectDB = require("../config/db");
const DummyVendor = require("../models/DummyVendor");
const Vendor = require("../models/Vendor");
const { getMetaWhatsAppConfig } = require("../config/metaWhatsAppConfig");
const { readGraphAssetWithSystemUserToken } = require("../services/metaWhatsAppService");

const CONFIRM_FLAG = "--confirm-read-only-meta-diagnostic";
const TARGET = {
  vendorName: "Urban Cutz Family Salon",
  wabaId: "1067629586087563",
  phoneNumberId: "1414756031710652",
};

const PHONE_STATUS_FIELDS = [
  "id",
  "display_phone_number",
  "platform_type",
  "status",
  "code_verification_status",
  "account_mode",
  "is_pin_enabled",
  "health_status",
  "last_onboarded_time",
].join(",");

const IS_ON_BIZ_APP_FIELD = "is_on_biz_app";

function fail(message, details = {}) {
  const error = new Error(message);
  error.safeDetails = details;
  throw error;
}

function getCliOptionValue(prefix) {
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? String(arg.slice(prefix.length)).trim() : "";
}

function assertDatabaseEnvironment() {
  const mongoUriPresent = Boolean(String(process.env.MONGODB_URI || "").trim());
  const configuredDbName = String(process.env.MONGODB_DBNAME || "").trim();
  const expectedDbName = getCliOptionValue("--expected-db=");

  if (!mongoUriPresent) {
    fail("MONGODB_URI must be explicitly set for this diagnostic.");
  }

  if (!configuredDbName) {
    fail("MONGODB_DBNAME must be explicitly set for this diagnostic.");
  }

  if (!expectedDbName) {
    fail("Expected database name is required. Pass --expected-db=<database-name>.");
  }

  if (expectedDbName !== configuredDbName) {
    fail("Expected database name does not match MONGODB_DBNAME.", {
      expectedDbName,
      configuredDbName,
    });
  }

  return expectedDbName;
}

function assertConnectedDatabase(expectedDbName) {
  const actualDbName = String(mongoose.connection.db?.databaseName || "").trim();

  if (actualDbName !== expectedDbName) {
    fail("Connected database name does not match expected database name.", {
      expectedDbName,
      actualDbName,
    });
  }

  console.log(
    JSON.stringify(
      {
        diagnostic: "urban_cutz_meta_phone_status",
        mode: "read_only",
        database: {
          name: actualDbName,
          environmentCheckPassed: true,
        },
      },
      null,
      2
    )
  );
}

function sanitizeMetaError(meta = {}) {
  return {
    status: meta.status || null,
    type: meta.type || "",
    code: meta.code || "",
    subcode: meta.subcode || "",
    message: meta.message || "",
    fbtraceId: meta.fbtraceId || "",
  };
}

function isUnsupportedFieldError(meta = {}) {
  const code = String(meta.code || "");
  const message = String(meta.message || "").toLowerCase();
  return (
    code === "100" &&
    (message.includes("nonexisting field") ||
      message.includes("unknown field") ||
      message.includes("unsupported") ||
      message.includes(IS_ON_BIZ_APP_FIELD))
  );
}

function sanitizePhoneStatus(data = {}) {
  return {
    id: String(data.id || ""),
    displayPhoneNumber: String(data.display_phone_number || ""),
    platformType: String(data.platform_type || ""),
    status: String(data.status || ""),
    codeVerificationStatus: String(data.code_verification_status || ""),
    accountMode: String(data.account_mode || ""),
    isPinEnabled: typeof data.is_pin_enabled === "boolean" ? data.is_pin_enabled : null,
    healthStatus: data.health_status || null,
    lastOnboardedTime: data.last_onboarded_time || null,
  };
}

function sanitizeIsOnBizAppResult(result) {
  if (result.accessible) {
    return {
      accessible: true,
      supported: Object.prototype.hasOwnProperty.call(result.data || {}, IS_ON_BIZ_APP_FIELD),
      isOnBizApp:
        typeof result.data?.is_on_biz_app === "boolean" ? result.data.is_on_biz_app : null,
    };
  }

  const meta = sanitizeMetaError(result.meta);
  return {
    accessible: false,
    supported: !isUnsupportedFieldError(meta),
    unsupportedField: isUnsupportedFieldError(meta),
    meta,
  };
}

async function withSilencedDbConnectionLogs(fn) {
  const originalLog = console.log;
  const originalWarn = console.warn;
  try {
    console.log = () => {};
    console.warn = () => {};
    return await fn();
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }
}

function loadDecryptMetaAccessToken() {
  const originalLog = console.log;
  try {
    console.log = () => {};
    return require("../services/metaTokenStorage").decryptMetaAccessToken;
  } finally {
    console.log = originalLog;
  }
}

async function findMatchingVendor() {
  const query = {
    "whatsappBusiness.wabaId": TARGET.wabaId,
    "whatsappBusiness.phoneNumberId": TARGET.phoneNumberId,
  };
  const projection =
    "businessName whatsappBusiness.provider whatsappBusiness.connectionStatus whatsappBusiness.wabaId whatsappBusiness.phoneNumberId whatsappBusiness.displayPhoneNumber whatsappBusiness.phoneRegistrationStatus whatsappBusiness.phoneRegisteredAt whatsappBusiness.phoneRegistrationLastError whatsappBusiness.metaAuth";

  const [vendors, dummyVendors] = await Promise.all([
    Vendor.find(query).select(projection).lean(),
    DummyVendor.find(query).select(projection).lean(),
  ]);

  const matches = [
    ...vendors.map((vendor) => ({ collection: "Vendor", vendor })),
    ...dummyVendors.map((vendor) => ({ collection: "DummyVendor", vendor })),
  ];

  if (matches.length !== 1) {
    fail("Expected exactly one vendor match for the supplied WABA ID and Phone Number ID.", {
      matchCount: matches.length,
      collections: matches.map((match) => match.collection),
    });
  }

  return matches[0];
}

async function run() {
  if (!process.argv.includes(CONFIRM_FLAG)) {
    fail(`Refusing to run without explicit confirmation flag: ${CONFIRM_FLAG}`);
  }

  const expectedDbName = assertDatabaseEnvironment();
  axios.defaults.timeout = 15000;

  await withSilencedDbConnectionLogs(() => connectDB());
  if (mongoose.connection.readyState !== 1) {
    fail("Database connection was not established.");
  }
  assertConnectedDatabase(expectedDbName);

  const { graphApiVersion } = getMetaWhatsAppConfig();
  const match = await findMatchingVendor();
  const config = match.vendor.whatsappBusiness || {};
  const encryptedToken = String(config.metaAuth?.accessTokenEncrypted || "");

  if (!encryptedToken) {
    fail("Matched vendor does not have an encrypted Meta access token.");
  }

  const decryptMetaAccessToken = loadDecryptMetaAccessToken();
  const accessToken = decryptMetaAccessToken(encryptedToken);
  if (!accessToken) {
    fail("Matched vendor Meta access token could not be decrypted.");
  }

  const [phoneStatusResult, isOnBizAppResult] = await Promise.all([
    readGraphAssetWithSystemUserToken({
      path: TARGET.phoneNumberId,
      fields: PHONE_STATUS_FIELDS,
      accessToken,
    }),
    readGraphAssetWithSystemUserToken({
      path: TARGET.phoneNumberId,
      fields: IS_ON_BIZ_APP_FIELD,
      accessToken,
    }),
  ]);

  const output = {
    diagnostic: "urban_cutz_meta_phone_status",
    mode: "read_only",
    target: {
      expectedVendorName: TARGET.vendorName,
      wabaId: TARGET.wabaId,
      phoneNumberId: TARGET.phoneNumberId,
    },
    matchedVendor: {
      collection: match.collection,
      id: String(match.vendor._id || ""),
      businessName: String(match.vendor.businessName || ""),
      provider: String(config.provider || ""),
      connectionStatus: String(config.connectionStatus || ""),
      storedDisplayPhoneNumber: String(config.displayPhoneNumber || ""),
      storedPhoneRegistrationStatus: String(config.phoneRegistrationStatus || ""),
      storedPhoneRegisteredAt: config.phoneRegisteredAt || null,
      hasPhoneRegistrationLastError: Boolean(config.phoneRegistrationLastError),
    },
    graph: {
      graphApiVersion,
      requestTimeoutMs: axios.defaults.timeout,
      phoneStatus: phoneStatusResult.accessible
        ? {
            accessible: true,
            fields: sanitizePhoneStatus(phoneStatusResult.data),
          }
        : {
            accessible: false,
            meta: sanitizeMetaError(phoneStatusResult.meta),
          },
      isOnBizApp: sanitizeIsOnBizAppResult(isOnBizAppResult),
    },
    safety: {
      databaseWrites: false,
      metaWriteRequests: false,
      tokenPrinted: false,
      pinPrinted: false,
      registrationEndpointCalled: false,
      deregistrationEndpointCalled: false,
    },
  };

  console.log(JSON.stringify(output, null, 2));
}

run()
  .catch((error) => {
    const output = {
      diagnostic: "urban_cutz_meta_phone_status",
      mode: "read_only",
      success: false,
      error: {
        message: error.message || "Diagnostic failed",
        ...(error.safeDetails ? { details: error.safeDetails } : {}),
      },
      safety: {
        databaseWrites: false,
        metaWriteRequests: false,
        tokenPrinted: false,
        pinPrinted: false,
        registrationEndpointCalled: false,
        deregistrationEndpointCalled: false,
      },
    };
    console.error(JSON.stringify(output, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close().catch(() => {});
  });
