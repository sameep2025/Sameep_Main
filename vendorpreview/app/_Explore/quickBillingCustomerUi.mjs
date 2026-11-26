export function normalizeQuickBillingCustomerSearch(value) {
  const query = String(value || "").trim();
  const digits = query.replace(/\D/g, "");
  const isPhoneInput = /^[\d\s()+-]*$/.test(query);
  const mobile = digits.startsWith("91") && digits.length === 12 ? digits.slice(2) : digits;
  return {
    query,
    isPhoneInput,
    mobile: isPhoneInput && mobile.length === 10 ? mobile : "",
  };
}

export function validateQuickBillingCustomerSearch(value) {
  const normalized = normalizeQuickBillingCustomerSearch(value);
  if (!normalized.query) {
    return { ...normalized, valid: false, error: "Enter a valid 10-digit mobile number." };
  }
  if (normalized.isPhoneInput && !normalized.mobile) {
    return { ...normalized, valid: false, error: "Enter a valid 10-digit mobile number." };
  }
  if (!normalized.isPhoneInput && normalized.query.length < 2) {
    return { ...normalized, valid: false, error: "Enter at least two characters." };
  }
  return { ...normalized, valid: true, error: "" };
}

export function getQuickBillingCustomerSearchPlacement({
  cartItemCount = 0,
  customerId,
  customerFirstPinned = false,
} = {}) {
  const hasCustomer = Boolean(String(customerId || "").trim());
  return {
    customerFirst: Number(cartItemCount) === 0 || hasCustomer || customerFirstPinned,
    cart: Number(cartItemCount) > 0 && !hasCustomer && !customerFirstPinned,
  };
}
