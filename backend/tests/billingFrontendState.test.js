const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const exploreSource = fs.readFileSync(
  path.join(__dirname, "../../vendorpreview/app/_Explore/Explore.jsx"),
  "utf8"
);

function sourceBetween(start, end) {
  const startIndex = exploreSource.indexOf(start);
  const endIndex = exploreSource.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `Missing source marker: ${start}`);
  assert.notEqual(endIndex, -1, `Missing source marker: ${end}`);
  return exploreSource.slice(startIndex, endIndex);
}

test("Clear Cart uses the complete billing reset and invalidates pending customer data", () => {
  const clearCartSource = sourceBetween("const clearCart = () =>", "const resetBillingState =");
  const resetSource = sourceBetween("const resetBillingState =", "const enterVendorBilling =");

  assert.match(clearCartSource, /resetBillingState/);
  [
    "customerSearchRequestRef.current += 1",
    "customerVerificationRequestRef.current += 1",
    "customerNameRequestRef.current += 1",
    "membershipPreviewRequestRef.current += 1",
    "loyaltyWalletRequestRef.current += 1",
    "setCartItems([])",
    "setCustomerId(null)",
    'setCustomerMobile("")',
    'setCustomerName("")',
    "setAvailablePoints(0)",
    "setRedeemPoints(0)",
    "setMembershipPreview(null)",
    "setDiscountAmount(0)",
    'setPaymentMode("ONLINE")',
  ].forEach((expected) => assert.ok(resetSource.includes(expected), expected));
});

test("entering Billing resets once while remaining in Billing preserves the form", () => {
  const entrySource = sourceBetween("const enterVendorBilling =", "useEffect(() => {");

  assert.match(entrySource, /previousViewModeRef\.current !== "menu"/);
  assert.match(entrySource, /resetBillingState\(\{ nextCartOrigin: CART_ORIGIN_BILLING \}\)/);
  assert.match(entrySource, /persistViewMode\("menu"\)/);
});

test("customer selection refreshes wallet and wallet failures are not presented as zero", () => {
  const selectionSource = sourceBetween(
    "const selectBillingCustomerSearchResult =",
    "const renderBillingCustomerSearch ="
  );
  const walletSource = sourceBetween("async function fetchWallet", "async function verifyCustomer");

  assert.match(selectionSource, /fetchWallet\(result\.customerId, nextMobile\)/);
  assert.match(walletSource, /loyaltyWalletRequestRef\.current !== requestId/);
  assert.match(walletSource, /String\(vendorIdRef\.current \|\| ""\) !== expectedVendorId/);
  assert.match(walletSource, /!res\.ok \|\| !wallet\?\.success/);
  assert.match(walletSource, /setLoyaltyWalletStatus\("ready"\)/);
  assert.match(walletSource, /setLoyaltyWalletStatus\("error"\)/);
  assert.match(exploreSource, /loyaltyWalletStatus === "error"/);
  assert.match(exploreSource, /Retry points lookup/);
});

test("membership preview sends redemption and refreshes loyalty estimates when it changes", () => {
  const previewEffect = sourceBetween(
    "const requestId = membershipPreviewRequestRef.current + 1",
    "/*\n  const saveLoyaltyRule"
  );
  const earnHelper = sourceBetween(
    "const getAuthoritativeEarnPoints = () =>",
    "const handleBillingCustomerInputChange ="
  );

  assert.match(previewEffect, /redemption:\s*\{\s*amount: redeemPoints/);
  assert.match(previewEffect, /percentPer100,\s*redeemPoints,\s*membershipPreviewRetryNonce/);
  assert.match(earnHelper, /membershipPreview\?\.hasEffectiveMembership/);
  assert.match(earnHelper, /preview\?\.estimatedRewardPoints/);
  assert.match(earnHelper, /finalTotal[\s\S]*redeemPoints/);
});

test("Billing discount summaries use a defined qualifying-membership predicate", () => {
  const helperSource = sourceBetween(
    "const hasQualifyingMembershipPreview = () =>",
    "const getAuthoritativeCartTotal ="
  );
  const evaluate = new Function(
    "membershipPreview",
    `${helperSource}; return hasQualifyingMembershipPreview();`
  );
  const helperCalls = exploreSource.match(/hasQualifyingMembershipPreview\(\)/g) || [];

  assert.equal(helperCalls.length, 2, "expected desktop and mobile render calls");
  assert.equal(evaluate(null), false);
  assert.equal(evaluate({
    hasEffectiveMembership: true,
    preview: { qualifiesForMinimum: false, membershipDiscountAmount: 0 },
  }), false);
  assert.equal(evaluate({
    hasEffectiveMembership: true,
    preview: { qualifiesForMinimum: true, membershipDiscountAmount: 50 },
  }), true);
});
