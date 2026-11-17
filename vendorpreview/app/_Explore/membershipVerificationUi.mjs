function normalizeId(value) {
  return value === null || value === undefined ? "" : String(value);
}

function normalizeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizePreviewItem(item = {}) {
  const price = normalizeNumber(item.price);
  const qty = normalizeNumber(item.qty, 1);
  return {
    itemId: normalizeId(item.itemId),
    name: String(item.name || ""),
    price,
    qty,
    total: price * qty,
    cartKey: normalizeId(item.cartKey || item.itemId),
    categoryId: normalizeId(item.categoryId),
    nodePath: Array.isArray(item.nodePath) ? item.nodePath.map(normalizeId) : [],
    categoryPathIds: Array.isArray(item.categoryPathIds)
      ? item.categoryPathIds.map(normalizeId)
      : [],
  };
}

export function createMembershipPreviewRequestKey({
  vendorId,
  customerId,
  customerMobile,
  cartItems,
  discountMode,
  appliedDiscount,
  discountPercent,
  percentPer100,
  redeemPoints,
  selectedDiscountMembershipId,
  prepaidSelected,
} = {}) {
  return JSON.stringify({
    vendorId: normalizeId(vendorId),
    customerId: normalizeId(customerId),
    customerMobile: String(customerMobile || ""),
    paymentMode: prepaidSelected ? "PREPAID" : "STANDARD",
    items: Array.isArray(cartItems) ? cartItems.map(normalizePreviewItem) : [],
    manualDiscount: {
      mode: discountMode || null,
      amount: normalizeNumber(appliedDiscount),
      percent: normalizeNumber(discountPercent),
    },
    loyaltyPercentPer100: normalizeNumber(percentPer100),
    redemptionAmount: normalizeNumber(redeemPoints),
    selectedDiscountMembershipId: normalizeId(selectedDiscountMembershipId),
  });
}

export function resolveSelectedDiscountMembershipId(memberships, currentId) {
  const available = Array.isArray(memberships) ? memberships : [];
  if (available.length <= 1) return "";
  return available.some((membership) => String(membership?.id) === String(currentId || ""))
    ? String(currentId)
    : "";
}

export function getMembershipVerificationGate({
  customerId,
  cartItemCount,
  prepaidSelected,
  preview,
  loading,
  error,
  discountMembershipCount,
  selectedDiscountMembershipId,
} = {}) {
  const required = Boolean(customerId) && Number(cartItemCount) > 0 && !prepaidSelected;
  if (!required) {
    return { required: false, pending: false, failed: false, selectionRequired: false, blocked: false };
  }

  const failed = Boolean(error);
  const pending = !failed && (loading === true || !preview);
  const selectionRequired = Boolean(
    preview &&
      (preview.selectionRequired === true ||
        (Number(discountMembershipCount) > 1 && !selectedDiscountMembershipId))
  );

  return {
    required: true,
    pending,
    failed,
    selectionRequired,
    blocked: pending || failed || selectionRequired,
  };
}

