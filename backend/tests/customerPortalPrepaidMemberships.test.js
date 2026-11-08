const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const mongoose = require("mongoose");

const CustomerMembership = require("../models/CustomerMembership");
const PrepaidMembershipWallet = require("../models/PrepaidMembershipWallet");
const PrepaidWalletLedger = require("../models/PrepaidWalletLedger");
const Vendor = require("../models/DummyVendor");
const controller = require("../controllers/customerPortalMembershipsController");

function oid(value) {
  return new mongoose.Types.ObjectId(value);
}

function mockReq({ auth = {}, params = {}, query = {} } = {}) {
  return { auth, params, query };
}

function mockRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

function membership(overrides = {}) {
  return {
    _id: oid("692900000000000000000031"),
    vendorId: oid("692900000000000000000011"),
    customerId: oid("692900000000000000000001"),
    membershipPlanId: oid("692900000000000000000041"),
    membershipType: "PREPAID_VALUE",
    status: "ACTIVE",
    planSnapshot: { name: "Value Plus", description: "Prepaid value plan" },
    prepaidValueSnapshot: {
      paidAmountPaise: 100000,
      creditedAmountPaise: 120000,
      bonusAmountPaise: 20000,
    },
    activatedAt: new Date("2030-01-01T00:00:00.000Z"),
    expiresAt: new Date("2031-01-01T00:00:00.000Z"),
    createdAt: new Date("2030-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function wallet(membershipRow, overrides = {}) {
  return {
    _id: oid("692900000000000000000051"),
    vendorId: membershipRow.vendorId,
    customerId: membershipRow.customerId,
    customerMembershipId: membershipRow._id,
    walletType: membershipRow.membershipType,
    creditedAmountPaise: 120000,
    consumedAmountPaise: 25000,
    remainingAmountPaise: 95000,
    activatesAt: membershipRow.activatedAt,
    expiresAt: membershipRow.expiresAt,
    status: "ACTIVE",
    ...overrides,
  };
}

async function withMocks(fn) {
  const originals = {
    membershipFind: CustomerMembership.find,
    membershipFindOne: CustomerMembership.findOne,
    walletFind: PrepaidMembershipWallet.find,
    walletFindOne: PrepaidMembershipWallet.findOne,
    ledgerFind: PrepaidWalletLedger.find,
    vendorFind: Vendor.find,
    flag: process.env.PREPAID_MEMBERSHIP_WALLETS_ENABLED,
  };
  try {
    await fn();
  } finally {
    CustomerMembership.find = originals.membershipFind;
    CustomerMembership.findOne = originals.membershipFindOne;
    PrepaidMembershipWallet.find = originals.walletFind;
    PrepaidMembershipWallet.findOne = originals.walletFindOne;
    PrepaidWalletLedger.find = originals.ledgerFind;
    Vendor.find = originals.vendorFind;
    if (originals.flag === undefined) delete process.env.PREPAID_MEMBERSHIP_WALLETS_ENABLED;
    else process.env.PREPAID_MEMBERSHIP_WALLETS_ENABLED = originals.flag;
  }
}

function findQuery(rows, capture) {
  return (query) => {
    if (capture) capture(query);
    return {
      select() { return this; },
      sort() { return this; },
      lean: async () => rows,
    };
  };
}

function findOneQuery(row, capture) {
  return (query) => {
    if (capture) capture(query);
    return { lean: async () => row };
  };
}

function ledgerQuery(rows, state = {}) {
  return (query) => {
    state.query = query;
    return {
      sort(sort) {
        state.sort = sort;
        return this;
      },
      limit(limit) {
        state.limit = limit;
        return this;
      },
      lean: async () => rows,
    };
  };
}

test("prepaid visibility is feature gated without changing Discount membership behavior", async () => {
  await withMocks(async () => {
    delete process.env.PREPAID_MEMBERSHIP_WALLETS_ENABLED;
    let capturedQuery;
    CustomerMembership.find = findQuery([], (query) => { capturedQuery = query; });
    Vendor.find = findQuery([]);

    const res = mockRes();
    await controller.getMemberships(mockReq({ auth: { customerId: "692900000000000000000001" } }), res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(capturedQuery, {
      customerId: "692900000000000000000001",
      membershipType: "DISCOUNT",
      status: { $in: ["ACTIVE", "SCHEDULED", "EXPIRED"] },
    });
    assert.deepEqual(res.payload.data.memberships, []);
  });
});

test("authenticated customer receives exact prepaid value paise and session quantities", async () => {
  await withMocks(async () => {
    process.env.PREPAID_MEMBERSHIP_WALLETS_ENABLED = "true";
    const valueMembership = membership();
    const sessionMembership = membership({
      _id: oid("692900000000000000000032"),
      membershipType: "PREPAID_SESSIONS",
      planSnapshot: { name: "Keratin Six" },
      prepaidValueSnapshot: undefined,
      prepaidSessionsSnapshot: {
        itemName: "Keratin Treatment",
        eligibleItemKind: "SERVICE",
        categoryPath: ["Hair", "Treatments"],
        packageIncludes: "",
        paidQuantity: 5,
        creditedQuantity: 6,
      },
    });
    const discountMembership = membership({
      _id: oid("692900000000000000000033"),
      membershipType: "DISCOUNT",
      planSnapshot: {
        name: "Gold Discount",
        discountPercentage: 10,
        eligibleMenuItemIds: [],
      },
      prepaidValueSnapshot: undefined,
    });
    const valueWallet = wallet(valueMembership);
    const sessionWallet = wallet(sessionMembership, {
      _id: oid("692900000000000000000052"),
      walletType: "PREPAID_SESSIONS",
      creditedAmountPaise: undefined,
      consumedAmountPaise: undefined,
      remainingAmountPaise: undefined,
      creditedQuantity: 6,
      consumedQuantity: 2,
      remainingQuantity: 4,
    });

    CustomerMembership.find = findQuery([
      discountMembership,
      valueMembership,
      sessionMembership,
    ]);
    PrepaidMembershipWallet.find = findQuery([valueWallet, sessionWallet]);
    Vendor.find = findQuery([{
      _id: valueMembership.vendorId,
      businessName: "Test Salon",
      subdomain: "test-salon",
      logoUrl: "logo.png",
    }]);

    const res = mockRes();
    await controller.getMemberships(mockReq({ auth: { customerId: String(valueMembership.customerId) } }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.data.memberships.length, 3);
    assert.ok(res.payload.data.memberships.some((row) => row.membershipType === "DISCOUNT"));
    const value = res.payload.data.memberships.find((row) => row.membershipType === "PREPAID_VALUE");
    assert.deepEqual(value.prepaidWallet, {
      walletType: "PREPAID_VALUE",
      status: "SCHEDULED",
      activatesAt: valueMembership.activatedAt,
      expiresAt: valueMembership.expiresAt,
      paidAmountPaise: 100000,
      creditedAmountPaise: 120000,
      bonusAmountPaise: 20000,
      consumedAmountPaise: 25000,
      remainingAmountPaise: 95000,
    });
    const sessions = res.payload.data.memberships.find((row) => row.membershipType === "PREPAID_SESSIONS");
    assert.equal(sessions.prepaidWallet.purchasedQuantity, 5);
    assert.equal(sessions.prepaidWallet.creditedQuantity, 6);
    assert.equal(sessions.prepaidWallet.consumedQuantity, 2);
    assert.equal(sessions.prepaidWallet.remainingQuantity, 4);
    assert.deepEqual(sessions.prepaidWallet.eligibleItem, {
      name: "Keratin Treatment",
      itemType: "SERVICE",
      categoryPath: ["Hair", "Treatments"],
      packageIncludes: "",
    });
    assert.equal(res.payload.data.vendors[0].memberships.length, 3);
  });
});

test("wallet status precedence covers cancelled, expired, scheduled, depleted, and active", () => {
  const now = new Date("2030-06-01T00:00:00.000Z");
  const row = membership({
    activatedAt: new Date("2030-01-01T00:00:00.000Z"),
    expiresAt: new Date("2031-01-01T00:00:00.000Z"),
  });
  const activeWallet = wallet(row, { activatesAt: row.activatedAt, expiresAt: row.expiresAt });

  assert.equal(controller.getEffectiveWalletStatus({ ...activeWallet, status: "CANCELLED" }, row, now), "CANCELLED");
  assert.equal(controller.getEffectiveWalletStatus({ ...activeWallet, expiresAt: new Date("2030-05-01") }, row, now), "EXPIRED");
  assert.equal(controller.getEffectiveWalletStatus({ ...activeWallet, activatesAt: new Date("2030-07-01") }, row, now), "SCHEDULED");
  assert.equal(controller.getEffectiveWalletStatus({ ...activeWallet, status: "SCHEDULED", activatesAt: new Date("2030-05-01") }, row, now), "ACTIVE");
  assert.equal(controller.getEffectiveWalletStatus({ ...activeWallet, status: "DEPLETED", expiresAt: new Date("2030-05-01") }, row, now), "EXPIRED");
  assert.equal(controller.getEffectiveWalletStatus({ ...activeWallet, status: "CANCELLED" }, row, now), "CANCELLED");
  assert.equal(controller.getEffectiveWalletStatus({ ...activeWallet, remainingAmountPaise: 0 }, row, now), "DEPLETED");
  assert.equal(controller.getEffectiveWalletStatus(activeWallet, row, now), "ACTIVE");
});

test("renewed memberships keep independent wallets and missing wallets are not fabricated", async () => {
  await withMocks(async () => {
    process.env.PREPAID_MEMBERSHIP_WALLETS_ENABLED = "true";
    const original = membership();
    const renewal = membership({
      _id: oid("692900000000000000000032"),
      renewedFromMembershipId: original._id,
      activatedAt: new Date("2031-01-01T00:00:00.000Z"),
      expiresAt: new Date("2032-01-01T00:00:00.000Z"),
    });
    CustomerMembership.find = findQuery([original, renewal]);
    PrepaidMembershipWallet.find = findQuery([wallet(original)]);
    Vendor.find = findQuery([{ _id: original.vendorId, businessName: "Test Salon" }]);

    const res = mockRes();
    await controller.getMemberships(mockReq({ auth: { customerId: String(original.customerId) } }), res);

    const originalResult = res.payload.data.memberships.find((row) => row.id === String(original._id));
    const renewalResult = res.payload.data.memberships.find((row) => row.id === String(renewal._id));
    assert.equal(originalResult.prepaidWallet.remainingAmountPaise, 95000);
    assert.equal(renewalResult.prepaidWallet, null);
    assert.equal(renewalResult.renewedFromMembershipId, String(original._id));
  });
});

test("inconsistent cross-vendor or unreconciled wallet records are not exposed", () => {
  const row = membership();
  const validWallet = wallet(row);
  assert.equal(controller.isConsistentPrepaidWallet(validWallet, row), true);
  assert.equal(
    controller.serializePrepaidWallet(
      { ...validWallet, vendorId: oid("692900000000000000000099") },
      row
    ),
    null
  );
  assert.equal(
    controller.serializePrepaidWallet(
      { ...validWallet, remainingAmountPaise: 94000 },
      row
    ),
    null
  );
});

test("activity requires authentication and the prepaid visibility feature", async () => {
  await withMocks(async () => {
    process.env.PREPAID_MEMBERSHIP_WALLETS_ENABLED = "true";
    const unauthenticated = mockRes();
    await controller.getMembershipActivity(mockReq({ params: { membershipId: "692900000000000000000031" } }), unauthenticated);
    assert.equal(unauthenticated.statusCode, 401);

    process.env.PREPAID_MEMBERSHIP_WALLETS_ENABLED = "false";
    const disabled = mockRes();
    await controller.getMembershipActivity(mockReq({
      auth: { customerId: "692900000000000000000001" },
      params: { membershipId: "692900000000000000000031" },
    }), disabled);
    assert.equal(disabled.statusCode, 403);
    assert.equal(disabled.payload.code, "prepaid_membership_wallets_disabled");
  });
});

test("activity lookup denies cross-customer access without exposing membership existence", async () => {
  await withMocks(async () => {
    process.env.PREPAID_MEMBERSHIP_WALLETS_ENABLED = "true";
    let membershipQuery;
    CustomerMembership.findOne = findOneQuery(null, (query) => { membershipQuery = query; });

    const res = mockRes();
    await controller.getMembershipActivity(mockReq({
      auth: { customerId: "692900000000000000000099" },
      params: { membershipId: "692900000000000000000031" },
    }), res);

    assert.equal(res.statusCode, 404);
    assert.equal(res.payload.message, "Membership activity not found");
    assert.equal(membershipQuery.customerId, "692900000000000000000099");
    assert.deepEqual(membershipQuery.membershipType, { $in: ["PREPAID_VALUE", "PREPAID_SESSIONS"] });
  });
});

test("activity is stably paginated and exposes only sanitized recorded events", async () => {
  await withMocks(async () => {
    process.env.PREPAID_MEMBERSHIP_WALLETS_ENABLED = "true";
    const row = membership();
    const walletRow = wallet(row);
    const entries = [
      {
        _id: oid("692900000000000000000061"),
        eventType: "CANCELLATION_REVERSAL",
        walletType: "PREPAID_VALUE",
        amountPaise: 10000,
        occurredAt: new Date("2030-04-03T10:00:00.000Z"),
        sourceLedgerId: oid("692900000000000000000099"),
        audit: { secret: "not-for-customers" },
      },
      {
        _id: oid("692900000000000000000060"),
        eventType: "REDEMPTION",
        walletType: "PREPAID_VALUE",
        amountPaise: 10000,
        occurredAt: new Date("2030-04-02T10:00:00.000Z"),
        billingSessionId: oid("692900000000000000000098"),
      },
      {
        _id: oid("692900000000000000000059"),
        eventType: "CREDIT",
        walletType: "PREPAID_VALUE",
        amountPaise: 120000,
        occurredAt: new Date("2030-04-01T10:00:00.000Z"),
      },
    ];
    const state = {};
    CustomerMembership.findOne = findOneQuery(row);
    PrepaidMembershipWallet.findOne = findOneQuery(walletRow);
    PrepaidWalletLedger.find = ledgerQuery(entries, state);

    const res = mockRes();
    await controller.getMembershipActivity(mockReq({
      auth: { customerId: String(row.customerId) },
      params: { membershipId: String(row._id) },
      query: { limit: "2" },
    }), res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(state.sort, { occurredAt: -1, _id: -1 });
    assert.equal(state.limit, 3);
    assert.equal(res.payload.data.items.length, 2);
    assert.equal(res.payload.data.items[0].eventType, "CANCELLATION_REVERSAL");
    assert.equal(res.payload.data.items.some((entry) => entry.eventType === "EXPIRY"), false);
    assert.equal(res.payload.data.hasMore, true);
    assert.ok(res.payload.data.nextCursor);
    assert.equal("audit" in res.payload.data.items[0], false);
    assert.equal("sourceLedgerId" in res.payload.data.items[0], false);
    assert.equal("billingSessionId" in res.payload.data.items[1], false);

    const cursor = controller.decodeActivityCursor(res.payload.data.nextCursor);
    assert.equal(cursor.error, undefined);
    assert.equal(cursor.occurredAt.toISOString(), entries[1].occurredAt.toISOString());
  });
});

test("invalid pagination and inconsistent wallet records fail safely", async () => {
  await withMocks(async () => {
    process.env.PREPAID_MEMBERSHIP_WALLETS_ENABLED = "true";
    const row = membership();
    CustomerMembership.findOne = findOneQuery(row);
    PrepaidMembershipWallet.findOne = findOneQuery(null);

    const invalid = mockRes();
    await controller.getMembershipActivity(mockReq({
      auth: { customerId: String(row.customerId) },
      params: { membershipId: String(row._id) },
      query: { limit: "51" },
    }), invalid);
    assert.equal(invalid.statusCode, 400);

    const missingWallet = mockRes();
    await controller.getMembershipActivity(mockReq({
      auth: { customerId: String(row.customerId) },
      params: { membershipId: String(row._id) },
    }), missingWallet);
    assert.equal(missingWallet.statusCode, 404);
    assert.equal(missingWallet.payload.message, "Membership activity not found");

    PrepaidMembershipWallet.findOne = findOneQuery({
      ...wallet(row),
      remainingAmountPaise: 94000,
    });
    const inconsistentWallet = mockRes();
    await controller.getMembershipActivity(mockReq({
      auth: { customerId: String(row.customerId) },
      params: { membershipId: String(row._id) },
    }), inconsistentWallet);
    assert.equal(inconsistentWallet.statusCode, 404);
    assert.equal(inconsistentWallet.payload.message, "Membership activity not found");
  });
});

test("customer portal activity route is read-only and protected by customer authentication", () => {
  const routeSource = fs.readFileSync(
    path.join(__dirname, "../routes/customerPortalRoutes.js"),
    "utf8"
  );
  assert.match(
    routeSource,
    /router\.get\([\s\S]*"\/memberships\/:membershipId\/activity"[\s\S]*requireCustomerPortalSession/
  );
  assert.doesNotMatch(routeSource, /router\.(post|patch|delete)\("\/memberships\/:membershipId\/activity"/);
});
