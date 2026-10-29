const mongoose = require("mongoose");

const paiseField = {
  type: Number,
  required: true,
  min: 0,
  validate: { validator: Number.isSafeInteger, message: "amount must be integer paise" },
};

const GstComplianceWarningSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, enum: ["classification_missing"] },
    message: { type: String, required: true, trim: true, maxlength: 300 },
    itemName: { type: String, required: true, trim: true, maxlength: 300 },
    classificationType: { type: String, required: true, enum: ["SAC", "HSN"] },
  },
  { _id: false }
);

const GstInvoiceLineSchema = new mongoose.Schema(
  {
    itemId: { type: mongoose.Schema.Types.ObjectId, required: true },
    itemSource: {
      type: String,
      enum: ["vendor_price_node", "vendor_menu_node", "custom_package"],
      required: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 300 },
    quantity: { type: Number, required: true, min: 0 },
    itemType: { type: String, enum: ["SERVICE", "PRODUCT"], required: true },
    sac: { type: String, trim: true, maxlength: 8, default: "" },
    hsn: { type: String, trim: true, maxlength: 8, default: "" },
    gstRateBps: { type: Number, required: true, min: 0, max: 10000 },
    unitPricePaise: paiseField,
    grossAmountPaise: paiseField,
    membershipDiscountPaise: paiseField,
    manualDiscountPaise: paiseField,
    totalDiscountPaise: paiseField,
    taxableValuePaise: paiseField,
    cgstPaise: paiseField,
    sgstPaise: paiseField,
    utgstPaise: paiseField,
    igstPaise: paiseField,
    totalGstPaise: paiseField,
    invoiceTotalPaise: paiseField,
  },
  { _id: false }
);

const GstInvoiceSnapshotSchema = new mongoose.Schema(
  {
    schemaVersion: { type: Number, required: true, enum: [1] },
    documentMode: {
      type: String,
      enum: ["TAX_INVOICE", "TEST", "NON_TAX_INVOICE"],
      default: "TAX_INVOICE",
    },
    invoiceNumber: {
      type: String,
      required: true,
      maxlength: 16,
      match: /^(?:GST\/\d{2}-\d{2}\/\d{5,6}|NTI\/[a-f0-9]{12})$/,
    },
    financialYear: { type: String, required: true, match: /^\d{2}-\d{2}$/ },
    invoiceIssueDate: { type: Date, required: true },
    supplier: {
      gstin: { type: String, required: true, maxlength: 15 },
      legalName: { type: String, required: true, trim: true, maxlength: 150 },
      registeredAddress: { type: String, required: true, trim: true, maxlength: 500 },
      registeredStateCode: { type: String, required: true, match: /^\d{2}$/ },
    },
    placeOfSupply: {
      stateCode: { type: String, required: true, match: /^\d{2}$/ },
      supplyType: { type: String, required: true, enum: ["intrastate"] },
    },
    pricingMode: { type: String, required: true, enum: ["inclusive", "exclusive"] },
    complianceWarnings: { type: [GstComplianceWarningSchema], default: [] },
    items: { type: [GstInvoiceLineSchema], required: true },
    totals: {
      grossAmountPaise: paiseField,
      membershipDiscountPaise: paiseField,
      manualDiscountPaise: paiseField,
      totalDiscountPaise: paiseField,
      taxableValuePaise: paiseField,
      cgstPaise: paiseField,
      sgstPaise: paiseField,
      utgstPaise: paiseField,
      igstPaise: paiseField,
      totalGstPaise: paiseField,
      invoiceTotalPaise: paiseField,
      loyaltyRedemptionPaise: paiseField,
      customerPayablePaise: paiseField,
    },
  },
  { _id: false, minimize: false }
);

module.exports = GstInvoiceSnapshotSchema;
