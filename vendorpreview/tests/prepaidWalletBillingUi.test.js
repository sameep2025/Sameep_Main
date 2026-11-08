/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app/_Explore/Explore.jsx"), "utf8");
const css = fs.readFileSync(path.join(root, "app/_Explore/ExploreInline.css"), "utf8");
const receiptSource = fs.readFileSync(path.join(root, "app/utils/receiptPrint.js"), "utf8");
const customerSearchSource = fs.readFileSync(
  path.join(root, "app/components/dashboard/CustomerSearch.jsx"),
  "utf8"
);
const publicBillSource = fs.readFileSync(path.join(root, "app/b/[code]/page.jsx"), "utf8");
const gstBillSource = fs.readFileSync(
  path.join(root, "app/components/billing/GstInvoiceDetails.jsx"),
  "utf8"
);

async function loadHelpers() {
  return import("../app/_Explore/prepaidWalletUi.mjs");
}

test("value wallet allows an independent Discount Membership but rejects manual discount combinations", async () => {
  const { getPrepaidWalletQuote } = await loadHelpers();
  const wallet = { walletType: "PREPAID_VALUE", remainingAmountPaise: 1200000 };
  assert.deepEqual(getPrepaidWalletQuote({ wallet, finalPayablePaise: 100000 }), {
    eligible: true,
    paymentMode: "PREPAID_VALUE",
    amountPaise: 100000,
    expectedRemainingAmountPaise: 1100000,
  });
  assert.equal(getPrepaidWalletQuote({ wallet, finalPayablePaise: 1300000 }).eligible, false);
  assert.equal(
    getPrepaidWalletQuote({
      wallet,
      finalPayablePaise: 100000,
      hasDiscountMembership: true,
    }).eligible,
    true
  );
  assert.match(
    getPrepaidWalletQuote({ wallet, finalPayablePaise: 100000, hasManualDiscount: true }).reason,
    /cannot be combined/i
  );
  assert.equal(
    getPrepaidWalletQuote({ wallet, finalPayablePaise: 100000, redeemPoints: 5 }).eligible,
    false
  );
});

test("sessions wallet matches exact canonical identity and supports multiple quantity", async () => {
  const { getPrepaidWalletQuote } = await loadHelpers();
  const wallet = {
    walletType: "PREPAID_SESSIONS",
    remainingQuantity: 6,
    eligibleItem: { itemId: "item-1", itemSource: "custom_package" },
  };
  assert.deepEqual(getPrepaidWalletQuote({
    wallet,
    cartItems: [{ itemId: "item-1", itemSource: "custom_package", qty: 2 }],
  }), {
    eligible: true,
    paymentMode: "PREPAID_SESSIONS",
    quantity: 2,
    expectedRemainingQuantity: 4,
  });
  assert.equal(getPrepaidWalletQuote({
    wallet,
    cartItems: [{ itemId: "item-1", itemSource: "vendor_menu_node", qty: 2 }],
  }).eligible, false);
  assert.equal(getPrepaidWalletQuote({
    wallet,
    cartItems: [
      { itemId: "item-1", itemSource: "custom_package", qty: 1 },
      { itemId: "item-2", itemSource: "custom_package", qty: 1 },
    ],
  }).eligible, false);
});

test("authorization binding changes with customer, cart, quantity, amount, or wallet", async () => {
  const { createPrepaidAuthorizationBinding } = await loadHelpers();
  const base = {
    walletId: "wallet-1",
    customerId: "customer-1",
    cartItems: [{ itemId: "item-1", itemSource: "vendor_menu_node", qty: 1, price: 500 }],
    finalPayablePaise: 50000,
    amountPaise: 50000,
  };
  const binding = createPrepaidAuthorizationBinding(base);
  assert.notEqual(binding, createPrepaidAuthorizationBinding({ ...base, walletId: "wallet-2" }));
  assert.notEqual(binding, createPrepaidAuthorizationBinding({ ...base, customerId: "customer-2" }));
  assert.notEqual(binding, createPrepaidAuthorizationBinding({
    ...base,
    cartItems: [{ ...base.cartItems[0], qty: 2 }],
  }));
  assert.notEqual(binding, createPrepaidAuthorizationBinding({ ...base, finalPayablePaise: 49000 }));
});

test("same-customer selection preserves active wallet requests and safely retries failures", async () => {
  const { getPrepaidWalletSelectionAction } = await loadHelpers();
  for (const walletStatus of ["ready", "loading", "unavailable"]) {
    assert.equal(
      getPrepaidWalletSelectionAction({
        currentCustomerId: "customer-1",
        nextCustomerId: "customer-1",
        walletStatus,
      }),
      "PRESERVE"
    );
  }
  for (const walletStatus of ["idle", "error"]) {
    assert.equal(
      getPrepaidWalletSelectionAction({
        currentCustomerId: "customer-1",
        nextCustomerId: "customer-1",
        walletStatus,
      }),
      "RETRY"
    );
  }
  assert.equal(
    getPrepaidWalletSelectionAction({
      currentCustomerId: "customer-1",
      nextCustomerId: "customer-2",
      walletStatus: "ready",
    }),
    "RESET"
  );
});

test("Quick Billing capability-gates wallet lookup and preserves ordinary payment contract", () => {
  assert.match(source, /walletPaymentAvailable/);
  assert.match(source, /prepaid-wallets\/\$\{encodeURIComponent\(vendorId\)\}\/capabilities/);
  assert.match(source, /paymentMode:\s*prepaidWallet\.walletType/);
  assert.match(source, /prepaidAuthorizationId:\s*authorizationId/);
  assert.match(source, /paymentBreakdown:\s*\{/);
  assert.match(source, /Verify OTP & Complete/);
  assert.match(source, /prepaidAuthorizationBindingRef\.current !== prepaidBinding/);
  assert.match(source, /prepaid_otp_delivery_uncertain/);
  assert.match(source, /payload\?\.authorization\?\.id/);
  assert.match(source, /deliveryStatus === "UNCERTAIN"/);
  assert.match(source, /could not be confirmed\. Enter the code if it arrived/);
  assert.match(source, /"Prepaid Wallet" : "Prepaid Packages"/);
  assert.match(source, /Discount Membership benefits are not applied when prepaid payment is selected/);
  assert.match(source, /const billingDiscount = prepaidSelected \? 0 : appliedDiscount/);
});

test("prepaid controls remain compact on narrow mobile layouts", () => {
  assert.match(css, /\.quick-billing-prepaid-card/);
  assert.match(css, /\.quick-billing-prepaid-otp-actions/);
  assert.match(css, /@media \(max-width: 380px\)/);
  assert.match(css, /min-height:\s*44px/);
});

test("completed prepaid transaction snapshots produce customer-safe receipt presentation", async () => {
  const { buildPrepaidBillPresentation } = await loadHelpers();
  assert.deepEqual(
    buildPrepaidBillPresentation({
      paymentMode: "PREPAID_VALUE",
      snapshot: {
        walletType: "PREPAID_VALUE",
        authorizedAmountPaise: 20000,
        remainingAmountPaiseAfterRedemption: 630000,
        walletId: "internal-wallet-id",
      },
    }),
    {
      paymentMode: "PREPAID_VALUE",
      paymentMethodLabel: "Prepaid Wallet",
      redeemedAmountPaise: 20000,
      remainingAmountPaiseAfterRedemption: 630000,
      balanceDuePaise: 0,
    }
  );

  assert.deepEqual(
    buildPrepaidBillPresentation({
      paymentMode: "PREPAID_SESSIONS",
      snapshot: {
        walletType: "PREPAID_SESSIONS",
        authorizedQuantity: 1,
        remainingQuantityAfterRedemption: 5,
        eligibleItemId: "item-1",
        eligibleItemSource: "custom_package",
      },
      cartItems: [
        {
          itemId: "item-1",
          itemSource: "custom_package",
          name: "Bridal Care Combo",
        },
      ],
    }),
    {
      paymentMode: "PREPAID_SESSIONS",
      paymentMethodLabel: "Prepaid Package",
      redeemedQuantity: 1,
      redeemedItemName: "Bridal Care Combo",
      remainingQuantityAfterRedemption: 5,
      balanceDuePaise: 0,
    }
  );

  const historicalPresentation = buildPrepaidBillPresentation({
    paymentMode: "PREPAID_VALUE",
    snapshot: {
      walletType: "PREPAID_VALUE",
      authorizedAmountPaise: 20000,
    },
  });
  assert.equal("remainingAmountPaiseAfterRedemption" in historicalPresentation, false);
});

test("bill detail, public bill, and print surfaces distinguish prepaid settlement from net collection", () => {
  assert.match(receiptSource, /receiptSnapshot\.status === "CANCELLED" \? "Restored" : "Redeemed"/);
  assert.match(receiptSource, /Prepaid Wallet \$\{prepaidAction\}/);
  assert.match(receiptSource, /Prepaid Package \$\{prepaidAction\}/);
  assert.match(receiptSource, /Balance Due/);
  assert.match(receiptSource, /Remaining Wallet Balance/);
  assert.match(receiptSource, /Remaining Package Sessions/);
  assert.match(customerSearchSource, /Prepaid Restored/);
  assert.match(customerSearchSource, /Prepaid Redeemed/);
  assert.match(customerSearchSource, /Net Collected/);
  assert.match(publicBillSource, /prepaidSettlement/);
  assert.match(publicBillSource, /Balance Due/);
  assert.match(publicBillSource, /remainingAmountPaiseAfterRedemption/);
  assert.match(publicBillSource, /remainingQuantityAfterRedemption/);
  assert.match(gstBillSource, /remainingAmountPaiseAfterRedemption/);
  assert.match(gstBillSource, /remainingQuantityAfterRedemption/);
});
