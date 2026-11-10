const ALLOWED_MARKETING_VARIABLES = [
  "customer_name",
  "offer_details",
  "salon_name",
];
const ALLOWED_VARIABLE_SET = new Set(ALLOWED_MARKETING_VARIABLES);
const MARKETING_TEMPLATE_PURPOSES = new Set([
  "INACTIVE_CUSTOMER_REMINDER",
  "PROMOTIONAL_OFFER",
  "EXCLUSIVE_OFFER",
  "MEMBERSHIP_REMINDER",
  "GENERAL_MARKETING",
]);
const PLACEHOLDER_PATTERN = /{{\s*([^{}]+?)\s*}}/g;

class WhatsappMarketingValidationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "WhatsappMarketingValidationError";
    this.code = code;
    this.statusCode = 400;
  }
}

function normalizeInternalName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeTemplateName(value) {
  return normalizeInternalName(value).toLocaleLowerCase("en");
}

function extractMarketingVariables(messageBody) {
  const body = String(messageBody || "");
  const placeholderPattern = new RegExp(PLACEHOLDER_PATTERN.source, PLACEHOLDER_PATTERN.flags);
  const variables = [];
  const seen = new Set();
  let match;

  while ((match = placeholderPattern.exec(body)) !== null) {
    const variable = String(match[1] || "").trim();
    if (!ALLOWED_VARIABLE_SET.has(variable)) {
      throw new WhatsappMarketingValidationError(
        `Unsupported placeholder: {{${variable}}}`,
        "unsupported_marketing_placeholder"
      );
    }
    if (match[0] !== `{{${variable}}}`) {
      throw new WhatsappMarketingValidationError(
        `Use the exact placeholder {{${variable}}}`,
        "invalid_marketing_placeholder_format"
      );
    }
    if (!seen.has(variable)) {
      seen.add(variable);
      variables.push(variable);
    }
  }

  const withoutKnownPlaceholders = body.replace(placeholderPattern, "");
  if (withoutKnownPlaceholders.includes("{{") || withoutKnownPlaceholders.includes("}}")) {
    throw new WhatsappMarketingValidationError(
      "Message contains an incomplete placeholder",
      "invalid_marketing_placeholder_format"
    );
  }

  return variables;
}

function validateMarketingTemplateInput(input, { partial = false } = {}) {
  const source = input && typeof input === "object" ? input : {};
  const supportedFields = new Set([
    "internalName",
    "purpose",
    "messageBody",
    "image",
    "media",
    "language",
  ]);
  const unknownField = Object.keys(source).find((key) => !supportedFields.has(key));
  if (unknownField) {
    throw new WhatsappMarketingValidationError(
      `Unsupported template field: ${unknownField}`,
      "unsupported_marketing_template_field"
    );
  }

  const result = {};
  if (!partial || Object.hasOwn(source, "internalName")) {
    const internalName = normalizeInternalName(source.internalName);
    if (internalName.length < 2 || internalName.length > 80) {
      throw new WhatsappMarketingValidationError(
        "Template name must be between 2 and 80 characters",
        "invalid_marketing_template_name"
      );
    }
    result.internalName = internalName;
    result.normalizedName = normalizeTemplateName(internalName);
  }

  if (!partial || Object.hasOwn(source, "purpose")) {
    const purpose = String(source.purpose || "").trim().toUpperCase();
    if (!MARKETING_TEMPLATE_PURPOSES.has(purpose)) {
      throw new WhatsappMarketingValidationError(
        "Select a valid marketing template purpose",
        "invalid_marketing_template_purpose"
      );
    }
    result.purpose = purpose;
  }

  if (!partial || Object.hasOwn(source, "messageBody")) {
    const messageBody = String(source.messageBody || "").trim();
    if (!messageBody || messageBody.length > 1024) {
      throw new WhatsappMarketingValidationError(
        "Message body is required and cannot exceed 1024 characters",
        "invalid_marketing_message_body"
      );
    }
    result.messageBody = messageBody;
    result.variables = extractMarketingVariables(messageBody);
  }

  if (Object.hasOwn(source, "language")) {
    const language = String(source.language || "").trim().toLowerCase();
    if (language !== "en") {
      throw new WhatsappMarketingValidationError(
        "Only English templates are supported in Phase 1",
        "unsupported_marketing_template_language"
      );
    }
    result.language = language;
  } else if (!partial) {
    result.language = "en";
  }

  if (Object.hasOwn(source, "image")) result.image = source.image;
  if (Object.hasOwn(source, "media")) result.media = source.media;
  return result;
}

function renderMarketingTemplatePreview(messageBody, sampleData = {}) {
  const samples = {
    customer_name: "Priya",
    offer_details: "20% off this week",
    salon_name: "Your Salon",
    ...sampleData,
  };
  const placeholderPattern = new RegExp(PLACEHOLDER_PATTERN.source, PLACEHOLDER_PATTERN.flags);
  return String(messageBody || "").replace(placeholderPattern, (placeholder, name) => {
    const variable = String(name || "").trim();
    return ALLOWED_VARIABLE_SET.has(variable)
      ? String(samples[variable] || placeholder)
      : placeholder;
  });
}

module.exports = {
  ALLOWED_MARKETING_VARIABLES,
  WhatsappMarketingValidationError,
  extractMarketingVariables,
  normalizeTemplateName,
  renderMarketingTemplatePreview,
  validateMarketingTemplateInput,
};
