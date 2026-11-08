import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  formatPrepaidActivityValue,
  formatPrepaidPaise,
  getMembershipTypeLabel,
  getPrepaidActivityLabel,
  getPrepaidActivityTone,
  getPrepaidStatusClass,
  getPrepaidStatusLabel,
  isPrepaidMembership,
  mergePrepaidActivityItems,
} from "../src/app/mybills/prepaidMembershipUi.mjs";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(dirname, "..");
const page = fs.readFileSync(path.join(webRoot, "src/app/mybills/page.js"), "utf8");
const css = fs.readFileSync(path.join(webRoot, "src/styles/globals.css"), "utf8");

function compactCurrency(value) {
  return value.replace(/\s/g, "");
}

test("prepaid value formatting converts integer paise without changing balances", () => {
  assert.equal(compactCurrency(formatPrepaidPaise(95000)), "₹950");
  assert.equal(compactCurrency(formatPrepaidPaise(95050)), "₹950.50");
  assert.equal(formatPrepaidPaise(1.5), "-");
  assert.equal(formatPrepaidPaise(-1), "-");
  assert.equal(
    formatPrepaidActivityValue({ eventType: "CREDIT", amountPaise: 120000 }),
    `+${formatPrepaidPaise(120000)}`
  );
});

test("both prepaid types and all backend wallet statuses have explicit UI handling", () => {
  assert.equal(isPrepaidMembership({ membershipType: "PREPAID_VALUE" }), true);
  assert.equal(isPrepaidMembership({ membershipType: "PREPAID_SESSIONS" }), true);
  assert.equal(isPrepaidMembership({ membershipType: "DISCOUNT" }), false);
  assert.equal(getMembershipTypeLabel("DISCOUNT"), "Discount Membership");
  assert.equal(getMembershipTypeLabel("PREPAID_VALUE"), "Prepaid Wallet");
  assert.equal(getMembershipTypeLabel("PREPAID_SESSIONS"), "Prepaid Packages");

  const expected = {
    ACTIVE: ["ACTIVE", "active"],
    SCHEDULED: ["SCHEDULED", "scheduled"],
    DEPLETED: ["EXHAUSTED", "exhausted"],
    EXHAUSTED: ["EXHAUSTED", "exhausted"],
    EXPIRED: ["EXPIRED", "expired"],
    CANCELLED: ["CANCELLED", "cancelled"],
  };
  Object.entries(expected).forEach(([status, [label, className]]) => {
    assert.equal(getPrepaidStatusLabel(status), label);
    assert.equal(getPrepaidStatusClass(status), className);
  });
});

test("activity labels, session quantities, and pagination merging are deterministic", () => {
  assert.equal(getPrepaidActivityLabel("CREDIT"), "Credited");
  assert.equal(getPrepaidActivityLabel("REDEMPTION"), "Redeemed");
  assert.equal(
    getPrepaidActivityLabel("CANCELLATION_REVERSAL"),
    "Restored after bill cancellation"
  );
  assert.equal(getPrepaidActivityLabel("EXPIRY"), "Expired");
  assert.equal(formatPrepaidActivityValue({ eventType: "CREDIT", quantity: 1 }), "+1 session");
  assert.equal(formatPrepaidActivityValue({ eventType: "REDEMPTION", quantity: 3 }), "−3 sessions");
  assert.equal(
    compactCurrency(formatPrepaidActivityValue({ eventType: "REDEMPTION", amountPaise: 20000 })),
    "−₹200"
  );
  assert.equal(
    compactCurrency(formatPrepaidActivityValue({ eventType: "CANCELLATION_REVERSAL", amountPaise: 20000 })),
    "+₹200"
  );
  assert.equal(getPrepaidActivityTone("CREDIT"), "incoming");
  assert.equal(getPrepaidActivityTone("CANCELLATION_REVERSAL"), "incoming");
  assert.equal(getPrepaidActivityTone("REDEMPTION"), "redeemed");
  assert.equal(getPrepaidActivityTone("EXPIRY"), "neutral");
  assert.deepEqual(
    mergePrepaidActivityItems(
      [{ id: "one", eventType: "CREDIT" }],
      [{ id: "one", eventType: "CREDIT" }, { id: "two", eventType: "REDEMPTION" }]
    ).map((entry) => entry.id),
    ["one", "two"]
  );
});

test("Memberships tab preserves Discount cards and vendor grouping while adding prepaid cards", () => {
  assert.match(page, /group\.memberships \|\| \[\]\)\.map\(\(membership\) =>/);
  assert.match(page, /if \(isPrepaidMembership\(membership\)\)/);
  assert.match(page, /key=\{`\$\{token\}:\$\{membership\.id\}`\}/);
  assert.match(page, /membership\.discountPercentage/);
  assert.match(page, /View Benefits/);
  assert.match(page, /Eligible services/);
  assert.match(page, /portalMembershipVendorHeader/);
  assert.match(page, /portalMembershipType/);
  assert.match(page, /getMembershipTypeLabel\(membership\.membershipType\)/);
});

test("prepaid cards render backend balances, independent renewals, and package inclusions", () => {
  for (const field of [
    "remainingAmountPaise",
    "creditedAmountPaise",
    "consumedAmountPaise",
    "paidAmountPaise",
    "bonusAmountPaise",
    "remainingQuantity",
    "creditedQuantity",
    "consumedQuantity",
    "purchasedQuantity",
  ]) {
    assert.match(page, new RegExp(`wallet(?:\\?\\.|\\.)${field}`));
  }
  assert.match(page, /item\.itemType === "PACKAGE" && item\.packageIncludes/);
  assert.match(page, /View package inclusions/);
  assert.match(page, /item\.categoryPath\.join\(" \/ "\)/);
  assert.doesNotMatch(page, /eligibleItem\??\.name\s*===|item\??\.name\s*===/);
});

test("activity is lazy, authenticated, paginated, concurrency-safe, and session-scoped", () => {
  assert.match(page, /View Activity/);
  assert.match(
    page,
    /\/api\/customer-portal\/memberships\/\$\{encodeURIComponent\(membership\.id\)\}\/activity/
  );
  assert.match(page, /\{ token \}/);
  assert.doesNotMatch(page, /customerId.*activity|activity.*customerId/);
  assert.match(page, /requestInFlightRef\.current/);
  assert.match(page, /requestContextRef\.current !== contextAtRequest/);
  assert.match(page, /params\.set\("cursor", cursor\)/);
  assert.match(page, /Load More/);
  assert.match(page, /Loading activity/);
  assert.match(page, /No wallet activity recorded yet/);
  assert.match(page, /Unable to load membership activity/);
  assert.match(page, /setActivity\(\{[\s\S]*items: \[\][\s\S]*loaded: false/);
});

test("Bills, Rewards, scratch cards, and existing portal tabs remain present", () => {
  assert.match(page, /<BillsTab token=\{token\}/);
  assert.match(page, /<RewardsTab token=\{token\}/);
  assert.match(page, /NewRewardScratchCard/);
  assert.match(page, />\s*Bills\s*</);
  assert.match(page, />\s*Rewards\s*</);
  assert.match(page, />\s*Memberships\s*</);
});

test("prepaid membership and activity layouts remain compact on mobile", () => {
  assert.match(css, /\.portalPrepaidBalance[\s\S]*overflow-wrap: anywhere/);
  assert.match(css, /\.portalPrepaidActivity li[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.portalPrepaidBalance/);
  assert.match(css, /\.portalMembershipStatus\.exhausted/);
  assert.match(css, /\.portalMembershipStatus\.cancelled/);
});
