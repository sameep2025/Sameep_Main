const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const mongoose = require("mongoose");

const DummyVendor = require("../models/DummyVendor");
const MembershipPlan = require("../models/MembershipPlan");
const VendorMenuNode = require("../models/VendorMenuNode");
const VendorPriceNode = require("../models/VendorPriceNode");
const controller = require("../controllers/vendorMembershipPlanController");

function mockQueryChain(value) {
  return {
    select() {
      return this;
    },
    lean() {
      return Promise.resolve(value);
    },
  };
}

test("membership plan schema supports Phase 1 enums and future plan foundations", () => {
  const constants = MembershipPlan.constants;
  assert.deepEqual(constants.PLAN_TYPES, ["DISCOUNT", "SERVICE_QUOTA", "PREPAID_VALUE"]);
  assert.deepEqual(constants.DURATIONS, ["MONTHLY", "QUARTERLY", "HALF_YEARLY", "ANNUAL"]);
  assert.deepEqual(constants.STATUSES, ["ACTIVE", "INACTIVE"]);

  assert.ok(MembershipPlan.schema.path("eligibleMenuItemIds"));
  assert.ok(MembershipPlan.schema.path("serviceQuotaConfig.benefits"));
  assert.ok(MembershipPlan.schema.path("prepaidValueConfig.prepaidValue"));
  assert.ok(MembershipPlan.schema.path("serviceEligibilityRevisions.revisionId"));
  assert.ok(MembershipPlan.schema.path("serviceEligibilityRevisions.scope"));
  assert.ok(MembershipPlan.schema.path("benefitRulesRevisions.revisionId"));
  assert.ok(MembershipPlan.schema.path("benefitRulesRevisions.scope"));
  assert.ok(MembershipPlan.schema.path("benefitRulesRevisions.affectedMembershipCount"));
});

test("discount plan payload validation accepts all durations", () => {
  const { validateDiscountPayload, DURATIONS } = controller._private;

  DURATIONS.forEach((duration) => {
    const result = validateDiscountPayload({
      planType: "DISCOUNT",
      name: `${duration} Plan`,
      duration,
      sellingPrice: 999,
      discountPercentage: 10,
      eligibleMenuItemIds: [],
      minimumBillAmount: 0,
      allowAdditionalDiscountOnMembershipItems: false,
      allowRewardsOnMembershipItems: false,
    });

    assert.deepEqual(result.errors, []);
    assert.equal(result.payload.duration, duration);
  });
});

test("discount plan payload validation rejects invalid price, discount and incomplete plan types", () => {
  const { validateDiscountPayload } = controller._private;

  const invalid = validateDiscountPayload({
    planType: "SERVICE_QUOTA",
    name: "",
    duration: "WEEKLY",
    sellingPrice: -1,
    discountPercentage: 101,
    minimumBillAmount: -25,
  });

  assert.ok(invalid.errors.some((message) => /Only DISCOUNT/.test(message)));
  assert.ok(invalid.errors.some((message) => /Plan name/.test(message)));
  assert.ok(invalid.errors.some((message) => /duration/.test(message)));
  assert.ok(invalid.errors.some((message) => /Selling price/.test(message)));
  assert.ok(invalid.errors.some((message) => /Discount percentage/.test(message)));
  assert.ok(invalid.errors.some((message) => /Minimum bill/.test(message)));
});

test("membership plan serialization preserves discount/non-membership distinction", () => {
  const { serializePlan } = controller._private;
  const itemId = new mongoose.Types.ObjectId();
  const plan = serializePlan({
    _id: new mongoose.Types.ObjectId(),
    vendorId: new mongoose.Types.ObjectId(),
    planType: "DISCOUNT",
    name: "Gold",
    description: "10% off selected services",
    duration: "MONTHLY",
    sellingPrice: 500,
    discountPercentage: 10,
    eligibleMenuItemIds: [itemId],
    minimumBillAmount: 1000,
    allowAdditionalDiscountOnMembershipItems: false,
    allowRewardsOnMembershipItems: false,
    benefitSemanticsVersion: "MEMBERSHIP_ITEM_FLAGS_V1",
    status: "INACTIVE",
  });

  assert.deepEqual(plan.eligibleMenuItemIds, [String(itemId)]);
  assert.equal(plan.allowAdditionalDiscountOnMembershipItems, false);
  assert.equal(plan.allowRewardsOnMembershipItems, false);
  assert.equal(plan.benefitSemanticsVersion, "MEMBERSHIP_ITEM_FLAGS_V1");
});

test("membership plan update records service eligibility revision and active member scope", () => {
  const controllerSource = fs.readFileSync(
    path.join(__dirname, "../controllers/vendorMembershipPlanController.js"),
    "utf8"
  );
  const modelSource = fs.readFileSync(path.join(__dirname, "../models/MembershipPlan.js"), "utf8");

  assert.match(modelSource, /previousEligibleMenuItemIds/);
  assert.match(modelSource, /newEligibleMenuItemIds/);
  assert.match(modelSource, /ALL_ACTIVE_AND_SCHEDULED/);
  assert.match(modelSource, /FUTURE_ONLY/);
  assert.match(controllerSource, /serviceEligibilityScope/);
  assert.match(controllerSource, /Choose how service changes apply to existing members/);
  assert.match(controllerSource, /CustomerMembership\.updateMany/);
  assert.match(controllerSource, /status: \{ \$in: \["ACTIVE", "SCHEDULED"\] \}/);
  assert.match(controllerSource, /expiresAt: \{ \$gt: now \}/);
  assert.match(controllerSource, /serviceEligibilityOverride/);
  assert.match(controllerSource, /serviceEligibilityRevisions/);
});

test("membership plan update records benefit revision and active member scope", () => {
  const controllerSource = fs.readFileSync(
    path.join(__dirname, "../controllers/vendorMembershipPlanController.js"),
    "utf8"
  );
  const modelSource = fs.readFileSync(path.join(__dirname, "../models/MembershipPlan.js"), "utf8");

  assert.match(modelSource, /BenefitRulesRevisionSchema/);
  assert.match(modelSource, /previousAllowAdditionalDiscountOnMembershipItems/);
  assert.match(modelSource, /newAllowRewardsOnMembershipItems/);
  assert.match(controllerSource, /benefitRulesScope/);
  assert.match(controllerSource, /Choose how benefit changes apply to existing members/);
  assert.match(controllerSource, /benefitRulesOverride/);
  assert.match(controllerSource, /PLAN_BENEFIT_RULES_UPDATE/);
  assert.match(controllerSource, /benefitRulesRevisions/);
  assert.match(controllerSource, /status: \{ \$in: \["ACTIVE", "SCHEDULED"\] \}/);
});

test("benefit scope validation and legacy flag resolution are explicit", () => {
  const {
    normalizeBenefitRulesScope,
    resolveEffectiveBenefitFlagsFromPlan,
  } = controller._private;

  assert.equal(normalizeBenefitRulesScope("ALL_ACTIVE_AND_SCHEDULED"), "ALL_ACTIVE_AND_SCHEDULED");
  assert.equal(normalizeBenefitRulesScope("future_only"), "FUTURE_ONLY");
  assert.equal(normalizeBenefitRulesScope("existing"), "");
  assert.deepEqual(
    resolveEffectiveBenefitFlagsFromPlan({
      allowAdditionalDiscountOnMembershipItems: true,
      allowRewardsOnMembershipItems: false,
      benefitSemanticsVersion: "MEMBERSHIP_ITEM_FLAGS_V1",
    }),
    {
      allowAdditionalDiscountOnMembershipItems: true,
      allowRewardsOnMembershipItems: false,
      benefitSemanticsVersion: "MEMBERSHIP_ITEM_FLAGS_V1",
    }
  );
  assert.deepEqual(
    resolveEffectiveBenefitFlagsFromPlan({
      applyDiscountOnNonMembershipItems: true,
      rewardsOnNonMembershipItems: true,
      benefitSemanticsVersion: "LEGACY_NON_MEMBERSHIP_FLAGS",
    }),
    {
      allowAdditionalDiscountOnMembershipItems: false,
      allowRewardsOnMembershipItems: false,
      benefitSemanticsVersion: "LEGACY_NON_MEMBERSHIP_FLAGS",
    }
  );
});

test("eligible item tree exposes parent hierarchy but flattens only billable leaves", () => {
  const { buildTreeFromParentIds, flattenBillableItems } = controller._private;
  const rootId = new mongoose.Types.ObjectId();
  const groupId = new mongoose.Types.ObjectId();
  const activeLeafId = new mongoose.Types.ObjectId();
  const inactiveLeafId = new mongoose.Types.ObjectId();
  const duplicateLeafId = new mongoose.Types.ObjectId();

  const tree = buildTreeFromParentIds(
    [
      {
        _id: rootId,
        parentNodeId: null,
        name: "Hair",
        isLeaf: false,
        pricingStatus: "Inactive",
        sequence: 1,
      },
      {
        _id: groupId,
        parentNodeId: rootId,
        name: "Styling",
        isLeaf: false,
        pricingStatus: "Inactive",
        sequence: 1,
      },
      {
        _id: activeLeafId,
        parentNodeId: groupId,
        name: "Hair Cut",
        isLeaf: true,
        price: 250,
        pricingStatus: "Active",
        pathNames: ["Hair", "Styling", "Hair Cut"],
        sequence: 1,
      },
      {
        _id: inactiveLeafId,
        parentNodeId: groupId,
        name: "Hair Cut",
        isLeaf: true,
        price: 300,
        pricingStatus: "Inactive",
        pathNames: ["Hair", "Styling", "Hair Cut"],
        sequence: 2,
      },
      {
        _id: duplicateLeafId,
        parentNodeId: rootId,
        name: "Hair Cut",
        isLeaf: true,
        price: 500,
        pricingStatus: "Active",
        pathNames: ["Hair", "Hair Cut"],
        sequence: 3,
      },
    ],
    {
      sourceType: "vendor_menu",
      parentField: "parentNodeId",
      pathField: "pathNames",
      rootLabel: "Uploaded Menu",
      isBillable: (node) => Boolean(node.isLeaf) && node.pricingStatus === "Active",
    }
  );
  const flat = flattenBillableItems(tree);

  assert.equal(tree.length, 1);
  assert.equal(tree[0].name, "Hair");
  assert.equal(tree[0].eligibleDescendantCount, 2);
  assert.deepEqual(
    flat.map((item) => item.id).sort(),
    [String(activeLeafId), String(duplicateLeafId)].sort()
  );
  assert.ok(flat.every((item) => item.name === "Hair Cut"));
  assert.ok(flat.every((item) => Array.isArray(item.path) && item.path.length > 0));
});

test("eligible item loader uses only the currently active vendor menu source", async () => {
  const { loadEligibleMenuOptions } = controller._private;
  const vendorId = new mongoose.Types.ObjectId();
  const uploadedLeafId = new mongoose.Types.ObjectId();
  const standardLeafId = new mongoose.Types.ObjectId();

  const originals = {
    dummyFindById: DummyVendor.findById,
    menuFind: VendorMenuNode.find,
    priceFind: VendorPriceNode.find,
  };

  try {
    VendorMenuNode.find = () =>
      mockQueryChain([
        {
          _id: uploadedLeafId,
          parentNodeId: null,
          name: "Uploaded Hair Cut",
          isLeaf: true,
          price: 250,
          pricingStatus: "Active",
          pathNames: ["Uploaded Hair Cut"],
        },
      ]);
    VendorPriceNode.find = () =>
      mockQueryChain([
        {
          _id: standardLeafId,
          parentVendorPriceNodeId: null,
          name: "Standard Hair Cut",
          isLeaf: true,
          price: 300,
          pricingStatus: "Active",
        },
      ]);

    DummyVendor.findById = () =>
      mockQueryChain({ pricingSource: "standard", menuSourceType: "admin_tree" });
    const standardOptions = await loadEligibleMenuOptions(String(vendorId));
    assert.equal(standardOptions.activeSource.pricingSource, "standard");
    assert.deepEqual(standardOptions.items.map((item) => item.id), [String(standardLeafId)]);
    assert.equal(standardOptions.tree[0].name, "Standard Hair Cut");

    DummyVendor.findById = () =>
      mockQueryChain({ pricingSource: "self_managed", menuSourceType: "excel_upload" });
    const selfManagedOptions = await loadEligibleMenuOptions(String(vendorId));
    assert.equal(selfManagedOptions.activeSource.pricingSource, "self_managed");
    assert.deepEqual(selfManagedOptions.items.map((item) => item.id), [String(uploadedLeafId)]);
    assert.equal(selfManagedOptions.tree[0].name, "Uploaded Hair Cut");
  } finally {
    DummyVendor.findById = originals.dummyFindById;
    VendorMenuNode.find = originals.menuFind;
    VendorPriceNode.find = originals.priceFind;
  }
});

test("membership routes are vendor-authenticated and mounted without billing integration", () => {
  const routeSource = fs.readFileSync(
    path.join(__dirname, "../routes/vendorMembershipPlanRoutes.js"),
    "utf8"
  );
  const serverSource = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  const billingSource = fs.readFileSync(path.join(__dirname, "../controllers/billingController.js"), "utf8");

  assert.match(routeSource, /requireVendorAccessFromExistingAuth/);
  assert.match(routeSource, /eligible-items/);
  assert.match(routeSource, /status/);
  assert.match(serverSource, /\/api\/vendor\/membership-plans/);
  assert.doesNotMatch(billingSource, /MembershipPlan/);
});
