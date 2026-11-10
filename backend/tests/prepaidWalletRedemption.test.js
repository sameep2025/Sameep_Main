const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const mongoose = require("mongoose");

const BillingSession = require("../models/BillingSession");
const CustomerMembership = require("../models/CustomerMembership");
const Transaction = require("../models/Transaction");
const PrepaidMembershipWallet = require("../models/PrepaidMembershipWallet");
const PrepaidRedemptionAuthorization = require("../models/PrepaidRedemptionAuthorization");
const PrepaidWalletLedger = require("../models/PrepaidWalletLedger");
const {
  assertNoPrepaidDiscountsOrRewards,
  assertPrepaidRequestContract,
  consumePrepaidAuthorization,
  persistInitialPrepaidSettlementSnapshot,
  reversePrepaidSettlement,
} = require("../services/prepaidWalletSettlementService");
const { createCartFingerprint } = require("../services/prepaidRedemptionAuthorizationService");

const ids = {
  vendor: "690000000000000000000001",
  customer: "690000000000000000000002",
  membership: "690000000000000000000003",
  wallet: "690000000000000000000004",
  bill: "690000000000000000000005",
  item: "690000000000000000000006",
  authorization: "690000000000000000000007",
  redemption: "690000000000000000000008",
  reversal: "690000000000000000000009",
};

function oid(value) { return new mongoose.Types.ObjectId(value); }

function cart(overrides = {}) {
  return [{
    itemId: oid(ids.item),
    itemSource: "vendor_menu_node",
    itemType: "SERVICE",
    name: "Keratin Treatment",
    qty: 1,
    price: 1000,
    total: 1000,
    resourceId: oid("690000000000000000000010"),
    resourceName: "Stylist One",
    ...overrides,
  }];
}

function billing(items = cart()) {
  return {
    _id: oid(ids.bill),
    vendorId: oid(ids.vendor),
    customerId: oid(ids.customer),
    cartItems: items,
  };
}

function query(value) {
  return { session: async () => value };
}

async function withSettlementModels(options, run) {
  const originals = {
    authorizationFindOne: PrepaidRedemptionAuthorization.findOne,
    authorizationUpdate: PrepaidRedemptionAuthorization.findOneAndUpdate,
    walletUpdate: PrepaidMembershipWallet.findOneAndUpdate,
    walletStatusUpdate: PrepaidMembershipWallet.updateOne,
    membershipStatusUpdate: CustomerMembership.updateOne,
    ledgerCreate: PrepaidWalletLedger.create,
    ledgerFindOne: PrepaidWalletLedger.findOne,
  };
  const calls = {
    authorizationUpdates: [],
    walletUpdates: [],
    statusUpdates: [],
    membershipStatusUpdates: [],
    ledgerCreates: [],
  };
  PrepaidRedemptionAuthorization.findOne = () => query(options.authorization);
  PrepaidRedemptionAuthorization.findOneAndUpdate = async (filter, update, config) => {
    calls.authorizationUpdates.push({ filter, update, config });
    return options.consumeResult === undefined ? { ...options.authorization, status: "CONSUMED" } : options.consumeResult;
  };
  PrepaidMembershipWallet.findOneAndUpdate = async (filter, update, config) => {
    calls.walletUpdates.push({ filter, update, config });
    return options.walletResult === undefined ? options.wallet : options.walletResult;
  };
  PrepaidMembershipWallet.updateOne = async (filter, update, config) => {
    calls.statusUpdates.push({ filter, update, config });
    return { modifiedCount: 1 };
  };
  CustomerMembership.updateOne = async (filter, update, config) => {
    calls.membershipStatusUpdates.push({ filter, update, config });
    return { modifiedCount: 1 };
  };
  PrepaidWalletLedger.create = async (documents, config) => {
    calls.ledgerCreates.push({ documents, config });
    if (options.ledgerError) throw options.ledgerError;
    const eventType = documents[0].eventType;
    return [{ _id: oid(eventType === "REDEMPTION" ? ids.redemption : ids.reversal), ...documents[0] }];
  };
  PrepaidWalletLedger.findOne = () => query(options.sourceLedger || null);

  const previousMembershipFlag = process.env.PREPAID_MEMBERSHIP_WALLETS_ENABLED;
  const previousRedemptionFlag = process.env.PREPAID_WALLET_REDEMPTION_ENABLED;
  process.env.PREPAID_MEMBERSHIP_WALLETS_ENABLED = options.featureDisabled ? "false" : "true";
  process.env.PREPAID_WALLET_REDEMPTION_ENABLED = options.featureDisabled ? "false" : "true";
  try {
    await run(calls);
  } finally {
    PrepaidRedemptionAuthorization.findOne = originals.authorizationFindOne;
    PrepaidRedemptionAuthorization.findOneAndUpdate = originals.authorizationUpdate;
    PrepaidMembershipWallet.findOneAndUpdate = originals.walletUpdate;
    PrepaidMembershipWallet.updateOne = originals.walletStatusUpdate;
    CustomerMembership.updateOne = originals.membershipStatusUpdate;
    PrepaidWalletLedger.create = originals.ledgerCreate;
    PrepaidWalletLedger.findOne = originals.ledgerFindOne;
    if (previousMembershipFlag === undefined) delete process.env.PREPAID_MEMBERSHIP_WALLETS_ENABLED;
    else process.env.PREPAID_MEMBERSHIP_WALLETS_ENABLED = previousMembershipFlag;
    if (previousRedemptionFlag === undefined) delete process.env.PREPAID_WALLET_REDEMPTION_ENABLED;
    else process.env.PREPAID_WALLET_REDEMPTION_ENABLED = previousRedemptionFlag;
  }
}

function authorization(mode, items = cart(), overrides = {}) {
  return {
    _id: oid(ids.authorization),
    vendorId: oid(ids.vendor),
    customerId: oid(ids.customer),
    walletId: oid(ids.wallet),
    billingSessionId: oid(ids.bill),
    authorizationType: mode,
    status: "VERIFIED",
    verifiedAt: new Date(),
    consumedAt: null,
    otpExpiresAt: new Date(Date.now() + 600000),
    cartFingerprint: createCartFingerprint({
      vendorId: ids.vendor,
      customerId: ids.customer,
      billingSessionId: ids.bill,
      cartItems: items,
    }),
    ...(mode === "PREPAID_VALUE"
      ? { exactAmountPaise: 100000 }
      : {
          exactQuantity: items.reduce((sum, item) => sum + item.qty, 0),
          eligibleItemId: oid(ids.item),
          eligibleItemSource: "vendor_menu_node",
        }),
    ...overrides,
  };
}

function wallet(mode, overrides = {}) {
  return {
    _id: oid(ids.wallet),
    vendorId: oid(ids.vendor),
    customerId: oid(ids.customer),
    customerMembershipId: oid(ids.membership),
    walletType: mode,
    status: "ACTIVE",
    remainingAmountPaise: mode === "PREPAID_VALUE" ? 100000 : undefined,
    consumedAmountPaise: mode === "PREPAID_VALUE" ? 100000 : undefined,
    remainingQuantity: mode === "PREPAID_SESSIONS" ? 3 : undefined,
    consumedQuantity: mode === "PREPAID_SESSIONS" ? 3 : undefined,
    expiresAt: new Date(Date.now() + 86400000),
    ...overrides,
  };
}

test("value wallet redemption atomically consumes authorization, deducts paise and records settlement", async () => {
  const items = cart();
  await withSettlementModels({
    authorization: authorization("PREPAID_VALUE", items),
    wallet: wallet("PREPAID_VALUE", { remainingAmountPaise: 0 }),
  }, async (calls) => {
    const snapshot = await consumePrepaidAuthorization({
      authorizationId: ids.authorization,
      paymentMode: "PREPAID_VALUE",
      billing: billing(items),
      cartItems: items,
      finalPayablePaise: 100000,
      operationalServiceValuePaise: 100000,
      session: { id: "session" },
    });
    assert.equal(snapshot.authorizedAmountPaise, 100000);
    assert.equal(snapshot.remainingAmountPaiseAfterRedemption, 0);
    assert.equal(snapshot.freshCashCollectedPaise, 0);
    assert.equal(String(snapshot.redemptionLedgerId), ids.redemption);
    assert.equal(calls.authorizationUpdates[0].update.$set.status, "CONSUMED");
    assert.equal(calls.walletUpdates[0].update.$inc.remainingAmountPaise, -100000);
    assert.equal(calls.walletUpdates[0].update.$inc.consumedAmountPaise, 100000);
    assert.equal(calls.ledgerCreates[0].documents[0].eventType, "REDEMPTION");
    assert.equal(calls.ledgerCreates[0].documents[0].amountPaise, 100000);
    assert.equal(calls.ledgerCreates[0].config.session.id, "session");
    assert.equal(calls.statusUpdates[0].update.$set.status, "DEPLETED");
    assert.equal(calls.membershipStatusUpdates[0].update.$set.status, "DEPLETED");
  });
});

test("1260 cart with 10 manual discount redeems the authoritative 1250 payable", async () => {
  const items = cart({ price: 1260, total: 1260 });
  await withSettlementModels({
    authorization: authorization("PREPAID_VALUE", items, { exactAmountPaise: 125000 }),
    wallet: wallet("PREPAID_VALUE", { remainingAmountPaise: 0 }),
  }, async (calls) => {
    const snapshot = await consumePrepaidAuthorization({
      authorizationId: ids.authorization,
      paymentMode: "PREPAID_VALUE",
      billing: { ...billing(items), discountAmount: 10 },
      cartItems: items,
      finalPayablePaise: 125000,
      operationalServiceValuePaise: 125000,
      session: { id: "discounted-session" },
    });

    assert.equal(snapshot.authorizedAmountPaise, 125000);
    assert.equal(calls.walletUpdates[0].update.$inc.remainingAmountPaise, -125000);
    assert.equal(calls.ledgerCreates[0].documents[0].amountPaise, 125000);
  });
});

test("session wallet redemption supports multiple exact eligible units", async () => {
  const items = cart({ qty: 2, total: 2000 });
  await withSettlementModels({
    authorization: authorization("PREPAID_SESSIONS", items),
    wallet: wallet("PREPAID_SESSIONS", { remainingQuantity: 1 }),
  }, async (calls) => {
    const snapshot = await consumePrepaidAuthorization({
      authorizationId: ids.authorization,
      paymentMode: "PREPAID_SESSIONS",
      billing: billing(items),
      cartItems: items,
      finalPayablePaise: 200000,
      operationalServiceValuePaise: 200000,
      session: { id: "session" },
    });
    assert.equal(snapshot.authorizedQuantity, 2);
    assert.equal(snapshot.remainingQuantityAfterRedemption, 1);
    assert.equal(snapshot.eligibleItemSource, "vendor_menu_node");
    assert.equal(calls.walletUpdates[0].update.$inc.remainingQuantity, -2);
    assert.equal(calls.ledgerCreates[0].documents[0].quantity, 2);
  });
});

test("session wallet rejects unrelated items and changed quantity", async () => {
  const original = cart();
  const unrelated = [...original, ...cart({
    itemId: oid("690000000000000000000011"),
    name: "Unrelated service",
  })];
  await withSettlementModels({
    authorization: authorization("PREPAID_SESSIONS", unrelated, { exactQuantity: 2 }),
    wallet: wallet("PREPAID_SESSIONS"),
  }, async (calls) => {
    await assert.rejects(consumePrepaidAuthorization({
      authorizationId: ids.authorization,
      paymentMode: "PREPAID_SESSIONS",
      billing: billing(unrelated),
      cartItems: unrelated,
      finalPayablePaise: 200000,
      operationalServiceValuePaise: 200000,
      session: {},
    }), (error) => error.code === "prepaid_session_ineligible_item");
    assert.equal(calls.walletUpdates.length, 0);
  });
});

test("changed cart, insufficient balance, consumed authorization and expired wallet fail closed", async () => {
  const items = cart();
  await withSettlementModels({
    authorization: authorization("PREPAID_VALUE", items),
    wallet: wallet("PREPAID_VALUE"),
  }, async (calls) => {
    await assert.rejects(consumePrepaidAuthorization({
      authorizationId: ids.authorization,
      paymentMode: "PREPAID_VALUE",
      billing: billing(items),
      cartItems: cart({ price: 999, total: 999 }),
      finalPayablePaise: 100000,
      operationalServiceValuePaise: 100000,
      session: {},
    }), (error) => error.code === "prepaid_authorization_binding_changed");
    assert.equal(calls.walletUpdates.length, 0);
  });

  await withSettlementModels({
    authorization: authorization("PREPAID_VALUE", items),
    wallet: wallet("PREPAID_VALUE"),
    walletResult: null,
  }, async () => {
    await assert.rejects(consumePrepaidAuthorization({
      authorizationId: ids.authorization,
      paymentMode: "PREPAID_VALUE",
      billing: billing(items),
      cartItems: items,
      finalPayablePaise: 100000,
      operationalServiceValuePaise: 100000,
      session: {},
    }), (error) => error.code === "prepaid_wallet_insufficient");
  });

  await withSettlementModels({
    authorization: authorization("PREPAID_VALUE", items),
    wallet: wallet("PREPAID_VALUE"),
    consumeResult: null,
  }, async () => {
    await assert.rejects(consumePrepaidAuthorization({
      authorizationId: ids.authorization,
      paymentMode: "PREPAID_VALUE",
      billing: billing(items),
      cartItems: items,
      finalPayablePaise: 100000,
      operationalServiceValuePaise: 100000,
      session: {},
    }), (error) => error.code === "prepaid_authorization_consumed");
  });
});

test("feature gates and real transaction requirement fail closed", async () => {
  const items = cart();
  await withSettlementModels({
    authorization: authorization("PREPAID_VALUE", items),
    wallet: wallet("PREPAID_VALUE"),
    featureDisabled: true,
  }, async () => {
    await assert.rejects(consumePrepaidAuthorization({
      authorizationId: ids.authorization,
      paymentMode: "PREPAID_VALUE",
      billing: billing(items),
      cartItems: items,
      finalPayablePaise: 100000,
      operationalServiceValuePaise: 100000,
      session: {},
    }), (error) => error.code === "prepaid_membership_wallets_disabled");
  });

  await withSettlementModels({
    authorization: authorization("PREPAID_VALUE", items),
    wallet: wallet("PREPAID_VALUE"),
  }, async () => {
    await assert.rejects(consumePrepaidAuthorization({
      authorizationId: ids.authorization,
      paymentMode: "PREPAID_VALUE",
      billing: billing(items),
      cartItems: items,
      finalPayablePaise: 100000,
      operationalServiceValuePaise: 100000,
      session: null,
    }), (error) => error.code === "prepaid_transaction_required");
  });
});

test("prepaid value permits a consistent manual discount but rejects stacking and session discounts", () => {
  assert.throws(() => assertPrepaidRequestContract({
    paymentMode: "PREPAID_VALUE",
    authorizationId: ids.authorization,
    paymentBreakdown: { cashAmountPaise: 1, onlineAmountPaise: 0 },
  }), (error) => error.code === "mixed_prepaid_payment_not_supported");
  assert.doesNotThrow(() => assertNoPrepaidDiscountsOrRewards({
    paymentMode: "PREPAID_VALUE",
    billing: { pointsRedeemed: 0, discountAmount: 10 },
    authoritativeFinancials: {
      discountAmount: 10,
      additionalManualDiscountAmount: 10,
      membershipDiscountAmount: 0,
      membership: null,
    },
  }));
  assert.throws(() => assertNoPrepaidDiscountsOrRewards({
    paymentMode: "PREPAID_SESSIONS",
    billing: { pointsRedeemed: 0, discountAmount: 10 },
    authoritativeFinancials: { discountAmount: 10, additionalManualDiscountAmount: 10 },
  }), (error) => error.code === "prepaid_discounts_or_rewards_not_allowed");
  assert.throws(() => assertNoPrepaidDiscountsOrRewards({
    paymentMode: "PREPAID_VALUE",
    billing: { pointsRedeemed: 10, discountAmount: 0 },
    authoritativeFinancials: { discountAmount: 0 },
  }), (error) => error.code === "prepaid_discounts_or_rewards_not_allowed");
});

test("prepaid settlement snapshot is validated and persisted exactly once in the transaction", async () => {
  const snapshot = {
    walletType: "PREPAID_VALUE",
    walletId: oid(ids.wallet),
    customerMembershipId: oid(ids.membership),
    authorizedAmountPaise: 100000,
    remainingAmountPaiseAfterRedemption: 250000,
    operationalServiceValuePaise: 100000,
    freshCashCollectedPaise: 0,
    redemptionLedgerId: oid(ids.redemption),
    authorizationId: oid(ids.authorization),
  };
  const originalUpdateOne = BillingSession.collection.updateOne;
  const session = { transaction: "prepaid-test" };
  let captured;
  BillingSession.collection.updateOne = async (filter, update, options) => {
    captured = { filter, update, options };
    return { modifiedCount: 1 };
  };
  try {
    const persisted = await persistInitialPrepaidSettlementSnapshot({
      BillingSessionModel: BillingSession,
      billingId: ids.bill,
      snapshot,
      session,
    });
    assert.equal(persisted.authorizedAmountPaise, 100000);
    assert.equal(persisted.remainingAmountPaiseAfterRedemption, 250000);
    assert.equal(captured.filter.status, "COMPLETED");
    assert.deepEqual(captured.filter.prepaidSettlementSnapshot, { $exists: false });
    assert.equal(captured.options.session, session);

    BillingSession.collection.updateOne = async () => ({ modifiedCount: 0 });
    await assert.rejects(
      persistInitialPrepaidSettlementSnapshot({
        BillingSessionModel: BillingSession,
        billingId: ids.bill,
        snapshot,
        session,
      }),
      (error) => error.code === "prepaid_settlement_snapshot_conflict"
    );
    await assert.rejects(
      persistInitialPrepaidSettlementSnapshot({
        BillingSessionModel: BillingSession,
        billingId: ids.bill,
        snapshot,
        session: null,
      }),
      (error) => error.code === "prepaid_transaction_required"
    );
  } finally {
    BillingSession.collection.updateOne = originalUpdateOne;
  }
});

test("cancellation restores exact value once and keeps expired wallet expired", async () => {
  const snapshot = {
    walletType: "PREPAID_VALUE",
    walletId: oid(ids.wallet),
    customerMembershipId: oid(ids.membership),
    authorizedAmountPaise: 100000,
    operationalServiceValuePaise: 100000,
    freshCashCollectedPaise: 0,
    redemptionLedgerId: oid(ids.redemption),
    authorizationId: oid(ids.authorization),
  };
  const bill = {
    ...billing(),
    prepaidSettlementSnapshot: snapshot,
  };
  await withSettlementModels({
    authorization: null,
    wallet: wallet("PREPAID_VALUE", {
      status: "DEPLETED",
      remainingAmountPaise: 100000,
      consumedAmountPaise: 0,
      expiresAt: new Date(Date.now() - 1000),
    }),
    sourceLedger: {
      _id: oid(ids.redemption),
      walletId: oid(ids.wallet),
      eventType: "REDEMPTION",
    },
  }, async (calls) => {
    const reversal = await reversePrepaidSettlement({ bill, transaction: {}, session: { id: "cancel" } });
    assert.equal(String(reversal._id), ids.reversal);
    assert.equal(calls.walletUpdates[0].update.$inc.remainingAmountPaise, 100000);
    assert.equal(calls.walletUpdates[0].update.$inc.consumedAmountPaise, -100000);
    assert.equal(calls.statusUpdates[0].update.$set.status, "EXPIRED");
    assert.equal(calls.membershipStatusUpdates[0].update.$set.status, "EXPIRED");
    assert.equal(calls.statusUpdates[0].update.$set.status, "EXPIRED");
    assert.equal(calls.ledgerCreates[0].documents[0].eventType, "CANCELLATION_REVERSAL");
    assert.equal(String(calls.ledgerCreates[0].documents[0].sourceLedgerId), ids.redemption);
  });
});

test("ledger uniqueness and completion source preserve duplicate and rollback safety", () => {
  const indexes = PrepaidWalletLedger.schema.indexes();
  assert.ok(indexes.some(([, options]) => options.name === "prepaid_wallet_redemption_once" && options.unique));
  assert.ok(indexes.some(([, options]) => options.name === "prepaid_wallet_reversal_once" && options.unique));
  const controller = fs.readFileSync(path.join(__dirname, "../controllers/billingController.js"), "utf8");
  const completion = controller.slice(controller.indexOf("exports.completeBillingSession"));
  assert.match(completion, /consumePrepaidAuthorization/);
  assert.match(completion, /prepaidSettlementSnapshot/);
  assert.match(completion, /isPrepaidPayment \? 0 : finalPaidAmount/);
  assert.match(controller, /reversePrepaidSettlement/);
  assert.match(controller, /setImmediate\(async \(\) =>/);
});

test("prepaid modes are additive and settlement snapshots preserve stylist and GST fields", async () => {
  for (const paymentMode of ["PREPAID_VALUE", "PREPAID_SESSIONS"]) {
    const session = new BillingSession({ vendorId: oid(ids.vendor), paymentMode });
    assert.equal(session.validateSync(), undefined);
    const transaction = new Transaction({ vendorId: oid(ids.vendor), paymentMode });
    assert.equal(transaction.validateSync(), undefined);
  }
  const item = cart()[0];
  const session = new BillingSession({ vendorId: oid(ids.vendor), cartItems: [item] });
  await session.validate();
  assert.equal(session.cartItems[0].resourceName, "Stylist One");
  assert.equal(session.gstInvoiceSnapshot, undefined);
});
