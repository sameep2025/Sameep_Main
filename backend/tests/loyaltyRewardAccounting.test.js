const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  getRewardExpiryDate,
  sortRewardCreditBuckets,
  summarizeRewardLedgerRowsForVendor,
} = require("../services/loyaltyService");

const root = path.resolve(__dirname, "..");
const vendorId = "vendor-1";

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function summary(rows, now = new Date("2026-10-01T00:00:00.000Z")) {
  return summarizeRewardLedgerRowsForVendor({
    ledgerRows: rows.map((row, index) => ({
      vendorId,
      createdAt: new Date(2026, 8, index + 1),
      ...row,
    })),
    vendorId,
    now,
  });
}

test("reward accounting blocks redemption while cancelled earned points create a deficit", () => {
  const afterCancel = summary([
    { type: "EARN", points: 100, remainingPoints: 0, expiryDate: "2026-12-01T00:00:00.000Z" },
    { type: "REDEEM", points: -100 },
    { type: "EARN_REVERSAL", points: -100, expiryDate: "2026-12-01T00:00:00.000Z" },
  ]);

  assert.equal(afterCancel.accountingBalance, -100);
  assert.equal(afterCancel.redeemableBalance, 0);
  assert.equal(afterCancel.availablePoints, 0);

  const afterEarn40 = summary([
    { type: "EARN", points: 100, remainingPoints: 0, expiryDate: "2026-12-01T00:00:00.000Z" },
    { type: "REDEEM", points: -100 },
    { type: "EARN_REVERSAL", points: -100, expiryDate: "2026-12-01T00:00:00.000Z" },
    { type: "EARN", points: 40, remainingPoints: 40, expiryDate: "2026-12-01T00:00:00.000Z" },
  ]);

  assert.equal(afterEarn40.accountingBalance, -60);
  assert.equal(afterEarn40.redeemableBalance, 0);

  const afterEarn80More = summary([
    { type: "EARN", points: 100, remainingPoints: 0, expiryDate: "2026-12-01T00:00:00.000Z" },
    { type: "REDEEM", points: -100 },
    { type: "EARN_REVERSAL", points: -100, expiryDate: "2026-12-01T00:00:00.000Z" },
    { type: "EARN", points: 40, remainingPoints: 40, expiryDate: "2026-12-01T00:00:00.000Z" },
    { type: "EARN", points: 80, remainingPoints: 80, expiryDate: "2026-12-01T00:00:00.000Z" },
  ]);

  assert.equal(afterEarn80More.accountingBalance, 20);
  assert.equal(afterEarn80More.redeemableBalance, 20);
});

test("legacy redemption reversals are counted as finite redeemable credits", () => {
  const row = summary([
    { type: "REDEEM", points: -120 },
    {
      type: "REDEEM_REVERSAL",
      points: 120,
      remainingPoints: 120,
      expiryDate: "2026-10-05T00:00:00.000Z",
      metadata: { legacyNoAllocationRestoration: true },
    },
  ]);

  assert.equal(row.accountingBalance, 120);
  assert.equal(row.redeemableBalance, 120);
  assert.equal(row.totalRedeemedPoints, 0);

  const expired = summary([
    {
      type: "REDEEM_REVERSAL",
      points: 120,
      remainingPoints: 120,
      expiryDate: "2026-09-30T00:00:00.000Z",
      metadata: { legacyNoAllocationRestoration: true },
    },
  ]);

  assert.equal(expired.redeemableBalance, 0);
  assert.equal(expired.totalExpiredPoints, 120);
});

test("legacy redemption reversals without stored expiry fall back to seven days from restoration", () => {
  const legacyRestoration = {
    type: "REDEEM_REVERSAL",
    points: 49,
    remainingPoints: 49,
    createdAt: "2026-09-20T00:00:00.000Z",
    metadata: { legacyNoAllocationRestoration: true },
  };

  assert.equal(
    getRewardExpiryDate(legacyRestoration).toISOString(),
    "2026-09-27T00:00:00.000Z"
  );

  const beforeFallbackExpiry = summary([legacyRestoration], new Date("2026-09-26T00:00:00.000Z"));
  assert.equal(beforeFallbackExpiry.redeemableBalance, 49);

  const afterFallbackExpiry = summary([legacyRestoration], new Date("2026-09-28T00:00:00.000Z"));
  assert.equal(afterFallbackExpiry.redeemableBalance, 0);
  assert.equal(afterFallbackExpiry.totalExpiredPoints, 49);
});

test("allocation-backed redeem and earn cancellation returns to the pre-bill balance", () => {
  const row = summary([
    { type: "EARN", points: 200, remainingPoints: 200, expiryDate: "2026-12-01T00:00:00.000Z" },
    { type: "REDEEM", points: -100 },
    { type: "REDEEM_REVERSAL", points: 100, remainingPoints: null },
    { type: "EARN", points: 70, remainingPoints: 70, expiryDate: "2026-12-01T00:00:00.000Z" },
    { type: "EARN_REVERSAL", points: -70, expiryDate: "2026-12-01T00:00:00.000Z" },
  ]);

  assert.equal(row.accountingBalance, 200);
  assert.equal(row.redeemableBalance, 200);
  assert.equal(row.totalEarnedPoints, 200);
  assert.equal(row.totalRedeemedPoints, 0);
});

test("expired credits and expired reversals do not become redeemable", () => {
  const row = summary([
    { type: "EARN", points: 50, remainingPoints: 50, expiryDate: "2026-09-01T00:00:00.000Z" },
    { type: "EARN_REVERSAL", points: -50, expiryDate: "2026-09-01T00:00:00.000Z" },
    {
      type: "REDEEM_REVERSAL",
      points: 40,
      remainingPoints: 40,
      expiryDate: "2026-09-01T00:00:00.000Z",
      metadata: { legacyNoAllocationRestoration: true },
    },
  ]);

  assert.equal(row.accountingBalance, 0);
  assert.equal(row.redeemableBalance, 0);
  assert.equal(row.totalExpiredPoints, 90);
});

test("FIFO bucket ordering consumes expiring credits before non-expiring credits", () => {
  const buckets = [
    { type: "EARN", remainingPoints: 100, expiryDate: null, createdAt: "2026-09-01T00:00:00.000Z" },
    {
      type: "REDEEM_REVERSAL",
      remainingPoints: 120,
      expiryDate: "2026-10-05T00:00:00.000Z",
      createdAt: "2026-09-03T00:00:00.000Z",
      metadata: { legacyNoAllocationRestoration: true },
    },
    { type: "EARN", remainingPoints: 80, expiryDate: "2026-10-10T00:00:00.000Z", createdAt: "2026-09-02T00:00:00.000Z" },
  ].sort(sortRewardCreditBuckets);

  assert.equal(buckets[0].type, "REDEEM_REVERSAL");
  assert.equal(buckets[1].remainingPoints, 80);
  assert.equal(buckets[2].expiryDate, null);
});

test("billing, customer search, and customer portal use the shared reward-balance service", () => {
  const billing = read("controllers/billingController.js");
  const portalRewards = read("controllers/customerPortalRewardsController.js");
  const vendorCustomer = read("controllers/vendorCustomerController.js");
  const loyalty = read("controllers/loyaltyController.js");

  assert.match(billing, /calculateRewardBalance/);
  assert.match(billing, /findConsumableRewardBuckets/);
  assert.match(billing, /rewardBalance\.redeemableBalance\s*<\s*effectiveRedeemPoints/);
  assert.match(billing, /getRewardCreditRemaining\(rewardCredit\)/);

  assert.match(portalRewards, /summarizeRewardLedgerRowsByVendor/);
  assert.match(vendorCustomer, /summarizeRewardLedgerRowsForVendor/);
  assert.match(loyalty, /summarizeRewardLedgerRowsForVendor/);
});

test("cancellation restoration is capped and legacy restoration receives a finite expiry", () => {
  const controller = read("controllers/billingController.js");

  assert.match(controller, /restoreRewardCreditBucket/);
  assert.match(controller, /Math\.min\(currentRemaining \+ restorePoints, cap\)/);
  assert.match(controller, /getCancellationDeadline\(effectiveCompletedAt\)/);
  assert.match(controller, /legacyRestorationExpiryDate/);
  assert.match(controller, /expiryDate: allocations\.length \? null : legacyRestorationExpiryDate \|\| null/);
  assert.match(controller, /expiryDate: ledger\.expiryDate \|\| null/);
});
