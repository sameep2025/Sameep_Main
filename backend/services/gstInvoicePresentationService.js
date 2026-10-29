const GST_INVOICE_NUMBER_PATTERN = /^GST\/\d{2}-\d{2}\/\d{5,6}$/;
const NON_TAX_INVOICE_NUMBER_PATTERN = /^NTI\/[a-f0-9]{12}$/;
const GST_FINANCIAL_YEAR_PATTERN = /^\d{2}-\d{2}$/;
const GST_STATE_CODE_PATTERN = /^\d{2}$/;
const GSTIN_PATTERN = /^\d{2}[A-Z0-9]{13}$/;

const MONEY_FIELDS = [
  "grossAmountPaise",
  "membershipDiscountPaise",
  "manualDiscountPaise",
  "totalDiscountPaise",
  "taxableValuePaise",
  "cgstPaise",
  "sgstPaise",
  "utgstPaise",
  "igstPaise",
  "totalGstPaise",
  "invoiceTotalPaise",
];

const TOTAL_MONEY_FIELDS = [
  ...MONEY_FIELDS,
  "loyaltyRedemptionPaise",
  "customerPayablePaise",
];

function asPlainObject(value) {
  if (!value || typeof value !== "object") return null;
  return typeof value.toObject === "function" ? value.toObject() : value;
}

function requiredText(value, maxLength) {
  const text = typeof value === "string" ? value.trim() : "";
  return text && text.length <= maxLength ? text : null;
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function copyMoneyFields(source, fields) {
  const output = {};
  for (const field of fields) {
    const value = nonNegativeInteger(source?.[field]);
    if (value === null) return null;
    output[field] = value;
  }
  return output;
}

function buildItem(item, { allowMissingClassification = false } = {}) {
  const source = asPlainObject(item);
  if (!source) return null;

  const name = requiredText(source.name, 300);
  const itemType = ["SERVICE", "PRODUCT"].includes(source.itemType)
    ? source.itemType
    : null;
  const quantity = Number(source.quantity);
  const gstRateBps = nonNegativeInteger(source.gstRateBps);
  const amounts = copyMoneyFields(source, MONEY_FIELDS);
  const classificationCode = itemType === "PRODUCT"
    ? requiredText(source.hsn, 8)
    : requiredText(source.sac, 8);

  if (
    !name ||
    !itemType ||
    !Number.isFinite(quantity) ||
    quantity < 0 ||
    gstRateBps === null ||
    gstRateBps > 10000 ||
    (!allowMissingClassification && !classificationCode) ||
    !amounts
  ) {
    return null;
  }

  return {
    name,
    quantity,
    itemType,
    classificationType: itemType === "PRODUCT" ? "HSN" : "SAC",
    classificationCode: classificationCode || "",
    gstRateBps,
    ...amounts,
  };
}

function buildGstInvoicePresentation(snapshot) {
  const source = asPlainObject(snapshot);
  if (!source || source.schemaVersion !== 1) return null;

  const documentMode = ["TEST", "NON_TAX_INVOICE"].includes(source.documentMode)
    ? source.documentMode
    : "TAX_INVOICE";

  const invoiceNumber = requiredText(source.invoiceNumber, 16);
  const financialYear = requiredText(source.financialYear, 5);
  const issueDate = new Date(source.invoiceIssueDate);
  const supplier = asPlainObject(source.supplier);
  const placeOfSupply = asPlainObject(source.placeOfSupply);
  const items = Array.isArray(source.items)
    ? source.items.map((item) => buildItem(item, {
      allowMissingClassification: documentMode !== "TAX_INVOICE",
    }))
    : [];
  const totals = copyMoneyFields(asPlainObject(source.totals), TOTAL_MONEY_FIELDS);

  const gstin = requiredText(supplier?.gstin, 15);
  const legalName = requiredText(supplier?.legalName, 150);
  const registeredAddress = requiredText(supplier?.registeredAddress, 500);
  const registeredStateCode = requiredText(supplier?.registeredStateCode, 2);
  const placeOfSupplyStateCode = requiredText(placeOfSupply?.stateCode, 2);

  if (
    !invoiceNumber ||
    !(documentMode === "NON_TAX_INVOICE"
      ? NON_TAX_INVOICE_NUMBER_PATTERN.test(invoiceNumber)
      : GST_INVOICE_NUMBER_PATTERN.test(invoiceNumber)) ||
    !financialYear ||
    !GST_FINANCIAL_YEAR_PATTERN.test(financialYear) ||
    Number.isNaN(issueDate.getTime()) ||
    !gstin ||
    !GSTIN_PATTERN.test(gstin) ||
    !legalName ||
    !registeredAddress ||
    !registeredStateCode ||
    !GST_STATE_CODE_PATTERN.test(registeredStateCode) ||
    !placeOfSupplyStateCode ||
    !GST_STATE_CODE_PATTERN.test(placeOfSupplyStateCode) ||
    !["intrastate", "interstate"].includes(placeOfSupply?.supplyType) ||
    !["inclusive", "exclusive"].includes(source.pricingMode) ||
    !items.length ||
    items.some((item) => !item) ||
    !totals
  ) {
    return null;
  }

  return {
    schemaVersion: 1,
    documentMode,
    invoiceNumber,
    financialYear,
    invoiceIssueDate: issueDate.toISOString(),
    supplier: {
      gstin,
      legalName,
      registeredAddress,
      registeredStateCode,
    },
    placeOfSupply: {
      stateCode: placeOfSupplyStateCode,
      supplyType: placeOfSupply.supplyType,
    },
    pricingMode: source.pricingMode,
    complianceWarnings: Array.isArray(source.complianceWarnings)
      ? source.complianceWarnings
        .filter((warning) => warning?.code === "classification_missing")
        .map((warning) => ({
          code: "classification_missing",
          message: requiredText(warning.message, 300) || "Tax classification is missing.",
          itemName: requiredText(warning.itemName, 300) || "Item",
          classificationType: warning.classificationType === "HSN" ? "HSN" : "SAC",
        }))
      : [],
    items,
    totals,
  };
}

module.exports = {
  buildGstInvoicePresentation,
};
