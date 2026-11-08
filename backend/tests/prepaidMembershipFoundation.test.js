const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const mongoose = require("mongoose");

const CustomerMembership = require("../models/CustomerMembership");
const MembershipPlan = require("../models/MembershipPlan");
const PrepaidMembershipWallet = require("../models/PrepaidMembershipWallet");
const PrepaidRedemptionAuthorization = require("../models/PrepaidRedemptionAuthorization");
const PrepaidWalletLedger = require("../models/PrepaidWalletLedger");
const membershipPlanController = require("../controllers/vendorMembershipPlanController");
const {
  resolveCanonicalMembershipMenuItem,
} = require("../services/canonicalMembershipMenuItem");
const {
  assertPrepaidMembershipWalletEnabled,
  isMembershipTypeEnabled,
  isPrepaidMembershipWalletEnabled,
} = require("../services/prepaidMembershipCapability");

function id() {
  return new mongoose.Types.ObjectId();
}

function queryModel(documents = []) {
  return {
    findOne(filter) {
      const document = documents.find((candidate) => {
        if (filter?._id && String(candidate._id) !== String(filter._id)) return false;
        if (filter?.category && String(candidate.category) !== String(filter.category)) return false;
        return true;
      }) || null;
      return {
        select() {
          return this;
        },
        session() {
          return this;
        },
        lean: async () => document,
      };
    },
  };
}

function baseCustomerMembership(overrides = {}) {
  const now = new Date("2026-11-05T10:00:00.000Z");
  return {
    vendorId: id(),
    customerId: id(),
    customerMobileSnapshot: "919876543210",
    membershipPlanId: id(),
    membershipType: "DISCOUNT",
    planSnapshot: {
      planId: id(),
      name: "Membership",
      duration: "ANNUAL",
      sellingPrice: 1000,
    },
    sellingPriceAtPurchase: 1000,
    activatedAt: now,
    expiresAt: new Date("2027-11-05T10:00:00.000Z"),
    status: "ACTIVE",
    payment: { method: "CASH", amount: 1000 },
    ...overrides,
  };
}

test("membership enums preserve DISCOUNT and legacy SERVICE_QUOTA while adding prepaid sessions", async () => {
  assert.deepEqual(MembershipPlan.constants.PLAN_TYPES, [
    "DISCOUNT",
    "SERVICE_QUOTA",
    "PREPAID_VALUE",
    "PREPAID_SESSIONS",
  ]);
  assert.deepEqual(CustomerMembership.constants.MEMBERSHIP_TYPES, [
    "DISCOUNT",
    "SERVICE_QUOTA",
    "PREPAID_VALUE",
    "PREPAID_SESSIONS",
  ]);

  await new MembershipPlan({
    vendorId: id(),
    planType: "DISCOUNT",
    name: "Existing Gold",
    duration: "ANNUAL",
    sellingPrice: 1000,
  }).validate();
  await new MembershipPlan({
    vendorId: id(),
    planType: "SERVICE_QUOTA",
    name: "Legacy quota",
    duration: "ANNUAL",
    sellingPrice: 1000,
    serviceQuotaConfig: { benefits: [{ menuItemId: id(), quota: 5 }] },
  }).validate();
  await new CustomerMembership(baseCustomerMembership({
    membershipType: "PREPAID_VALUE",
    prepaidValueSnapshot: {
      paidAmountPaise: 100000,
      creditedAmountPaise: 110000,
      bonusAmountPaise: 10000,
      enrolledAt: new Date("2026-11-05T10:00:00.000Z"),
      expiresAt: new Date("2027-11-05T10:00:00.000Z"),
    },
  })).validate();
});

test("prepaid session plans require one exact item and credited quantity at least paid quantity", async () => {
  const valid = new MembershipPlan({
    vendorId: id(),
    planType: "PREPAID_SESSIONS",
    name: "Six Keratin Sessions",
    duration: "ANNUAL",
    sellingPrice: 25000,
    prepaidSessionsConfig: {
      eligibleItemId: id(),
      eligibleItemSource: "vendor_menu_node",
      eligibleItemKind: "SERVICE",
      paidQuantity: 5,
      creditedQuantity: 6,
    },
  });
  await valid.validate();

  const invalid = new MembershipPlan({
    vendorId: id(),
    planType: "PREPAID_SESSIONS",
    name: "Invalid sessions",
    duration: "ANNUAL",
    sellingPrice: 25000,
    prepaidSessionsConfig: {
      eligibleItemId: id(),
      eligibleItemSource: "vendor_menu_node",
      eligibleItemKind: "SERVICE",
      paidQuantity: 6,
      creditedQuantity: 5,
    },
  });
  await assert.rejects(invalid.validate(), /credited quantity not less than paid quantity/);
});

test("customer memberships validate immutable prepaid enrollment snapshots", async () => {
  const enrolledAt = new Date("2026-11-05T10:00:00.000Z");
  const expiresAt = new Date("2027-11-05T10:00:00.000Z");
  const sessions = new CustomerMembership(baseCustomerMembership({
    membershipType: "PREPAID_SESSIONS",
    expiresAt,
    prepaidSessionsSnapshot: {
      eligibleItemId: id(),
      eligibleItemSource: "custom_package",
      eligibleItemKind: "PACKAGE",
      itemName: "Bridal Care Combo",
      unitPricePaise: 300000,
      categoryPath: ["Salon", "Packages", "Bridal Care Combo"],
      packageIncludes: "Facial, hair styling and makeup",
      terms: "Appointment required",
      paidQuantity: 5,
      creditedQuantity: 6,
      enrolledAt,
      expiresAt,
    },
  }));
  await sessions.validate();
  assert.equal(CustomerMembership.schema.path("prepaidSessionsSnapshot").options.immutable, true);

  const value = new CustomerMembership(baseCustomerMembership({
    membershipType: "PREPAID_VALUE",
    expiresAt,
    prepaidValueSnapshot: {
      paidAmountPaise: 1000000,
      creditedAmountPaise: 1300000,
      bonusAmountPaise: 300000,
      enrolledAt,
      expiresAt,
    },
  }));
  await value.validate();

  value.prepaidValueSnapshot.creditedAmountPaise = 1299999;
  await assert.rejects(value.validate(), /paid, credited, and bonus amounts/);
});

test("wallet accounts enforce reconciled integer paise and session quantities", async () => {
  const common = {
    vendorId: id(),
    customerId: id(),
    customerMembershipId: id(),
    activatesAt: new Date("2026-11-05T10:00:00.000Z"),
    expiresAt: new Date("2027-11-05T10:00:00.000Z"),
  };
  await new PrepaidMembershipWallet({
    ...common,
    walletType: "PREPAID_VALUE",
    creditedAmountPaise: 1300000,
    consumedAmountPaise: 100000,
    remainingAmountPaise: 1200000,
  }).validate();
  await new PrepaidMembershipWallet({
    ...common,
    customerMembershipId: id(),
    walletType: "PREPAID_SESSIONS",
    creditedQuantity: 6,
    consumedQuantity: 1,
    remainingQuantity: 5,
  }).validate();

  const invalidMoney = new PrepaidMembershipWallet({
    ...common,
    customerMembershipId: id(),
    walletType: "PREPAID_VALUE",
    creditedAmountPaise: 1000.5,
    consumedAmountPaise: 0,
    remainingAmountPaise: 1000.5,
  });
  await assert.rejects(invalidMoney.validate(), /integer paise/);

  const invalidSessions = new PrepaidMembershipWallet({
    ...common,
    customerMembershipId: id(),
    walletType: "PREPAID_SESSIONS",
    creditedQuantity: 6,
    consumedQuantity: 2,
    remainingQuantity: 5,
  });
  await assert.rejects(invalidSessions.validate(), /reconcile exactly/);
});

test("wallet, ledger, and authorization indexes enforce ownership and idempotency boundaries", () => {
  const walletIndexes = PrepaidMembershipWallet.schema.indexes();
  assert.ok(walletIndexes.some(([fields, options]) => (
    fields.customerMembershipId === 1 && options.unique === true
  )));

  const ledgerIndexes = PrepaidWalletLedger.schema.indexes();
  assert.ok(ledgerIndexes.some(([, options]) => options.name === "prepaid_wallet_redemption_once" && options.unique));
  assert.ok(ledgerIndexes.some(([, options]) => options.name === "prepaid_wallet_reversal_once" && options.unique));

  const authorizationIndexes = PrepaidRedemptionAuthorization.schema.indexes();
  assert.ok(authorizationIndexes.some(([, options]) => (
    options.name === "prepaid_authorization_bill_unique" && options.unique
  )));
  assert.equal(PrepaidRedemptionAuthorization.schema.path("otpHash").options.select, false);
  assert.equal(PrepaidRedemptionAuthorization.schema.path("otp"), undefined);
});

test("ledger values and authorization bindings match their wallet type", async () => {
  const shared = {
    vendorId: id(),
    customerId: id(),
    customerMembershipId: id(),
    walletId: id(),
  };
  const billId = id();
  await new PrepaidWalletLedger({
    ...shared,
    walletType: "PREPAID_SESSIONS",
    eventType: "REDEMPTION",
    billingSessionId: billId,
    quantity: 2,
  }).validate();
  await assert.rejects(new PrepaidWalletLedger({
    ...shared,
    walletType: "PREPAID_VALUE",
    eventType: "REDEMPTION",
    billingSessionId: billId,
    quantity: 100,
  }).validate(), /wallet balance dimension/);

  await new PrepaidRedemptionAuthorization({
    vendorId: shared.vendorId,
    customerId: shared.customerId,
    walletId: shared.walletId,
    billingSessionId: billId,
    authorizationType: "PREPAID_SESSIONS",
    eligibleItemId: id(),
    eligibleItemSource: "custom_package",
    exactQuantity: 2,
    cartFingerprint: "a".repeat(64),
    otpHash: "a".repeat(64),
    otpExpiresAt: new Date("2026-11-05T10:10:00.000Z"),
  }).validate();
});

test("prepaid feature capability is disabled by default and requires explicit true", () => {
  assert.equal(isPrepaidMembershipWalletEnabled({}), false);
  assert.equal(isPrepaidMembershipWalletEnabled({ PREPAID_MEMBERSHIP_WALLETS_ENABLED: "false" }), false);
  assert.equal(isPrepaidMembershipWalletEnabled({ PREPAID_MEMBERSHIP_WALLETS_ENABLED: "true" }), true);
  assert.equal(isMembershipTypeEnabled("DISCOUNT", {}), true);
  assert.equal(isMembershipTypeEnabled("SERVICE_QUOTA", { PREPAID_MEMBERSHIP_WALLETS_ENABLED: "true" }), false);
  assert.equal(isMembershipTypeEnabled("PREPAID_VALUE", {}), false);
  assert.equal(
    isMembershipTypeEnabled("PREPAID_SESSIONS", { PREPAID_MEMBERSHIP_WALLETS_ENABLED: "true" }),
    true
  );
  assert.throws(
    () => assertPrepaidMembershipWalletEnabled({}),
    (error) => error.code === "prepaid_membership_wallets_disabled" && error.statusCode === 403
  );
});

test("Phase 2A membership APIs retain DISCOUNT while gating prepaid operations", () => {
  const validation = membershipPlanController._private.validateDiscountPayload({
    planType: "DISCOUNT",
    name: "Existing discount plan",
    duration: "ANNUAL",
    sellingPrice: 1000,
    discountPercentage: 10,
    eligibleMenuItemIds: [],
    minimumBillAmount: 0,
  });
  assert.deepEqual(validation.errors, []);
  const customerControllerSource = fs.readFileSync(
    path.join(__dirname, "../controllers/vendorCustomerMembershipController.js"),
    "utf8"
  );
  assert.match(customerControllerSource, /assertPrepaidMembershipWalletEnabled/);
  assert.match(customerControllerSource, /PrepaidMembershipWallet\.create/);
  assert.match(customerControllerSource, /PrepaidWalletLedger\.create/);
  assert.match(customerControllerSource, /withTransaction/);
});

test("canonical resolver handles uploaded services and custom packages", async () => {
  const vendorId = id();
  const serviceId = id();
  const packageId = id();
  const models = {
    vendor_price_node: queryModel([]),
    vendor_menu_node: queryModel([{
      _id: serviceId,
      vendorId,
      name: "Keratin Treatment",
      price: 5000,
      isLeaf: true,
      pricingStatus: "Active",
      datasetStatus: "active",
      customType: "service_item",
      pathNames: ["Hair", "Treatments", "Keratin Treatment"],
      terms: "Advance booking",
    }]),
    custom_package: queryModel([{
      _id: packageId,
      vendorId,
      name: "Bridal Care Combo",
      price: 3000,
      isLeaf: true,
      pricingStatus: "Active",
      isDeleted: false,
      customType: "package",
      pathLabels: ["Salon", "Packages"],
      packagesIncludes: "Facial, hair styling and makeup",
      terms: "Single package credit",
    }]),
  };

  const service = await resolveCanonicalMembershipMenuItem({
    vendorId,
    itemId: serviceId,
    itemSource: "vendor_menu_node",
  }, { models });
  assert.equal(service.itemKind, "SERVICE");
  assert.equal(service.pricePaise, 500000);

  const packageItem = await resolveCanonicalMembershipMenuItem({
    vendorId,
    itemId: packageId,
    itemSource: "custom_package",
  }, { models });
  assert.equal(packageItem.itemKind, "PACKAGE");
  assert.equal(packageItem.packageIncludes, "Facial, hair styling and makeup");
  assert.deepEqual(packageItem.categoryPath, ["Salon", "Packages", "Bridal Care Combo"]);
});

test("canonical resolver uses explicit master metadata for standard price nodes", async () => {
  const vendorId = id();
  const itemId = id();
  const rootId = id();
  const parentId = id();
  const categoryId = id();
  const result = await resolveCanonicalMembershipMenuItem({
    vendorId,
    itemId,
    itemSource: "vendor_price_node",
  }, {
    models: {
      vendor_price_node: queryModel([{
        _id: itemId,
        vendorId,
        rootCategoryId: rootId,
        categoryId,
        name: "Hair Spa",
        price: 1200,
        isLeaf: true,
        pricingStatus: "Active",
        terms: "",
      }]),
      DummyCategory: queryModel([{
        _id: rootId,
        name: "Salon",
        categoryType: "Services",
      }]),
      DummySubcategory: queryModel([
        { _id: parentId, category: rootId, name: "Hair", parentSubcategory: null },
        { _id: categoryId, category: rootId, name: "Treatments", parentSubcategory: parentId },
      ]),
    },
  });

  assert.equal(result.itemKind, "SERVICE");
  assert.deepEqual(result.categoryPath, ["Salon", "Hair", "Treatments", "Hair Spa"]);
});

test("canonical resolver rejects cross-vendor, ambiguous, and unsupported items", async () => {
  const vendorId = id();
  const otherVendorId = id();
  const itemId = id();
  const base = {
    _id: itemId,
    vendorId,
    name: "Item",
    price: 100,
    isLeaf: true,
    pricingStatus: "Active",
    datasetStatus: "active",
    isDeleted: false,
    customType: "service_item",
  };

  await assert.rejects(
    resolveCanonicalMembershipMenuItem({ vendorId, itemId, itemSource: "vendor_menu_node" }, {
      models: { vendor_menu_node: queryModel([{ ...base, vendorId: otherVendorId }]) },
    }),
    (error) => error.code === "cross_vendor_item"
  );
  await assert.rejects(
    resolveCanonicalMembershipMenuItem({ vendorId, itemId }, {
      models: {
        vendor_price_node: queryModel([]),
        vendor_menu_node: queryModel([base]),
        custom_package: queryModel([{ ...base, customType: "package" }]),
      },
    }),
    (error) => error.code === "ambiguous_item_identity"
  );
  await assert.rejects(
    resolveCanonicalMembershipMenuItem({ vendorId, itemId, itemSource: "vendor_menu_node" }, {
      models: { vendor_menu_node: queryModel([{ ...base, customType: "offer" }]) },
    }),
    (error) => error.code === "unsupported_item_kind"
  );
  await assert.rejects(
    resolveCanonicalMembershipMenuItem({ vendorId, itemId, itemSource: "custom_package" }, {
      models: { custom_package: queryModel([{ ...base, customType: "" }]) },
    }),
    (error) => error.code === "item_kind_unavailable"
  );
});

test("canonical resolver preserves the Vendor Menu legacy service default", async () => {
  const vendorId = id();
  const itemId = id();
  const service = await resolveCanonicalMembershipMenuItem({
    vendorId,
    itemId,
    itemSource: "vendor_menu_node",
  }, {
    models: {
      vendor_menu_node: queryModel([{
        _id: itemId,
        vendorId,
        name: "Legacy imported facial",
        price: 800,
        isLeaf: true,
        pricingStatus: "Active",
        datasetStatus: "active",
        customType: "",
        pathNames: ["Women", "Beauty Services", "Legacy imported facial"],
      }]),
    },
  });

  assert.equal(service.itemKind, "SERVICE");
  assert.equal(service.itemSource, "vendor_menu_node");
  assert.deepEqual(service.categoryPath, [
    "Women",
    "Beauty Services",
    "Legacy imported facial",
  ]);
});
