const {
  extractMongoDatabase,
  extractMongoHost,
  sanitizeMongoError,
  verifyConnectedIdentity,
} = require("./prepaidIndexMigration");

const APPROVED_TARGET = Object.freeze({
  host: "cluster0.ddzqz7y.mongodb.net",
  databaseName: "categoryApp",
  collectionName: "customermemberships",
});

const LEGACY_INDEX = Object.freeze({
  name: "vendorId_1_customerId_1",
  key: Object.freeze({ vendorId: 1, customerId: 1 }),
  unique: true,
  partialFilterExpression: Object.freeze({ status: "ACTIVE" }),
});

const REPLACEMENT_INDEXES = Object.freeze([
  Object.freeze({
    name: "customer_membership_active_discount_unique",
    key: LEGACY_INDEX.key,
    unique: true,
    partialFilterExpression: Object.freeze({
      status: "ACTIVE",
      membershipType: "DISCOUNT",
    }),
  }),
  Object.freeze({
    name: "customer_membership_active_prepaid_unique",
    key: LEGACY_INDEX.key,
    unique: true,
    partialFilterExpression: Object.freeze({
      status: "ACTIVE",
      membershipType: Object.freeze({
        $in: Object.freeze(["PREPAID_VALUE", "PREPAID_SESSIONS"]),
      }),
    }),
  }),
]);

const ALLOWED_MEMBERSHIP_TYPES = Object.freeze([
  "DISCOUNT",
  "PREPAID_VALUE",
  "PREPAID_SESSIONS",
]);
const DROP_CONFIRMATION = "DROP_vendorId_1_customerId_1_FROM_categoryApp.customermemberships";

function migrationError(code, details = {}) {
  const error = new Error(code);
  error.safeCode = code;
  error.safeDetails = details;
  return error;
}

function normalizeHost(value) {
  return String(value || "").trim().toLowerCase().replace(/\.$/, "").replace(/:\d+$/, "");
}

function parseArguments(argv) {
  const values = {};
  let createReplacements = false;
  let dropOldIndex = false;
  for (const argument of argv) {
    if (argument === "--create-replacements") {
      if (createReplacements) throw migrationError("arguments_malformed");
      createReplacements = true;
      continue;
    }
    if (argument === "--drop-old-index") {
      if (dropOldIndex) throw migrationError("arguments_malformed");
      dropOldIndex = true;
      continue;
    }
    const match = String(argument).match(/^--([a-z-]+)=(.*)$/);
    if (!match || Object.prototype.hasOwnProperty.call(values, match[1])) {
      throw migrationError("arguments_malformed");
    }
    values[match[1]] = match[2].trim();
  }

  if (createReplacements && dropOldIndex) throw migrationError("migration_modes_conflict");
  const allowed = new Set([
    "expected-host",
    "expected-db",
    "expected-collection",
    "confirm-drop",
    "membership-writes-paused",
    "old-backends-stopped",
    "global-index-recreation-prevented",
  ]);
  if (Object.keys(values).some((key) => !allowed.has(key))) {
    throw migrationError("argument_not_allowed");
  }

  const mode = createReplacements ? "create_replacements" : dropOldIndex ? "drop_old_index" : "dry_run";
  if (mode !== "dry_run") {
    throw migrationError("membership_coexistence_migration_retired", {
      replacementUtility: "migrateUnlimitedMembershipIndexes.js",
    });
  }
  const options = {
    mode,
    expectedHost: normalizeHost(values["expected-host"]),
    expectedDb: String(values["expected-db"] || "").trim(),
    expectedCollection: String(values["expected-collection"] || "").trim(),
    confirmDrop: String(values["confirm-drop"] || ""),
    membershipWritesPaused: values["membership-writes-paused"] === "true",
    oldBackendsStopped: values["old-backends-stopped"] === "true",
    globalIndexRecreationPrevented:
      values["global-index-recreation-prevented"] === "true",
  };
  if (!options.expectedHost) throw migrationError("expected_host_required");
  if (!options.expectedDb) throw migrationError("expected_database_required");
  if (!options.expectedCollection) throw migrationError("expected_collection_required");
  if (
    options.expectedHost !== APPROVED_TARGET.host ||
    options.expectedDb !== APPROVED_TARGET.databaseName ||
    options.expectedCollection !== APPROVED_TARGET.collectionName
  ) {
    throw migrationError("approved_target_mismatch");
  }
  if (mode === "drop_old_index") {
    if (options.confirmDrop !== DROP_CONFIRMATION) {
      throw migrationError("drop_confirmation_required");
    }
    if (!options.membershipWritesPaused) throw migrationError("membership_writes_pause_required");
    if (!options.oldBackendsStopped) throw migrationError("old_backends_stop_required");
    if (!options.globalIndexRecreationPrevented) {
      throw migrationError("global_index_recreation_guard_required");
    }
  } else if (
    options.confirmDrop ||
    values["membership-writes-paused"] !== undefined ||
    values["old-backends-stopped"] !== undefined ||
    values["global-index-recreation-prevented"] !== undefined
  ) {
    throw migrationError("drop_guards_without_drop_mode");
  }
  return options;
}

function verifyConfiguredIdentity(options, env) {
  const auditUri = String(env.MONGODB_AUDIT_URI || "").trim();
  if (!auditUri) throw migrationError("mongodb_audit_uri_required");
  const configuredHost = extractMongoHost(auditUri);
  const databaseName = extractMongoDatabase(auditUri);
  const configuredDb = String(env.MONGODB_DBNAME || "").trim();
  if (configuredHost !== options.expectedHost) throw migrationError("configured_host_mismatch");
  if (databaseName !== options.expectedDb) throw migrationError("configured_database_mismatch");
  if (configuredDb && configuredDb !== options.expectedDb) {
    throw migrationError("configured_database_mismatch");
  }
  return { host: configuredHost, databaseName };
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

function hasUnsupportedOptions(index) {
  return Boolean(
    index?.sparse === true ||
    index?.hidden === true ||
    index?.expireAfterSeconds !== undefined ||
    index?.wildcardProjection !== undefined ||
    index?.collation !== undefined
  );
}

function isExactIndex(index, specification) {
  return Boolean(
    index &&
    index.name === specification.name &&
    index.unique === true &&
    !hasUnsupportedOptions(index) &&
    sameDocument(index.key, specification.key) &&
    sameDocument(index.partialFilterExpression, specification.partialFilterExpression)
  );
}

function inspectCatalog(indexes) {
  const allowedSameKeyNames = new Set([
    LEGACY_INDEX.name,
    ...REPLACEMENT_INDEXES.map((index) => index.name),
  ]);
  const sameKeyIndexes = indexes.filter((index) => sameDocument(index.key, LEGACY_INDEX.key));
  const unexpectedSameKey = sameKeyIndexes.filter((index) => !allowedSameKeyNames.has(index.name));
  if (unexpectedSameKey.length) {
    throw migrationError("same_key_index_unexpected", {
      collectionName: APPROVED_TARGET.collectionName,
      indexNames: unexpectedSameKey.map((index) => String(index.name || "unnamed")),
    });
  }

  const legacy = indexes.find((index) => index.name === LEGACY_INDEX.name);
  if (legacy && !isExactIndex(legacy, LEGACY_INDEX)) {
    throw migrationError("legacy_index_definition_unexpected", {
      collectionName: APPROVED_TARGET.collectionName,
      indexName: LEGACY_INDEX.name,
    });
  }
  const replacements = REPLACEMENT_INDEXES.map((specification) => {
    const index = indexes.find((item) => item.name === specification.name);
    if (index && !isExactIndex(index, specification)) {
      throw migrationError("replacement_index_definition_unexpected", {
        collectionName: APPROVED_TARGET.collectionName,
        indexName: specification.name,
      });
    }
    return { specification, present: Boolean(index) };
  });
  return { legacyPresent: Boolean(legacy), replacements };
}

function duplicateEntitlementPipeline(membershipTypes) {
  return [
    {
      $match: {
        status: "ACTIVE",
        membershipType: membershipTypes.length === 1
          ? membershipTypes[0]
          : { $in: membershipTypes },
      },
    },
    {
      $group: {
        _id: { vendorId: "$vendorId", customerId: "$customerId" },
        count: { $sum: 1 },
        documentIds: { $push: "$_id" },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $limit: 100 },
  ];
}

function legacyTypePipeline() {
  return [
    {
      $match: {
        status: { $in: ["ACTIVE", "SCHEDULED"] },
        $or: [
          { membershipType: { $exists: false } },
          { membershipType: null },
          { membershipType: { $nin: ALLOWED_MEMBERSHIP_TYPES } },
        ],
      },
    },
    {
      $project: {
        _id: 1,
        status: 1,
        membershipType: 1,
        detectedType: { $type: "$membershipType" },
      },
    },
    { $limit: 100 },
  ];
}

function serializeDuplicateGroups(groups) {
  return groups.map((item) => ({
    vendorId: String(item._id?.vendorId || ""),
    customerId: String(item._id?.customerId || ""),
    count: Number(item.count),
    documentIds: (item.documentIds || []).map(String),
  }));
}

async function auditMembershipData(repository) {
  const [discountDuplicates, prepaidDuplicates, legacyTypes] = await Promise.all([
    repository.aggregate(
      APPROVED_TARGET.collectionName,
      duplicateEntitlementPipeline(["DISCOUNT"])
    ),
    repository.aggregate(
      APPROVED_TARGET.collectionName,
      duplicateEntitlementPipeline(["PREPAID_VALUE", "PREPAID_SESSIONS"])
    ),
    repository.aggregate(APPROVED_TARGET.collectionName, legacyTypePipeline()),
  ]);
  if (discountDuplicates.length) {
    throw migrationError("duplicate_active_discount_memberships", {
      groups: serializeDuplicateGroups(discountDuplicates),
    });
  }
  if (prepaidDuplicates.length) {
    throw migrationError("duplicate_active_prepaid_memberships", {
      groups: serializeDuplicateGroups(prepaidDuplicates),
    });
  }
  if (legacyTypes.length) {
    throw migrationError("unsupported_active_or_scheduled_memberships", {
      documents: legacyTypes.map((item) => ({
        documentId: String(item._id),
        status: String(item.status || ""),
        membershipType: typeof item.membershipType === "string" ? item.membershipType : null,
        detectedType: String(item.detectedType || "missing"),
      })),
    });
  }
  return {
    activeDiscountDuplicateGroups: 0,
    activePrepaidDuplicateGroups: 0,
    unsupportedActiveOrScheduledMemberships: 0,
  };
}

async function loadAndInspectCatalog(repository) {
  return inspectCatalog(await repository.listIndexes(APPROVED_TARGET.collectionName));
}

async function runMigration({ options, repository }) {
  if (options?.mode !== "dry_run") {
    throw migrationError("membership_coexistence_migration_retired", {
      replacementUtility: "migrateUnlimitedMembershipIndexes.js",
    });
  }
  const connected = verifyConnectedIdentity({
    options,
    databaseName: await repository.getDatabaseName(),
    topology: await repository.getTopology(),
  });
  if (!/^8\./.test(connected.mongoVersion)) {
    throw migrationError("mongodb_version_unapproved_for_coexistence_migration", {
      approvedMajorVersion: 8,
      detectedVersion: connected.mongoVersion,
    });
  }
  const collections = new Set(await repository.listCollectionNames());
  if (!collections.has(options.expectedCollection)) {
    throw migrationError("required_collection_missing", {
      collectionName: options.expectedCollection,
    });
  }

  let catalog = await loadAndInspectCatalog(repository);
  const audit = await auditMembershipData(repository);
  if (!catalog.legacyPresent && catalog.replacements.some((item) => !item.present)) {
    throw migrationError("global_index_missing_before_replacements");
  }

  const created = [];
  const dropped = [];
  if (options.mode === "create_replacements") {
    for (const replacement of catalog.replacements) {
      if (replacement.present) continue;
      const specification = replacement.specification;
      let createdName;
      try {
        createdName = await repository.createIndex(
          options.expectedCollection,
          specification.key,
          {
            name: specification.name,
            unique: true,
            partialFilterExpression: specification.partialFilterExpression,
          }
        );
      } catch (error) {
        throw migrationError("index_creation_failed", sanitizeMongoError(error, {
          operation: "create_index",
          stage: "create_replacements",
          collectionName: options.expectedCollection,
          indexName: specification.name,
        }));
      }
      if (createdName !== specification.name) {
        throw migrationError("created_index_name_unexpected", { indexName: specification.name });
      }
      created.push(specification.name);
    }
    catalog = await loadAndInspectCatalog(repository);
    if (catalog.replacements.some((item) => !item.present) || !catalog.legacyPresent) {
      throw migrationError("replacement_index_verification_failed");
    }
  }

  if (options.mode === "drop_old_index") {
    if (catalog.replacements.some((item) => !item.present)) {
      throw migrationError("replacement_indexes_required_before_drop");
    }
    if (catalog.legacyPresent) {
      await auditMembershipData(repository);
      try {
        await repository.dropIndex(options.expectedCollection, LEGACY_INDEX.name);
      } catch (error) {
        throw migrationError("index_drop_failed", sanitizeMongoError(error, {
          operation: "drop_index",
          stage: "drop_old_index",
          collectionName: options.expectedCollection,
          indexName: LEGACY_INDEX.name,
        }));
      }
      dropped.push(LEGACY_INDEX.name);
    }
    catalog = await loadAndInspectCatalog(repository);
    if (catalog.legacyPresent || catalog.replacements.some((item) => !item.present)) {
      throw migrationError("post_drop_index_verification_failed");
    }
  }

  return {
    mode: options.mode,
    target: {
      host: options.expectedHost,
      databaseName: connected.databaseName,
      collectionName: options.expectedCollection,
      replicaSet: connected.replicaSet,
      mongoVersion: connected.mongoVersion,
    },
    indexes: {
      legacy: {
        indexName: LEGACY_INDEX.name,
        present: catalog.legacyPresent,
        action: catalog.legacyPresent
          ? options.mode === "dry_run" ? "pending_controlled_drop" : "preserved"
          : "absent",
      },
      replacements: catalog.replacements.map((item) => ({
        indexName: item.specification.name,
        present: item.present,
        action: item.present
          ? created.includes(item.specification.name) ? "created" : "verified"
          : "would_create",
      })),
    },
    audit,
    created,
    dropped,
    recordsModified: 0,
    indexesDropped: dropped.length,
  };
}

module.exports = {
  ALLOWED_MEMBERSHIP_TYPES,
  APPROVED_TARGET,
  DROP_CONFIRMATION,
  LEGACY_INDEX,
  REPLACEMENT_INDEXES,
  auditMembershipData,
  duplicateEntitlementPipeline,
  inspectCatalog,
  isExactIndex,
  legacyTypePipeline,
  parseArguments,
  runMigration,
  verifyConfiguredIdentity,
};
