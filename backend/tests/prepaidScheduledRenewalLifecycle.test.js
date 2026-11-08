const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  reconcilePrepaidLifecycleForCustomer,
  reconcilePrepaidLifecycleInSession,
} = require("../services/prepaidMembershipLifecycleService");

const VENDOR_ID = "690000000000000000000001";
const CUSTOMER_ID = "690000000000000000000002";
const MEMBERSHIP_ID = "690000000000000000000003";
const WALLET_ID = "690000000000000000000004";
const NOW = new Date("2026-11-06T10:00:00.000Z");
const EXPIRY = new Date("2027-11-06T10:00:00.000Z");

function query(value) {
  const chain = {
    sort() { return chain; },
    limit() { return chain; },
    session() { return chain; },
    async lean() { return value; },
  };
  return chain;
}

function lifecycleModels({
  membershipType = "PREPAID_VALUE",
  dueMemberships,
  overlappingActive = null,
  walletOverrides = {},
  membershipModified = 1,
  walletModified = 1,
} = {}) {
  const membership = {
    _id: MEMBERSHIP_ID,
    vendorId: VENDOR_ID,
    customerId: CUSTOMER_ID,
    membershipType,
    status: "SCHEDULED",
    activatedAt: NOW,
    expiresAt: EXPIRY,
  };
  const wallet = {
    _id: WALLET_ID,
    customerMembershipId: MEMBERSHIP_ID,
    vendorId: VENDOR_ID,
    customerId: CUSTOMER_ID,
    walletType: membershipType,
    status: "SCHEDULED",
    activatesAt: NOW,
    expiresAt: EXPIRY,
    ...walletOverrides,
  };
  const calls = { membershipUpdates: [], walletUpdates: [] };

  return {
    membership,
    wallet,
    calls,
    CustomerMembershipModel: {
      exists: async () => true,
      updateMany: async (...args) => { calls.membershipUpdates.push(args); return { modifiedCount: 0 }; },
      find: () => query(dueMemberships === undefined ? [membership] : dueMemberships),
      findOne: () => query(overlappingActive),
      updateOne: async (...args) => {
        calls.membershipUpdates.push(args);
        return { modifiedCount: membershipModified };
      },
    },
    PrepaidMembershipWalletModel: {
      exists: async () => true,
      updateMany: async (...args) => { calls.walletUpdates.push(args); return { modifiedCount: 0 }; },
      findOne: () => query(wallet),
      updateOne: async (...args) => {
        calls.walletUpdates.push(args);
        return { modifiedCount: walletModified };
      },
    },
  };
}

test("scheduled value and session renewals activate at and after the boundary", async () => {
  for (const membershipType of ["PREPAID_VALUE", "PREPAID_SESSIONS"]) {
    for (const now of [NOW, new Date(NOW.getTime() + 1)]) {
      const models = lifecycleModels({ membershipType });
      const result = await reconcilePrepaidLifecycleInSession({
        vendorId: VENDOR_ID,
        customerId: CUSTOMER_ID,
        session: {},
        now,
        ...models,
      });

      assert.equal(result.promoted, true, membershipType);
      assert.equal(String(result.customerMembershipId), MEMBERSHIP_ID, membershipType);
      assert.equal(String(result.walletId), WALLET_ID, membershipType);
      assert.equal(models.calls.membershipUpdates.at(-1)[1].$set.status, "ACTIVE");
      assert.equal(models.calls.walletUpdates.at(-1)[1].$set.status, "ACTIVE");
    }
  }
});

test("before activation, a correct lifecycle performs no transaction or writes", async () => {
  let startCalls = 0;
  const result = await reconcilePrepaidLifecycleForCustomer({
    vendorId: VENDOR_ID,
    customerId: CUSTOMER_ID,
    now: new Date(NOW.getTime() - 1),
    CustomerMembershipModel: { exists: async () => null },
    PrepaidMembershipWalletModel: { exists: async () => null },
    startSession: async () => { startCalls += 1; throw new Error("must not start"); },
  });
  assert.deepEqual(result, { promoted: false });
  assert.equal(startCalls, 0);
});

test("expiry wins over scheduled, active, and depleted wallet states", async () => {
  const models = lifecycleModels({ dueMemberships: [] });
  await reconcilePrepaidLifecycleInSession({
    vendorId: VENDOR_ID,
    customerId: CUSTOMER_ID,
    session: {},
    now: new Date(EXPIRY.getTime() + 1),
    ...models,
  });

  const membershipExpiryFilter = models.calls.membershipUpdates[0][0];
  const walletExpiryFilter = models.calls.walletUpdates[0][0];
  assert.deepEqual(membershipExpiryFilter.status.$in, ["ACTIVE", "SCHEDULED"]);
  assert.deepEqual(walletExpiryFilter.status.$in, ["ACTIVE", "SCHEDULED", "DEPLETED"]);
  assert.equal(membershipExpiryFilter.status.$in.includes("CANCELLED"), false);
  assert.equal(walletExpiryFilter.status.$in.includes("CANCELLED"), false);
  assert.equal(models.calls.membershipUpdates.length, 1);
  assert.equal(models.calls.walletUpdates.length, 1);
});

test("multiple due renewals and inconsistent matching wallets fail closed", async () => {
  const first = lifecycleModels();
  const secondMembership = { ...first.membership, _id: "690000000000000000000005" };
  await assert.rejects(
    reconcilePrepaidLifecycleInSession({
      vendorId: VENDOR_ID,
      customerId: CUSTOMER_ID,
      session: {},
      now: NOW,
      ...lifecycleModels({ dueMemberships: [first.membership, secondMembership] }),
    }),
    (error) => error.code === "prepaid_lifecycle_ambiguous"
  );

  await assert.rejects(
    reconcilePrepaidLifecycleInSession({
      vendorId: VENDOR_ID,
      customerId: CUSTOMER_ID,
      session: {},
      now: NOW,
      ...lifecycleModels({ walletOverrides: { status: "CANCELLED" } }),
    }),
    (error) => error.code === "prepaid_lifecycle_inconsistent"
  );
});

test("wallet activation conflict rolls back the membership transition", async () => {
  const models = lifecycleModels({ walletModified: 0 });
  let aborted = 0;
  let ended = 0;
  const session = {
    active: false,
    startTransaction() { this.active = true; },
    async commitTransaction() { this.active = false; },
    async abortTransaction() { aborted += 1; this.active = false; },
    inTransaction() { return this.active; },
    async endSession() { ended += 1; },
  };

  await assert.rejects(
    reconcilePrepaidLifecycleForCustomer({
      vendorId: VENDOR_ID,
      customerId: CUSTOMER_ID,
      now: NOW,
      startSession: async () => session,
      ...models,
    }),
    (error) => error.code === "prepaid_lifecycle_conflict"
  );
  assert.equal(aborted, 1);
  assert.equal(ended, 1);
});

test("transient transaction conflicts retry within the bounded limit", async () => {
  const models = lifecycleModels({ dueMemberships: [] });
  let sessions = 0;
  const startSession = async () => {
    sessions += 1;
    const attempt = sessions;
    return {
      active: false,
      startTransaction() { this.active = true; },
      async commitTransaction() {
        if (attempt === 1) {
          const error = new Error("write conflict");
          error.code = 112;
          throw error;
        }
        this.active = false;
      },
      async abortTransaction() { this.active = false; },
      inTransaction() { return this.active; },
      async endSession() {},
    };
  };

  const result = await reconcilePrepaidLifecycleForCustomer({
    vendorId: VENDOR_ID,
    customerId: CUSTOMER_ID,
    now: NOW,
    startSession,
    ...models,
  });
  assert.deepEqual(result, { promoted: false });
  assert.equal(sessions, 2);
});

test("lifecycle promotion cannot create payments, wallets, or CREDIT ledger entries", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../services/prepaidMembershipLifecycleService.js"),
    "utf8"
  );
  assert.doesNotMatch(source, /PrepaidWalletLedger|\.create\(|payment\s*:/);
});

test("wallet preparation and verification both use lifecycle-aware lookup", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../controllers/vendorPrepaidWalletController.js"),
    "utf8"
  );
  const prepare = source.slice(source.indexOf("exports.prepareAuthorization"), source.indexOf("exports.verifyAuthorization"));
  const verify = source.slice(source.indexOf("exports.verifyAuthorization"));
  assert.match(prepare, /loadAvailableWallet/);
  assert.match(verify, /loadAvailableWallet/);
  assert.match(source, /await reconcileLifecycle\(\{ vendorId, customerId, now \}\)/);
});
