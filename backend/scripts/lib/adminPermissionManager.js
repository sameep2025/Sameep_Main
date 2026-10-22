const crypto = require("crypto");

const ALLOWED_ENVIRONMENTS = new Set(["test", "preprod", "production"]);
const ALLOWED_OPERATIONS = new Set(["grant", "revoke"]);
const ALLOWED_PERMISSIONS = new Set(["whatsapp_registration_recovery"]);

function safeError(code) {
  const error = new Error(code);
  error.safeCode = code;
  return error;
}

function normalizeEnvironment(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "pre-production" || normalized === "pre_production"
    ? "preprod"
    : normalized;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function extractMongoHost(uri) {
  const value = String(uri || "").trim();
  const match = value.match(/^mongodb(?:\+srv)?:\/\/([^/]+)(?:\/|$)/i);
  if (!match) throw safeError("mongodb_uri_invalid");
  const authority = match[1].includes("@") ? match[1].split("@").pop() : match[1];
  const hosts = authority
    .split(",")
    .map((host) => host.trim().toLowerCase().replace(/:\d+$/, ""))
    .filter(Boolean)
    .sort();
  if (!hosts.length) throw safeError("mongodb_host_missing");
  return hosts.join(",");
}

function fingerprintMongoHost(uri) {
  return crypto.createHash("sha256").update(extractMongoHost(uri)).digest("hex").slice(0, 16);
}

function parseArguments(argv) {
  const values = {};
  const flags = new Set();
  for (const argument of argv) {
    if (argument === "--apply") {
      flags.add("apply");
      continue;
    }
    const match = argument.match(/^--([a-z-]+)=(.*)$/);
    if (!match || Object.prototype.hasOwnProperty.call(values, match[1])) {
      throw safeError("arguments_malformed");
    }
    values[match[1]] = match[2].trim();
  }

  const allowed = new Set([
    "environment",
    "operation",
    "admin-id",
    "email",
    "permission",
    "expected-db",
    "expected-host-fingerprint",
    "confirm-production",
  ]);
  if (Object.keys(values).some((key) => !allowed.has(key))) {
    throw safeError("argument_not_allowed");
  }

  const options = {
    environment: normalizeEnvironment(values.environment),
    operation: String(values.operation || "").trim().toLowerCase(),
    adminId: String(values["admin-id"] || "").trim(),
    email: normalizeEmail(values.email),
    permission: String(values.permission || "").trim(),
    expectedDb: String(values["expected-db"] || "").trim(),
    expectedHostFingerprint: String(values["expected-host-fingerprint"] || "")
      .trim()
      .toLowerCase(),
    productionConfirmation: String(values["confirm-production"] || "").trim(),
    apply: flags.has("apply"),
  };

  if (!ALLOWED_ENVIRONMENTS.has(options.environment)) throw safeError("environment_invalid");
  if (!ALLOWED_OPERATIONS.has(options.operation)) throw safeError("operation_invalid");
  if (!/^[a-f\d]{24}$/i.test(options.adminId)) throw safeError("admin_id_invalid");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(options.email)) throw safeError("email_invalid");
  if (!ALLOWED_PERMISSIONS.has(options.permission)) throw safeError("permission_not_allowed");
  if (!options.expectedDb) throw safeError("expected_database_required");
  if (!/^[a-f\d]{16}$/.test(options.expectedHostFingerprint)) {
    throw safeError("expected_host_fingerprint_invalid");
  }
  return options;
}

function verifyEnvironmentIdentity(options, env) {
  const runtimeEnvironment = normalizeEnvironment(env.YNOT_DEPLOYMENT_ENVIRONMENT);
  const configuredDb = String(env.MONGODB_DBNAME || "").trim();
  const identityDb = String(env.YNOT_MONGODB_DATABASE_IDENTITY || "").trim();
  const configuredFingerprint = fingerprintMongoHost(env.MONGODB_URI);
  const identityFingerprint = String(env.YNOT_MONGODB_HOST_FINGERPRINT || "")
    .trim()
    .toLowerCase();

  if (!runtimeEnvironment || runtimeEnvironment !== options.environment) {
    throw safeError("deployment_environment_mismatch");
  }
  if (!configuredDb || configuredDb !== identityDb || configuredDb !== options.expectedDb) {
    throw safeError("database_identity_mismatch");
  }
  if (
    !identityFingerprint ||
    configuredFingerprint !== identityFingerprint ||
    configuredFingerprint !== options.expectedHostFingerprint
  ) {
    throw safeError("cluster_identity_mismatch");
  }

  if (options.environment === "production") {
    const required = `CONFIRM-PRODUCTION:${configuredDb}:${configuredFingerprint}`;
    if (options.productionConfirmation !== required) {
      throw safeError("production_confirmation_required");
    }
  }

  return {
    environment: runtimeEnvironment,
    databaseName: configuredDb,
    hostFingerprint: configuredFingerprint,
  };
}

function normalizePermissions(value) {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))]
    : [];
}

async function manageAdminPermission(options, repository) {
  const query = { _id: options.adminId, email: options.email };
  const admin = await repository.findExact(query);
  if (!admin) {
    const identity = await repository.inspectIdentity({
      adminId: options.adminId,
      email: options.email,
    });
    const code = identity.idExists || identity.emailExists
      ? "admin_identity_mismatch"
      : "admin_not_found";
    return { result: "BLOCKED", code, applied: false };
  }

  const before = normalizePermissions(admin.permissions);
  const after = options.operation === "grant"
    ? normalizePermissions([...before, options.permission])
    : before.filter((permission) => permission !== options.permission);

  if (!options.apply) {
    return {
      result: "DRY_RUN",
      code: "permission_change_previewed",
      applied: false,
      admin: { id: String(admin._id), email: normalizeEmail(admin.email) },
      operation: options.operation,
      permission: options.permission,
      before,
      after,
    };
  }

  const update = options.operation === "grant"
    ? { $addToSet: { permissions: options.permission } }
    : { $pull: { permissions: options.permission } };
  const writeResult = await repository.updateExact(query, update);
  if (Number(writeResult?.matchedCount) !== 1) {
    throw safeError("admin_update_match_count_invalid");
  }

  const verified = await repository.findExact(query);
  if (!verified) throw safeError("admin_readback_failed");
  const permissions = normalizePermissions(verified.permissions);
  const expectedPresent = options.operation === "grant";
  if (permissions.includes(options.permission) !== expectedPresent) {
    throw safeError("permission_readback_mismatch");
  }

  return {
    result: "PASS",
    code: options.operation === "grant" ? "permission_granted" : "permission_revoked",
    applied: true,
    matchedCount: Number(writeResult.matchedCount),
    modifiedCount: Number(writeResult.modifiedCount || 0),
    admin: {
      id: String(verified._id),
      email: normalizeEmail(verified.email),
      permissions,
    },
  };
}

module.exports = {
  ALLOWED_PERMISSIONS,
  fingerprintMongoHost,
  manageAdminPermission,
  normalizePermissions,
  parseArguments,
  verifyEnvironmentIdentity,
};
