"use client";

import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "../../../config";
import "./RevenuePanels.css";

const currencyFmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function formatDateTime(value) {
  if (!value) return "-";

  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatItemMeta(item) {
  const parts = [];

  if (Number(item?.qty || 0) > 0) {
    parts.push(`Qty ${item.qty}`);
  }

  if (Array.isArray(item?.nodePath) && item.nodePath.length > 0) {
    parts.push(item.nodePath.join(" / "));
  }

  return parts.join(" • ");
}

function formatItemResource(item) {
  return String(item?.resourceName || "").trim();
}

function getNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function hasAmount(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function getBillFinancials(bill) {
  const billValue = getNumber(bill?.billValue ?? bill?.grossAmount ?? bill?.netBillValue ?? bill?.total);
  const netBillValue = getNumber(bill?.netBillValue ?? bill?.total);
  const rewardsRedeemedValue = getNumber(bill?.rewardsRedeemedValue ?? bill?.redeemed);
  const netCollected = getNumber(
    bill?.netCollected ?? Math.max(netBillValue - rewardsRedeemedValue, 0)
  );

  return {
    discountAmount: hasAmount(bill?.discountAmount) ? getNumber(bill.discountAmount) : null,
    billValue,
    netBillValue,
    rewardsRedeemedValue,
    netCollected: Math.max(netCollected, 0),
  };
}

function getMonthRange() {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  const end = new Date();
  end.setHours(23, 59, 59, 999);

  return {
    from: start.toISOString(),
    to: end.toISOString(),
  };
}

export default function MonthRevenue({
  vendorId,
  hrEnabled = true,
  hrLabelSingular = "Stylist",
  hrPerformanceTitle = "Stylist Performance",
}) {
  const [activeSection, setActiveSection] = useState("revenue");
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stylists, setStylists] = useState([]);
  const [loadingStylists, setLoadingStylists] = useState(true);
  const [expandedBills, setExpandedBills] = useState({});

  useEffect(() => {
    if (!hrEnabled && activeSection === "stylists") {
      setActiveSection("revenue");
    }
  }, [hrEnabled, activeSection]);

  useEffect(() => {
    if (!vendorId) {
      setBills([]);
      setLoading(false);
      setStylists([]);
      setLoadingStylists(false);
      return;
    }

    let cancelled = false;

    const loadBills = async () => {
      try {
        setLoading(true);
        const { from, to } = getMonthRange();
        const res = await fetch(
          `${API_BASE_URL}/api/vendor/dashboard/bills?vendorId=${encodeURIComponent(vendorId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
          { cache: "no-store" }
        );

        if (!res.ok) {
          throw new Error("Failed to load month revenue");
        }

        const json = await res.json();
        const rawBills = Array.isArray(json)
          ? json
          : Array.isArray(json?.data)
            ? json.data
            : [];

        if (!cancelled) {
          setBills(rawBills.filter((bill) => Number(bill?.total || 0) > 0));
        }
      } catch (error) {
        console.error("Failed to fetch month revenue", error);
        if (!cancelled) {
          setBills([]);
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
          { cache: "no-store" }
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

    loadBills();
    loadStylists();

    return () => {
      cancelled = true;
    };
  }, [vendorId, hrEnabled, hrLabelSingular]);

  const summary = useMemo(() => {
    return bills.reduce(
      (acc, bill) => {
        acc.totalBills += 1;
        const financials = getBillFinancials(bill);
        acc.billValue += financials.billValue;
        acc.discountsGiven += financials.discountAmount || 0;
        acc.rewardsRedeemed += financials.rewardsRedeemedValue;
        acc.netCollected += financials.netCollected;
        acc.totalDistributed += Number(bill?.earned || 0);
        return acc;
      },
      {
        totalBills: 0,
        billValue: 0,
        discountsGiven: 0,
        rewardsRedeemed: 0,
        netCollected: 0,
        totalDistributed: 0,
      }
    );
  }, [bills]);

  useEffect(() => {
    setExpandedBills(
      bills.reduce((acc, bill) => {
        const key = bill.billId || `${bill.phone}-${bill.createdAt}`;
        acc[key] = false;
        return acc;
      }, {})
    );
  }, [bills]);

  const toggleBill = (billKey) => {
    setExpandedBills((prev) => ({
      ...prev,
      [billKey]: !prev[billKey],
    }));
  };

  return (
    <section className="revenue-panel">
      <div className="revenue-panel-header">
        <div className="revenue-panel-title">This Month Revenue</div>
        <div className="revenue-panel-subtitle">
          Running revenue for the current month with the most recent bills.
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
          <div className="revenue-panel-loading">Loading monthly revenue...</div>
        ) : (
          <>
            <div className="revenue-panel-stat-grid">
              <div className="revenue-panel-stat-card">
                <div className="revenue-panel-stat-label">Bill Value</div>
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
            </div>

            <div className="revenue-panel-section">
              <div className="revenue-panel-section-title">Recent Bills</div>
              {bills.length === 0 ? (
                <div className="revenue-panel-empty">No revenue bills found for this month.</div>
              ) : (
                <div className="revenue-panel-list">
                  {bills.map((bill) => {
                    const billKey = bill.billId || `${bill.phone}-${bill.createdAt}`;
                    const isExpanded = expandedBills[billKey] === true;
                    const financials = getBillFinancials(bill);

                    return (
                    <div
                      key={billKey}
                      className="revenue-panel-list-item"
                    >
                      <div className="revenue-panel-bill-content">
                        <div className="revenue-panel-list-main">
                          Bill #{String(bill.billId || "").slice(0, 8)}
                        </div>
                        <div className="revenue-panel-list-sub">
                          {bill.phone || "Walk-in"} • {formatDateTime(bill.createdAt)}
                        </div>
                        <div className="revenue-panel-chip-row">
                          <span className="revenue-panel-chip">
                            Bill Value {currencyFmt.format(financials.billValue)}
                          </span>
                          {financials.discountAmount !== null ? (
                            <span className="revenue-panel-chip">
                              Discount {currencyFmt.format(financials.discountAmount)}
                            </span>
                          ) : null}
                          <span className="revenue-panel-chip">
                            Redeemed {currencyFmt.format(financials.rewardsRedeemedValue)}
                          </span>
                          <span className="revenue-panel-chip">
                            Collected {currencyFmt.format(financials.netCollected)}
                          </span>
                          <span className="revenue-panel-chip">Earned {Number(bill.earned || 0)}</span>
                          <span className="revenue-panel-chip">
                            {Array.isArray(bill.items) ? bill.items.length : 0} item(s)
                          </span>
                        </div>
                        <div className="revenue-panel-bill-meta">
                          {isExpanded ? "Expanded item details" : "Tap to inspect bill items"}
                        </div>

                        {isExpanded && Array.isArray(bill.items) && bill.items.length > 0 ? (
                          <div className="revenue-panel-items-list">
                            {bill.items.map((item, index) => (
                              <div
                                key={`${bill.billId || bill.createdAt}-item-${item.itemId || item.name || index}`}
                              className="revenue-panel-item-row"
                            >
                              <div>
                                  <div className="revenue-panel-item-name">{item.name || "Unnamed Item"}</div>
                                  <div className="revenue-panel-item-meta">{formatItemMeta(item)}</div>
                                  {formatItemResource(item) ? (
                                    <div className="revenue-panel-item-resource">
                                      Handled by {formatItemResource(item)}
                                    </div>
                                  ) : null}
                                </div>
                                <div className="revenue-panel-item-value">
                                  {currencyFmt.format(Number(item.total || item.price || 0))}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="revenue-panel-bill-actions">
                        <div className="revenue-panel-list-value">
                          {currencyFmt.format(financials.netCollected)}
                        </div>
                        <button
                          type="button"
                          className="revenue-panel-expand-btn"
                          onClick={() => toggleBill(billKey)}
                        >
                          {isExpanded ? "Hide items" : "View items"}
                        </button>
                      </div>
                    </div>
                  )})}
                </div>
              )}
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
                <div
                  key={row._id || row.stylist || index}
                  className="revenue-panel-list-item"
                >
                  <div className="revenue-panel-list-main">
                    {row.stylist || `${hrLabelSingular} ${index + 1}`}
                  </div>
                  <div className="revenue-panel-list-value">
                    {currencyFmt.format(Number(row.revenue || 0))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
