const BillingSession = require("../models/BillingSession");

const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 366;
const MAX_REPORT_ROWS = 25000;
const DOCUMENT_MODES = new Set(["TAX_INVOICE", "TEST", "NON_TAX_INVOICE"]);
const INVOICE_STATUSES = new Set(["ALL", "COMPLETED", "CANCELLED", "SUPERSEDED"]);
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
  "loyaltyRedemptionPaise",
  "customerPayablePaise",
];

class GstReportError extends Error {
  constructor(message, code, statusCode = 400) {
    super(message);
    this.name = "GstReportError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function parseYmd(value, field) {
  const text = String(value || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw new GstReportError(`${field} must use YYYY-MM-DD`, `invalid_${field}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    throw new GstReportError(`${field} is not a valid date`, `invalid_${field}`);
  }
  return { text, year, month, day, utcMs: utc.getTime() };
}

function getIstToday(now = new Date()) {
  const shifted = new Date(now.getTime() + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function toYmd({ year, month, day }) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function toIstBoundary(parsed) {
  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day) - IST_OFFSET_MS);
}

function addUtcDays(parsed, days) {
  const date = new Date(parsed.utcMs + days * DAY_MS);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    utcMs: date.getTime(),
  };
}

function positiveInteger(value, fallback, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function resolveGstReportFilters(query = {}, now = new Date()) {
  const today = getIstToday(now);
  const defaultFrom = toYmd({ year: today.year, month: today.month, day: 1 });
  const defaultTo = toYmd(today);
  const from = parseYmd(query.from || defaultFrom, "from");
  const to = parseYmd(query.to || defaultTo, "to");
  if (to.utcMs < from.utcMs) {
    throw new GstReportError("To date must not be before from date", "invalid_date_range");
  }
  const rangeDays = Math.round((to.utcMs - from.utcMs) / DAY_MS) + 1;
  if (rangeDays > MAX_RANGE_DAYS) {
    throw new GstReportError(
      `Date range cannot exceed ${MAX_RANGE_DAYS} days`,
      "date_range_too_large"
    );
  }

  const documentMode = String(query.documentMode || "TAX_INVOICE").trim().toUpperCase();
  const status = String(query.status || "ALL").trim().toUpperCase();
  if (!DOCUMENT_MODES.has(documentMode)) {
    throw new GstReportError("Document mode is invalid", "invalid_document_mode");
  }
  if (!INVOICE_STATUSES.has(status)) {
    throw new GstReportError("Invoice status is invalid", "invalid_invoice_status");
  }

  return {
    from: from.text,
    to: to.text,
    fromDate: toIstBoundary(from),
    toExclusiveDate: toIstBoundary(addUtcDays(to, 1)),
    rangeDays,
    documentMode,
    status,
    page: positiveInteger(query.page, 1, Number.MAX_SAFE_INTEGER),
    pageSize: positiveInteger(query.pageSize, 25, 100),
  };
}

function buildGstReportQuery(vendorId, filters) {
  const query = {
    vendorId,
    "gstInvoiceSnapshot.invoiceIssueDate": {
      $gte: filters.fromDate,
      $lt: filters.toExclusiveDate,
    },
    "gstInvoiceSnapshot.documentMode": filters.documentMode,
    "gstInvoiceSnapshot.invoiceNumber": { $type: "string" },
  };
  if (filters.status !== "ALL") query.status = filters.status;
  else query.status = { $in: ["COMPLETED", "CANCELLED", "SUPERSEDED"] };
  return query;
}

function assertPaise(value, field, billId) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new GstReportError(
      `Stored GST amount ${field} is invalid for bill ${billId}`,
      "invalid_gst_snapshot",
      500
    );
  }
  return value;
}

function normalizeInvoice(bill) {
  const snapshot = bill?.gstInvoiceSnapshot;
  const billId = String(bill?._id || "unknown");
  if (!snapshot || !Array.isArray(snapshot.items) || !snapshot.totals) {
    throw new GstReportError(
      `GST snapshot is incomplete for bill ${billId}`,
      "invalid_gst_snapshot",
      500
    );
  }
  const totals = {};
  MONEY_FIELDS.forEach((field) => {
    totals[field] = assertPaise(snapshot.totals[field], field, billId);
  });
  const items = snapshot.items.map((item, index) => ({
    gstRateBps: (() => {
      const rate = assertPaise(item.gstRateBps, `items[${index}].gstRateBps`, billId);
      if (rate > 10000) {
        throw new GstReportError(
          `Stored GST rate is invalid for bill ${billId}`,
          "invalid_gst_snapshot",
          500
        );
      }
      return rate;
    })(),
    taxableValuePaise: assertPaise(item.taxableValuePaise, `items[${index}].taxableValuePaise`, billId),
    cgstPaise: assertPaise(item.cgstPaise, `items[${index}].cgstPaise`, billId),
    sgstPaise: assertPaise(item.sgstPaise, `items[${index}].sgstPaise`, billId),
    utgstPaise: assertPaise(item.utgstPaise, `items[${index}].utgstPaise`, billId),
    igstPaise: assertPaise(item.igstPaise, `items[${index}].igstPaise`, billId),
    totalGstPaise: assertPaise(item.totalGstPaise, `items[${index}].totalGstPaise`, billId),
  }));
  const issueDate = new Date(snapshot.invoiceIssueDate);
  if (Number.isNaN(issueDate.getTime())) {
    throw new GstReportError(`GST invoice date is invalid for bill ${billId}`, "invalid_gst_snapshot", 500);
  }
  return {
    billId,
    invoiceDate: issueDate.toISOString(),
    invoiceNumber: String(snapshot.invoiceNumber || ""),
    documentMode: String(snapshot.documentMode || "TAX_INVOICE"),
    pricingMode: String(snapshot.pricingMode || ""),
    status: String(bill.status || ""),
    customerName: String(bill.customerNameSnapshot || "Walk-in"),
    customerGstin: "",
    totals,
    items,
    cancelledAt: bill.cancelledAt ? new Date(bill.cancelledAt).toISOString() : null,
    cancellationReason: String(bill.cancellationReason || ""),
  };
}

function emptyTotals() {
  return Object.fromEntries(MONEY_FIELDS.map((field) => [field, 0]));
}

function addSafe(left, right, field) {
  const total = left + right;
  if (!Number.isSafeInteger(total)) {
    throw new GstReportError(`GST report ${field} exceeds the safe integer range`, "report_amount_out_of_range", 500);
  }
  return total;
}

function summarizeInvoices(invoices) {
  const createBucket = () => ({ invoiceCount: 0, ...emptyTotals() });
  const summary = {
    all: createBucket(),
    active: createBucket(),
    cancelled: createBucket(),
    superseded: createBucket(),
  };
  invoices.forEach((invoice) => {
    const bucket = invoice.status === "CANCELLED"
      ? summary.cancelled
      : invoice.status === "SUPERSEDED"
        ? summary.superseded
        : summary.active;
    [summary.all, bucket].forEach((target) => {
      target.invoiceCount += 1;
      MONEY_FIELDS.forEach((field) => {
        target[field] = addSafe(target[field], invoice.totals[field], field);
      });
    });
  });
  return summary;
}

function buildTaxRateBreakup(invoices) {
  return invoices.flatMap((invoice) => {
    const groups = new Map();
    invoice.items.forEach((item) => {
      const current = groups.get(item.gstRateBps) || {
        gstRateBps: item.gstRateBps,
        taxableValuePaise: 0,
        cgstPaise: 0,
        sgstPaise: 0,
        utgstPaise: 0,
        igstPaise: 0,
        totalGstPaise: 0,
      };
      Object.keys(current).forEach((field) => {
        if (field !== "gstRateBps") current[field] = addSafe(current[field], item[field], field);
      });
      groups.set(item.gstRateBps, current);
    });
    return [...groups.values()].map((group) => ({
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      documentMode: invoice.documentMode,
      status: invoice.status,
      ...group,
    }));
  });
}

async function loadGstReport({ vendorId, query = {}, includeTaxRateBreakup = false, paginate = true }) {
  const filters = resolveGstReportFilters(query);
  const mongoQuery = buildGstReportQuery(vendorId, filters);
  const bills = await BillingSession.find(mongoQuery)
    .select("_id status customerNameSnapshot cancelledAt cancellationReason gstInvoiceSnapshot")
    .sort({ "gstInvoiceSnapshot.invoiceIssueDate": -1, _id: -1 })
    .limit(MAX_REPORT_ROWS + 1)
    .lean();
  if (bills.length > MAX_REPORT_ROWS) {
    throw new GstReportError(
      "The selected report is too large. Choose a narrower date range.",
      "report_too_large",
      413
    );
  }
  const invoices = bills.map(normalizeInvoice);
  const start = (filters.page - 1) * filters.pageSize;
  return {
    filters: {
      from: filters.from,
      to: filters.to,
      documentMode: filters.documentMode,
      status: filters.status,
    },
    summary: summarizeInvoices(invoices),
    pagination: {
      page: filters.page,
      pageSize: filters.pageSize,
      totalRecords: invoices.length,
      totalPages: Math.max(Math.ceil(invoices.length / filters.pageSize), 1),
    },
    invoices: paginate ? invoices.slice(start, start + filters.pageSize) : invoices,
    ...(includeTaxRateBreakup ? { taxRateBreakup: buildTaxRateBreakup(invoices) } : {}),
  };
}

module.exports = {
  DOCUMENT_MODES,
  INVOICE_STATUSES,
  MAX_RANGE_DAYS,
  GstReportError,
  buildGstReportQuery,
  buildTaxRateBreakup,
  loadGstReport,
  normalizeInvoice,
  resolveGstReportFilters,
  summarizeInvoices,
};
