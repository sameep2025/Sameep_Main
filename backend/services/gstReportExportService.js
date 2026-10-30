const XLSX = require("xlsx");

const SUMMARY_FIELDS = [
  ["Invoice Count", "invoiceCount", false],
  ["Gross Amount", "grossAmountPaise", true],
  ["Membership Discount", "membershipDiscountPaise", true],
  ["Manual Discount", "manualDiscountPaise", true],
  ["Total Discount", "totalDiscountPaise", true],
  ["Taxable Value", "taxableValuePaise", true],
  ["CGST", "cgstPaise", true],
  ["SGST", "sgstPaise", true],
  ["UTGST", "utgstPaise", true],
  ["IGST", "igstPaise", true],
  ["Total GST", "totalGstPaise", true],
  ["Invoice Total", "invoiceTotalPaise", true],
  ["Loyalty Redemption", "loyaltyRedemptionPaise", true],
  ["Amount at Bill Completion", "customerPayablePaise", true],
];
const INVOICE_EXPORT_HEADERS = [
  "Invoice Date", "Invoice Number", "Document Mode", "Status", "Customer",
  "Customer GSTIN", "Pricing Mode", "Gross Amount", "Membership Discount",
  "Manual Discount", "Total Discount", "Taxable Value", "CGST", "SGST",
  "UTGST", "IGST", "Total GST", "Invoice Total", "Loyalty Redemption",
  "Amount at Bill Completion", "Cancellation Date", "Cancellation Reason",
];
const TAX_RATE_EXPORT_HEADERS = [
  "Invoice Number", "Invoice Date", "Document Mode", "Status", "GST Rate (%)",
  "Taxable Amount", "CGST", "SGST", "UTGST", "IGST", "Total GST",
];

function protectSpreadsheetText(value) {
  const text = String(value ?? "");
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function rupees(paise) {
  return Number(paise || 0) / 100;
}

function invoiceExportRows(invoices) {
  return invoices.map((invoice) => ({
    "Invoice Date": invoice.invoiceDate,
    "Invoice Number": protectSpreadsheetText(invoice.invoiceNumber),
    "Document Mode": invoice.documentMode,
    Status: invoice.status,
    Customer: protectSpreadsheetText(invoice.customerName),
    "Customer GSTIN": protectSpreadsheetText(invoice.customerGstin),
    "Pricing Mode": invoice.pricingMode,
    "Gross Amount": rupees(invoice.totals.grossAmountPaise),
    "Membership Discount": rupees(invoice.totals.membershipDiscountPaise),
    "Manual Discount": rupees(invoice.totals.manualDiscountPaise),
    "Total Discount": rupees(invoice.totals.totalDiscountPaise),
    "Taxable Value": rupees(invoice.totals.taxableValuePaise),
    CGST: rupees(invoice.totals.cgstPaise),
    SGST: rupees(invoice.totals.sgstPaise),
    UTGST: rupees(invoice.totals.utgstPaise),
    IGST: rupees(invoice.totals.igstPaise),
    "Total GST": rupees(invoice.totals.totalGstPaise),
    "Invoice Total": rupees(invoice.totals.invoiceTotalPaise),
    "Loyalty Redemption": rupees(invoice.totals.loyaltyRedemptionPaise),
    "Amount at Bill Completion": rupees(invoice.totals.customerPayablePaise),
    "Cancellation Date": invoice.cancelledAt || "",
    "Cancellation Reason": protectSpreadsheetText(invoice.cancellationReason),
  }));
}

function taxRateExportRows(rows) {
  return rows.map((row) => ({
    "Invoice Number": protectSpreadsheetText(row.invoiceNumber),
    "Invoice Date": row.invoiceDate,
    "Document Mode": row.documentMode,
    Status: row.status,
    "GST Rate (%)": row.gstRateBps / 100,
    "Taxable Amount": rupees(row.taxableValuePaise),
    CGST: rupees(row.cgstPaise),
    SGST: rupees(row.sgstPaise),
    UTGST: rupees(row.utgstPaise),
    IGST: rupees(row.igstPaise),
    "Total GST": rupees(row.totalGstPaise),
  }));
}

function summaryRows(report) {
  const rows = [
    ["GST Report Summary"],
    ["From", report.filters.from],
    ["To", report.filters.to],
    ["Document Mode", report.filters.documentMode],
    ["Status Filter", report.filters.status],
    [],
    ["Metric", "All Selected", "Completed", "Cancelled", "Superseded"],
  ];
  SUMMARY_FIELDS.forEach(([label, field, monetary]) => {
    rows.push([
      label,
      monetary ? rupees(report.summary.all[field]) : report.summary.all[field],
      monetary ? rupees(report.summary.active[field]) : report.summary.active[field],
      monetary ? rupees(report.summary.cancelled[field]) : report.summary.cancelled[field],
      monetary ? rupees(report.summary.superseded[field]) : report.summary.superseded[field],
    ]);
  });
  rows.push([], ["Note", "Cancelled invoices are shown separately and are not automatically reversed."]);
  return rows;
}

function buildGstReportWorkbook(report) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(summaryRows(report)),
    "Summary"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(invoiceExportRows(report.invoices), { header: INVOICE_EXPORT_HEADERS }),
    "Invoice Details"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(taxRateExportRows(report.taxRateBreakup || []), { header: TAX_RATE_EXPORT_HEADERS }),
    "GST Rate Breakup"
  );
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function csvEscape(value) {
  const text = protectSpreadsheetText(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function rowsToCsv(rows, headers = rows.length ? Object.keys(rows[0]) : []) {
  if (!headers.length) return "\uFEFF";
  return `\uFEFF${headers.map(csvEscape).join(",")}\r\n${rows
    .map((row) => headers.map((header) => csvEscape(row[header])).join(","))
    .join("\r\n")}`;
}

module.exports = {
  INVOICE_EXPORT_HEADERS,
  TAX_RATE_EXPORT_HEADERS,
  buildGstReportWorkbook,
  invoiceExportRows,
  protectSpreadsheetText,
  rowsToCsv,
  taxRateExportRows,
};
