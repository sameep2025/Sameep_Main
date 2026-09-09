const DEFAULT_COUNTRY = "IN";
const COUNTRY_DIAL_CODES = {
  IN: "91",
};

function removeFormatting(value) {
  return String(value || "").trim().replace(/[\s()-]/g, "");
}

function normalizeWhatsappRecipientPhone(value, { defaultCountry = DEFAULT_COUNTRY } = {}) {
  const cleaned = removeFormatting(value);
  if (!cleaned) {
    return { valid: false, value: "", reason: "empty" };
  }

  if (!/^\+?\d+$/.test(cleaned)) {
    return { valid: false, value: "", reason: "malformed" };
  }

  let digits = cleaned.startsWith("+") ? cleaned.slice(1) : cleaned;
  const dialCode = COUNTRY_DIAL_CODES[String(defaultCountry || "").toUpperCase()] || "";

  if (!cleaned.startsWith("+") && dialCode && digits.length === 10) {
    digits = `${dialCode}${digits}`;
  }

  if (!/^[1-9]\d{7,14}$/.test(digits)) {
    return { valid: false, value: "", reason: "invalid_length_or_prefix" };
  }

  return {
    valid: true,
    value: digits,
    e164: `+${digits}`,
    reason: "",
  };
}

module.exports = {
  normalizeWhatsappRecipientPhone,
};
