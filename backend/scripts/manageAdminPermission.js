#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const mongoose = require("mongoose");
const AdminUser = require("../models/AdminUser");
const {
  manageAdminPermission,
  parseArguments,
  verifyEnvironmentIdentity,
} = require("./lib/adminPermissionManager");

function safeOutput(report) {
  console.log(JSON.stringify(report));
}

function createRepository() {
  const projection = "_id email permissions";
  return {
    async findExact(query) {
      return AdminUser.findOne(query).select(projection).lean();
    },
    async inspectIdentity({ adminId, email }) {
      const [idExists, emailExists] = await Promise.all([
        AdminUser.exists({ _id: adminId }),
        AdminUser.exists({ email }),
      ]);
      return { idExists: Boolean(idExists), emailExists: Boolean(emailExists) };
    },
    async updateExact(query, update) {
      return AdminUser.updateOne(query, update);
    },
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const identity = verifyEnvironmentIdentity(options, process.env);

  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: identity.databaseName,
    serverSelectionTimeoutMS: 10000,
  });

  const result = await manageAdminPermission(options, createRepository());
  safeOutput({
    utility: "admin_permission_manager",
    mode: options.apply ? "apply" : "dry_run",
    environment: identity.environment,
    databaseName: identity.databaseName,
    hostFingerprint: identity.hostFingerprint,
    ...result,
  });
  if (result.result === "BLOCKED") process.exitCode = 1;
}

main()
  .catch((error) => {
    safeOutput({
      utility: "admin_permission_manager",
      result: "BLOCKED",
      code: error.safeCode || "permission_management_failed",
      applied: false,
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
