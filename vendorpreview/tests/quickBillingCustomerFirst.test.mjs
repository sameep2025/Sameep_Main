import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  getQuickBillingCustomerSearchPlacement,
  normalizeQuickBillingCustomerSearch,
  validateQuickBillingCustomerSearch,
} from "../app/_Explore/quickBillingCustomerUi.mjs";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dirname, "..");
const source = fs.readFileSync(path.join(root, "app/_Explore/Explore.jsx"), "utf8");
const css = fs.readFileSync(path.join(root, "app/_Explore/ExploreInline.css"), "utf8");

test("customer-first search normalizes Indian mobile numbers and rejects invalid input", () => {
  assert.deepEqual(normalizeQuickBillingCustomerSearch("+91 98765 43210"), {
    query: "+91 98765 43210",
    isPhoneInput: true,
    mobile: "9876543210",
  });
  assert.equal(validateQuickBillingCustomerSearch("9876543210").valid, true);
  assert.equal(validateQuickBillingCustomerSearch("98765").valid, false);
  assert.equal(validateQuickBillingCustomerSearch("").valid, false);
  assert.equal(validateQuickBillingCustomerSearch("A").valid, false);
  assert.equal(validateQuickBillingCustomerSearch("Advik").valid, true);
});

test("one customer search is placed before services or in the service-first cart", () => {
  assert.deepEqual(getQuickBillingCustomerSearchPlacement({ cartItemCount: 0 }), {
    customerFirst: true,
    cart: false,
  });
  assert.deepEqual(getQuickBillingCustomerSearchPlacement({ cartItemCount: 2 }), {
    customerFirst: false,
    cart: true,
  });
  assert.deepEqual(
    getQuickBillingCustomerSearchPlacement({ cartItemCount: 2, customerId: "customer-1" }),
    { customerFirst: true, cart: false }
  );
  assert.deepEqual(
    getQuickBillingCustomerSearchPlacement({ cartItemCount: 2, customerFirstPinned: true }),
    { customerFirst: true, cart: false }
  );
});

test("customer-first UI reuses authenticated lookup and existing customer state", () => {
  assert.match(source, /Customer Search <span>\(Optional\)<\/span>/);
  assert.match(source, /api\/vendor\/dashboard\/customer\?\$\{params\.toString\(\)\}/);
  assert.match(source, /Authorization:\s*`Bearer \$\{vendorToken\}`/);
  assert.match(source, /selectBillingCustomerSearchResult\(result\)/);
  assert.match(source, /fetchPrepaidWallet\(customerId\)/);
  assert.match(source, /renderPrepaidPackageShortcuts\(\)/);
  assert.match(source, /customerSearchPlacement\.customerFirst/);
  assert.match(source, /customerSearchPlacement\.cart/);
  assert.match(source, /normalizedCustomerSearch\.mobile/);
  assert.match(source, /No existing customer found/);
});

test("customer changes and cart clearing preserve the intended safety boundaries", () => {
  assert.match(source, /customerSearchRequestRef\.current \+= 1/);
  assert.match(source, /prepaidWalletRequestRef\.current \+= 1/);
  assert.match(source, /handleBillingCustomerInputChange\(""\)/);
  assert.match(source, /preserveBillingCustomer/);
  assert.match(source, /setPrepaidWallet\(null\)/);
  assert.match(source, /clearPrepaidAuthorization\(\)/);
  assert.match(source, /setSelectedPaymentMode\("STANDARD"\)/);
});

test("customer-first controls remain compact on mobile without changing sticky cart", () => {
  assert.match(css, /\.quick-billing-customer-search-row/);
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\) auto/);
  assert.match(css, /\.quick-billing-customer-summary/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.quick-billing-customer-summary/);
  assert.match(css, /\.menu-mobile-cart-pill/);
});
