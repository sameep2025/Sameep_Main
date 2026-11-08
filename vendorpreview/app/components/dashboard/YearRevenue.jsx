"use client";

import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "../../../config";
import RevenueSnapshot from "./RevenueSnapshot";
import StaffPerformanceMetrics from "./StaffPerformanceMetrics";
import PrepaidRevenueSummary, { addPrepaidReporting } from "./PrepaidRevenueSummary";
import RevenuePeriodAnalytics from "./RevenuePeriodAnalytics";
import RevenueTrendChart from "./RevenueTrendChart";
import { calculateRevenueAverages } from "./revenueAnalytics.mjs";
import { getVendorAuthHeaders } from "../../utils/vendorAuth";
import "./RevenuePanels.css";

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

function getNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getMonthlyCardNetCollected(month) {
  return getNumber(month?.netCollected);
}

function getRollingSnapshotFileName() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `ynot-revenue-report-last-12-months-${year}-${month}-${day}.png`;
}

export default function YearRevenue({
  vendorId,
  businessName = "Your Business",
  hrEnabled = true,
  hrLabelSingular = "Stylist",
  hrPerformanceTitle = "Stylist Performance",
}) {
  const [activeSection, setActiveSection] = useState("revenue");
  const [summary, setSummary] = useState(null);
  const [months, setMonths] = useState([]);
  const [selectedMonthKey, setSelectedMonthKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [stylists, setStylists] = useState([]);
  const [loadingStylists, setLoadingStylists] = useState(true);
  const [showSnapshot, setShowSnapshot] = useState(false);

  useEffect(() => {
    if (!hrEnabled && activeSection === "stylists") {
      setActiveSection("revenue");
    }
  }, [hrEnabled, activeSection]);

  useEffect(() => {
    if (!vendorId) {
      setSummary(null);
      setMonths([]);
      setSelectedMonthKey("");
      setLoading(false);
      setStylists([]);
      setLoadingStylists(false);
      return;
    }

    let cancelled = false;

    const loadData = async () => {
      try {
        setLoading(true);

        const [summaryRes, fyRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/vendor/dashboard/summary?vendorId=${encodeURIComponent(vendorId)}`, {
            cache: "no-store",
            headers: getVendorAuthHeaders(vendorId),
          }),
          fetch(`${API_BASE_URL}/api/vendor/dashboard/fy-monthly?vendorId=${encodeURIComponent(vendorId)}`, {
            cache: "no-store",
            headers: getVendorAuthHeaders(vendorId),
          }),
        ]);

        if (!summaryRes.ok || !fyRes.ok) {
          throw new Error("Failed to load rolling revenue");
        }

        const summaryJson = await summaryRes.json();
        const fyJson = await fyRes.json();

        if (!cancelled) {
          const nextMonths = Array.isArray(fyJson?.data) ? fyJson.data : [];
          setSummary(summaryJson?.data || null);
          setMonths(nextMonths);
          setSelectedMonthKey((currentKey) => {
            if (nextMonths.some((month) => month.monthKey === currentKey)) {
              return currentKey;
            }

            return (
              nextMonths.find((month) => month.isCurrentMonth)?.monthKey ||
              nextMonths[nextMonths.length - 1]?.monthKey ||
              ""
            );
          });
        }
      } catch (error) {
        console.error("Failed to fetch rolling revenue", error);
        if (!cancelled) {
          setSummary(null);
          setMonths([]);
          setSelectedMonthKey("");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  const selectedMonth = useMemo(() => {
    return (
      months.find((month) => month.monthKey === selectedMonthKey) ||
      months.find((month) => month.isCurrentMonth) ||
      months[months.length - 1] ||
      null
    );
  }, [months, selectedMonthKey]);

  useEffect(() => {
    if (!vendorId) {
      setStylists([]);
      setLoadingStylists(false);
      return;
    }

    let cancelled = false;

    const loadStylists = async () => {
      if (!hrEnabled) {
        if (!cancelled) {
          setStylists([]);
          setLoadingStylists(false);
        }
        return;
      }

      if (!selectedMonth?.startDate || !selectedMonth?.endDate) {
        if (!cancelled) {
          setStylists([]);
          setLoadingStylists(false);
        }
        return;
      }

      try {
        setLoadingStylists(true);
        const params = new URLSearchParams({
          vendorId,
          from: selectedMonth.startDate,
          to: selectedMonth.endDate,
        });
        const res = await fetch(
          `${API_BASE_URL}/api/vendor/dashboard/stylist-performance?${params.toString()}`,
          { cache: "no-store", headers: getVendorAuthHeaders(vendorId) }
        );

        if (!res.ok) {
          throw new Error(`Failed to load ${hrLabelSingular.toLowerCase()} performance`);
        }

        const json = await res.json();
        const rawStylists = Array.isArray(json)
          ? json
          : Array.isArray(json?.data)
            ? json.data
            : [];

        if (!cancelled) {
          setStylists(rawStylists);
        }
      } catch (error) {
        console.error(`Failed to fetch ${hrLabelSingular.toLowerCase()} performance`, error);
        if (!cancelled) {
          setStylists([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingStylists(false);
        }
      }
    };

    loadStylists();

    return () => {
      cancelled = true;
    };
  }, [vendorId, hrEnabled, hrLabelSingular, selectedMonth]);

  const totals = useMemo(() => {
    const summaryRevenue = Number(
      summary?.thisYearRevenue ?? summary?.yearRevenue ?? summary?.yearlyRevenue ?? 0
    );
    const monthlyBillValue = months.reduce(
      (acc, month) => acc + getNumber(month?.billValue ?? month?.netBillValue ?? month?.revenue),
      0
    );
    const discountsGiven = months.reduce(
      (acc, month) => acc + getNumber(month?.discountsGiven),
      0
    );
    const rewardsRedeemed = months.reduce(
      (acc, month) => acc + getNumber(month?.rewardsRedeemed),
      0
    );
    const netCollected = months.reduce(
      (acc, month) => acc + getNumber(month?.netCollected),
      0
    );
    const onlineCollected = months.reduce(
      (acc, month) => acc + getNumber(month?.onlineCollected),
      0
    );
    const cashCollected = months.reduce(
      (acc, month) => acc + getNumber(month?.cashCollected),
      0
    );
    const notRecordedCollected = months.reduce(
      (acc, month) => acc + getNumber(month?.notRecordedCollected),
      0
    );
    const totalOrders = months.reduce((acc, month) => acc + Number(month?.orders || 0), 0);
    const bestMonth = months.reduce((best, month) => {
      if (
        !best ||
        getNumber(month?.billValue ?? month?.netBillValue ?? month?.revenue) >
          getNumber(best?.billValue ?? best?.netBillValue ?? best?.revenue)
      ) {
        return month;
      }
      return best;
    }, null);

    return {
      billValue: monthlyBillValue || summaryRevenue,
      discountsGiven,
      rewardsRedeemed,
      netCollected,
      onlineCollected,
      cashCollected,
      notRecordedCollected,
      totalOrders,
      activeMonths: months.filter((month) =>
        getNumber(month?.billValue ?? month?.netBillValue ?? month?.revenue) > 0
      ).length,
      bestMonth,
      prepaidReporting: addPrepaidReporting(months.map((month) => month.prepaidReporting)),
    };
  }, [months, summary]);

  const selectedMonthLabel = selectedMonth?.label || selectedMonth?.month || "Selected Month";
  const rollingAverages = calculateRevenueAverages({
    grossBillValue: totals.billValue,
    netCollected: totals.netCollected,
    completedBills: totals.totalOrders,
  });
  const monthlyTrend = useMemo(
    () => months.map((month) => ({
      ...month,
      label: month.month || month.label || month.monthKey,
      netCollected: getMonthlyCardNetCollected(month),
      completedBills: Number(month.orders || month.totalBills || 0),
    })),
    [months]
  );
  const rollingPeriodLabel = useMemo(() => {
    if (months.length === 0) return "Rolling 12-month period";

    const first = months[0]?.label || months[0]?.month;
    const last = months[months.length - 1]?.label || months[months.length - 1]?.month;

    if (first && last) {
      return `${first} to ${last}`;
    }

    return "Rolling 12-month period";
  }, [months]);
  return (
    <section className="revenue-panel">
      <RevenueSnapshot
        isOpen={showSnapshot}
        onClose={() => setShowSnapshot(false)}
        businessName={businessName}
        title="Last 12 Months Revenue Summary"
        periodLabel={rollingPeriodLabel}
        summary={{
          billValue: totals.billValue,
          discountsGiven: totals.discountsGiven,
          rewardsRedeemed: totals.rewardsRedeemed,
          netCollected: totals.netCollected,
          totalBills: totals.totalOrders,
          onlineCollected: totals.onlineCollected,
          cashCollected: totals.cashCollected,
          notRecordedCollected: totals.notRecordedCollected,
        }}
        showPointsDistributed={false}
        fileName={getRollingSnapshotFileName()}
      />

      <div className="revenue-panel-header">
        <div className="revenue-panel-title">Last 12 Months Revenue</div>
        <div className="revenue-panel-subtitle">
          Rolling 12-month revenue with month-by-month performance.
        </div>
      </div>
      <div className="revenue-panel-tabs">
        <button
          type="button"
          className={`revenue-panel-tab ${activeSection === "revenue" ? "active" : ""}`}
          onClick={() => setActiveSection("revenue")}
        >
          Revenue
        </button>
        {hrEnabled ? (
          <button
            type="button"
            className={`revenue-panel-tab ${activeSection === "stylists" ? "active" : ""}`}
            onClick={() => setActiveSection("stylists")}
          >
            {hrPerformanceTitle}
          </button>
        ) : null}
      </div>

      {activeSection === "revenue" ? (
        loading ? (
          <div className="revenue-panel-loading">Loading last 12 months revenue...</div>
        ) : (
          <>
            <div className="revenue-snapshot-trigger-row">
              <button
                type="button"
                className="revenue-snapshot-trigger"
                onClick={() => setShowSnapshot(true)}
              >
                Revenue Snapshot
              </button>
            </div>

            <div className="revenue-panel-stat-grid">
              <div className="revenue-panel-stat-card">
                <div className="revenue-panel-stat-label">Gross Bill Value</div>
                <div className="revenue-panel-stat-value">
                  {currencyFmt.format(totals.billValue || 0)}
                </div>
              </div>
              <div className="revenue-panel-stat-card">
                <div className="revenue-panel-stat-label">Discounts Given</div>
                <div className="revenue-panel-stat-value">
                  {currencyFmt.format(totals.discountsGiven || 0)}
                </div>
              </div>
              <div className="revenue-panel-stat-card">
                <div className="revenue-panel-stat-label">Rewards Redeemed</div>
                <div className="revenue-panel-stat-value">
                  {currencyFmt.format(totals.rewardsRedeemed || 0)}
                </div>
              </div>
              <div className="revenue-panel-stat-card">
                <div className="revenue-panel-stat-label">Net Collected</div>
                <div className="revenue-panel-stat-value">
                  {currencyFmt.format(totals.netCollected || 0)}
                </div>
              </div>
              <div className="revenue-panel-stat-card">
                <div className="revenue-panel-stat-label">Total Bills</div>
                <div className="revenue-panel-stat-value">
                  {totals.totalOrders}
                </div>
              </div>
              <div className="revenue-panel-stat-card">
                <div className="revenue-panel-stat-label">Average Bill Value</div>
                <div className="revenue-panel-stat-value">{averageCurrencyFmt.format(rollingAverages.averageBillValue)}</div>
              </div>
              <div className="revenue-panel-stat-card">
                <div className="revenue-panel-stat-label">Average Collection</div>
                <div className="revenue-panel-stat-value">{averageCurrencyFmt.format(rollingAverages.averageCollection)}</div>
              </div>
            </div>

            <PrepaidRevenueSummary reporting={totals.prepaidReporting} />

            <div className="revenue-panel-payment-breakdown">
              <div className="revenue-panel-payment-title">Payment Breakdown</div>
              <div className="revenue-panel-payment-row">
                <span>Online</span>
                <strong>{currencyFmt.format(totals.onlineCollected || 0)}</strong>
              </div>
              <div className="revenue-panel-payment-row">
                <span>Cash</span>
                <strong>{currencyFmt.format(totals.cashCollected || 0)}</strong>
              </div>
              <div className="revenue-panel-payment-row">
                <span>Not Recorded</span>
                <strong>{currencyFmt.format(totals.notRecordedCollected || 0)}</strong>
              </div>
            </div>

            <div className="revenue-panel-section">
              <div className="revenue-panel-section-title">
                Monthly Breakdown
                {selectedMonth ? (
                  <span className="revenue-panel-section-note">
                    Selected: {selectedMonthLabel}
                  </span>
                ) : null}
              </div>
              {months.length === 0 ? (
                <div className="revenue-panel-empty">No revenue data found for the last 12 months.</div>
              ) : (
                <RevenueTrendChart
                  points={monthlyTrend}
                  selectedKey={selectedMonth?.monthKey || ""}
                  onSelect={setSelectedMonthKey}
                  keyField="monthKey"
                  labelField="label"
                  ariaLabel="Last 12 months net collection"
                  defaultType="line"
                />
              )}
            </div>

            <div className="revenue-panel-section">
              {selectedMonth ? (
                <RevenuePeriodAnalytics
                  vendorId={vendorId}
                  monthKey={selectedMonth.monthKey}
                  periodLabel={selectedMonthLabel}
                  periodFrom={selectedMonth.startDate}
                  periodTo={selectedMonth.endDate}
                  showPeriodSummary
                />
              ) : null}
            </div>
          </>
        )
      ) : (
        <div className="revenue-panel-section">
          <div className="revenue-panel-section-title">
            {hrPerformanceTitle}
            {selectedMonth ? (
              <span className="revenue-panel-section-note">
                {selectedMonthLabel}
              </span>
            ) : null}
          </div>
          {loadingStylists ? (
            <div className="revenue-panel-loading">{`Loading ${hrLabelSingular.toLowerCase()} performance...`}</div>
          ) : stylists.length === 0 ? (
            <div className="revenue-panel-empty">
              {`No ${hrLabelSingular.toLowerCase()} performance data available for ${selectedMonthLabel}.`}
            </div>
          ) : (
            <div className="revenue-panel-list">
              {stylists.map((row, index) => (
                <StaffPerformanceMetrics
                  key={row._id || row.stylist || index}
                  row={row}
                  fallbackName={`${hrLabelSingular} ${index + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
