"use client";

import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "../../../config";
import { getVendorAuthHeaders } from "../../utils/vendorAuth";
import "./GstReports.css";

const MONEY_CARDS = [
  ["Gross Sales", "grossAmountPaise"],
  ["Membership Discount", "membershipDiscountPaise"],
  ["Manual Discount", "manualDiscountPaise"],
  ["Total Discounts", "totalDiscountPaise"],
  ["Taxable Value", "taxableValuePaise"],
  ["CGST", "cgstPaise"],
  ["SGST", "sgstPaise"],
  ["UTGST", "utgstPaise"],
  ["IGST", "igstPaise"],
  ["Total GST", "totalGstPaise"],
  ["Invoice Value", "invoiceTotalPaise"],
  ["Loyalty Redemption", "loyaltyRedemptionPaise"],
  ["Amount at Bill Completion", "customerPayablePaise"],
];

function getIstParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function ymd(parts) {
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getPresetRange(preset) {
  const today = getIstParts();
  const to = ymd(today);
  return preset === "today"
    ? { from: to, to }
    : { from: `${today.year}-${today.month}-01`, to };
}

function formatMoney(paise) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(paise || 0) / 100);
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function buildQuery(filters, page = 1, includePage = true) {
  const params = new URLSearchParams({
    from: filters.from,
    to: filters.to,
    status: filters.status,
    documentMode: filters.documentMode,
  });
  if (includePage) {
    params.set("page", String(page));
    params.set("pageSize", "25");
  }
  return params.toString();
}

export default function GstReports({ vendorId }) {
  const initialRange = useMemo(() => getPresetRange("month"), []);
  const [preset, setPreset] = useState("month");
  const [filters, setFilters] = useState({
    ...initialRange,
    status: "ALL",
    documentMode: "TAX_INVOICE",
  });
  const [page, setPage] = useState(1);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState("");

  useEffect(() => {
    if (!vendorId) return;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/vendor/gst-reports/${encodeURIComponent(vendorId)}?${buildQuery(filters, page)}`,
          {
            headers: getVendorAuthHeaders(vendorId),
            cache: "no-store",
            signal: controller.signal,
          }
        );
        const payload = await response.json();
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.message || "Unable to load GST report");
        }
        setReport(payload.data);
      } catch (loadError) {
        if (loadError.name !== "AbortError") setError(loadError.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [vendorId, filters, page]);

  function applyPreset(nextPreset) {
    setPreset(nextPreset);
    setPage(1);
    if (nextPreset !== "custom") {
      setFilters((current) => ({ ...current, ...getPresetRange(nextPreset) }));
    }
  }

  function updateFilter(field, value) {
    setPage(1);
    setFilters((current) => ({ ...current, [field]: value }));
  }

  async function download(type, dataset = "") {
    const key = `${type}-${dataset}`;
    setDownloading(key);
    setError("");
    try {
      const suffix = type === "excel" ? "export.xlsx" : "export.csv";
      const query = new URLSearchParams(buildQuery(filters, 1, false));
      if (dataset) query.set("dataset", dataset);
      const response = await fetch(
        `${API_BASE_URL}/api/vendor/gst-reports/${encodeURIComponent(vendorId)}/${suffix}?${query}`,
        { headers: getVendorAuthHeaders(vendorId) }
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message || "Unable to download GST report");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const fileName = disposition.match(/filename="([^"]+)"/)?.[1] || `gst-report.${type === "excel" ? "xlsx" : "csv"}`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError.message);
    } finally {
      setDownloading("");
    }
  }

  const summary = report?.summary?.all || {};
  const cancelled = report?.summary?.cancelled || {};
  const invoices = report?.invoices || [];
  const pagination = report?.pagination || { page: 1, totalPages: 1, totalRecords: 0 };

  return (
    <section className="gst-reports" aria-labelledby="gst-reports-title">
      <div className="gst-reports-heading">
        <div>
          <p>Tax reconciliation</p>
          <h2 id="gst-reports-title">GST Reports</h2>
        </div>
        <span className={`gst-report-mode gst-report-mode-${filters.documentMode.toLowerCase()}`}>
          {filters.documentMode.replaceAll("_", " ")}
        </span>
      </div>

      <div className="gst-report-presets" aria-label="Date presets">
        {[['today', 'Today'], ['month', 'This Month'], ['custom', 'Custom Range']].map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={preset === value ? "active" : ""}
            onClick={() => applyPreset(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="gst-report-filters">
        <label>
          From
          <input type="date" value={filters.from} onChange={(event) => { setPreset("custom"); updateFilter("from", event.target.value); }} />
        </label>
        <label>
          To
          <input type="date" value={filters.to} onChange={(event) => { setPreset("custom"); updateFilter("to", event.target.value); }} />
        </label>
        <label>
          Invoice status
          <select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}>
            <option value="ALL">All statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="SUPERSEDED">Superseded</option>
          </select>
        </label>
        <label>
          Document mode
          <select value={filters.documentMode} onChange={(event) => updateFilter("documentMode", event.target.value)}>
            <option value="TAX_INVOICE">Tax Invoice</option>
            <option value="TEST">Test</option>
            <option value="NON_TAX_INVOICE">Non-Tax Invoice</option>
          </select>
        </label>
      </div>

      {error && <div className="gst-report-error" role="alert">{error}</div>}
      {loading ? (
        <div className="gst-report-state">Loading GST report...</div>
      ) : (
        <>
          <div className="gst-report-cards">
            <article><span>Invoices</span><strong>{summary.invoiceCount || 0}</strong></article>
            {MONEY_CARDS.map(([label, field]) => (
              <article key={field}><span>{label}</span><strong>{formatMoney(summary[field])}</strong></article>
            ))}
          </div>

          <div className="gst-report-cancelled-note">
            <strong>{cancelled.invoiceCount || 0} cancelled invoice(s)</strong>
            <span>{formatMoney(cancelled.invoiceTotalPaise)} invoice value shown separately and not reversed.</span>
          </div>

          <div className="gst-report-actions">
            <button type="button" onClick={() => download("excel")} disabled={Boolean(downloading)}>
              {downloading === "excel-" ? "Preparing..." : "Download Excel"}
            </button>
            <button type="button" onClick={() => download("csv", "invoices")} disabled={Boolean(downloading)}>
              Invoice CSV
            </button>
            <button type="button" onClick={() => download("csv", "tax-rates")} disabled={Boolean(downloading)}>
              Tax Rate CSV
            </button>
          </div>

          {invoices.length === 0 ? (
            <div className="gst-report-state">No GST invoices match these filters.</div>
          ) : (
            <div className="gst-report-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th><th>Invoice</th><th>Customer</th><th>Customer GSTIN</th><th>Status</th>
                    <th>Gross</th><th>Membership Discount</th><th>Manual Discount</th><th>Total Discounts</th><th>Taxable</th><th>CGST</th>
                    <th>SGST</th><th>UTGST</th><th>IGST</th><th>Total GST</th>
                    <th>Invoice Total</th><th>Loyalty</th><th>Amount at Bill Completion</th><th>Cancellation</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.billId}>
                      <td>{formatDate(invoice.invoiceDate)}</td>
                      <td><strong>{invoice.invoiceNumber}</strong><small>{invoice.documentMode.replaceAll("_", " ")}</small></td>
                      <td>{invoice.customerName || "Walk-in"}</td>
                      <td>{invoice.customerGstin || "-"}</td>
                      <td><span className={`gst-report-status gst-report-status-${invoice.status.toLowerCase()}`}>{invoice.status}</span></td>
                      <td>{formatMoney(invoice.totals.grossAmountPaise)}</td>
                      <td>{formatMoney(invoice.totals.membershipDiscountPaise)}</td>
                      <td>{formatMoney(invoice.totals.manualDiscountPaise)}</td>
                      <td>{formatMoney(invoice.totals.totalDiscountPaise)}</td>
                      <td>{formatMoney(invoice.totals.taxableValuePaise)}</td>
                      <td>{formatMoney(invoice.totals.cgstPaise)}</td>
                      <td>{formatMoney(invoice.totals.sgstPaise)}</td>
                      <td>{formatMoney(invoice.totals.utgstPaise)}</td>
                      <td>{formatMoney(invoice.totals.igstPaise)}</td>
                      <td>{formatMoney(invoice.totals.totalGstPaise)}</td>
                      <td>{formatMoney(invoice.totals.invoiceTotalPaise)}</td>
                      <td>{formatMoney(invoice.totals.loyaltyRedemptionPaise)}</td>
                      <td>{formatMoney(invoice.totals.customerPayablePaise)}</td>
                      <td>{invoice.status === "CANCELLED" ? <><span>{formatDate(invoice.cancelledAt)}</span><small>{invoice.cancellationReason || "No reason recorded"}</small></> : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="gst-report-pagination">
            <span>{pagination.totalRecords} invoice(s)</span>
            <div>
              <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button>
              <span>Page {pagination.page} of {pagination.totalPages}</span>
              <button type="button" disabled={page >= pagination.totalPages} onClick={() => setPage((current) => current + 1)}>Next</button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
