const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const CustomerMembership = require("../models/CustomerMembership");

const {
  APPROVED_TARGET,
  DROP_CONFIRMATION,
  LEGACY_INDEX,
  REPLACEMENT_INDEXES,
  duplicateEntitlementPipeline,
  inspectCatalog,
  legacyTypePipeline,
  parseArguments,
  runMigration,
  verifyConfiguredIdentity,
} = require("../scripts/lib/membershipCoexistenceIndexMigration");

function exactIndex(specification) {
  return {
    name: specification.name,
    key: specification.key,
    unique: true,
    partialFilterExpression: specification.partialFilterExpression,
  };
}

function baseArguments(extra = []) {
  return [
    `--expected-host=${APPROVED_TARGET.host}`,
    `--expected-db=${APPROVED_TARGET.databaseName}`,
    `--expected-collection=${APPROVED_TARGET.collectionName}`,
    ...extra,
  ];
}

function options(mode = "dry_run") {
  return {
    mode,
    expectedHost: APPROVED_TARGET.host,
    expectedDb: APPROVED_TARGET.databaseName,
    expectedCollection: APPROVED_TARGET.collectionName,
    confirmDrop: mode === "drop_old_index" ? DROP_CONFIRMATION : "",
    membershipWritesPaused: mode === "drop_old_index",
    oldBackendsStopped: mode === "drop_old_index",
    globalIndexRecreationPrevented: mode === "drop_old_index",
  };
}

function repository({
  legacyPresent = true,
  replacementsPresent = false,
  indexes: suppliedIndexes,
  discountDuplicates = [],
  prepaidDuplicates = [],
  legacyTypes = [],
} = {}) {
  const indexes = suppliedIndexes || [
    { name: "_id_", key: { _id: 1 } },
    ...(legacyPresent ? [exactIndex(LEGACY_INDEX)] : []),
    ...(replacementsPresent ? REPLACEMENT_INDEXES.map(exactIndex) : []),
  ];
  const calls = { aggregate: [], createIndex: [], dropIndex: [] };
  return {
    calls,
    async getDatabaseName() { return APPROVED_TARGET.databaseName; },
    async getTopology() { return { setName: "atlas-test-shard-0", version: "8.0.37" }; },
    async listCollectionNames() { return [APPROVED_TARGET.collectionName]; },
    async listIndexes() { return indexes; },
    async aggregate(collectionName, pipeline) {
      calls.aggregate.push({ collectionName, pipeline });
      const match = pipeline[0]?.$match || {};
      if (pipeline.some((stage) => stage.$group)) {
        return match.membershipType === "DISCOUNT" ? discountDuplicates : prepaidDuplicates;
      }
      return legacyTypes;
    },
    async createIndex(collectionName, key, indexOptions) {
      calls.createIndex.push({ collectionName, key, options: indexOptions });
      const specification = REPLACEMENT_INDEXES.find((item) => item.name === indexOptions.name);
      indexes.push(exactIndex(specification));
      return indexOptions.name;
    },
    async dropIndex(collectionName, indexName) {
      calls.dropIndex.push({ collectionName, indexName });
      const position = indexes.findIndex((index) => index.name === indexName);
      if (position >= 0) indexes.splice(position, 1);
      return { ok: 1 };
    },
  };
}

test("retired coexistence migration remains read-only", () => {
  assert.deepEqual(parseArguments(baseArguments()), options());
  assert.throws(
    () => parseArguments(baseArguments(["--create-replacements"])),
    { message: "membership_coexistence_migration_retired" }
  );
  assert.throws(
    () => parseArguments(baseArguments([
      "--drop-old-index",
      `--confirm-drop=${DROP_CONFIRMATION}`,
      "--membership-writes-paused=true",
      "--old-backends-stopped=true",
      "--global-index-recreation-prevented=true",
    ])),
    { message: "membership_coexistence_migration_retired" }
  );
});

test("identity validation uses only the explicit audit URI target", () => {
  assert.deepEqual(
    verifyConfiguredIdentity(options(), {
      MONGODB_AUDIT_URI:
        "mongodb+srv://hidden:hidden@cluster0.ddzqz7y.mongodb.net/categoryApp",
      MONGODB_URI: "mongodb+srv://hidden:hidden@production.invalid/production",
    }),
    { host: APPROVED_TARGET.host, databaseName: APPROVED_TARGET.databaseName }
  );
  assert.throws(
    () => verifyConfiguredIdentity(options(), { MONGODB_URI: "mongodb://ignored" }),
    { message: "mongodb_audit_uri_required" }
  );
});

test("catalog accepts only exact legacy and replacement definitions", () => {
  const exactCatalog = [exactIndex(LEGACY_INDEX), ...REPLACEMENT_INDEXES.map(exactIndex)];
  const result = inspectCatalog(exactCatalog);
  assert.equal(result.legacyPresent, true);
  assert.ok(result.replacements.every((item) => item.present));

  assert.throws(
    () => inspectCatalog([{ ...exactIndex(LEGACY_INDEX), unique: false }]),
    { message: "legacy_index_definition_unexpected" }
  );
  assert.throws(
    () => inspectCatalog([{ ...exactIndex(REPLACEMENT_INDEXES[0]), unique: false }]),
    { message: "replacement_index_definition_unexpected" }
  );
  assert.throws(
    () => inspectCatalog([{ name: "unexpected_same_key", key: LEGACY_INDEX.key }]),
    { message: "same_key_index_unexpected" }
  );
});

test("retired entitlement indexes are absent from the current Mongoose schema", () => {
  const schemaIndexes = CustomerMembership.schema.indexes();
  for (const replacement of REPLACEMENT_INDEXES) {
    const schemaIndex = schemaIndexes.find(([, indexOptions]) => (
      indexOptions.name === replacement.name
    ));
    assert.equal(schemaIndex, undefined, `${replacement.name} must not be declared by the schema`);
  }
});

test("duplicate and legacy pipelines use the approved entitlement definitions", () => {
  const discount = duplicateEntitlementPipeline(["DISCOUNT"]);
  const prepaid = duplicateEntitlementPipeline(["PREPAID_VALUE", "PREPAID_SESSIONS"]);
  assert.equal(discount[0].$match.status, "ACTIVE");
  assert.equal(discount[0].$match.membershipType, "DISCOUNT");
  assert.deepEqual(prepaid[0].$match.membershipType, {
    $in: ["PREPAID_VALUE", "PREPAID_SESSIONS"],
  });
  assert.deepEqual(legacyTypePipeline()[0].$match.status, {
    $in: ["ACTIVE", "SCHEDULED"],
  });
});

test("dry-run performs audits without index mutations", async () => {
  const repo = repository();
  const result = await runMigration({ options: options(), repository: repo });
  assert.equal(result.mode, "dry_run");
  assert.deepEqual(
    result.indexes.replacements.map((index) => index.action),
    ["would_create", "would_create"]
  );
  assert.equal(result.indexes.legacy.action, "pending_controlled_drop");
  assert.equal(repo.calls.createIndex.length, 0);
  assert.equal(repo.calls.dropIndex.length, 0);
  assert.equal(result.recordsModified, 0);
});

test("the migration fails closed outside the audited MongoDB 8 major version", async () => {
  const repo = repository();
  repo.getTopology = async () => ({ setName: "local-replica", version: "7.0.24" });
  await assert.rejects(
    runMigration({ options: options(), repository: repo }),
    { message: "mongodb_version_unapproved_for_coexistence_migration" }
  );
  assert.equal(repo.calls.createIndex.length, 0);
  assert.equal(repo.calls.dropIndex.length, 0);
});

test("direct callers cannot use retired mutation modes", async () => {
  const repo = repository();
  for (const mode of ["create_replacements", "drop_old_index"]) {
    await assert.rejects(
      runMigration({ options: options(mode), repository: repo }),
      { message: "membership_coexistence_migration_retired" }
    );
  }
  assert.equal(repo.calls.createIndex.length, 0);
  assert.equal(repo.calls.dropIndex.length, 0);
});

test("duplicate and unsupported membership records block every mutation", async () => {
  for (const repo of [
    repository({
      discountDuplicates: [{
        _id: { vendorId: "vendor", customerId: "customer" },
        count: 2,
        documentIds: ["one", "two"],
      }],
    }),
    repository({
      prepaidDuplicates: [{
        _id: { vendorId: "vendor", customerId: "customer" },
        count: 2,
        documentIds: ["one", "two"],
      }],
    }),
    repository({
      legacyTypes: [{
        _id: "legacy",
        status: "ACTIVE",
        membershipType: "SERVICE_QUOTA",
        detectedType: "string",
      }],
    }),
  ]) {
    await assert.rejects(runMigration({
      options: options(),
      repository: repo,
    }));
    assert.equal(repo.calls.createIndex.length, 0);
    assert.equal(repo.calls.dropIndex.length, 0);
  }
});

test("legacy dry-run still fails closed when the old index is unexpectedly absent", async () => {
  await assert.rejects(
    runMigration({
      options: options(),
      repository: repository({ legacyPresent: false, replacementsPresent: false }),
    }),
    { message: "global_index_missing_before_replacements" }
  );
});

test("standalone CLI disables auto-indexing and contains no startup or syncIndexes path", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../scripts/migrateMembershipCoexistenceIndexes.js"),
    "utf8"
  );
  assert.match(source, /createConnection\(process\.env\.MONGODB_AUDIT_URI,/);
  assert.match(source, /autoIndex:\s*false/);
  assert.doesNotMatch(source, /process\.env\.MONGODB_URI/);
  assert.doesNotMatch(source, /syncIndexes|server\.js|connectDB/);
});
