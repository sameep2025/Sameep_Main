const APPROVED_TARGET = Object.freeze({
  host: "cluster0.ddzqz7y.mongodb.net",
  databaseName: "categoryApp",
});

const REQUIRED_INDEXES = Object.freeze([
  Object.freeze({
    collectionName: "customermemberships",
    legacyIndexName: "renewedFromMembershipId_1",
    name: "customer_membership_renewal_lineage_unique",
    key: Object.freeze({ renewedFromMembershipId: 1 }),
    unique: true,
    partialFilterExpression: Object.freeze({
      renewedFromMembershipId: Object.freeze({ $exists: true, $type: "objectId" }),
    }),
    referenceField: "renewedFromMembershipId",
  }),
  Object.freeze({
    collectionName: "transactions",
    legacyIndexName: "billingSessionId_1",
    name: "transaction_billing_session_unique",
    key: Object.freeze({ billingSessionId: 1 }),
    unique: true,
    partialFilterExpression: Object.freeze({
      billingSessionId: Object.freeze({ $exists: true, $type: "objectId" }),
    }),
    referenceField: "billingSessionId",
  }),
]);

function migrationError(code, details = {}) {
  const error = new Error(code);
  error.safeCode = code;
  error.safeDetails = details;
  return error;
}

function sanitizeMongoError(error, context = {}) {
  const numericCode = Number(error?.code);
  const mongoCode = Number.isSafeInteger(numericCode) ? numericCode : null;
  const rawCodeName = String(error?.codeName || "").trim();
  const mongoCodeName = /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(rawCodeName)
    ? rawCodeName
    : null;
  const categories = new Map([
    [13, "authorization_failed"],
    [26, "namespace_missing"],
    [67, "cannot_create_index"],
    [85, "index_options_conflict"],
    [86, "index_key_specs_conflict"],
    [11000, "duplicate_key"],
  ]);
  const category = categories.get(mongoCode) || (
    mongoCodeName === "Unauthorized" ? "authorization_failed" :
    mongoCodeName === "IndexOptionsConflict" ? "index_options_conflict" :
    mongoCodeName === "IndexKeySpecsConflict" ? "index_key_specs_conflict" :
    mongoCodeName === "DuplicateKey" ? "duplicate_key" :
    "mongodb_operation_failed"
  );

  return {
    operation: String(context.operation || "unknown"),
    stage: String(context.stage || "unknown"),
    collectionName: context.collectionName ? String(context.collectionName) : null,
    indexName: context.indexName ? String(context.indexName) : null,
    mongoCode,
    mongoCodeName,
    category,
  };
}

function normalizeHost(value) {
  return String(value || "").trim().toLowerCase().replace(/\.$/, "").replace(/:\d+$/, "");
}

function extractMongoHost(uri) {
  const match = String(uri || "").trim().match(/^mongodb(?:\+srv)?:\/\/([^/]+)(?:\/|$)/i);
  if (!match) throw migrationError("mongodb_uri_invalid");
  const authority = match[1].includes("@") ? match[1].split("@").pop() : match[1];
  const hosts = authority.split(",").map(normalizeHost).filter(Boolean);
  if (hosts.length !== 1) throw migrationError("mongodb_host_count_invalid");
  return hosts[0];
}

function extractMongoDatabase(uri) {
  const match = String(uri || "")
    .trim()
    .match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]*)(?:\?|$)/i);
  const encodedDatabase = String(match?.[1] || "").trim();
  if (!encodedDatabase) throw migrationError("mongodb_audit_database_required");
  try {
    return decodeURIComponent(encodedDatabase);
  } catch {
    throw migrationError("mongodb_audit_database_invalid");
  }
}

function parseArguments(argv) {
  const values = {};
  let apply = false;
  for (const argument of argv) {
    if (argument === "--apply") {
      if (apply) throw migrationError("arguments_malformed");
      apply = true;
      continue;
    }
    const match = String(argument).match(/^--([a-z-]+)=(.*)$/);
    if (!match || Object.prototype.hasOwnProperty.call(values, match[1])) {
      throw migrationError("arguments_malformed");
    }
    values[match[1]] = match[2].trim();
  }

  const allowed = new Set(["expected-host", "expected-db"]);
  if (Object.keys(values).some((key) => !allowed.has(key))) {
    throw migrationError("argument_not_allowed");
  }

  const options = {
    apply,
    expectedHost: normalizeHost(values["expected-host"]),
    expectedDb: String(values["expected-db"] || "").trim(),
  };
  if (!options.expectedHost) throw migrationError("expected_host_required");
  if (!options.expectedDb) throw migrationError("expected_database_required");
  if (
    options.expectedHost !== APPROVED_TARGET.host ||
    options.expectedDb !== APPROVED_TARGET.databaseName
  ) {
    throw migrationError("approved_target_mismatch");
  }
  return options;
}

function verifyConfiguredIdentity(options, env) {
  const auditUri = String(env.MONGODB_AUDIT_URI || "").trim();
  if (!auditUri) throw migrationError("mongodb_audit_uri_required");
  const configuredHost = extractMongoHost(auditUri);
  const auditDatabase = extractMongoDatabase(auditUri);
  const configuredDb = String(env.MONGODB_DBNAME || "").trim();
  if (configuredHost !== options.expectedHost) throw migrationError("configured_host_mismatch");
  if (auditDatabase !== options.expectedDb) throw migrationError("configured_database_mismatch");
  if (configuredDb && configuredDb !== options.expectedDb) {
    throw migrationError("configured_database_mismatch");
  }
  return { host: configuredHost, databaseName: auditDatabase };
}

function parseMajorVersion(version) {
  const match = String(version || "").match(/^(\d+)\./);
  return match ? Number(match[1]) : NaN;
}

function verifyConnectedIdentity({ options, databaseName, topology }) {
  if (String(databaseName || "") !== options.expectedDb) {
    throw migrationError("connected_database_mismatch");
  }
  if (!topology?.setName) throw migrationError("replica_set_required");
  const majorVersion = parseMajorVersion(topology.version);
  if (!Number.isSafeInteger(majorVersion) || majorVersion < 5) {
    throw migrationError("mongodb_version_unsupported", {
      minimumMajorVersion: 5,
      detectedMajorVersion: Number.isSafeInteger(majorVersion) ? majorVersion : null,
    });
  }
  return {
    databaseName: options.expectedDb,
    replicaSet: String(topology.setName),
    mongoVersion: String(topology.version),
  };
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

function hasUnsupportedIndexOptions(index) {
  return Boolean(
    index?.sparse === true ||
    index?.hidden === true ||
    index?.expireAfterSeconds !== undefined ||
    index?.wildcardProjection !== undefined ||
    index?.collation !== undefined
  );
}

function isExactRequiredIndex(index, specification) {
  return Boolean(
    index &&
    index.name === specification.name &&
    index.unique === true &&
    !hasUnsupportedIndexOptions(index) &&
    sameDocument(index.key, specification.key) &&
    sameDocument(index.partialFilterExpression, specification.partialFilterExpression)
  );
}

function isExpectedLegacyIndex(index, specification) {
  return Boolean(
    index &&
    index.name === specification.legacyIndexName &&
    index.unique !== true &&
    !index.partialFilterExpression &&
    !hasUnsupportedIndexOptions(index) &&
    sameDocument(index.key, specification.key)
  );
}

function inspectIndexCatalog(indexes, specification) {
  const namedTarget = indexes.find((index) => index.name === specification.name);
  if (namedTarget && !isExactRequiredIndex(namedTarget, specification)) {
    throw migrationError("target_index_definition_unexpected", {
      collectionName: specification.collectionName,
      indexName: specification.name,
    });
  }

  const sameKeyIndexes = indexes.filter((index) => sameDocument(index.key, specification.key));
  const unexpected = sameKeyIndexes.filter((index) => (
    !isExactRequiredIndex(index, specification) && !isExpectedLegacyIndex(index, specification)
  ));
  if (unexpected.length) {
    throw migrationError("same_key_index_unexpected", {
      collectionName: specification.collectionName,
      indexNames: unexpected.map((index) => String(index.name || "unnamed")),
    });
  }

  const namedLegacy = indexes.find((index) => index.name === specification.legacyIndexName);
  if (namedLegacy && !isExpectedLegacyIndex(namedLegacy, specification)) {
    throw migrationError("legacy_index_definition_unexpected", {
      collectionName: specification.collectionName,
      indexName: specification.legacyIndexName,
    });
  }

  return {
    targetPresent: Boolean(namedTarget),
    legacyPresent: Boolean(namedLegacy),
  };
}

function duplicatePipeline(field) {
  return [
    { $match: { [field]: { $type: "objectId" } } },
    {
      $group: {
        _id: `$${field}`,
        count: { $sum: 1 },
        documentIds: { $push: "$_id" },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $limit: 100 },
  ];
}

function malformedPipeline(field) {
  return [
    {
      $match: {
        [field]: { $exists: true, $ne: null },
        $expr: { $ne: [{ $type: `$${field}` }, "objectId"] },
      },
    },
    { $project: { _id: 1, detectedType: { $type: `$${field}` } } },
    { $limit: 100 },
  ];
}

async function auditSpecification(repository, specification) {
  const indexes = await repository.listIndexes(specification.collectionName);
  const catalog = inspectIndexCatalog(indexes, specification);
  const [duplicates, malformed] = await Promise.all([
    repository.aggregate(specification.collectionName, duplicatePipeline(specification.referenceField)),
    repository.aggregate(specification.collectionName, malformedPipeline(specification.referenceField)),
  ]);
  if (duplicates.length) {
    throw migrationError("duplicate_references_detected", {
      collectionName: specification.collectionName,
      field: specification.referenceField,
      groups: duplicates.map((item) => ({
        referenceId: String(item._id),
        count: Number(item.count),
        documentIds: (item.documentIds || []).map(String),
      })),
    });
  }
  if (malformed.length) {
    throw migrationError("malformed_references_detected", {
      collectionName: specification.collectionName,
      field: specification.referenceField,
      documents: malformed.map((item) => ({
        documentId: String(item._id),
        detectedType: String(item.detectedType),
      })),
    });
  }
  return { specification, ...catalog };
}

async function runMigration({ options, repository }) {
  const connected = verifyConnectedIdentity({
    options,
    databaseName: await repository.getDatabaseName(),
    topology: await repository.getTopology(),
  });

  const collections = new Set(await repository.listCollectionNames());
  for (const specification of REQUIRED_INDEXES) {
    if (!collections.has(specification.collectionName)) {
      throw migrationError("required_collection_missing", {
        collectionName: specification.collectionName,
      });
    }
  }

  const audits = [];
  for (const specification of REQUIRED_INDEXES) {
    audits.push(await auditSpecification(repository, specification));
  }

  const created = [];
  if (options.apply) {
    for (const audit of audits) {
      if (audit.targetPresent) continue;
      const specification = audit.specification;
      let createdName;
      try {
        createdName = await repository.createIndex(
          specification.collectionName,
          specification.key,
          {
            name: specification.name,
            unique: specification.unique,
            partialFilterExpression: specification.partialFilterExpression,
          }
        );
      } catch (error) {
        throw migrationError(
          "index_creation_failed",
          sanitizeMongoError(error, {
            operation: "create_index",
            stage: "apply",
            collectionName: specification.collectionName,
            indexName: specification.name,
          })
        );
      }
      if (createdName !== specification.name) {
        throw migrationError("created_index_name_unexpected", {
          collectionName: specification.collectionName,
        });
      }
      created.push(specification.name);
    }

    for (const specification of REQUIRED_INDEXES) {
      const indexes = await repository.listIndexes(specification.collectionName);
      const verified = indexes.find((index) => index.name === specification.name);
      if (!isExactRequiredIndex(verified, specification)) {
        throw migrationError("created_index_verification_failed", {
          collectionName: specification.collectionName,
          indexName: specification.name,
        });
      }
    }
  }

  return {
    mode: options.apply ? "apply" : "dry_run",
    target: {
      host: options.expectedHost,
      databaseName: connected.databaseName,
      replicaSet: connected.replicaSet,
      mongoVersion: connected.mongoVersion,
    },
    indexes: audits.map((audit) => ({
      collectionName: audit.specification.collectionName,
      indexName: audit.specification.name,
      targetPresent: audit.targetPresent || created.includes(audit.specification.name),
      legacyPresent: audit.legacyPresent,
      action: audit.targetPresent ? "verified" : options.apply ? "created" : "would_create",
    })),
    created,
    recordsModified: 0,
    indexesDropped: 0,
  };
}

module.exports = {
  APPROVED_TARGET,
  REQUIRED_INDEXES,
  duplicatePipeline,
  extractMongoDatabase,
  extractMongoHost,
  inspectIndexCatalog,
  isExactRequiredIndex,
  malformedPipeline,
  parseArguments,
  runMigration,
  sanitizeMongoError,
  verifyConfiguredIdentity,
  verifyConnectedIdentity,
};
