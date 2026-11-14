const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  ACTIVE_MEMBERSHIP_UNIQUE_INDEXES,
  expectedConfirmation,
  inspectIndexes,
  parseArguments,
  runMigration,
  verifyConfiguredIdentity,
} = require("../scripts/lib/unlimitedMembershipIndexMigration");

const TARGET = {
  environment: "test",
  host: "cluster0.example.mongodb.net",
  databaseName: "categoryApp",
  collectionName: "customermemberships",
};

function exactIndex(specification) {
  return {
    name: specification.name,
    key: specification.key,
    unique: true,
    partialFilterExpression: specification.partialFilterExpression,
  };
}

function args(extra = []) {
  return [
    `--environment=${TARGET.environment}`,
    `--expected-host=${TARGET.host}`,
    `--expected-db=${TARGET.databaseName}`,
    `--expected-collection=${TARGET.collectionName}`,
    ...extra,
  ];
}

function repository(indexes = ACTIVE_MEMBERSHIP_UNIQUE_INDEXES.map(exactIndex)) {
  const catalog = [...indexes];
  const calls = { drops: [] };
  return {
    calls,
    async getDatabaseName() { return TARGET.databaseName; },
    async getTopology() { return { setName: "rs-test", version: "8.0.37" }; },
    async listCollectionNames() { return [TARGET.collectionName]; },
    async listIndexes() { return catalog; },
    async countDocuments() { return 19; },
    async dropIndex(collectionName, indexName) {
      calls.drops.push({ collectionName, indexName });
      const position = catalog.findIndex((index) => index.name === indexName);
      if (position >= 0) catalog.splice(position, 1);
    },
  };
}

test("unlimited membership migration defaults to dry-run and requires every drop guard", () => {
  const dryRun = parseArguments(args());
  assert.equal(dryRun.mode, "dry_run");
  assert.equal(dryRun.expectedCollection, TARGET.collectionName);

  const confirmation = expectedConfirmation(dryRun);
  const applyArgs = args([
    "--drop-active-membership-unique-indexes",
    `--confirm-drop=${confirmation}`,
    "--membership-writes-paused=true",
    "--all-backends-updated=true",
    "--index-recreation-prevented=true",
  ]);
  assert.equal(parseArguments(applyArgs).mode, "drop_active_membership_unique_indexes");
  for (const guard of applyArgs.slice(-4)) {
    assert.throws(() => parseArguments(applyArgs.filter((argument) => argument !== guard)));
  }
});

test("migration identity uses only the explicit audit URI", () => {
  const options = parseArguments(args());
  assert.deepEqual(verifyConfiguredIdentity(options, {
    MONGODB_AUDIT_URI: "mongodb+srv://hidden:hidden@cluster0.example.mongodb.net/categoryApp",
    MONGODB_URI: "mongodb+srv://hidden:hidden@production.invalid/prod",
  }), {
    host: TARGET.host,
    databaseName: TARGET.databaseName,
  });
  assert.throws(
    () => verifyConfiguredIdentity(options, { MONGODB_URI: "mongodb://ignored" }),
    { message: "mongodb_audit_uri_required" }
  );
});

test("only exact known entitlement indexes are eligible for removal", () => {
  assert.equal(inspectIndexes(ACTIVE_MEMBERSHIP_UNIQUE_INDEXES.map(exactIndex)).length, 3);
  assert.throws(
    () => inspectIndexes([{ ...exactIndex(ACTIVE_MEMBERSHIP_UNIQUE_INDEXES[0]), unique: false }]),
    { message: "active_membership_index_definition_unexpected" }
  );
  assert.throws(
    () => inspectIndexes([{
      name: "unexpected_active_unique",
      key: { vendorId: 1, customerId: 1 },
      unique: true,
      partialFilterExpression: { status: "ACTIVE", membershipType: "OTHER" },
    }]),
    { message: "unexpected_membership_count_unique_index" }
  );
});

test("dry-run reports without dropping indexes or records", async () => {
  const repo = repository();
  const result = await runMigration({ options: parseArguments(args()), repository: repo });
  assert.ok(result.indexes.every((index) => index.action === "would_drop"));
  assert.equal(result.indexesDropped, 0);
  assert.equal(result.recordsModified, 0);
  assert.equal(result.documentCountBefore, result.documentCountAfter);
  assert.deepEqual(repo.calls.drops, []);
});

test("guarded mode drops only exact active-membership uniques and is idempotent", async () => {
  const dryRun = parseArguments(args());
  const options = parseArguments(args([
    "--drop-active-membership-unique-indexes",
    `--confirm-drop=${expectedConfirmation(dryRun)}`,
    "--membership-writes-paused=true",
    "--all-backends-updated=true",
    "--index-recreation-prevented=true",
  ]));
  const repo = repository();
  const result = await runMigration({ options, repository: repo });
  assert.deepEqual(
    result.dropped.sort(),
    ACTIVE_MEMBERSHIP_UNIQUE_INDEXES.map((index) => index.name).sort()
  );
  assert.ok(result.indexes.every((index) => index.present === false));
  assert.equal(result.recordsModified, 0);

  const repeated = await runMigration({ options, repository: repo });
  assert.deepEqual(repeated.dropped, []);
  assert.equal(repo.calls.drops.length, 3);
});

test("standalone migration disables automatic indexing and has no create path", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../scripts/migrateUnlimitedMembershipIndexes.js"),
    "utf8"
  );
  assert.match(source, /MONGODB_AUDIT_URI/);
  assert.match(source, /autoIndex:\s*false/);
  assert.match(source, /autoCreate:\s*false/);
  assert.doesNotMatch(source, /MONGODB_URI|syncIndexes|createIndex\(/);
});
