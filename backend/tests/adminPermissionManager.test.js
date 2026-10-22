const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const AdminUser = require("../models/AdminUser");
const {
  fingerprintMongoHost,
  manageAdminPermission,
  parseArguments,
  verifyEnvironmentIdentity,
} = require("../scripts/lib/adminPermissionManager");

const ADMIN_ID = "507f1f77bcf86cd799439011";
const EMAIL = "admin@ynot.business";
const PERMISSION = "whatsapp_registration_recovery";
const URI = "mongodb+srv://user:password@test-cluster.example.mongodb.net/categoryApp";
const FINGERPRINT = fingerprintMongoHost(URI);

function options(overrides = {}) {
  return {
    environment: "test",
    operation: "grant",
    adminId: ADMIN_ID,
    email: EMAIL,
    permission: PERMISSION,
    expectedDb: "categoryApp",
    expectedHostFingerprint: FINGERPRINT,
    productionConfirmation: "",
    apply: false,
    ...overrides,
  };
}

function environment(overrides = {}) {
  return {
    MONGODB_URI: URI,
    MONGODB_DBNAME: "categoryApp",
    YNOT_DEPLOYMENT_ENVIRONMENT: "test",
    YNOT_MONGODB_DATABASE_IDENTITY: "categoryApp",
    YNOT_MONGODB_HOST_FINGERPRINT: FINGERPRINT,
    ...overrides,
  };
}

function repository(initial) {
  let document = initial ? { ...initial, permissions: [...(initial.permissions || [])] } : null;
  let writes = 0;
  return {
    async findExact(query) {
      return document && String(document._id) === query._id && document.email === query.email
        ? { ...document, permissions: [...document.permissions] }
        : null;
    },
    async inspectIdentity({ adminId, email }) {
      return {
        idExists: Boolean(document && String(document._id) === adminId),
        emailExists: Boolean(document && document.email === email),
      };
    },
    async updateExact(query, update) {
      if (!document || String(document._id) !== query._id || document.email !== query.email) {
        return { matchedCount: 0, modifiedCount: 0 };
      }
      writes += 1;
      const before = JSON.stringify(document.permissions);
      if (update.$addToSet) {
        const value = update.$addToSet.permissions;
        if (!document.permissions.includes(value)) document.permissions.push(value);
      }
      if (update.$pull) {
        document.permissions = document.permissions.filter(
          (value) => value !== update.$pull.permissions
        );
      }
      return {
        matchedCount: 1,
        modifiedCount: before === JSON.stringify(document.permissions) ? 0 : 1,
      };
    },
    get writes() { return writes; },
    get document() { return document; },
  };
}

test("existing admin password verification and JWT identity remain compatible", async () => {
  const passwordHash = await bcrypt.hash("existing-password", 4);
  const admin = new AdminUser({
    _id: ADMIN_ID,
    email: EMAIL,
    passwordHash,
    permissions: [PERMISSION],
  });
  assert.equal(await bcrypt.compare("existing-password", admin.passwordHash), true);
  const token = jwt.sign(
    { adminId: admin._id.toString(), email: admin.email },
    "test-secret"
  );
  assert.deepEqual(jwt.verify(token, "test-secret"), {
    adminId: ADMIN_ID,
    email: EMAIL,
    iat: jwt.decode(token).iat,
  });
});

test("dry-run previews grant without database writes", async () => {
  const repo = repository({ _id: ADMIN_ID, email: EMAIL, permissions: ["existing"] });
  const result = await manageAdminPermission(options(), repo);
  assert.equal(result.result, "DRY_RUN");
  assert.equal(repo.writes, 0);
  assert.deepEqual(result.before, ["existing"]);
  assert.deepEqual(result.after, ["existing", PERMISSION]);
});

test("grant preserves existing permissions and repeated grant creates no duplicate", async () => {
  const repo = repository({ _id: ADMIN_ID, email: EMAIL, permissions: ["existing"] });
  const first = await manageAdminPermission(options({ apply: true }), repo);
  const second = await manageAdminPermission(options({ apply: true }), repo);
  assert.equal(first.code, "permission_granted");
  assert.equal(second.modifiedCount, 0);
  assert.deepEqual(repo.document.permissions, ["existing", PERMISSION]);
});

test("revoke removes only the requested allowed permission", async () => {
  const repo = repository({
    _id: ADMIN_ID,
    email: EMAIL,
    permissions: ["existing", PERMISSION],
  });
  const result = await manageAdminPermission(
    options({ operation: "revoke", apply: true }),
    repo
  );
  assert.equal(result.code, "permission_revoked");
  assert.deepEqual(repo.document.permissions, ["existing"]);
});

test("missing admin and ID/email mismatch are distinguished", async () => {
  const missing = await manageAdminPermission(options(), repository(null));
  assert.equal(missing.code, "admin_not_found");

  const mismatch = await manageAdminPermission(
    options(),
    repository({ _id: ADMIN_ID, email: "another@example.com", permissions: [] })
  );
  assert.equal(mismatch.code, "admin_identity_mismatch");
});

test("apply refuses a write result that does not match exactly one admin", async () => {
  const repo = repository({ _id: ADMIN_ID, email: EMAIL, permissions: [] });
  repo.updateExact = async () => ({ matchedCount: 0, modifiedCount: 0 });
  await assert.rejects(
    manageAdminPermission(options({ apply: true }), repo),
    (error) => error.safeCode === "admin_update_match_count_invalid"
  );
});

test("environment verification requires environment, database and host identity", () => {
  assert.equal(verifyEnvironmentIdentity(options(), environment()).environment, "test");
  assert.throws(
    () => verifyEnvironmentIdentity(options(), environment({ YNOT_DEPLOYMENT_ENVIRONMENT: "preprod" })),
    (error) => error.safeCode === "deployment_environment_mismatch"
  );
  assert.throws(
    () => verifyEnvironmentIdentity(options(), environment({ YNOT_MONGODB_DATABASE_IDENTITY: "other" })),
    (error) => error.safeCode === "database_identity_mismatch"
  );
  assert.throws(
    () => verifyEnvironmentIdentity(options(), environment({ YNOT_MONGODB_HOST_FINGERPRINT: "0000000000000000" })),
    (error) => error.safeCode === "cluster_identity_mismatch"
  );
});

test("production requires exact environment and database identity confirmation", () => {
  const productionOptions = options({
    environment: "production",
    productionConfirmation: "",
  });
  const productionEnv = environment({ YNOT_DEPLOYMENT_ENVIRONMENT: "production" });
  assert.throws(
    () => verifyEnvironmentIdentity(productionOptions, productionEnv),
    (error) => error.safeCode === "production_confirmation_required"
  );
  const confirmed = verifyEnvironmentIdentity(
    {
      ...productionOptions,
      productionConfirmation: `CONFIRM-PRODUCTION:categoryApp:${FINGERPRINT}`,
    },
    productionEnv
  );
  assert.equal(confirmed.environment, "production");
});

test("malformed and unauthorized arguments are rejected", () => {
  const base = [
    "--environment=test",
    "--operation=grant",
    `--admin-id=${ADMIN_ID}`,
    `--email=${EMAIL}`,
    `--permission=${PERMISSION}`,
    "--expected-db=categoryApp",
    `--expected-host-fingerprint=${FINGERPRINT}`,
  ];
  assert.equal(parseArguments(base).apply, false);
  assert.equal(parseArguments([...base, "--apply"]).apply, true);
  assert.throws(
    () => parseArguments(base.map((value) => value.startsWith("--permission=") ? "--permission=unrelated" : value)),
    (error) => error.safeCode === "permission_not_allowed"
  );
  assert.throws(
    () => parseArguments([...base, "--unknown=value"]),
    (error) => error.safeCode === "argument_not_allowed"
  );
});

test("CLI is standalone and never imported by application startup", () => {
  const serverSource = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  const cliSource = fs.readFileSync(
    path.join(__dirname, "../scripts/manageAdminPermission.js"),
    "utf8"
  );
  const librarySource = fs.readFileSync(
    path.join(__dirname, "../scripts/lib/adminPermissionManager.js"),
    "utf8"
  );
  assert.doesNotMatch(serverSource, /manageAdminPermission/);
  assert.match(cliSource, /createRepository/);
  assert.match(librarySource, /\$addToSet/);
  assert.match(librarySource, /\$pull/);
  assert.doesNotMatch(cliSource, /new AdminUser|AdminUser\.create/);
});
