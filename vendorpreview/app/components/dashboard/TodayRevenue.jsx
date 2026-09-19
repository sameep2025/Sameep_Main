"use client";

import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "../../../config";
import "./TodayRevenue.css";

const currencyFmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function formatDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);
  return date.toLocaleString("en-IN", {
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

function getTodayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date();
  end.setHours(23, 59, 59, 999);

  return {
    from: start.toISOString(),
    to: end.toISOString(),
  };
}

function TodayRevenue({
  vendorId,
  onBack,
  embedded = false,
  hrEnabled = true,
  hrLabelSingular = "Stylist",
  hrPerformanceTitle = "Stylist Performance",
}) {
  const [activeSection, setActiveSection] = useState("revenue");
  const [bills, setBills] = useState([]);
  const [stylists, setStylists] = useState([]);
  const [loadingRevenue, setLoadingRevenue] = useState(true);
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
      setStylists([]);
      setLoadingRevenue(false);
      setLoadingStylists(false);
      return;
    }

    let cancelled = false;

    const loadBills = async () => {
      try {
        setLoadingRevenue(true);
        const { from, to } = getTodayRange();
        const res = await fetch(
          `${API_BASE_URL}/api/vendor/dashboard/bills?vendorId=${encodeURIComponent(vendorId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
          { cache: "no-store" }
        );

        if (!res.ok) {
          throw new Error("Failed to load today's revenue");
        }

        const json = await res.json();
        const rawBills = Array.isArray(json)
          ? json
          : Array.isArray(json?.data)
            ? json.data
            : [];

        const filteredBills = rawBills.filter(
          (bill) =>
            Array.isArray(bill?.items) &&
            bill.items.length > 0 &&
            Number(bill?.total || 0) > 0
        );

        if (!cancelled) {
          setBills(filteredBills);
        }
      } catch (err) {
        console.error("Failed to fetch today's bills", err);
        if (!cancelled) {
          setBills([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingRevenue(false);
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
          `${API_BASE_URL}/api/vendor/dashboard/stylist-performance?vendorId=${encodeURIComponent(vendorId)}&range=today`,
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
        return acc;
      },
      {
        totalBills: 0,
        billValue: 0,
        discountsGiven: 0,
        rewardsRedeemed: 0,
        netCollected: 0,
      }
    );
  }, [bills]);

  useEffect(() => {
    setExpandedBills(
      bills.reduce((acc, bill) => {
        const key = bill.billId || `${bill.phone}-${bill.createdAt}`;
        acc[key] = true;
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
    <div className={`today-revenue-page ${embedded ? "today-revenue-page-embedded" : ""}`}>
      {!embedded ? (
        <div className="today-revenue-header">
          {onBack ? (
            <button type="button" onClick={onBack} className="today-revenue-back-btn">
              Back
            </button>
          ) : null}
          <div>
            <div className="today-revenue-title">
              Today&apos;s Revenue
            </div>
            <div className="today-revenue-subtitle">
              Today&apos;s billing summary and bill-wise revenue details.
            </div>
          </div>
        </div>
      ) : null}

      <div className="today-revenue-tabs">
        <button
          type="button"
          className={`today-revenue-tab ${activeSection === "revenue" ? "active" : ""}`}
          onClick={() => setActiveSection("revenue")}
        >
          Revenue
        </button>
        {hrEnabled ? (
          <button
            type="button"
            className={`today-revenue-tab ${activeSection === "stylists" ? "active" : ""}`}
            onClick={() => setActiveSection("stylists")}
          >
            {hrPerformanceTitle}
          </button>
        ) : null}
      </div>

      {activeSection === "revenue" ? (
        loadingRevenue ? (
          <div className="today-revenue-loading">
            <div className="today-revenue-spinner" />
          </div>
        ) : (
          <>
            <div className="today-revenue-section-title">Revenue</div>

            <div className="today-revenue-summary-grid">
              {[
                { label: "Bill Value", value: currencyFmt.format(summary.billValue || 0) },
                { label: "Discounts Given", value: currencyFmt.format(summary.discountsGiven || 0) },
                { label: "Rewards Redeemed", value: currencyFmt.format(summary.rewardsRedeemed || 0) },
                { label: "Net Collected", value: currencyFmt.format(summary.netCollected || 0) },
                { label: "Total Bills", value: summary.totalBills },
              ].map((card) => (
                <div key={card.label} className="today-revenue-summary-card">
                  <div className="today-revenue-summary-label">{card.label}</div>
                  <div className="today-revenue-summary-value">{card.value}</div>
                </div>
              ))}
            </div>

            <div className="today-revenue-section-title">Bill List</div>
            {bills.length === 0 ? (
              <div className="today-revenue-empty">
                No valid bills found for today.
              </div>
            ) : (
              <div className="today-revenue-bills">
                {bills.map((bill) => {
                  const billKey = bill.billId || `${bill.phone}-${bill.createdAt}`;
                  const isExpanded = expandedBills[billKey] !== false;
                  const financials = getBillFinancials(bill);

                  return (
                  <div key={billKey} className="today-revenue-bill-card">
                    <div className="today-revenue-bill-header">
                      <div className="today-revenue-bill-main">
                        <div className="today-revenue-bill-id">
                          Bill #{String(bill.billId || "").slice(0, 8)}
                        </div>
                        <div className="today-revenue-bill-phone">
                          {bill.phone || "Walk-in"} • {formatDateTime(bill.createdAt)}
                        </div>
                        <div className="today-revenue-bill-chip-row">
                          <span className="today-revenue-bill-chip">
                            Bill Value {currencyFmt.format(financials.billValue)}
                          </span>
                          {financials.discountAmount !== null ? (
                            <span className="today-revenue-bill-chip">
                              Discount {currencyFmt.format(financials.discountAmount)}
                            </span>
                          ) : null}
                          <span className="today-revenue-bill-chip">
                            Redeemed {currencyFmt.format(financials.rewardsRedeemedValue)}
                          </span>
                          <span className="today-revenue-bill-chip">
                            Collected {currencyFmt.format(financials.netCollected)}
                          </span>
                          <span className="today-revenue-bill-chip">Earned {Number(bill.earned || 0)}</span>
                          <span className="today-revenue-bill-chip">
                            {Array.isArray(bill.items) ? bill.items.length : 0} item(s)
                          </span>
                        </div>
                      </div>
                      <div className="today-revenue-bill-actions">
                        <div className="today-revenue-bill-total">
                          {currencyFmt.format(financials.netCollected)}
                        </div>
                        <button
                          type="button"
                          className="today-revenue-expand-btn"
                          onClick={() => toggleBill(billKey)}
                        >
                          {isExpanded ? "Hide items" : "Show items"}
                        </button>
                      </div>
                    </div>

                    {isExpanded && Array.isArray(bill.items) && bill.items.length > 0 ? (
                      <div className="today-revenue-items-section">
                        <div className="today-revenue-items-title">Cart Items</div>
                        <div className="today-revenue-items-list">
                          {bill.items.map((item, index) => (
                            <div
                              key={`${bill.billId || bill.createdAt}-item-${item.itemId || item.name || index}`}
                              className="today-revenue-item-row"
                            >
                              <div>
                                <div className="today-revenue-item-name">{item.name || "Unnamed Item"}</div>
                                <div className="today-revenue-item-meta">{formatItemMeta(item)}</div>
                                {formatItemResource(item) ? (
                                  <div className="today-revenue-item-resource">
                                    Handled by {formatItemResource(item)}
                                  </div>
                                ) : null}
                              </div>
                              <div className="today-revenue-bill-total">
                                {currencyFmt.format(Number(item.total || item.price || 0))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )})}
              </div>
            )}
          </>
        )
      ) : hrEnabled ? (
        loadingStylists ? (
          <div className="today-revenue-loading">
            <div className="today-revenue-spinner" />
          </div>
        ) : (
          <>
            <div className="today-revenue-section-title">{hrPerformanceTitle}</div>
            {stylists.length === 0 ? (
              <div className="today-revenue-empty">
                {`No ${hrLabelSingular.toLowerCase()} performance data available for today.`}
              </div>
            ) : (
              <div className="today-revenue-stylist-list">
                {stylists.map((row, index) => (
                  <div
                    key={row._id || row.stylist || index}
                    className="today-revenue-stylist-row"
                  >
                    <div className="today-revenue-stylist-name">
                      {row.stylist || `${hrLabelSingular} ${index + 1}`}
                    </div>
                    <div className="today-revenue-stylist-value">
                      {currencyFmt.format(Number(row.revenue || 0))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )
      ) : null}
    </div>
  );
}

export default TodayRevenue;
