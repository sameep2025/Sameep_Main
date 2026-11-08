const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  APPROVED_TARGET,
  REQUIRED_INDEXES,
  duplicatePipeline,
  extractMongoDatabase,
  inspectIndexCatalog,
  malformedPipeline,
  parseArguments,
  runMigration,
  sanitizeMongoError,
  verifyConfiguredIdentity,
  verifyConnectedIdentity,
} = require("../scripts/lib/prepaidIndexMigration");

function options(apply = false) {
  return {
    apply,
    expectedHost: APPROVED_TARGET.host,
    expectedDb: APPROVED_TARGET.databaseName,
  };
}

function targetIndex(specification) {
  return {
    name: specification.name,
    key: specification.key,
    unique: true,
    partialFilterExpression: specification.partialFilterExpression,
  };
}

function legacyIndex(specification) {
  return { name: specification.legacyIndexName, key: specification.key, unique: false };
}

function repository({ targetsPresent = false, duplicates = {}, malformed = {} } = {}) {
  const indexes = new Map(REQUIRED_INDEXES.map((specification) => [
    specification.collectionName,
    [
      { name: "_id_", key: { _id: 1 } },
      legacyIndex(specification),
      ...(targetsPresent ? [targetIndex(specification)] : []),
    ],
  ]));
  const calls = { createIndex: [] };
  return {
    calls,
    async getDatabaseName() { return APPROVED_TARGET.databaseName; },
    async getTopology() { return { setName: "atlas-test-shard-0", version: "8.0.12" }; },
    async listCollectionNames() { return REQUIRED_INDEXES.map((item) => item.collectionName); },
    async listIndexes(collectionName) { return indexes.get(collectionName); },
    async aggregate(collectionName, pipeline) {
      const isDuplicateCheck = pipeline.some((stage) => stage.$group);
      return isDuplicateCheck ? (duplicates[collectionName] || []) : (malformed[collectionName] || []);
    },
    async createIndex(collectionName, key, indexOptions) {
      calls.createIndex.push({ collectionName, key, options: indexOptions });
      const specification = REQUIRED_INDEXES.find((item) => item.collectionName === collectionName);
      indexes.get(collectionName).push(targetIndex(specification));
      return indexOptions.name;
    },
  };
}

test("CLI defaults to dry-run and requires the exact approved target", () => {
  const parsed = parseArguments([
    `--expected-host=${APPROVED_TARGET.host}`,
    `--expected-db=${APPROVED_TARGET.databaseName}`,
  ]);
  assert.equal(parsed.apply, false);
  assert.deepEqual(parsed, options(false));
  assert.throws(
    () => parseArguments(["--expected-host=other.example", "--expected-db=categoryApp"]),
    { message: "approved_target_mismatch" }
  );
});

test("audit URI database is authoritative when MONGODB_DBNAME is unset", () => {
  assert.deepEqual(
    verifyConfiguredIdentity(options(), {
      MONGODB_AUDIT_URI: "mongodb+srv://hidden:hidden@cluster0.ddzqz7y.mongodb.net/categoryApp",
      MONGODB_URI: "mongodb+srv://hidden:hidden@wrong.example/ignored",
    }),
    APPROVED_TARGET
  );
});

test("matching optional MONGODB_DBNAME is accepted", () => {
  assert.deepEqual(
    verifyConfiguredIdentity(options(), {
      MONGODB_AUDIT_URI: "mongodb+srv://hidden:hidden@cluster0.ddzqz7y.mongodb.net/categoryApp",
      MONGODB_DBNAME: "categoryApp",
    }),
    APPROVED_TARGET
  );
});

test("database identity validation rejects conflicts, omissions, and wrong targets", () => {
  assert.throws(
    () => verifyConfiguredIdentity(options(), {
      MONGODB_AUDIT_URI: "mongodb+srv://hidden:hidden@cluster0.ddzqz7y.mongodb.net/categoryApp",
      MONGODB_DBNAME: "anotherDatabase",
    }),
    { message: "configured_database_mismatch" }
  );
  assert.throws(
    () => verifyConfiguredIdentity(options(), {
      MONGODB_AUDIT_URI: "mongodb+srv://hidden:hidden@cluster0.ddzqz7y.mongodb.net/?retryWrites=true",
    }),
    { message: "mongodb_audit_database_required" }
  );
  assert.throws(
    () => verifyConfiguredIdentity(options(), {
      MONGODB_AUDIT_URI: "mongodb+srv://hidden:hidden@cluster0.ddzqz7y.mongodb.net/anotherDatabase",
    }),
    { message: "configured_database_mismatch" }
  );
  assert.throws(
    () => verifyConfiguredIdentity(options(), {
      MONGODB_AUDIT_URI: "mongodb+srv://hidden:hidden@wrong.example/categoryApp",
    }),
    { message: "configured_host_mismatch" }
  );
  assert.throws(
    () => verifyConfiguredIdentity(options(), {
      MONGODB_URI: "mongodb+srv://hidden:hidden@cluster0.ddzqz7y.mongodb.net/ignored",
      MONGODB_DBNAME: "categoryApp",
    }),
    { message: "mongodb_audit_uri_required" }
  );
});

test("audit database parser requires an explicit URI database", () => {
  assert.equal(
    extractMongoDatabase(
      "mongodb+srv://hidden:hidden@cluster0.ddzqz7y.mongodb.net/categoryApp?retryWrites=true"
    ),
    "categoryApp"
  );
  assert.throws(
    () => extractMongoDatabase("mongodb+srv://hidden:hidden@cluster0.ddzqz7y.mongodb.net"),
    { message: "mongodb_audit_database_required" }
  );
});

test("connected identity and MongoDB compatibility fail closed", () => {
  assert.throws(
    () => verifyConnectedIdentity({
      options: options(),
      databaseName: "categoryApp",
      topology: { version: "4.4.29", setName: "legacy" },
    }),
    { message: "mongodb_version_unsupported" }
  );
  assert.throws(
    () => verifyConnectedIdentity({
      options: options(),
      databaseName: "categoryApp",
      topology: { version: "8.0.12" },
    }),
    { message: "replica_set_required" }
  );
});

test("standalone CLI connects exclusively with MONGODB_AUDIT_URI", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../scripts/migratePrepaidIndexes.js"),
    "utf8"
  );
  assert.match(source, /createConnection\(process\.env\.MONGODB_AUDIT_URI,/);
  assert.doesNotMatch(source, /process\.env\.MONGODB_URI/);
});

test("catalog accepts only the expected legacy and exact target definitions", () => {
  const specification = REQUIRED_INDEXES[0];
  assert.deepEqual(
    inspectIndexCatalog([legacyIndex(specification)], specification),
    { targetPresent: false, legacyPresent: true }
  );
  assert.deepEqual(
    inspectIndexCatalog([legacyIndex(specification), targetIndex(specification)], specification),
    { targetPresent: true, legacyPresent: true }
  );
  assert.throws(
    () => inspectIndexCatalog([{ ...targetIndex(specification), unique: false }], specification),
    { message: "target_index_definition_unexpected" }
  );
  assert.throws(
    () => inspectIndexCatalog([{ ...targetIndex(specification), hidden: true }], specification),
    { message: "target_index_definition_unexpected" }
  );
  assert.throws(
    () => inspectIndexCatalog([{ name: "unknown", key: specification.key }], specification),
    { message: "same_key_index_unexpected" }
  );
});

test("duplicate and malformed checks target only qualifying references", () => {
  const duplicate = duplicatePipeline("billingSessionId");
  assert.deepEqual(duplicate[0], { $match: { billingSessionId: { $type: "objectId" } } });
  assert.deepEqual(duplicate[2], { $match: { count: { $gt: 1 } } });

  const malformed = malformedPipeline("billingSessionId");
  assert.deepEqual(malformed[0].$match.billingSessionId, { $exists: true, $ne: null });
  assert.deepEqual(malformed[0].$match.$expr, {
    $ne: [{ $type: "$billingSessionId" }, "objectId"],
  });
});

test("dry-run audits but never creates indexes", async () => {
  const repo = repository();
  const result = await runMigration({ options: options(false), repository: repo });
  assert.equal(result.mode, "dry_run");
  assert.deepEqual(result.indexes.map((item) => item.action), ["would_create", "would_create"]);
  assert.equal(repo.calls.createIndex.length, 0);
  assert.equal(result.recordsModified, 0);
  assert.equal(result.indexesDropped, 0);
});

test("apply creates and verifies only missing approved indexes", async () => {
  const repo = repository();
  const result = await runMigration({ options: options(true), repository: repo });
  assert.deepEqual(result.created, REQUIRED_INDEXES.map((item) => item.name));
  assert.equal(repo.calls.createIndex.length, 2);
  for (const call of repo.calls.createIndex) {
    assert.equal(call.options.unique, true);
    assert.ok(call.options.partialFilterExpression);
  }
  assert.equal(result.indexesDropped, 0);
});

test("rerun is idempotent when exact indexes already exist", async () => {
  const repo = repository({ targetsPresent: true });
  const result = await runMigration({ options: options(true), repository: repo });
  assert.deepEqual(result.created, []);
  assert.deepEqual(result.indexes.map((item) => item.action), ["verified", "verified"]);
  assert.equal(repo.calls.createIndex.length, 0);
});

test("duplicates and malformed references block both dry-run and apply", async () => {
  const duplicateRepo = repository({
    duplicates: {
      transactions: [{ _id: "bill", count: 2, documentIds: ["one", "two"] }],
    },
  });
  await assert.rejects(
    runMigration({ options: options(true), repository: duplicateRepo }),
    { message: "duplicate_references_detected" }
  );
  assert.equal(duplicateRepo.calls.createIndex.length, 0);

  const malformedRepo = repository({
    malformed: {
      customermemberships: [{ _id: "membership", detectedType: "string" }],
    },
  });
  await assert.rejects(
    runMigration({ options: options(false), repository: malformedRepo }),
    { message: "malformed_references_detected" }
  );
  assert.equal(malformedRepo.calls.createIndex.length, 0);
});

test("index creation errors expose only safe structured diagnostics", async () => {
  const repo = repository();
  repo.createIndex = async () => {
    const error = new Error(
      "Index conflict at mongodb+srv://secret-user:secret-password@example.invalid/private"
    );
    error.code = 85;
    error.codeName = "IndexOptionsConflict";
    error.connectionString = "mongodb+srv://secret-user:secret-password@example.invalid/private";
    throw error;
  };

  await assert.rejects(
    async () => runMigration({ options: options(true), repository: repo }),
    (error) => {
      assert.equal(error.safeCode, "index_creation_failed");
      assert.deepEqual(error.safeDetails, {
        operation: "create_index",
        stage: "apply",
        collectionName: "customermemberships",
        indexName: "customer_membership_renewal_lineage_unique",
        mongoCode: 85,
        mongoCodeName: "IndexOptionsConflict",
        category: "index_options_conflict",
      });
      const serialized = JSON.stringify(error.safeDetails);
      assert.doesNotMatch(serialized, /secret-user|secret-password|connectionString|example\.invalid/);
      return true;
    }
  );
});

test("MongoDB error sanitizer categorizes privilege and unknown failures safely", () => {
  assert.deepEqual(
    sanitizeMongoError(
      { code: 13, codeName: "Unauthorized", message: "contains a secret" },
      { operation: "create_index", stage: "apply", collectionName: "transactions" }
    ),
    {
      operation: "create_index",
      stage: "apply",
      collectionName: "transactions",
      indexName: null,
      mongoCode: 13,
      mongoCodeName: "Unauthorized",
      category: "authorization_failed",
    }
  );

  const unknown = sanitizeMongoError({
    code: "not-numeric",
    codeName: "invalid name with spaces",
    message: "mongodb://user:password@example.invalid",
  });
  assert.equal(unknown.mongoCode, null);
  assert.equal(unknown.mongoCodeName, null);
  assert.equal(unknown.category, "mongodb_operation_failed");
  assert.doesNotMatch(JSON.stringify(unknown), /password|example\.invalid/);
});
