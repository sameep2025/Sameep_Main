const TEMPLATE_PURPOSES = {
  BILLING: "billing",
  APPOINTMENT: "appointment",
  MARKETING: "marketing",
};

const META_TEMPLATE_CATEGORIES = {
  UTILITY: "UTILITY",
  MARKETING: "MARKETING",
};

const YNOT_TEMPLATE_VARIABLES = {
  VENDOR_NAME: {
    key: "VENDOR_NAME",
    displayName: "Vendor Name",
    description: "Business name shown to the customer.",
    sourceField: "vendorName",
  },
  CUSTOMER_NAME: {
    key: "CUSTOMER_NAME",
    displayName: "Customer Name",
    description: "Customer name from the billing record.",
    sourceField: "customerName",
  },
  BILL_AMOUNT: {
    key: "BILL_AMOUNT",
    displayName: "Bill Amount",
    description: "Original bill amount before point redemption.",
    sourceField: "billAmount",
  },
  POINTS_EARNED: {
    key: "POINTS_EARNED",
    displayName: "Points Earned",
    description: "Loyalty points earned from the bill.",
    sourceField: "earned",
  },
  POINTS_REDEEMED: {
    key: "POINTS_REDEEMED",
    displayName: "Points Redeemed",
    description: "Loyalty points redeemed on the bill.",
    sourceField: "redeemed",
  },
  FINAL_PAID: {
    key: "FINAL_PAID",
    displayName: "Final Paid",
    description: "Final paid amount after redemption.",
    sourceField: "finalPaid",
  },
  LOYALTY_BALANCE: {
    key: "LOYALTY_BALANCE",
    displayName: "Loyalty Balance",
    description: "Customer loyalty balance after the bill.",
    sourceField: "balance",
  },
  BILL_URL: {
    key: "BILL_URL",
    displayName: "Bill URL",
    description: "Public bill details link.",
    sourceField: "billUrl",
  },
  GOOGLE_URL: {
    key: "GOOGLE_URL",
    displayName: "Google URL",
    description: "Vendor Google profile or review link.",
    sourceField: "googleUrl",
  },
  INSTAGRAM_URL: {
    key: "INSTAGRAM_URL",
    displayName: "Instagram URL",
    description: "Vendor Instagram profile link.",
    sourceField: "instagramUrl",
  },
  OFFER_TEXT: {
    key: "OFFER_TEXT",
    displayName: "Offer Text",
    description: "YNOT-controlled offer message.",
    sourceField: "offerText",
  },
  VALID_UNTIL: {
    key: "VALID_UNTIL",
    displayName: "Valid Until",
    description: "Offer or reminder expiry date.",
    sourceField: "validUntil",
  },
  SERVICE_NAME: {
    key: "SERVICE_NAME",
    displayName: "Service Name",
    description: "Service or package name.",
    sourceField: "serviceName",
  },
};

const MASTER_TEMPLATES = {
  BILL_STANDARD: {
    key: "BILL_STANDARD",
    displayName: "Standard Bill",
    description: "Utility billing message with bill amount, loyalty points, final paid amount, balance, and bill link.",
    purpose: TEMPLATE_PURPOSES.BILLING,
    metaCategory: META_TEMPLATE_CATEGORIES.UTILITY,
    language: "en",
    version: 1,
    active: true,
    variables: [
      "VENDOR_NAME",
      "BILL_AMOUNT",
      "POINTS_EARNED",
      "POINTS_REDEEMED",
      "FINAL_PAID",
      "LOYALTY_BALANCE",
      "BILL_URL",
    ],
    components: [
      {
        type: "BODY",
        text:
          "Hello,\n\nThank you for visiting {{1}}.\n\nBill Amount: ₹{{2}}\nPoints Earned: {{3}}\nPoints Redeemed: {{4}}\nFinal Paid: ₹{{5}}\n\nYour current loyalty balance is {{6}} points.\n\nTo view your bill, use the following link:\n{{7}}\n\nWe look forward to serving you again.",
        example: {
          body_text: [
            [
              "Reelook Beauty Saloon",
              "1050",
              "52",
              "0",
              "1050",
              "102",
              "https://sameep.app/bill/example",
            ],
          ],
        },
      },
    ],
  },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getMasterTemplate(key) {
  const template = MASTER_TEMPLATES[String(key || "").trim()];
  return template ? clone(template) : null;
}

function listMasterTemplates({ purpose, activeOnly = true } = {}) {
  return Object.values(MASTER_TEMPLATES)
    .filter((template) => !purpose || template.purpose === purpose)
    .filter((template) => !activeOnly || template.active)
    .map(clone);
}

function getTemplateVariablesInOrder(key) {
  const template = getMasterTemplate(key);
  if (!template) return [];

  return template.variables.map((variableKey, index) => ({
    position: index + 1,
    ...YNOT_TEMPLATE_VARIABLES[variableKey],
  }));
}

function getVariableSourceFieldsInOrder(key) {
  return getTemplateVariablesInOrder(key)
    .map((variable) => variable.sourceField)
    .filter(Boolean);
}

function getTemplateExampleValuesInOrder(key) {
  const template = getMasterTemplate(key);
  const body = template?.components?.find((component) => component.type === "BODY") || {};
  return Array.isArray(body.example?.body_text?.[0]) ? body.example.body_text[0].slice() : [];
}

function getBillStandardSampleData({ vendorName } = {}) {
  return {
    vendorName: String(vendorName || "").trim() || "Reelook Beauty Saloon",
    billAmount: "1050",
    earned: "52",
    redeemed: "0",
    finalPaid: "1050",
    balance: "102",
    billUrl: "https://sameep.app/bill/example",
  };
}

function getTemplateBodyParameterTexts(key, data = {}) {
  return getVariableSourceFieldsInOrder(key).map((sourceField) =>
    String(data[sourceField] ?? "")
  );
}

module.exports = {
  MASTER_TEMPLATES,
  META_TEMPLATE_CATEGORIES,
  TEMPLATE_PURPOSES,
  YNOT_TEMPLATE_VARIABLES,
  getBillStandardSampleData,
  getMasterTemplate,
  getTemplateBodyParameterTexts,
  getTemplateExampleValuesInOrder,
  getTemplateVariablesInOrder,
  getVariableSourceFieldsInOrder,
  listMasterTemplates,
};
