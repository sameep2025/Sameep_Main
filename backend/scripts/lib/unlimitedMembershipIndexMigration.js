const {
  extractMongoDatabase,
  extractMongoHost,
  verifyConnectedIdentity,
} = require("./prepaidIndexMigration");

const COLLECTION_NAME = "customermemberships";
const ALLOWED_ENVIRONMENTS = new Set(["test", "preprod", "production"]);
const ACTIVE_MEMBERSHIP_UNIQUE_INDEXES = Object.freeze([
  Object.freeze({
    name: "vendorId_1_customerId_1",
    key: Object.freeze({ vendorId: 1, customerId: 1 }),
    unique: true,
    partialFilterExpression: Object.freeze({ status: "ACTIVE" }),
  }),
  Object.freeze({
    name: "customer_membership_active_discount_unique",
    key: Object.freeze({ vendorId: 1, customerId: 1 }),
    unique: true,
    partialFilterExpression: Object.freeze({ status: "ACTIVE", membershipType: "DISCOUNT" }),
  }),
  Object.freeze({
    name: "customer_membership_active_prepaid_unique",
    key: Object.freeze({ vendorId: 1, customerId: 1 }),
    unique: true,
    partialFilterExpression: Object.freeze({
      status: "ACTIVE",
      membershipType: Object.freeze({ $in: Object.freeze(["PREPAID_VALUE", "PREPAID_SESSIONS"]) }),
    }),
  }),
]);

function migrationError(code, details = {}) {
  const error = new Error(code);
  error.safeCode = code;
  error.safeDetails = details;
  return error;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stable(value[key]);
    return result;
  }, {});
}

function sameDocument(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function normalizeHost(value) {
  return String(value || "").trim().toLowerCase().replace(/\.$/, "").replace(/:\d+$/, "");
}

function expectedConfirmation(options) {
  return `DROP_ACTIVE_MEMBERSHIP_UNIQUES_FROM_${options.environment.toUpperCase()}_${options.expectedDb}_${options.expectedCollection}`;
}

function parseArguments(argv) {
  const values = {};
  let apply = false;
  argv.forEach((argument) => {
    if (argument === "--drop-active-membership-unique-indexes") {
      if (apply) throw migrationError("arguments_malformed");
      apply = true;
      return;
    }
    const match = String(argument).match(/^--([a-z-]+)=(.*)$/);
    if (!match || Object.prototype.hasOwnProperty.call(values, match[1])) {
      throw migrationError("arguments_malformed");
    }
    values[match[1]] = match[2].trim();
  });
  const allowed = new Set([
    "environment",
    "expected-host",
    "expected-db",
    "expected-collection",
    "confirm-drop",
    "membership-writes-paused",
    "all-backends-updated",
    "index-recreation-prevented",
  ]);
  if (Object.keys(values).some((key) => !allowed.has(key))) {
    throw migrationError("argument_not_allowed");
  }
  const options = {
    mode: apply ? "drop_active_membership_unique_indexes" : "dry_run",
    environment: String(values.environment || "").trim().toLowerCase(),
    expectedHost: normalizeHost(values["expected-host"]),
    expectedDb: String(values["expected-db"] || "").trim(),
    expectedCollection: String(values["expected-collection"] || "").trim(),
    confirmDrop: String(values["confirm-drop"] || ""),
    membershipWritesPaused: values["membership-writes-paused"] === "true",
    allBackendsUpdated: values["all-backends-updated"] === "true",
    indexRecreationPrevented: values["index-recreation-prevented"] === "true",
  };
  if (!ALLOWED_ENVIRONMENTS.has(options.environment)) throw migrationError("environment_invalid");
  if (!options.expectedHost) throw migrationError("expected_host_required");
  if (!options.expectedDb) throw migrationError("expected_database_required");
  if (options.expectedCollection !== COLLECTION_NAME) throw migrationError("expected_collection_mismatch");
  if (apply) {
    if (options.confirmDrop !== expectedConfirmation(options)) throw migrationError("drop_confirmation_required");
    if (!options.membershipWritesPaused) throw migrationError("membership_writes_pause_required");
    if (!options.allBackendsUpdated) throw migrationError("all_backends_updated_required");
    if (!options.indexRecreationPrevented) throw migrationError("index_recreation_guard_required");
  } else if (
    options.confirmDrop ||
    values["membership-writes-paused"] !== undefined ||
    values["all-backends-updated"] !== undefined ||
    values["index-recreation-prevented"] !== undefined
  ) {
    throw migrationError("drop_guards_without_apply_mode");
  }
  return options;
}

function verifyConfiguredIdentity(options, env) {
  const auditUri = String(env.MONGODB_AUDIT_URI || "").trim();
  if (!auditUri) throw migrationError("mongodb_audit_uri_required");
  const host = extractMongoHost(auditUri);
  const databaseName = extractMongoDatabase(auditUri);
  if (host !== options.expectedHost) throw migrationError("configured_host_mismatch");
  if (!databaseName || databaseName !== options.expectedDb) {
    throw migrationError("configured_database_mismatch");
  }
  const configuredDb = String(env.MONGODB_DBNAME || "").trim();
  if (configuredDb && configuredDb !== options.expectedDb) {
    throw migrationError("configured_database_mismatch");
  }
  return { host, databaseName };
}

function isExactIndex(index, specification) {
  return Boolean(
    index &&
    index.name === specification.name &&
    index.unique === true &&
    sameDocument(index.key, specification.key) &&
    sameDocument(index.partialFilterExpression, specification.partialFilterExpression) &&
    index.sparse !== true &&
    index.hidden !== true &&
    index.expireAfterSeconds === undefined &&
    index.collation === undefined
  );
}

function inspectIndexes(indexes) {
  const byName = new Map(indexes.map((index) => [index.name, index]));
  const known = ACTIVE_MEMBERSHIP_UNIQUE_INDEXES.map((specification) => {
    const actual = byName.get(specification.name);
    if (actual && !isExactIndex(actual, specification)) {
      throw migrationError("active_membership_index_definition_unexpected", {
        collectionName: COLLECTION_NAME,
        indexName: specification.name,
      });
    }
    return { specification, present: Boolean(actual) };
  });
  const knownNames = new Set(ACTIVE_MEMBERSHIP_UNIQUE_INDEXES.map((index) => index.name));
  const unexpected = indexes.filter((index) => (
    index.unique === true &&
    sameDocument(index.key, { vendorId: 1, customerId: 1 }) &&
    !knownNames.has(index.name)
  ));
  if (unexpected.length) {
    throw migrationError("unexpected_membership_count_unique_index", {
      collectionName: COLLECTION_NAME,
      indexNames: unexpected.map((index) => index.name),
    });
  }
  return known;
}

async function runMigration({ options, repository }) {
  const connected = verifyConnectedIdentity({
    options,
    databaseName: await repository.getDatabaseName(),
    topology: await repository.getTopology(),
  });
  const collections = await repository.listCollectionNames();
  if (!collections.includes(options.expectedCollection)) throw migrationError("collection_missing");

  let catalog = inspectIndexes(await repository.listIndexes(options.expectedCollection));
  const documentCountBefore = await repository.countDocuments(options.expectedCollection);
  const toDrop = catalog.filter((entry) => entry.present).map((entry) => entry.specification.name);
  const dropped = [];
  if (options.mode !== "dry_run") {
    for (const indexName of toDrop) {
      await repository.dropIndex(options.expectedCollection, indexName);
      dropped.push(indexName);
    }
    catalog = inspectIndexes(await repository.listIndexes(options.expectedCollection));
    if (catalog.some((entry) => entry.present)) throw migrationError("post_drop_verification_failed");
  }
  const documentCountAfter = await repository.countDocuments(options.expectedCollection);
  if (documentCountAfter !== documentCountBefore) throw migrationError("membership_record_count_changed");

  return {
    mode: options.mode,
    target: {
      environment: options.environment,
      host: options.expectedHost,
      databaseName: connected.databaseName,
      collectionName: options.expectedCollection,
      replicaSet: connected.replicaSet,
      mongoVersion: connected.mongoVersion,
    },
    indexes: catalog.map((entry) => ({
      indexName: entry.specification.name,
      present: entry.present,
      action: options.mode === "dry_run" && entry.present ? "would_drop" : entry.present ? "present" : "absent",
    })),
    documentCountBefore,
    documentCountAfter,
    recordsModified: 0,
    dropped,
    indexesDropped: dropped.length,
  };
}

module.exports = {
  ACTIVE_MEMBERSHIP_UNIQUE_INDEXES,
  ALLOWED_ENVIRONMENTS,
  COLLECTION_NAME,
  expectedConfirmation,
  inspectIndexes,
  isExactIndex,
  parseArguments,
  runMigration,
  verifyConfiguredIdentity,
};
