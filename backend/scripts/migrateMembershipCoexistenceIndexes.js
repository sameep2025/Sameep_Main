#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const mongoose = require("mongoose");
const { sanitizeMongoError } = require("./lib/prepaidIndexMigration");
const {
  parseArguments,
  runMigration,
  verifyConfiguredIdentity,
} = require("./lib/membershipCoexistenceIndexMigration");

function safeOutput(value) {
  console.log(JSON.stringify(value));
}

function createRepository(connection) {
  const db = connection.db;
  return {
    async getDatabaseName() {
      return db.databaseName;
    },
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
    async aggregate(collectionName, pipeline) {
      return db.collection(collectionName).aggregate(pipeline, { allowDiskUse: false }).toArray();
    },
    async createIndex(collectionName, key, options) {
      return db.collection(collectionName).createIndex(key, options);
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
  }).asPromise();

  try {
    const result = await runMigration({ options, repository: createRepository(connection) });
    safeOutput({ utility: "membership_coexistence_index_migration", result: "SUCCESS", ...result });
  } finally {
    await connection.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    const safeError = error.safeCode
      ? error
      : {
          safeCode: "mongodb_operation_failed",
          safeDetails: sanitizeMongoError(error, {
            operation: "migration",
            stage: "unhandled",
          }),
        };
    safeOutput({
      utility: "membership_coexistence_index_migration",
      result: "BLOCKED",
      code: safeError.safeCode,
      details: safeError.safeDetails || undefined,
      recordsModified: 0,
      indexesDropped: 0,
    });
    process.exitCode = 1;
  });
}
