export const MARKETING_PLACEHOLDERS = [
  "{{customer_name}}",
  "{{offer_details}}",
  "{{salon_name}}",
];

export const MARKETING_PURPOSES = [
  { value: "INACTIVE_CUSTOMER_REMINDER", label: "Inactive Customer Reminder" },
  { value: "PROMOTIONAL_OFFER", label: "Promotional Offer" },
  { value: "EXCLUSIVE_OFFER", label: "Exclusive Offer" },
  { value: "MEMBERSHIP_REMINDER", label: "Membership Reminder" },
  { value: "GENERAL_MARKETING", label: "General Marketing" },
];

const SAMPLE_VALUES = {
  customer_name: "Priya",
  offer_details: "20% off this week",
  salon_name: "Your Salon",
};

export function renderMarketingTemplatePreview(messageBody, sampleValues = {}) {
  const values = { ...SAMPLE_VALUES, ...sampleValues };
  return String(messageBody || "").replace(
    /{{\s*([^{}]+?)\s*}}/g,
    (placeholder, variable) => values[String(variable || "").trim()] || placeholder
  );
}

export function validateMarketingDraft(form = {}) {
  const name = String(form.internalName || "").trim();
  const body = String(form.messageBody || "").trim();
  if (name.length < 2 || name.length > 80) {
    return "Template name must be between 2 and 80 characters.";
  }
  if (!MARKETING_PURPOSES.some((purpose) => purpose.value === form.purpose)) {
    return "Select a template purpose.";
  }
  if (!body || body.length > 1024) {
    return "Message is required and cannot exceed 1024 characters.";
  }

  const allowed = new Set(MARKETING_PLACEHOLDERS);
  const placeholders = body.match(/{{\s*[^{}]+?\s*}}/g) || [];
  if (placeholders.some((placeholder) => !allowed.has(placeholder))) {
    return "Use only the supported personalization placeholders.";
  }
  const stripped = body.replace(/{{\s*[^{}]+?\s*}}/g, "");
  if (stripped.includes("{{") || stripped.includes("}}")) {
    return "Complete or remove the unfinished placeholder.";
  }
  return "";
}

export function getMarketingPurposeLabel(value) {
  return MARKETING_PURPOSES.find((purpose) => purpose.value === value)?.label || "General Marketing";
}
