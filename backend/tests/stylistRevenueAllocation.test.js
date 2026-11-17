const assert = require("node:assert/strict");
const test = require("node:test");

const vendorDashboardController = require("../controllers/vendorDashboardController");
const {
  StylistRevenueAllocationError,
  reconcileStylistBillRevenue,
} = require("../services/stylistRevenueAllocationService");

function item(total, overrides = {}) {
  return {
    name: overrides.name || "Service",
    qty: overrides.qty ?? 1,
    total,
    resourceId: overrides.resourceId || null,
    resourceName: overrides.resourceName || "",
    ...overrides,
  };
}

function reconcile({ discountAmount, items, breakdown, bill = {} }) {
  return reconcileStylistBillRevenue({
    bill: { discountAmount, cartItems: items, ...bill },
    lineBreakdown: breakdown || items.map((entry) => ({ item: entry })),
  });
}

test("allocates a fixed manual discount proportionally across multiple stylists", () => {
  const items = [item(500, { resourceName: "A" }), item(1500, { resourceName: "B" }), item(1000, { resourceName: "C" })];
  const result = reconcile({ discountAmount: 300, items });

  assert.deepEqual(result.lines.map((line) => line.allocatedDiscounts), [50, 150, 100]);
  assert.deepEqual(result.lines.map((line) => line.netRevenue), [450, 1350, 900]);
  assert.deepEqual(result.totals, {
    grossRevenue: 3000,
    allocatedDiscounts: 300,
    netRevenue: 2700,
  });
});

test("manual percentage snapshots reconcile for single and repeated stylist assignments", () => {
  const items = [
    item(400, { resourceName: "A" }),
    item(600, { resourceName: "A" }),
  ];
  const result = reconcile({
    discountAmount: 100,
    items,
    bill: { manualDiscountMode: "percent", manualDiscountPercent: 10 },
  });

  assert.deepEqual(result.lines.map((line) => line.allocatedDiscounts), [40, 60]);
  assert.equal(result.totals.netRevenue, 900);
});

test("preserves membership line discounts and allocates only the residual bill discount", () => {
  const items = [item(600), item(400)];
  const result = reconcile({
    discountAmount: 160,
    items,
    breakdown: [
      { item: items[0], existingDiscountAmount: 60, finalLineAmount: 540 },
      { item: items[1] },
    ],
  });

  assert.equal(result.totals.allocatedDiscounts, 160);
  assert.equal(result.totals.netRevenue, 840);
  assert.equal(result.lines[0].allocatedDiscounts + result.lines[1].allocatedDiscounts, 160);
});

test("does not allocate residual discounts to explicitly ineligible lines", () => {
  const items = [item(500), item(500)];
  const result = reconcile({
    discountAmount: 100,
    items,
    breakdown: [
      { item: items[0], manualDiscountEligible: true },
      { item: items[1], manualDiscountEligible: false },
    ],
  });

  assert.deepEqual(result.lines.map((line) => line.allocatedDiscounts), [100, 0]);
});

test("allocates paise deterministically and preserves exact reconciliation", () => {
  const items = [item(1), item(1), item(1)];
  const result = reconcile({ discountAmount: 1, items });

  assert.deepEqual(result.lines.map((line) => line.allocatedDiscounts), [0.34, 0.33, 0.33]);
  assert.equal(result.totals.grossRevenue, 3);
  assert.equal(result.totals.allocatedDiscounts, 1);
  assert.equal(result.totals.netRevenue, 2);
});

test("loyalty redemption and prepaid settlement are not stylist discounts", () => {
  for (const paymentMode of ["CASH", "PREPAID_VALUE", "PREPAID_SESSIONS"]) {
    const items = [item(500)];
    const result = reconcile({
      discountAmount: 0,
      items,
      bill: {
        paymentMode,
        pointsRedeemed: 200,
        prepaidSettlementSnapshot: { walletType: paymentMode },
      },
    });
    assert.equal(result.totals.allocatedDiscounts, 0);
    assert.equal(result.totals.netRevenue, 500);
  }
});

test("uses exact GST line discount snapshots for inclusive and exclusive bills", () => {
  for (const pricingMode of ["inclusive", "exclusive"]) {
    const bill = {
      discountAmount: 100,
      cartItems: [item(400), item(600)],
      gstInvoiceSnapshot: {
        pricingMode,
        items: [
          { totalDiscountPaise: 4000 },
          { totalDiscountPaise: 6000 },
        ],
      },
    };
    const breakdown = vendorDashboardController._private.buildReportItemBreakdown(bill, new Map());
    const result = reconcileStylistBillRevenue({ bill, lineBreakdown: breakdown.lines });
    assert.deepEqual(result.lines.map((line) => line.allocatedDiscounts), [40, 60]);
    assert.equal(result.totals.netRevenue, 900);
  }
});

test("historical bills without item allocations reconcile from bill-level snapshots", () => {
  const bill = {
    discountAmount: 250,
    cartItems: [item(1000), item(1500)],
  };
  const breakdown = vendorDashboardController._private.buildReportItemBreakdown(bill, new Map());
  const result = reconcileStylistBillRevenue({ bill, lineBreakdown: breakdown.lines });

  assert.deepEqual(result.lines.map((line) => line.allocatedDiscounts), [100, 150]);
  assert.equal(result.totals.netRevenue, 2250);
});

test("fails closed for conflicting or unreconstructable historical allocations", () => {
  const items = [item(100)];
  assert.throws(
    () => reconcile({
      discountAmount: 10,
      items,
      breakdown: [{ item: items[0], existingDiscountAmount: 5, finalLineAmount: 90 }],
    }),
    (error) => error instanceof StylistRevenueAllocationError && error.code === "line_discount_conflict"
  );
  assert.throws(
    () => reconcileStylistBillRevenue({
      bill: { discountAmount: 10 },
      lineBreakdown: [{ item: items[0] }],
      membershipAllocationUnavailable: true,
    }),
    (error) => error.code === "membership_allocation_unavailable"
  );
});

test("aggregate regression reconciles 47370 gross and 2730 discounts to 44640 net", () => {
  const result = reconcile({
    discountAmount: 2730,
    items: [item(46810), item(560)],
    breakdown: [
      { item: item(46810) },
      { item: item(560), existingDiscountAmount: 560, finalLineAmount: 0 },
    ],
  });

  assert.equal(result.totals.grossRevenue, 47370);
  assert.equal(result.totals.allocatedDiscounts, 2730);
  assert.equal(result.totals.netRevenue, 44640);
});

test("Today and MTD stylist ranges use Asia/Kolkata boundaries", () => {
  const now = new Date("2026-11-17T20:00:00.000Z");
  const today = vendorDashboardController._private.resolveStylistReportingRange({ range: "today" }, now);
  const mtd = vendorDashboardController._private.resolveStylistReportingRange({ range: "mtd" }, now);

  assert.equal(today.startDate.toISOString(), "2026-11-17T18:30:00.000Z");
  assert.equal(mtd.startDate.toISOString(), "2026-10-31T18:30:00.000Z");
});
