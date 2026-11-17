import assert from "node:assert/strict";
import test from "node:test";

import {
  createMembershipPreviewRequestKey,
  getMembershipVerificationGate,
  resolveSelectedDiscountMembershipId,
} from "../app/_Explore/membershipVerificationUi.mjs";

const baseKeyInput = {
  vendorId: "vendor-1",
  customerId: "customer-1",
  customerMobile: "9876543210",
  cartItems: [{
    itemId: "service-1",
    name: "Haircut",
    price: 500,
    qty: 1,
    itemSource: "vendor_menu_node",
    resourceId: "stylist-1",
    resourceName: "Stylist One",
  }],
  discountMode: null,
  appliedDiscount: 0,
  discountPercent: 0,
  percentPer100: 5,
  redeemPoints: 0,
  selectedDiscountMembershipId: "",
  prepaidSelected: false,
};

test("membership verification blocks immediate and delayed standard billing until resolved", () => {
  const missing = getMembershipVerificationGate({
    customerId: "customer-1",
    cartItemCount: 1,
    preview: null,
    loading: false,
  });
  assert.equal(missing.pending, true);
  assert.equal(missing.blocked, true);

  const loading = getMembershipVerificationGate({
    customerId: "customer-1",
    cartItemCount: 1,
    preview: null,
    loading: true,
  });
  assert.equal(loading.pending, true);
  assert.equal(loading.blocked, true);

  const noMembership = getMembershipVerificationGate({
    customerId: "customer-1",
    cartItemCount: 1,
    preview: { hasEffectiveMembership: false, selectionRequired: false },
  });
  assert.equal(noMembership.pending, false);
  assert.equal(noMembership.blocked, false);
});

test("membership verification fails closed and preserves explicit multiple-membership selection", () => {
  const failed = getMembershipVerificationGate({
    customerId: "customer-1",
    cartItemCount: 1,
    error: "Request failed",
  });
  assert.equal(failed.failed, true);
  assert.equal(failed.blocked, true);

  const unresolved = getMembershipVerificationGate({
    customerId: "customer-1",
    cartItemCount: 1,
    preview: { hasEffectiveMembership: true, selectionRequired: true },
    discountMembershipCount: 2,
    selectedDiscountMembershipId: "",
  });
  assert.equal(unresolved.selectionRequired, true);
  assert.equal(unresolved.blocked, true);

  const selected = getMembershipVerificationGate({
    customerId: "customer-1",
    cartItemCount: 1,
    preview: { hasEffectiveMembership: true, selectionRequired: false },
    discountMembershipCount: 2,
    selectedDiscountMembershipId: "membership-2",
  });
  assert.equal(selected.blocked, false);
});

test("explicit prepaid settlement is not blocked by Discount Membership verification", () => {
  const gate = getMembershipVerificationGate({
    customerId: "customer-1",
    cartItemCount: 1,
    prepaidSelected: true,
    preview: null,
    loading: true,
    error: "Old discount preview failed",
  });
  assert.deepEqual(gate, {
    required: false,
    pending: false,
    failed: false,
    selectionRequired: false,
    blocked: false,
  });
});

test("preview request key changes for billing inputs but not stylist-only changes", () => {
  const original = createMembershipPreviewRequestKey(baseKeyInput);
  assert.equal(
    original,
    createMembershipPreviewRequestKey({
      ...baseKeyInput,
      cartItems: [{
        ...baseKeyInput.cartItems[0],
        resourceId: "stylist-2",
        resourceName: "Stylist Two",
      }],
    })
  );
  assert.notEqual(original, createMembershipPreviewRequestKey({
    ...baseKeyInput,
    cartItems: [{ ...baseKeyInput.cartItems[0], qty: 2 }],
  }));
  assert.notEqual(original, createMembershipPreviewRequestKey({
    ...baseKeyInput,
    customerId: "customer-2",
  }));
  assert.notEqual(original, createMembershipPreviewRequestKey({
    ...baseKeyInput,
    appliedDiscount: 50,
  }));
});

test("single Discount Membership does not create a redundant selected-id request", () => {
  assert.equal(resolveSelectedDiscountMembershipId([{ id: "membership-1" }], ""), "");
  assert.equal(
    resolveSelectedDiscountMembershipId(
      [{ id: "membership-1" }, { id: "membership-2" }],
      "membership-2"
    ),
    "membership-2"
  );
  assert.equal(
    resolveSelectedDiscountMembershipId(
      [{ id: "membership-1" }, { id: "membership-2" }],
      "missing"
    ),
    ""
  );
});
