const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const mongoose = require("mongoose");

const controller = require("../controllers/membershipBillingPreviewController");

function membership(overrides = {}) {
  const { planSnapshot: planSnapshotOverrides = {}, ...membershipOverrides } = overrides;
  return {
    _id: new mongoose.Types.ObjectId(),
    activatedAt: new Date("2026-10-01T00:00:00.000Z"),
    expiresAt: new Date("2026-11-01T00:00:00.000Z"),
    status: "ACTIVE",
    planSnapshot: {
      name: "Gold",
      discountPercentage: 10,
      minimumBillAmount: 500,
      eligibleMenuItemIds: [new mongoose.Types.ObjectId("652000000000000000000001")],
      allowAdditionalDiscountOnMembershipItems: false,
      allowRewardsOnMembershipItems: false,
      benefitSemanticsVersion: "MEMBERSHIP_ITEM_FLAGS_V1",
      ...planSnapshotOverrides,
    },
    ...membershipOverrides,
  };
}

test("membership preview applies eligible item discount when subtotal meets minimum", () => {
  const result = controller._private.calculateMembershipPreview({
    membership: membership(),
    items: [
      {
        itemId: "652000000000000000000001",
        name: "Hair Cut",
        price: 300,
        qty: 2,
      },
    ],
  });

  assert.equal(result.subtotal, 600);
  assert.equal(result.qualifiesForMinimum, true);
  assert.equal(result.membershipDiscountAmount, 60);
  assert.equal(result.previewPayableAmount, 540);
  assert.equal(result.items[0].membershipDiscountApplied, true);
  assert.equal(result.items[0].manualDiscountEligible, false);
});

test("membership preview checks minimum against entire pre-discount subtotal", () => {
  const result = controller._private.calculateMembershipPreview({
    membership: membership(),
    items: [
      { itemId: "652000000000000000000001", name: "Hair Cut", price: 300, qty: 1 },
      { itemId: "652000000000000000000002", name: "Facial", price: 400, qty: 1 },
    ],
  });

  assert.equal(result.subtotal, 700);
  assert.equal(result.qualifiesForMinimum, true);
  assert.equal(result.membershipDiscountAmount, 30);
  assert.equal(result.items[1].membershipDiscountApplied, false);
});

test("membership preview returns normal billing preview when below minimum", () => {
  const result = controller._private.calculateMembershipPreview({
    membership: membership(),
    items: [
      { itemId: "652000000000000000000001", name: "Hair Cut", price: 300, qty: 1 },
    ],
  });

  assert.equal(result.subtotal, 300);
  assert.equal(result.qualifiesForMinimum, false);
  assert.equal(result.membershipDiscountAmount, 0);
  assert.match(result.message, /below ₹500/);
});

test("membership preview does not apply membership discount to non-eligible items", () => {
  const result = controller._private.calculateMembershipPreview({
    membership: membership({ planSnapshot: { allowAdditionalDiscountOnMembershipItems: true } }),
    items: [{ itemId: "652000000000000000000002", name: "Facial", price: 600, qty: 1 }],
  });

  assert.equal(result.membershipDiscountAmount, 0);
  assert.equal(result.items[0].membershipEligible, false);
  assert.equal(result.items[0].manualDiscountEligible, true);
});

test("zero percent membership does not mark eligible items as discounted", () => {
  const result = controller._private.calculateMembershipPreview({
    membership: membership({ planSnapshot: { discountPercentage: 0 } }),
    items: [{ itemId: "652000000000000000000001", name: "Hair Cut", price: 600, qty: 1 }],
  });

  assert.equal(result.membershipDiscountAmount, 0);
  assert.equal(result.items[0].membershipEligible, true);
  assert.equal(result.items[0].membershipDiscountApplied, false);
  assert.equal(result.items[0].manualDiscountEligible, true);
});

test("membership preview combines membership and manual discounts for a mixed cart", () => {
  const result = controller._private.calculateMembershipPreview({
    membership: membership({
      planSnapshot: {
        allowAdditionalDiscountOnMembershipItems: false,
        allowRewardsOnMembershipItems: false,
      },
    }),
    items: [
      { itemId: "652000000000000000000001", name: "Haircut", price: 500, qty: 1 },
      { itemId: "652000000000000000000002", name: "Hydra Facial", price: 1500, qty: 1 },
    ],
    manualDiscount: { mode: "percent", percent: 10, amount: 200 },
    loyalty: { percentPer100: 5 },
  });

  assert.equal(result.subtotal, 2000);
  assert.equal(result.membershipDiscountAmount, 50);
  assert.equal(result.additionalManualDiscountAmount, 150);
  assert.equal(result.previewPayableAmount, 1800);
  assert.equal(result.estimatedRewardPoints, 67);
  assert.equal(result.items[0].manualDiscountAmount, 0);
  assert.equal(result.items[0].rewardsEligible, false);
  assert.equal(result.items[1].manualDiscountAmount, 150);
  assert.equal(result.items[1].rewardsEligible, true);
});

test("membership preview allows extra discount and rewards on membership services when enabled", () => {
  const result = controller._private.calculateMembershipPreview({
    membership: membership({
      planSnapshot: {
        allowAdditionalDiscountOnMembershipItems: true,
        allowRewardsOnMembershipItems: true,
      },
    }),
    items: [
      { itemId: "652000000000000000000001", name: "Haircut", price: 500, qty: 1 },
      { itemId: "652000000000000000000002", name: "Hydra Facial", price: 1500, qty: 1 },
    ],
    manualDiscount: { mode: "percent", percent: 10, amount: 200 },
    loyalty: { percentPer100: 5 },
  });

  assert.equal(result.membershipDiscountAmount, 50);
  assert.equal(result.additionalManualDiscountAmount, 195);
  assert.equal(result.previewPayableAmount, 1755);
  assert.equal(result.estimatedRewardPoints, 87);
  assert.equal(result.items[0].manualDiscountAmount, 45);
  assert.equal(result.items[0].rewardsEligible, true);
});

test("membership preview calculates mixed carts for all membership benefit flag combinations", () => {
  const scenarios = [
    {
      name: "extra off, rewards off",
      allowAdditionalDiscountOnMembershipItems: false,
      allowRewardsOnMembershipItems: false,
      additionalManualDiscountAmount: 150,
      previewPayableAmount: 1800,
      estimatedRewardPoints: 67,
      membershipItemManualDiscount: 0,
      membershipItemRewardsEligible: false,
    },
    {
      name: "extra on, rewards off",
      allowAdditionalDiscountOnMembershipItems: true,
      allowRewardsOnMembershipItems: false,
      additionalManualDiscountAmount: 195,
      previewPayableAmount: 1755,
      estimatedRewardPoints: 67,
      membershipItemManualDiscount: 45,
      membershipItemRewardsEligible: false,
    },
    {
      name: "extra off, rewards on",
      allowAdditionalDiscountOnMembershipItems: false,
      allowRewardsOnMembershipItems: true,
      additionalManualDiscountAmount: 150,
      previewPayableAmount: 1800,
      estimatedRewardPoints: 90,
      membershipItemManualDiscount: 0,
      membershipItemRewardsEligible: true,
    },
    {
      name: "extra on, rewards on",
      allowAdditionalDiscountOnMembershipItems: true,
      allowRewardsOnMembershipItems: true,
      additionalManualDiscountAmount: 195,
      previewPayableAmount: 1755,
      estimatedRewardPoints: 87,
      membershipItemManualDiscount: 45,
      membershipItemRewardsEligible: true,
    },
  ];

  for (const scenario of scenarios) {
    const result = controller._private.calculateMembershipPreview({
      membership: membership({
        planSnapshot: {
          allowAdditionalDiscountOnMembershipItems:
            scenario.allowAdditionalDiscountOnMembershipItems,
          allowRewardsOnMembershipItems: scenario.allowRewardsOnMembershipItems,
        },
      }),
      items: [
        { itemId: "652000000000000000000001", name: "Haircut", price: 500, qty: 1 },
        { itemId: "652000000000000000000002", name: "Hydra Facial", price: 1500, qty: 1 },
      ],
      manualDiscount: { mode: "percent", percent: 10 },
      loyalty: { percentPer100: 5 },
    });

    assert.equal(result.membershipDiscountAmount, 50, scenario.name);
    assert.equal(
      result.additionalManualDiscountAmount,
      scenario.additionalManualDiscountAmount,
      scenario.name
    );
    assert.equal(result.previewPayableAmount, scenario.previewPayableAmount, scenario.name);
    assert.equal(result.estimatedRewardPoints, scenario.estimatedRewardPoints, scenario.name);
    assert.equal(
      result.items[0].manualDiscountAmount,
      scenario.membershipItemManualDiscount,
      scenario.name
    );
    assert.equal(
      result.items[0].rewardsEligible,
      scenario.membershipItemRewardsEligible,
      scenario.name
    );
  }
});

test("membership preview uses benefit rules override before purchased snapshot", () => {
  const result = controller._private.calculateMembershipPreview({
    membership: membership({
      planSnapshot: {
        allowAdditionalDiscountOnMembershipItems: false,
        allowRewardsOnMembershipItems: false,
      },
      benefitRulesOverride: {
        allowAdditionalDiscountOnMembershipItems: true,
        allowRewardsOnMembershipItems: true,
        benefitSemanticsVersion: "MEMBERSHIP_ITEM_FLAGS_V1",
      },
    }),
    items: [{ itemId: "652000000000000000000001", name: "Haircut", price: 600, qty: 1 }],
    manualDiscount: { mode: "percent", percent: 5 },
    loyalty: { percentPer100: 5 },
  });

  assert.equal(result.membershipDiscountAmount, 60);
  assert.equal(result.additionalManualDiscountAmount, 27);
  assert.equal(result.previewPayableAmount, 513);
  assert.equal(result.estimatedRewardPoints, 25);
  assert.equal(result.items[0].manualDiscountEligible, true);
  assert.equal(result.items[0].rewardsEligible, true);
});

test("membership preview preserves safe legacy benefit semantics without guessing old fields", () => {
  const benefits = controller._private.resolveEffectiveBenefitFlags({
    planSnapshot: {
      applyDiscountOnNonMembershipItems: true,
      rewardsOnNonMembershipItems: true,
      benefitSemanticsVersion: "LEGACY_NON_MEMBERSHIP_FLAGS",
    },
  });

  assert.equal(benefits.allowAdditionalDiscountOnMembershipItems, false);
  assert.equal(benefits.allowRewardsOnMembershipItems, false);
  assert.equal(benefits.benefitSemanticsVersion, "LEGACY_NON_MEMBERSHIP_FLAGS");
  assert.equal(benefits.source, "PURCHASED_SNAPSHOT");
});

test("membership preview resolves explicit benefit override source", () => {
  const benefits = controller._private.resolveEffectiveBenefitFlags({
    planSnapshot: {
      allowAdditionalDiscountOnMembershipItems: false,
      allowRewardsOnMembershipItems: false,
      benefitSemanticsVersion: "MEMBERSHIP_ITEM_FLAGS_V1",
    },
    benefitRulesOverride: {
      allowAdditionalDiscountOnMembershipItems: true,
      allowRewardsOnMembershipItems: false,
      benefitSemanticsVersion: "MEMBERSHIP_ITEM_FLAGS_V1",
    },
  });

  assert.equal(benefits.allowAdditionalDiscountOnMembershipItems, true);
  assert.equal(benefits.allowRewardsOnMembershipItems, false);
  assert.equal(benefits.benefitSemanticsVersion, "MEMBERSHIP_ITEM_FLAGS_V1");
  assert.equal(benefits.source, "BENEFIT_RULES_OVERRIDE");
});

test("membership preview allocates fixed manual discounts only across eligible balances", () => {
  const result = controller._private.calculateMembershipPreview({
    membership: membership({
      planSnapshot: {
        allowAdditionalDiscountOnMembershipItems: false,
        allowRewardsOnMembershipItems: false,
      },
    }),
    items: [
      { itemId: "652000000000000000000001", name: "Haircut", price: 500, qty: 1 },
      { itemId: "652000000000000000000002", name: "Hydra Facial", price: 1500, qty: 1 },
    ],
    manualDiscount: { mode: "amount", amount: 200 },
    loyalty: { percentPer100: 5 },
  });

  assert.equal(result.membershipDiscountAmount, 50);
  assert.equal(result.additionalManualDiscountAmount, 200);
  assert.equal(result.previewPayableAmount, 1750);
  assert.equal(result.items[0].manualDiscountAmount, 0);
  assert.equal(result.items[1].manualDiscountAmount, 200);
});

test("membership preview uses service eligibility override before purchased snapshot", () => {
  const snapshotServiceId = "652000000000000000000001";
  const overrideServiceId = "652000000000000000000002";
  const result = controller._private.calculateMembershipPreview({
    membership: membership({
      serviceEligibilityOverride: {
        eligibleMenuItemIds: [new mongoose.Types.ObjectId(overrideServiceId)],
      },
      planSnapshot: {
        eligibleMenuItemIds: [new mongoose.Types.ObjectId(snapshotServiceId)],
      },
    }),
    items: [
      { itemId: snapshotServiceId, name: "Old Service", price: 600, qty: 1 },
      { itemId: overrideServiceId, name: "Hydra Facial", price: 600, qty: 1 },
    ],
  });

  assert.equal(result.subtotal, 1200);
  assert.equal(result.membershipDiscountAmount, 60);
  assert.equal(result.items[0].membershipEligible, false);
  assert.equal(result.items[1].membershipEligible, true);
});

test("membership preview supports intentionally empty service eligibility override", () => {
  const result = controller._private.calculateMembershipPreview({
    membership: membership({
      serviceEligibilityOverride: {
        eligibleMenuItemIds: [],
      },
    }),
    items: [{ itemId: "652000000000000000000001", name: "Hair Cut", price: 600, qty: 1 }],
  });

  assert.equal(result.membershipDiscountAmount, 0);
  assert.equal(result.items[0].membershipEligible, false);
});

test("membership preview normalizes mobile and lifecycle state", () => {
  const { normalizeMobileInput, getEffectiveMembershipStatus } = controller._private;
  const now = new Date("2026-10-13T00:00:00.000Z");

  assert.equal(normalizeMobileInput("98765 43210"), "919876543210");
  assert.equal(
    getEffectiveMembershipStatus({
      status: "SCHEDULED",
      activatedAt: new Date("2026-11-01T00:00:00.000Z"),
      expiresAt: new Date("2026-12-01T00:00:00.000Z"),
    }, now),
    "SCHEDULED"
  );
  assert.equal(
    getEffectiveMembershipStatus({
      status: "ACTIVE",
      activatedAt: new Date("2026-10-01T00:00:00.000Z"),
      expiresAt: new Date("2026-11-01T00:00:00.000Z"),
    }, now),
    "ACTIVE"
  );
});

test("membership preview route is vendor-authenticated and read-only", () => {
  const routeSource = fs.readFileSync(path.join(__dirname, "../routes/billingRoutes.js"), "utf8");
  const controllerSource = fs.readFileSync(
    path.join(__dirname, "../controllers/membershipBillingPreviewController.js"),
    "utf8"
  );

  assert.match(routeSource, /\/membership-preview/);
  assert.match(routeSource, /requireVendorAccessFromExistingAuth\(resolveVendorBodyOrQueryId\)/);
  assert.doesNotMatch(controllerSource, /\.create\(/);
  assert.doesNotMatch(controllerSource, /\.save\(/);
  assert.doesNotMatch(controllerSource, /BillingSession/);
  assert.doesNotMatch(controllerSource, /Transaction/);
  assert.doesNotMatch(controllerSource, /LoyaltyLedger/);
  assert.doesNotMatch(controllerSource, /WhatsApp|Whatsapp|MSG91/);
});
