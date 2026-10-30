const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const XLSX = require("xlsx");

const BillingSession = require("../models/BillingSession");
const {
  buildTaxRateBreakup,
  loadGstReport,
  resolveGstReportFilters,
  summarizeInvoices,
} = require("../services/gstReportService");
const {
  buildGstReportWorkbook,
  invoiceExportRows,
  protectSpreadsheetText,
  rowsToCsv,
} = require("../services/gstReportExportService");

const VENDOR_ID = "692403a24d4d3a1b6a7f0ae5";

function storedBill(overrides = {}) {
  const totals = {
    grossAmountPaise: 10000,
    membershipDiscountPaise: 500,
    manualDiscountPaise: 250,
    totalDiscountPaise: 750,
    taxableValuePaise: 8810,
    cgstPaise: 220,
    sgstPaise: 220,
    utgstPaise: 0,
    igstPaise: 0,
    totalGstPaise: 440,
    invoiceTotalPaise: 9250,
    loyaltyRedemptionPaise: 250,
    customerPayablePaise: 9000,
  };
  return {
    _id: overrides._id || "692403a24d4d3a1b6a7f0af1",
    status: overrides.status || "COMPLETED",
    customerNameSnapshot: overrides.customerNameSnapshot || "Customer",
    cancelledAt: overrides.cancelledAt || null,
    cancellationReason: overrides.cancellationReason || "",
    gstInvoiceSnapshot: {
      invoiceIssueDate: overrides.invoiceIssueDate || new Date("2026-10-15T06:30:00.000Z"),
      invoiceNumber: overrides.invoiceNumber || "GST/26-27/00001",
      documentMode: overrides.documentMode || "TAX_INVOICE",
      pricingMode: overrides.pricingMode || "inclusive",
      totals: { ...totals, ...overrides.totals },
      items: overrides.items || [
        {
          gstRateBps: 500,
          taxableValuePaise: 3810,
          cgstPaise: 95,
          sgstPaise: 95,
          utgstPaise: 0,
          igstPaise: 0,
          totalGstPaise: 190,
        },
        {
          gstRateBps: 500,
          taxableValuePaise: 5000,
          cgstPaise: 125,
          sgstPaise: 125,
          utgstPaise: 0,
          igstPaise: 0,
          totalGstPaise: 250,
        },
      ],
    },
  };
}

test("GST report dates use Asia/Kolkata boundaries and enforce 366 days", () => {
  const filters = resolveGstReportFilters(
    { from: "2026-10-01", to: "2026-10-31" },
    new Date("2026-10-30T16:00:00.000Z")
  );
  assert.equal(filters.fromDate.toISOString(), "2026-09-30T18:30:00.000Z");
  assert.equal(filters.toExclusiveDate.toISOString(), "2026-10-31T18:30:00.000Z");
  assert.equal(filters.documentMode, "TAX_INVOICE");
  assert.equal(filters.status, "ALL");
  assert.throws(
    () => resolveGstReportFilters({ from: "2025-01-01", to: "2026-01-02" }),
    (error) => error.code === "date_range_too_large"
  );
  assert.throws(
    () => resolveGstReportFilters({ from: "2026-02-30", to: "2026-03-01" }),
    (error) => error.code === "invalid_from"
  );
});

test("summary keeps cancelled values visible and separate without reversal", () => {
  const completed = require("../services/gstReportService").normalizeInvoice(storedBill());
  const cancelled = require("../services/gstReportService").normalizeInvoice(storedBill({
    _id: "692403a24d4d3a1b6a7f0af2",
    status: "CANCELLED",
    invoiceNumber: "GST/26-27/00002",
    cancelledAt: new Date("2026-10-20T10:00:00.000Z"),
    cancellationReason: "Customer request",
  }));
  const summary = summarizeInvoices([completed, cancelled]);
  assert.equal(summary.all.invoiceCount, 2);
  assert.equal(summary.all.totalGstPaise, 880);
  assert.equal(summary.active.totalGstPaise, 440);
  assert.equal(summary.cancelled.totalGstPaise, 440);
  assert.equal(summary.cancelled.customerPayablePaise, 9000);
});

test("tax-rate breakup aggregates stored lines sharing a rate without recalculation", () => {
  const invoice = require("../services/gstReportService").normalizeInvoice(storedBill());
  const rows = buildTaxRateBreakup([invoice]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].gstRateBps, 500);
  assert.equal(rows[0].taxableValuePaise, 8810);
  assert.equal(rows[0].cgstPaise, 220);
  assert.equal(rows[0].sgstPaise, 220);
  assert.equal(rows[0].totalGstPaise, 440);
});

test("report query isolates document mode and exports more rows than the visible page", async () => {
  const originalFind = BillingSession.find;
  const bills = Array.from({ length: 30 }, (_, index) => storedBill({
    _id: `692403a24d4d3a1b6a7f${String(index).padStart(3, "0")}`.slice(0, 24),
    invoiceNumber: `GST/26-27/${String(index + 1).padStart(5, "0")}`,
  }));
  let querySeen;
  BillingSession.find = (query) => {
    querySeen = query;
    const chain = {
      select() { return chain; },
      sort() { return chain; },
      limit() { return chain; },
      async lean() { return bills; },
    };
    return chain;
  };
  try {
    const paged = await loadGstReport({
      vendorId: VENDOR_ID,
      query: { from: "2026-10-01", to: "2026-10-31", pageSize: 25 },
    });
    const exported = await loadGstReport({
      vendorId: VENDOR_ID,
      query: { from: "2026-10-01", to: "2026-10-31", pageSize: 25 },
      includeTaxRateBreakup: true,
      paginate: false,
    });
    assert.equal(querySeen["gstInvoiceSnapshot.documentMode"], "TAX_INVOICE");
    assert.equal(paged.invoices.length, 25);
    assert.equal(paged.pagination.totalRecords, 30);
    assert.equal(exported.invoices.length, 30);
    assert.equal(exported.taxRateBreakup.length, 30);
  } finally {
    BillingSession.find = originalFind;
  }
});

test("Excel contains all three sheets and CSV neutralizes spreadsheet formulas", () => {
  const invoice = require("../services/gstReportService").normalizeInvoice(storedBill({
    customerNameSnapshot: "=HYPERLINK(\"bad\")",
  }));
  const report = {
    filters: { from: "2026-10-01", to: "2026-10-31", documentMode: "TAX_INVOICE", status: "ALL" },
    invoices: [invoice],
    summary: summarizeInvoices([invoice]),
    taxRateBreakup: buildTaxRateBreakup([invoice]),
  };
  const workbook = XLSX.read(buildGstReportWorkbook(report), { type: "buffer" });
  assert.deepEqual(workbook.SheetNames, ["Summary", "Invoice Details", "GST Rate Breakup"]);
  assert.equal(protectSpreadsheetText("=SUM(A1:A2)"), "'=SUM(A1:A2)");
  const csv = rowsToCsv(invoiceExportRows([invoice]));
  assert.match(csv, /'=HYPERLINK/);
  assert.doesNotMatch(csv, /,=HYPERLINK/);
});

test("GST report routes require vendor ownership middleware and server mounts them", () => {
  const root = path.resolve(__dirname, "..");
  const routeSource = fs.readFileSync(path.join(root, "routes/vendorGstReportRoutes.js"), "utf8");
  const serverSource = fs.readFileSync(path.join(root, "server.js"), "utf8");
  assert.match(routeSource, /requireVendorAccessFromExistingAuth/);
  assert.match(routeSource, /req\.params\.vendorId/);
  assert.match(routeSource, /export\.xlsx/);
  assert.match(routeSource, /export\.csv/);
  assert.match(serverSource, /api\/vendor\/gst-reports/);
});

test("GST report index supports vendor, document mode, date and status filters", () => {
  const index = BillingSession.schema.indexes().find(([, options]) =>
    options.name === "gst_report_vendor_mode_date_status"
  );
  assert.ok(index);
  assert.deepEqual(index[0], {
    vendorId: 1,
    "gstInvoiceSnapshot.documentMode": 1,
    "gstInvoiceSnapshot.invoiceIssueDate": -1,
    status: 1,
  });
});
