"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../../config";
import { getVendorAuthHeaders } from "../../utils/vendorAuth";
import { printReceiptSnapshot } from "../../utils/receiptPrint";
import PrepaidRevenueSummary from "./PrepaidRevenueSummary";
import RevenueTrendChart from "./RevenueTrendChart";
import { buildReceiptSnapshotFromBillDetail } from "./billReceiptSnapshot.mjs";
import {
  chooseInitialDay,
  calculateRevenueAverages,
  getIstDayRange,
  mergeBillPages,
  normalizeTrendPoint,
} from "./revenueAnalytics.mjs";

const PAGE_SIZE = 25;
const currencyFmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const averageCurrencyFmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function emptySummary() {
  return {
    totalBills: 0,
    billValue: 0,
    discountsGiven: 0,
    rewardsRedeemed: 0,
    netCollected: 0,
    onlineCollected: 0,
    cashCollected: 0,
    notRecordedCollected: 0,
    prepaidReporting: {},
  };
}

function normalizeSummary(source) {
  const summary = source || {};
  return {
    totalBills: Number(summary.totalBills || 0),
    billValue: Number(summary.billValue || 0),
    discountsGiven: Number(summary.discountsGiven || 0),
    rewardsRedeemed: Number(summary.rewardsRedeemed || 0),
    netCollected: Number(summary.netCollected || 0),
    onlineCollected: Number(summary.onlineCollected || 0),
    cashCollected: Number(summary.cashCollected || 0),
    notRecordedCollected: Number(summary.notRecordedCollected || 0),
    prepaidReporting: summary.prepaidReporting || {},
  };
}

function formatDate(value) {
  if (!value) return "Selected day";
  return new Date(`${value}T12:00:00+05:30`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

function formatDateTime(value) {
  return value
    ? new Date(value).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: "Asia/Kolkata",
      })
    : "-";
}

function getBillFinancials(bill) {
  const billValue = Number(bill?.billValue ?? bill?.grossAmount ?? bill?.netBillValue ?? bill?.total ?? 0);
  const rewards = Number(bill?.rewardsRedeemedValue ?? bill?.redeemed ?? 0);
  const netCollected = Number(bill?.netCollected ?? Math.max(Number(bill?.netBillValue ?? bill?.total ?? 0) - rewards, 0));
  return { billValue, rewards, netCollected: Math.max(netCollected, 0) };
}

function getPaymentLabel(bill) {
  if (bill?.paymentMode === "SPLIT" && bill?.paymentBreakdown) {
    return `Cash ${currencyFmt.format(Number(bill.paymentBreakdown.cashAmountPaise || 0) / 100)} + Online ${currencyFmt.format(Number(bill.paymentBreakdown.onlineAmountPaise || 0) / 100)}`;
  }
  return bill?.paymentModeLabel || bill?.paymentMode || "Not Recorded";
}

function SummaryGrid({ summary, title }) {
  const averages = calculateRevenueAverages({
    grossBillValue: summary.billValue,
    netCollected: summary.netCollected,
    completedBills: summary.totalBills,
  });
  const cards = [
    ["Completed Bills", summary.totalBills],
    ["Gross Bill Value", currencyFmt.format(summary.billValue)],
    ["Discounts", currencyFmt.format(summary.discountsGiven)],
    ["Rewards Redeemed", currencyFmt.format(summary.rewardsRedeemed)],
    ["Net Collected", currencyFmt.format(summary.netCollected)],
    ["Average Bill Value", averageCurrencyFmt.format(averages.averageBillValue)],
    ["Average Collection", averageCurrencyFmt.format(averages.averageCollection)],
  ];
  return (
    <div className="revenue-analytics-summary">
      <div className="revenue-panel-section-title">{title}</div>
      <div className="revenue-panel-stat-grid revenue-analytics-stat-grid">
        {cards.map(([label, value]) => (
          <div className="revenue-panel-stat-card" key={label}>
            <div className="revenue-panel-stat-label">{label}</div>
            <div className="revenue-panel-stat-value">{value}</div>
          </div>
        ))}
      </div>
      <div className="revenue-analytics-payment-grid">
        <span>Cash <strong>{currencyFmt.format(summary.cashCollected)}</strong></span>
        <span>Online <strong>{currencyFmt.format(summary.onlineCollected)}</strong></span>
        <span>Not Recorded <strong>{currencyFmt.format(summary.notRecordedCollected)}</strong></span>
      </div>
    </div>
  );
}

export default function RevenuePeriodAnalytics({
  vendorId,
  monthKey,
  periodLabel,
  periodFrom,
  periodTo,
  showPeriodSummary = false,
  defaultChartType = "bar",
}) {
  const [trend, setTrend] = useState([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [periodSummary, setPeriodSummary] = useState(() => emptySummary());
  const [daySummary, setDaySummary] = useState(() => emptySummary());
  const [bills, setBills] = useState([]);
  const [pagination, setPagination] = useState({ hasMore: false, nextCursor: null });
  const [expandedBills, setExpandedBills] = useState({});
  const [loadingPeriod, setLoadingPeriod] = useState(true);
  const [loadingDay, setLoadingDay] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [printingBillId, setPrintingBillId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!vendorId || !monthKey) return;
    let cancelled = false;

    const loadPeriod = async () => {
      try {
        setLoadingPeriod(true);
        setError("");
        const trendParams = new URLSearchParams({ vendorId, month: monthKey });
        const summaryParams = new URLSearchParams({ vendorId });
        if (periodFrom && periodTo) {
          summaryParams.set("from", periodFrom);
          summaryParams.set("to", periodTo);
          summaryParams.set("endMode", "exclusive");
        }
        const requests = [
          fetch(`${API_BASE_URL}/api/vendor/dashboard/daily-trend?${trendParams}`, {
            cache: "no-store",
            headers: getVendorAuthHeaders(vendorId),
          }),
        ];
        if (showPeriodSummary && periodFrom && periodTo) {
          requests.push(fetch(`${API_BASE_URL}/api/vendor/dashboard/bills-summary?${summaryParams}`, {
            cache: "no-store",
            headers: getVendorAuthHeaders(vendorId),
          }));
        }
        const responses = await Promise.all(requests);
        if (responses.some((response) => !response.ok)) throw new Error("Unable to load revenue analytics");
        const trendJson = await responses[0].json();
        const points = (Array.isArray(trendJson?.data) ? trendJson.data : []).map(normalizeTrendPoint);
        const summaryJson = responses[1] ? await responses[1].json() : null;
        if (!cancelled) {
          setTrend(points);
          setSelectedDate((current) => chooseInitialDay(points, current));
          setPeriodSummary(normalizeSummary(summaryJson?.data));
        }
      } catch (loadError) {
        console.error("Failed to load revenue analytics", loadError);
        if (!cancelled) {
          setTrend([]);
          setSelectedDate("");
          setPeriodSummary(emptySummary());
          setError("Revenue analytics could not be loaded. Please try again.");
        }
      } finally {
        if (!cancelled) setLoadingPeriod(false);
      }
    };

    loadPeriod();
    return () => { cancelled = true; };
  }, [vendorId, monthKey, periodFrom, periodTo, showPeriodSummary]);

  useEffect(() => {
    if (!vendorId || !selectedDate) {
      setDaySummary(emptySummary());
      setBills([]);
      setPagination({ hasMore: false, nextCursor: null });
      return;
    }
    let cancelled = false;

    const loadDay = async () => {
      try {
        setLoadingDay(true);
        setError("");
        const range = getIstDayRange(selectedDate);
        const common = { vendorId, from: range.from, to: range.to, endMode: range.endMode };
        const summaryParams = new URLSearchParams(common);
        const billsParams = new URLSearchParams({ ...common, limit: String(PAGE_SIZE) });
        const [summaryRes, billsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/vendor/dashboard/bills-summary?${summaryParams}`, {
            cache: "no-store",
            headers: getVendorAuthHeaders(vendorId),
          }),
          fetch(`${API_BASE_URL}/api/vendor/dashboard/bills?${billsParams}`, {
            cache: "no-store",
            headers: getVendorAuthHeaders(vendorId),
          }),
        ]);
        if (!summaryRes.ok || !billsRes.ok) throw new Error("Unable to load selected day");
        const summaryJson = await summaryRes.json();
        const billsJson = await billsRes.json();
        if (!cancelled) {
          setDaySummary(normalizeSummary(summaryJson?.data));
          setBills(Array.isArray(billsJson?.data) ? billsJson.data : []);
          setPagination(billsJson?.pagination || { hasMore: false, nextCursor: null });
          setExpandedBills({});
        }
      } catch (loadError) {
        console.error("Failed to load selected revenue day", loadError);
        if (!cancelled) {
          setDaySummary(emptySummary());
          setBills([]);
          setPagination({ hasMore: false, nextCursor: null });
          setError("The selected day's bills could not be loaded.");
        }
      } finally {
        if (!cancelled) setLoadingDay(false);
      }
    };

    loadDay();
    return () => { cancelled = true; };
  }, [vendorId, selectedDate]);

  const loadMore = async () => {
    if (!pagination.hasMore || !pagination.nextCursor || loadingMore) return;
    try {
      setLoadingMore(true);
      const range = getIstDayRange(selectedDate);
      const params = new URLSearchParams({
        vendorId,
        from: range.from,
        to: range.to,
        endMode: range.endMode,
        limit: String(PAGE_SIZE),
        cursor: pagination.nextCursor,
      });
      const response = await fetch(`${API_BASE_URL}/api/vendor/dashboard/bills?${params}`, {
        cache: "no-store",
        headers: getVendorAuthHeaders(vendorId),
      });
      if (!response.ok) throw new Error("Unable to load more bills");
      const json = await response.json();
      setBills((current) => mergeBillPages(current, Array.isArray(json?.data) ? json.data : []));
      setPagination(json?.pagination || { hasMore: false, nextCursor: null });
    } catch (loadError) {
      console.error("Failed to load more revenue bills", loadError);
      setError("More bills could not be loaded. Please retry.");
    } finally {
      setLoadingMore(false);
    }
  };

  const printBill = async (billId) => {
    if (!billId || printingBillId) return;
    try {
      setPrintingBillId(String(billId));
      setError("");
      const response = await fetch(
        `${API_BASE_URL}/api/billing/${encodeURIComponent(billId)}/vendor-detail`,
        { cache: "no-store", headers: getVendorAuthHeaders(vendorId) }
      );
      const json = await response.json();
      if (!response.ok || !json?.data) throw new Error(json?.message || "Unable to load bill");
      printReceiptSnapshot(buildReceiptSnapshotFromBillDetail(json.data));
    } catch (printError) {
      console.error("Failed to print revenue bill", printError);
      setError(printError.message || "The bill could not be printed.");
    } finally {
      setPrintingBillId("");
    }
  };

  if (loadingPeriod) return <div className="revenue-panel-loading">Loading revenue trend...</div>;

  return (
    <div className="revenue-analytics">
      {error ? <div className="revenue-panel-action-error" role="alert">{error}</div> : null}
      {showPeriodSummary ? <SummaryGrid summary={periodSummary} title={`${periodLabel} Summary`} /> : null}

      <div className="revenue-panel-section-title">
        Daily Net Collection
        <span className="revenue-panel-section-note">Tap a day to inspect bills</span>
      </div>
      {trend.length === 0 ? (
        <div className="revenue-panel-empty">No daily reporting data is available for {periodLabel}.</div>
      ) : (
        <RevenueTrendChart
          points={trend}
          selectedKey={selectedDate}
          onSelect={setSelectedDate}
          ariaLabel={`${periodLabel} daily net collection`}
          defaultType={defaultChartType}
        />
      )}

      {selectedDate ? (
        <div className="revenue-analytics-day">
          {loadingDay ? (
            <div className="revenue-panel-loading">Loading {formatDate(selectedDate)}...</div>
          ) : (
            <>
              <SummaryGrid summary={daySummary} title={formatDate(selectedDate)} />
              <PrepaidRevenueSummary reporting={daySummary.prepaidReporting} title="Selected Day Prepaid Membership" />
              <div className="revenue-panel-section-title revenue-analytics-bills-title">
                Completed Bills
                <span className="revenue-panel-section-note">{daySummary.totalBills} total</span>
              </div>
              {bills.length === 0 ? (
                <div className="revenue-panel-empty">No completed bills for this day.</div>
              ) : (
                <div className="revenue-panel-list">
                  {bills.map((bill) => {
                    const billKey = String(bill.billId || `${bill.phone}-${bill.createdAt}`);
                    const expanded = expandedBills[billKey] === true;
                    const financials = getBillFinancials(bill);
                    return (
                      <article className="revenue-panel-list-item" key={billKey}>
                        <div className="revenue-panel-bill-content">
                          <div className="revenue-panel-list-main">Bill #{String(bill.billId || "").slice(-8).toUpperCase()}</div>
                          <div className="revenue-panel-list-sub">
                            {bill.customerLabel || bill.phone || "Walk-in"} • {formatDateTime(bill.createdAt)}
                          </div>
                          <div className="revenue-panel-chip-row">
                            <span className="revenue-panel-chip">Gross Bill Value {currencyFmt.format(financials.billValue)}</span>
                            <span className="revenue-panel-chip">Rewards {currencyFmt.format(financials.rewards)}</span>
                            <span className="revenue-panel-chip">Net Collected {currencyFmt.format(financials.netCollected)}</span>
                            <span className="revenue-panel-chip">{getPaymentLabel(bill)}</span>
                          </div>
                          {expanded ? (
                            <div className="revenue-panel-items-list">
                              {(bill.items || []).map((item, index) => (
                                <div className="revenue-panel-item-row" key={`${billKey}-${item.itemId || index}`}>
                                  <div>
                                    <div className="revenue-panel-item-name">{item.name || "Unnamed Item"}</div>
                                    <div className="revenue-panel-item-meta">
                                      Qty {Number(item.qty || 0)}{item.resourceName ? ` • ${item.resourceName}` : ""}
                                    </div>
                                  </div>
                                  <div className="revenue-panel-item-value">{currencyFmt.format(Number(item.total || item.price || 0))}</div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <div className="revenue-panel-bill-actions">
                          <button type="button" className="revenue-panel-expand-btn" onClick={() => setExpandedBills((current) => ({ ...current, [billKey]: !expanded }))}>
                            {expanded ? "Hide items" : "View items"}
                          </button>
                          <button type="button" className="revenue-panel-expand-btn" disabled={printingBillId === billKey} onClick={() => printBill(bill.billId)}>
                            {printingBillId === billKey ? "Preparing..." : "Reprint"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
              {pagination.hasMore ? (
                <button type="button" className="revenue-panel-button secondary revenue-analytics-load-more" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? "Loading..." : "Load More Bills"}
                </button>
              ) : null}
              <p className="revenue-analytics-cancellation-note">
                Cancelled bills are excluded from completed-bill counts. Stored prepaid reversals remain reflected in the reporting summary.
              </p>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
