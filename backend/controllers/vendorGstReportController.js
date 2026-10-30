const mongoose = require("mongoose");
const { GstReportError, loadGstReport } = require("../services/gstReportService");
const {
  INVOICE_EXPORT_HEADERS,
  TAX_RATE_EXPORT_HEADERS,
  buildGstReportWorkbook,
  invoiceExportRows,
  rowsToCsv,
  taxRateExportRows,
} = require("../services/gstReportExportService");

function authorizedVendorId(req) {
  return String(req.vendorWriteAuth?.vendorId || "");
}

function safeFilePart(value) {
  return String(value || "report").replace(/[^A-Za-z0-9_-]/g, "_");
}

function handleError(res, error) {
  if (error instanceof GstReportError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
      code: error.code,
    });
  }
  console.error("GST report error:", error?.message || error);
  return res.status(500).json({ success: false, message: "Unable to load GST report" });
}

async function getGstReport(req, res) {
  try {
    const vendorId = authorizedVendorId(req);
    if (!mongoose.isValidObjectId(vendorId)) {
      return res.status(400).json({ success: false, message: "Vendor ID is invalid" });
    }
    const report = await loadGstReport({ vendorId, query: req.query, paginate: true });
    return res.json({ success: true, data: report });
  } catch (error) {
    return handleError(res, error);
  }
}

async function exportGstReportExcel(req, res) {
  try {
    const vendorId = authorizedVendorId(req);
    if (!mongoose.isValidObjectId(vendorId)) {
      return res.status(400).json({ success: false, message: "Vendor ID is invalid" });
    }
    const report = await loadGstReport({
      vendorId,
      query: req.query,
      includeTaxRateBreakup: true,
      paginate: false,
    });
    const buffer = buildGstReportWorkbook(report);
    const name = `gst-report-${safeFilePart(report.filters.from)}-to-${safeFilePart(report.filters.to)}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    return res.send(buffer);
  } catch (error) {
    return handleError(res, error);
  }
}

async function exportGstReportCsv(req, res) {
  try {
    const vendorId = authorizedVendorId(req);
    if (!mongoose.isValidObjectId(vendorId)) {
      return res.status(400).json({ success: false, message: "Vendor ID is invalid" });
    }
    const dataset = String(req.query.dataset || "invoices").toLowerCase();
    if (!new Set(["invoices", "tax-rates"]).has(dataset)) {
      throw new GstReportError("CSV dataset is invalid", "invalid_csv_dataset");
    }
    const report = await loadGstReport({
      vendorId,
      query: req.query,
      includeTaxRateBreakup: dataset === "tax-rates",
      paginate: false,
    });
    const rows = dataset === "tax-rates"
      ? taxRateExportRows(report.taxRateBreakup)
      : invoiceExportRows(report.invoices);
    const name = `gst-${dataset}-${safeFilePart(report.filters.from)}-to-${safeFilePart(report.filters.to)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    return res.send(rowsToCsv(
      rows,
      dataset === "tax-rates" ? TAX_RATE_EXPORT_HEADERS : INVOICE_EXPORT_HEADERS
    ));
  } catch (error) {
    return handleError(res, error);
  }
}

module.exports = { exportGstReportCsv, exportGstReportExcel, getGstReport };
