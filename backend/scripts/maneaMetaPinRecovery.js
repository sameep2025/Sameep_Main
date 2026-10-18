#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const axios = require("axios");
const mongoose = require("mongoose");

const DummyVendor = require("../models/DummyVendor");
const Vendor = require("../models/Vendor");
const { getMetaWhatsAppConfig } = require("../config/metaWhatsAppConfig");
const {
  RECOVERY_AUTHORIZATION,
  TARGET,
  createMetaClient,
  runPreflight,
  runRecovery,
} = require("./lib/maneaMetaPinRecovery");

function option(name) {
  const prefix = `${name}=`;
  const value = process.argv.find((argument) => argument.startsWith(prefix));
  return value ? value.slice(prefix.length).trim() : "";
}

function loadDecryptPin() {
  const originalLog = console.log;
  try {
    console.log = () => {};
    return require("../services/metaTokenStorage").decryptMetaRegistrationPin;
  } finally {
    console.log = originalLog;
  }
}

function assertRuntime(mode) {
  const expectedDb = option("--expected-db");
  const configuredDb = String(process.env.MONGODB_DBNAME || "").trim();
  if (!process.env.MONGODB_URI || !configuredDb || !expectedDb || configuredDb !== expectedDb) {
    throw Object.assign(new Error("Database environment verification failed"), {
      safeCode: "database_environment_unverified",
    });
  }

  if (mode === "recovery") {
    const explicitlyEnabled = process.env.ALLOW_MANEA_META_PIN_RECOVERY === "true";
    const authorization = option("--authorization");
    if (!process.argv.includes("--execute-meta-pin-update") || !explicitlyEnabled) {
      throw Object.assign(new Error("Recovery execution is not explicitly enabled"), {
        safeCode: "recovery_execution_not_enabled",
      });
    }
    if (authorization !== RECOVERY_AUTHORIZATION) {
      throw Object.assign(new Error("Recovery authorization does not match"), {
        safeCode: "recovery_authorization_invalid",
      });
    }
  }

  return configuredDb;
}

async function findMatches() {
  const query = {
    "whatsappBusiness.wabaId": TARGET.wabaId,
    "whatsappBusiness.phoneNumberId": TARGET.phoneNumberId,
  };
  const projection =
    "businessName whatsappBusiness.provider whatsappBusiness.connectionStatus whatsappBusiness.enabled whatsappBusiness.wabaId whatsappBusiness.phoneNumberId whatsappBusiness.phoneRegistrationStatus whatsappBusiness.metaRegistration.pinEncrypted";
  const [vendors, dummyVendors] = await Promise.all([
    Vendor.find(query).select(projection).read("secondaryPreferred").lean().exec(),
    DummyVendor.find(query).select(projection).read("secondaryPreferred").lean().exec(),
  ]);
  return [
    ...vendors.map((vendor) => ({ collection: "vendors", vendor })),
    ...dummyVendors.map((vendor) => ({ collection: "dummyvendors", vendor })),
  ];
}

function safeOutput(report, mode) {
  console.log(
    JSON.stringify({
      utility: "manea_meta_pin_recovery",
      mode,
      ...report,
      safety: {
        databaseWrites: false,
        pinPrinted: false,
        ciphertextPrinted: false,
        tokenPrinted: false,
        registrationEndpointCalled: false,
      },
    })
  );
}

async function main() {
  const mode = option("--mode") || "preflight";
  if (!new Set(["preflight", "recovery"]).has(mode)) {
    throw Object.assign(new Error("Unsupported mode"), { safeCode: "mode_invalid" });
  }

  const dbName = assertRuntime(mode);
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName,
    serverSelectionTimeoutMS: 10000,
  });

  const dependencies = {
    findMatches,
    decryptPin: loadDecryptPin(),
  };

  if (mode === "preflight") {
    safeOutput(await runPreflight(dependencies), mode);
    return;
  }

  const config = getMetaWhatsAppConfig();
  if (!config.systemUserAccessToken || !config.graphApiVersion) {
    safeOutput({ result: "BLOCKED", code: "meta_configuration_missing" }, mode);
    return;
  }

  const metaClient = createMetaClient({
    axiosClient: axios,
    accessToken: config.systemUserAccessToken,
    graphApiVersion: config.graphApiVersion,
  });
  safeOutput(
    await runRecovery(
      { ...dependencies, ...metaClient },
      { authorization: option("--authorization") }
    ),
    mode
  );
}

main()
  .catch((error) => {
    safeOutput(
      {
        result: "BLOCKED",
        code: error.safeCode || "utility_failed",
      },
      option("--mode") || "preflight"
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
