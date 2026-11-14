/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(
  path.join(root, "app/components/dashboard/MembershipPlansDashboard.jsx"),
  "utf8"
);
const css = fs.readFileSync(
  path.join(root, "app/components/dashboard/MembershipPlansDashboard.css"),
  "utf8"
);
const activityPresentationPath = path.join(
  root,
  "app/components/dashboard/prepaidActivityPresentation.mjs"
);
const renewalUiPath = path.join(
  root,
  "app/components/dashboard/membershipRenewalUi.mjs"
);
const eligibilityCoveragePath = path.join(
  root,
  "app/components/dashboard/membershipEligibilityCoverage.mjs"
);
const renewalUiSource = fs.readFileSync(renewalUiPath, "utf8");

test("Discount remains the default and prepaid types are server-capability gated", () => {
  assert.match(source, /planType:\s*"DISCOUNT"/);
  assert.match(source, /plansJson\.capabilities\?\.prepaidMembershipWallets === true/);
  assert.match(source, /itemsJson\.capabilities\?\.prepaidMembershipWallets === true/);
  assert.match(source, /disabled=\{Boolean\(editingPlanId\)\}/);
  assert.match(source, /Membership type cannot be changed after creation/);
});

test("membership types use accessible responsive cards with consistent labels", () => {
  assert.match(source, /className="membership-type-selector"/);
  assert.match(source, /type="radio"/);
  assert.match(source, /name="membershipPlanType"/);
  assert.match(source, /checked=\{selected\}/);
  assert.match(source, /updateForm\("planType", option\.value\)/);
  assert.match(source, /Discount Membership/);
  assert.match(source, /Prepaid Wallet/);
  assert.match(source, /Prepaid Packages/);
  assert.match(source, /Offer special discounts on eligible services/);
  assert.match(source, /Pay ₹5,000, get ₹6,500/);
  assert.match(source, /5 facials for ₹3,000/);
  assert.match(css, /\.membership-type-card-grid[\s\S]*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.membership-type-card\.selected[\s\S]*border-color:\s*#e6c37a/);
  assert.match(css, /\.membership-type-card:focus-within/);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*\.membership-type-card-grid[\s\S]*grid-template-columns:\s*1fr/);
});

test("prepaid plan forms use canonical item identity and display calculated benefits", () => {
  assert.match(source, /prepaidValueConfig/);
  assert.match(source, /bonusValue:/);
  assert.match(source, /eligibleItemId:\s*form\.eligibleItemId/);
  assert.match(source, /eligibleItemSource:\s*form\.eligibleItemSource/);
  assert.match(source, /Package Includes:/);
  assert.match(source, /Bonus sessions/);
  assert.match(source, /Offers and unclassified items cannot be selected/);
});

test("prepaid sessions reuse the membership tree as a canonical single-item selector", () => {
  assert.match(source, /function buildPrepaidEligibleTree/);
  assert.match(source, /getPrepaidItemKey\(item\)/);
  assert.match(source, /selectionMode="single"/);
  assert.match(source, /type="radio"/);
  assert.match(source, /single-selected/);
  assert.match(source, /eligibleItemId: String\(item\.itemId/);
  assert.match(source, /eligibleItemSource: String\(item\.itemSource/);
  assert.match(source, /Search service, package or category/);
  assert.match(source, /Choosing another item replaces it/);
  assert.match(source, /const nextForm = normalizeFormFromPlan\(plan\)/);
  assert.match(source, /setForm\(nextForm\)/);
  assert.match(source, /selectedPrepaidItemKeys/);
  assert.doesNotMatch(source, /Select an eligible item/);
});

test("prepaid selector exposes the complete verified item set without frontend slicing", () => {
  assert.match(source, /buildPrepaidEligibleTree\(prepaidEligibleItems\)/);
  assert.match(source, /itemKind: item\.itemKind/);
  assert.match(source, /packageIncludes/);
  assert.doesNotMatch(source, /prepaidEligibleItems\.slice/);
  assert.match(css, /\.membership-service-list[\s\S]*overflow-y:\s*auto/);
  assert.match(css, /\.membership-editor-footer[\s\S]*position:\s*sticky/);
});

test("membership eligibility coverage counts complete unique canonical items", async () => {
  const { getMembershipEligibilityCoverage } = await import(eligibilityCoveragePath);
  const standardItems = [
    { id: "regular", sourceType: "vendor_price_node" },
    { id: "premium", sourceType: "vendor_price_node" },
    { id: "ammonia", sourceType: "vendor_price_node" },
    { id: "ammonia", sourceType: "vendor_price_node" },
  ];
  const prepaidItems = [
    { itemId: "regular", itemSource: "vendor_price_node" },
    { itemId: "premium", itemSource: "vendor_price_node" },
    { itemId: "premium", itemSource: "vendor_price_node" },
  ];

  assert.deepEqual(getMembershipEligibilityCoverage({
    standardItems,
    discountItems: standardItems,
    prepaidItems,
  }), {
    standardMenu: 3,
    discountEligible: 3,
    prepaidEligible: 2,
  });
  assert.match(source, /Membership service coverage/);
  assert.match(source, /eligibilityCoverage\.standardMenu/);
  assert.match(source, /eligibilityCoverage\.discountEligible/);
  assert.match(source, /eligibilityCoverage\.prepaidEligible/);
  assert.match(css, /\.membership-eligibility-coverage[\s\S]*repeat\(3, minmax\(0, 1fr\)\)/);
});

test("prepaid enrollment and renewal are idempotent and prevent duplicate submits", () => {
  assert.match(source, /createIdempotencyKey\("membership-enrollment"\)/);
  assert.match(source, /createIdempotencyKey\("membership-renewal"\)/);
  assert.match(source, /\{ idempotencyKey: activationForm\.idempotencyKey \}/);
  assert.match(source, /\{ idempotencyKey: renewalForm\.idempotencyKey \}/);
  assert.match(source, /disabled=\{activationSaving \|\| !selectedActivationPlan\}/);
  assert.match(source, /disabled=\{renewalSaving \|\| !selectedRenewalPlan\}/);
});

test("membership views distinguish loading, empty and error states", () => {
  assert.match(source, /membership-loading-state/);
  assert.match(source, /plansLoadError/);
  assert.match(source, /membershipsLoadError/);
  assert.match(source, /role="status"/);
  assert.match(source, /No membership plans yet/);
  assert.match(source, /No customer memberships activated yet/);
  assert.match(css, /\.membership-loading-spinner/);
});

test("prepaid renewal UI allows only depleted or expired balances", async () => {
  const { getMembershipRenewalAvailability } = await import(renewalUiPath);
  assert.equal(getMembershipRenewalAvailability({
    membershipType: "PREPAID_VALUE",
    status: "ACTIVE",
    wallet: { remainingAmountPaise: 1 },
  }).allowed, false);
  assert.equal(getMembershipRenewalAvailability({
    membershipType: "PREPAID_VALUE",
    status: "ACTIVE",
    wallet: { remainingAmountPaise: 0 },
  }).allowed, true);
  assert.deepEqual(getMembershipRenewalAvailability({
    membershipType: "PREPAID_VALUE",
    status: "DEPLETED",
    wallet: { remainingAmountPaise: 0 },
    renewal: {
      allowed: false,
      reason: "A newer prepaid membership is already active.",
    },
  }), {
    allowed: false,
    reason: "A newer prepaid membership is already active.",
    code: "",
  });
  assert.equal(getMembershipRenewalAvailability({
    membershipType: "PREPAID_SESSIONS",
    status: "DEPLETED",
    wallet: { remainingQuantity: 0 },
  }).allowed, true);
  assert.equal(getMembershipRenewalAvailability({
    membershipType: "PREPAID_VALUE",
    status: "EXPIRED",
  }).allowed, true);
  assert.match(renewalUiSource, /Renewal is available after the current wallet balance is exhausted/);
  assert.match(source, /<option value="DEPLETED">Depleted<\/option>/);
  assert.doesNotMatch(source, /prepaid_renewal_successor_exists/);
});

test("customer membership list is compact and supports type-first filtering", () => {
  assert.match(source, /<span>Membership type<\/span>/);
  assert.match(source, /All Memberships/);
  assert.match(source, /Discount Memberships/);
  assert.match(source, /Prepaid Packages/);
  assert.match(source, /Prepaid Wallets/);
  assert.match(source, /params\.set\("membershipType", membershipTypeFilter\)/);
  assert.match(source, /membership-customer-summary/);
  assert.match(source, /View Details/);
  assert.match(css, /\.membership-customer-card/);
  assert.match(css, /\.membership-customer-summary/);
});

test("wallet details and mobile layout use authenticated response values", () => {
  assert.match(source, /setSelectedMembershipWallet\(json\.wallet \|\| null\)/);
  assert.match(source, /json\.walletLedger/);
  assert.match(source, /remainingAmountPaise/);
  assert.match(source, /remainingQuantity/);
  assert.match(source, /Scheduled credits are unavailable before that date/);
  assert.match(css, /\.membership-wallet-summary/);
  assert.match(css, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
});

test("wallet activity derives signs and neutral tones from canonical ledger types", async () => {
  const {
    formatPrepaidActivityValue,
    getPrepaidActivityPresentation,
  } = await import(activityPresentationPath);
  const compact = (value) => value.replace(/\s/g, "");

  assert.equal(compact(formatPrepaidActivityValue({ eventType: "CREDIT", amountPaise: 650000 })), "+₹6,500");
  assert.equal(compact(formatPrepaidActivityValue({ eventType: "REDEMPTION", amountPaise: 20000 })), "−₹200");
  assert.equal(compact(formatPrepaidActivityValue({ eventType: "CANCELLATION_REVERSAL", amountPaise: 20000 })), "+₹200");
  assert.equal(formatPrepaidActivityValue({ eventType: "REDEMPTION", quantity: 1 }), "−1 session");
  assert.equal(getPrepaidActivityPresentation("CREDIT").tone, "incoming");
  assert.equal(getPrepaidActivityPresentation("CANCELLATION_REVERSAL").tone, "incoming");
  assert.equal(getPrepaidActivityPresentation("REDEMPTION").tone, "redeemed");
  assert.equal(getPrepaidActivityPresentation("REDEMPTION").label, "Redeemed");
  assert.match(source, /getPrepaidActivityPresentation\(entry\.eventType\)/);
  assert.match(css, /\.membership-wallet-activity-amount\.incoming/);
  assert.match(css, /\.membership-wallet-activity-amount\.redeemed/);
});
