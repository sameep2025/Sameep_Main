"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../../config";
import RevenueSnapshot from "./RevenueSnapshot";
import StaffPerformanceMetrics from "./StaffPerformanceMetrics";
import PrepaidRevenueSummary from "./PrepaidRevenueSummary";
import { getIstMonthToDateRange } from "./revenueDateRanges.mjs";
import { calculateRevenueAverages, getMonthKey } from "./revenueAnalytics.mjs";
import RevenuePeriodAnalytics from "./RevenuePeriodAnalytics";
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

function getMonthSnapshotFileName() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `ynot-revenue-report-${year}-${month}.png`;
}

function createEmptyRevenueSummary() {
  return {
    totalBills: 0,
    billValue: 0,
    discountsGiven: 0,
    rewardsRedeemed: 0,
    netCollected: 0,
    onlineCollected: 0,
    cashCollected: 0,
    notRecordedCollected: 0,
    totalDistributed: 0,
    prepaidReporting: {},
  };
}

function normalizeRevenueSummary(source) {
  const summary = source || {};
  return {
    totalBills: getNumber(summary.totalBills),
    billValue: getNumber(summary.billValue),
    discountsGiven: getNumber(summary.discountsGiven),
    rewardsRedeemed: getNumber(summary.rewardsRedeemed),
    netCollected: getNumber(summary.netCollected),
    onlineCollected: getNumber(summary.onlineCollected),
    cashCollected: getNumber(summary.cashCollected),
    notRecordedCollected: getNumber(summary.notRecordedCollected),
    totalDistributed: getNumber(summary.pointsDistributed),
    prepaidReporting: summary.prepaidReporting || {},
  };
}

export default function MonthRevenue({
  vendorId,
  businessName = "Your Business",
  hrEnabled = true,
  hrLabelSingular = "Stylist",
  hrPerformanceTitle = "Stylist Performance",
}) {
  const [activeSection, setActiveSection] = useState("revenue");
  const [summary, setSummary] = useState(() => createEmptyRevenueSummary());
  const [loading, setLoading] = useState(true);
  const [stylists, setStylists] = useState([]);
  const [loadingStylists, setLoadingStylists] = useState(true);
  const [showSnapshot, setShowSnapshot] = useState(false);
  const monthAverages = calculateRevenueAverages({
    grossBillValue: summary.billValue,
    netCollected: summary.netCollected,
    completedBills: summary.totalBills,
  });

  useEffect(() => {
    if (!hrEnabled && activeSection === "stylists") {
      setActiveSection("revenue");
    }
  }, [hrEnabled, activeSection]);

  useEffect(() => {
    if (!vendorId) {
      setSummary(createEmptyRevenueSummary());
      setLoading(false);
      setStylists([]);
      setLoadingStylists(false);
      return;
    }

    let cancelled = false;

    const loadRevenue = async () => {
      try {
        setLoading(true);
        const { from, to } = getIstMonthToDateRange();
        const query = `vendorId=${encodeURIComponent(vendorId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
        const summaryRes = await fetch(`${API_BASE_URL}/api/vendor/dashboard/bills-summary?${query}`, {
          cache: "no-store",
          headers: getVendorAuthHeaders(vendorId),
        });

        if (!summaryRes.ok) {
          throw new Error("Failed to load month revenue");
        }

        const summaryJson = await summaryRes.json();

        if (!cancelled) {
          setSummary(normalizeRevenueSummary(summaryJson?.data));
        }
      } catch (error) {
        console.error("Failed to fetch month revenue", error);
        if (!cancelled) {
          setSummary(createEmptyRevenueSummary());
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    const loadStylists = async () => {
      if (!hrEnabled) {
        if (!cancelled) {
          setStylists([]);
          setLoadingStylists(false);
        }
        return;
      }

      try {
        setLoadingStylists(true);
        const res = await fetch(
          `${API_BASE_URL}/api/vendor/dashboard/stylist-performance?vendorId=${encodeURIComponent(vendorId)}&range=mtd`,
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

    loadRevenue();
    loadStylists();

    return () => {
      cancelled = true;
    };
  }, [vendorId, hrEnabled, hrLabelSingular]);

  return (
    <section className="revenue-panel">
      <RevenueSnapshot
        isOpen={showSnapshot}
        onClose={() => setShowSnapshot(false)}
        businessName={businessName}
        title={`${new Date().toLocaleDateString("en-IN", {
          month: "long",
          year: "numeric",
        })} Revenue Summary`}
        periodLabel={`As of ${new Date().toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })}`}
        summary={summary}
        fileName={getMonthSnapshotFileName()}
      />

      <div className="revenue-panel-header">
        <div className="revenue-panel-title">This Month Revenue</div>
        <div className="revenue-panel-subtitle">Daily net collection and completed bills for the current month.</div>
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
          <div className="revenue-panel-loading">Loading monthly revenue...</div>
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
                  {currencyFmt.format(summary.billValue || 0)}
                </div>
              </div>
              <div className="revenue-panel-stat-card">
                <div className="revenue-panel-stat-label">Discounts Given</div>
                <div className="revenue-panel-stat-value">
                  {currencyFmt.format(summary.discountsGiven || 0)}
                </div>
              </div>
              <div className="revenue-panel-stat-card">
                <div className="revenue-panel-stat-label">Rewards Redeemed</div>
                <div className="revenue-panel-stat-value">
                  {currencyFmt.format(summary.rewardsRedeemed || 0)}
                </div>
              </div>
              <div className="revenue-panel-stat-card">
                <div className="revenue-panel-stat-label">Net Collected</div>
                <div className="revenue-panel-stat-value">
                  {currencyFmt.format(summary.netCollected || 0)}
                </div>
              </div>
              <div className="revenue-panel-stat-card">
                <div className="revenue-panel-stat-label">Bills This Month</div>
                <div className="revenue-panel-stat-value">{summary.totalBills}</div>
              </div>
              <div className="revenue-panel-stat-card">
                <div className="revenue-panel-stat-label">Points Distributed</div>
                <div className="revenue-panel-stat-value">{summary.totalDistributed}</div>
              </div>
              <div className="revenue-panel-stat-card">
                <div className="revenue-panel-stat-label">Average Bill Value</div>
                <div className="revenue-panel-stat-value">{averageCurrencyFmt.format(monthAverages.averageBillValue)}</div>
              </div>
              <div className="revenue-panel-stat-card">
                <div className="revenue-panel-stat-label">Average Collection</div>
                <div className="revenue-panel-stat-value">{averageCurrencyFmt.format(monthAverages.averageCollection)}</div>
              </div>
            </div>

            <PrepaidRevenueSummary reporting={summary.prepaidReporting} />

            <div className="revenue-panel-payment-breakdown">
              <div className="revenue-panel-payment-title">Payment Breakdown</div>
              <div className="revenue-panel-payment-row">
                <span>Online</span>
                <strong>{currencyFmt.format(summary.onlineCollected || 0)}</strong>
              </div>
              <div className="revenue-panel-payment-row">
                <span>Cash</span>
                <strong>{currencyFmt.format(summary.cashCollected || 0)}</strong>
              </div>
              <div className="revenue-panel-payment-row">
                <span>Not Recorded</span>
                <strong>{currencyFmt.format(summary.notRecordedCollected || 0)}</strong>
              </div>
            </div>

            <div className="revenue-panel-section">
              <RevenuePeriodAnalytics
                vendorId={vendorId}
                monthKey={getMonthKey()}
                periodLabel={new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" })}
                defaultChartType="line"
              />
            </div>
          </>
        )
      ) : (
        <div className="revenue-panel-section">
          <div className="revenue-panel-section-title">{hrPerformanceTitle}</div>
          {loadingStylists ? (
            <div className="revenue-panel-loading">{`Loading ${hrLabelSingular.toLowerCase()} performance...`}</div>
          ) : stylists.length === 0 ? (
            <div className="revenue-panel-empty">
              {`No ${hrLabelSingular.toLowerCase()} performance data available for this month.`}
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
