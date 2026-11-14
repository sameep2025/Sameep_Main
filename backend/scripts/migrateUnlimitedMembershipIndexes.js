#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const mongoose = require("mongoose");
const { sanitizeMongoError } = require("./lib/prepaidIndexMigration");
const {
  parseArguments,
  runMigration,
  verifyConfiguredIdentity,
} = require("./lib/unlimitedMembershipIndexMigration");

function output(value) {
  console.log(JSON.stringify(value));
}

function createRepository(connection) {
  const db = connection.db;
  return {
    async getDatabaseName() { return db.databaseName; },
    async getTopology() {
      const [hello, buildInfo] = await Promise.all([
        db.admin().command({ hello: 1 }),
        db.admin().command({ buildInfo: 1 }),
      ]);
      return { setName: hello.setName, version: buildInfo.version };
    },
    async listCollectionNames() {
      const collections = await db.listCollections({}, { nameOnly: true }).toArray();
      return collections.map((collection) => collection.name);
    },
    async listIndexes(collectionName) {
      return db.collection(collectionName).listIndexes().toArray();
    },
    async countDocuments(collectionName) {
      return db.collection(collectionName).countDocuments({});
    },
    async dropIndex(collectionName, indexName) {
      return db.collection(collectionName).dropIndex(indexName);
    },
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const configured = verifyConfiguredIdentity(options, process.env);
  const connection = await mongoose.createConnection(process.env.MONGODB_AUDIT_URI, {
    dbName: configured.databaseName,
    serverSelectionTimeoutMS: 10000,
    autoIndex: false,
    autoCreate: false,
  }).asPromise();
  try {
    const result = await runMigration({ options, repository: createRepository(connection) });
    output({ utility: "unlimited_membership_index_migration", result: "SUCCESS", ...result });
  } finally {
    await connection.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    output({
      utility: "unlimited_membership_index_migration",
      result: "BLOCKED",
      code: error.safeCode || "mongodb_operation_failed",
      details: error.safeDetails || sanitizeMongoError(error, {
        operation: "membership_index_migration",
        stage: "unhandled",
      }),
      recordsModified: 0,
    });
    process.exitCode = 1;
  });
}
