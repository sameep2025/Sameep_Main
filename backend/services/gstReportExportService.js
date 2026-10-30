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
const EXCEL_INVOICE_HEADERS = [
  "Invoice Date", "Invoice Time (IST)", ...INVOICE_EXPORT_HEADERS.slice(1),
];
const EXCEL_TAX_RATE_HEADERS = [
  "Invoice Number", "Invoice Date", "Invoice Time (IST)", ...TAX_RATE_EXPORT_HEADERS.slice(2),
];
const CURRENCY_FORMAT = '"₹"#,##0.00';

const INVOICE_COLUMN_WIDTHS = [
  14, 13, 21, 17, 14, 13, 24, 17, 14, 16, 19, 16, 16, 16, 14, 13, 13, 13,
  15, 15, 18, 25, 34,
];
const TAX_RATE_COLUMN_WIDTHS = [21, 14, 13, 17, 14, 13, 17, 14, 13, 13, 13, 13];

function protectSpreadsheetText(value) {
  const text = String(value ?? "");
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function rupees(paise) {
  return Number(paise || 0) / 100;
}

function formatIstDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "", time: "" };
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
  return {
    date: `${parts.day}-${parts.month}-${parts.year}`,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
  };
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

function invoiceExcelRows(invoices) {
  return invoiceExportRows(invoices).map((row, index) => {
    const issued = formatIstDateTime(invoices[index].invoiceDate);
    const cancelled = invoices[index].cancelledAt
      ? formatIstDateTime(invoices[index].cancelledAt)
      : null;
    return {
      "Invoice Date": issued.date,
      "Invoice Time (IST)": issued.time,
      ...Object.fromEntries(Object.entries(row).filter(([key]) => key !== "Invoice Date")),
      "Cancellation Date": cancelled ? `${cancelled.date} ${cancelled.time}` : "",
    };
  });
}

function taxRateExcelRows(rows) {
  return taxRateExportRows(rows).map((row, index) => {
    const issued = formatIstDateTime(rows[index].invoiceDate);
    return {
      "Invoice Number": row["Invoice Number"],
      "Invoice Date": issued.date,
      "Invoice Time (IST)": issued.time,
      ...Object.fromEntries(
        Object.entries(row).filter(([key]) => !["Invoice Number", "Invoice Date"].includes(key))
      ),
    };
  });
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

function applyCurrencyFormatByHeaders(worksheet, headers) {
  if (!worksheet["!ref"]) return;
  const range = XLSX.utils.decode_range(worksheet["!ref"]);
  const currencyColumns = [];
  for (let column = range.s.c; column <= range.e.c; column += 1) {
    const cell = worksheet[XLSX.utils.encode_cell({ r: range.s.r, c: column })];
    if (cell && headers.has(String(cell.v))) currencyColumns.push(column);
  }
  for (let row = range.s.r + 1; row <= range.e.r; row += 1) {
    currencyColumns.forEach((column) => {
      const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (cell?.t === "n") cell.z = CURRENCY_FORMAT;
    });
  }
}

function prepareTabularSheet(worksheet, widths, currencyHeaders) {
  worksheet["!cols"] = widths.map((wch) => ({ wch }));
  worksheet["!rows"] = [{ hpt: 24 }];
  if (worksheet["!ref"]) worksheet["!autofilter"] = { ref: worksheet["!ref"] };
  applyCurrencyFormatByHeaders(worksheet, new Set(currencyHeaders));
}

function prepareSummarySheet(worksheet) {
  worksheet["!cols"] = [{ wch: 30 }, ...Array.from({ length: 4 }, () => ({ wch: 18 }))];
  worksheet["!rows"] = [{ hpt: 26 }, null, null, null, null, null, { hpt: 22 }];
  SUMMARY_FIELDS.forEach(([, , monetary], index) => {
    if (!monetary) return;
    const row = 7 + index;
    for (let column = 1; column <= 4; column += 1) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (cell?.t === "n") cell.z = CURRENCY_FORMAT;
    }
  });
}

function appendStyleRecord(xml, tag, record) {
  const expression = new RegExp(`<${tag} count="(\\d+)">([\\s\\S]*?)<\\/${tag}>`);
  return xml.replace(expression, (_match, count, content) =>
    `<${tag} count="${Number(count) + 1}">${content}${record}</${tag}>`
  );
}

function styleHeaderRows(xml, rowNumbers, styleIndex) {
  rowNumbers.forEach((rowNumber) => {
    const rowExpression = new RegExp(`(<row r="${rowNumber}"[^>]*>)([\\s\\S]*?)(<\\/row>)`);
    xml = xml.replace(rowExpression, (_match, opening, cells, closing) => {
      const styledCells = cells.replace(/<c ([^>]*?)>/g, (_cell, attributes) => {
        const withoutStyle = attributes.replace(/\s+s="\d+"/g, "");
        return `<c ${withoutStyle} s="${styleIndex}">`;
      });
      return `${opening}${styledCells}${closing}`;
    });
  });
  return xml;
}

function addFrozenHeader(xml) {
  const pane = '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>';
  if (xml.includes('state="frozen"')) return xml;
  return xml.replace(/<sheetView([^>]*)\/>/, `<sheetView$1>${pane}</sheetView>`);
}

function enhanceWorkbookXml(buffer) {
  const container = XLSX.CFB.read(buffer, { type: "buffer" });
  const stylesEntry = XLSX.CFB.find(container, "/xl/styles.xml");
  if (!stylesEntry) return buffer;

  let stylesXml = stylesEntry.content.toString();
  const cellXfsCount = Number(stylesXml.match(/<cellXfs count="(\d+)">/)?.[1] || 0);
  const fontCount = Number(stylesXml.match(/<fonts count="(\d+)">/)?.[1] || 0);
  const fillCount = Number(stylesXml.match(/<fills count="(\d+)">/)?.[1] || 0);
  stylesXml = appendStyleRecord(
    stylesXml,
    "fonts",
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>'
  );
  stylesXml = appendStyleRecord(
    stylesXml,
    "fills",
    '<fill><patternFill patternType="solid"><fgColor rgb="FF2F291B"/><bgColor indexed="64"/></patternFill></fill>'
  );
  stylesXml = appendStyleRecord(
    stylesXml,
    "cellXfs",
    `<xf numFmtId="0" fontId="${fontCount}" fillId="${fillCount}" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>`
  );
  stylesEntry.content = Buffer.from(stylesXml);

  [1, 2, 3].forEach((sheetNumber) => {
    const entry = XLSX.CFB.find(container, `/xl/worksheets/sheet${sheetNumber}.xml`);
    if (!entry) return;
    let xml = entry.content.toString();
    if (sheetNumber > 1) xml = addFrozenHeader(xml);
    xml = styleHeaderRows(xml, sheetNumber === 1 ? [1, 7] : [1], cellXfsCount);
    entry.content = Buffer.from(xml);
  });

  return XLSX.CFB.write(container, { type: "buffer", fileType: "zip" });
}

function buildGstReportWorkbook(report) {
  const workbook = XLSX.utils.book_new();
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows(report));
  const invoiceSheet = XLSX.utils.json_to_sheet(invoiceExcelRows(report.invoices), {
    header: EXCEL_INVOICE_HEADERS,
  });
  const taxRateSheet = XLSX.utils.json_to_sheet(taxRateExcelRows(report.taxRateBreakup || []), {
    header: EXCEL_TAX_RATE_HEADERS,
  });
  prepareSummarySheet(summarySheet);
  prepareTabularSheet(invoiceSheet, INVOICE_COLUMN_WIDTHS, [
    "Gross Amount", "Membership Discount", "Manual Discount", "Total Discount",
    "Taxable Value", "CGST", "SGST", "UTGST", "IGST", "Total GST",
    "Invoice Total", "Loyalty Redemption", "Amount at Bill Completion",
  ]);
  prepareTabularSheet(taxRateSheet, TAX_RATE_COLUMN_WIDTHS, [
    "Taxable Amount", "CGST", "SGST", "UTGST", "IGST", "Total GST",
  ]);
  XLSX.utils.book_append_sheet(
    workbook,
    summarySheet,
    "Summary"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    invoiceSheet,
    "Invoice Details"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    taxRateSheet,
    "GST Rate Breakup"
  );
  const buffer = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
    cellStyles: true,
  });
  return enhanceWorkbookXml(buffer);
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
  formatIstDateTime,
  invoiceExportRows,
  protectSpreadsheetText,
  rowsToCsv,
  taxRateExportRows,
};
