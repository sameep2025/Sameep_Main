const mongoose = require("mongoose");
const GstInvoiceCounter = require("../models/GstInvoiceCounter");

const INVOICE_NUMBER_PATTERN = /^GST\/\d{2}-\d{2}\/\d{5,6}$/;
const INDIA_OFFSET_MS = 330 * 60 * 1000;

class GstInvoiceNumberError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "GstInvoiceNumberError";
    this.code = code;
  }
}

function getIndianFinancialYear(value = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new GstInvoiceNumberError("Invoice issue date is invalid", "invalid_invoice_date");
  }
  const indiaDate = new Date(date.getTime() + INDIA_OFFSET_MS);
  const year = indiaDate.getUTCFullYear();
  const month = indiaDate.getUTCMonth() + 1;
  const startYear = month >= 4 ? year : year - 1;
  return `${String(startYear).slice(-2)}-${String(startYear + 1).slice(-2)}`;
}

function formatGstInvoiceNumber(financialYear, sequence) {
  if (!/^\d{2}-\d{2}$/.test(financialYear)) {
    throw new GstInvoiceNumberError("Financial year is invalid", "invalid_financial_year");
  }
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999999) {
    throw new GstInvoiceNumberError("GST invoice sequence is exhausted", "invoice_sequence_exhausted");
  }
  const invoiceNumber = `GST/${financialYear}/${String(sequence).padStart(5, "0")}`;
  if (invoiceNumber.length > 16 || !INVOICE_NUMBER_PATTERN.test(invoiceNumber)) {
    throw new GstInvoiceNumberError("GST invoice number format is invalid", "invalid_invoice_number");
  }
  return invoiceNumber;
}

async function allocateGstInvoiceNumber({
  vendorId,
  issueDate,
  session,
  CounterModel = GstInvoiceCounter,
}) {
  if (!mongoose.isValidObjectId(vendorId)) {
    throw new GstInvoiceNumberError("Vendor identity is invalid", "invalid_vendor_id");
  }
  if (!session) {
    throw new GstInvoiceNumberError(
      "GST invoice allocation requires a MongoDB transaction",
      "invoice_transaction_required"
    );
  }
  const financialYear = getIndianFinancialYear(issueDate);
  const counter = await CounterModel.findOneAndUpdate(
    { vendorId, financialYear },
    {
      $inc: { sequence: 1 },
      $setOnInsert: { vendorId, financialYear },
    },
    {
      new: true,
      upsert: true,
      session,
      setDefaultsOnInsert: false,
      runValidators: true,
    }
  );
  if (!counter) {
    throw new GstInvoiceNumberError("Unable to allocate GST invoice number", "invoice_allocation_failed");
  }
  return {
    financialYear,
    sequence: counter.sequence,
    invoiceNumber: formatGstInvoiceNumber(financialYear, counter.sequence),
  };
}

module.exports = {
  INVOICE_NUMBER_PATTERN,
  GstInvoiceNumberError,
  allocateGstInvoiceNumber,
  formatGstInvoiceNumber,
  getIndianFinancialYear,
};
