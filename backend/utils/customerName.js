const MAX_CUSTOMER_NAME_LENGTH = 100;
const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/;

function normalizeCustomerName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function validateOptionalCustomerName(value, { allowEmpty = true } = {}) {
  const name = normalizeCustomerName(value);

  if (!name) {
    if (allowEmpty) return { ok: true, value: "" };
    return { ok: false, message: "Customer name is required" };
  }

  if (name.length > MAX_CUSTOMER_NAME_LENGTH) {
    return {
      ok: false,
      message: `Customer name must be ${MAX_CUSTOMER_NAME_LENGTH} characters or fewer`,
    };
  }

  if (CONTROL_CHAR_REGEX.test(name)) {
    return { ok: false, message: "Customer name contains unsupported characters" };
  }

  return { ok: true, value: name };
}

module.exports = {
  MAX_CUSTOMER_NAME_LENGTH,
  normalizeCustomerName,
  validateOptionalCustomerName,
};
