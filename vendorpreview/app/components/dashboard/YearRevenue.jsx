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

function getPaymentModeLabel(bill) {
  if (bill?.paymentModeLabel) return bill.paymentModeLabel;
  if (bill?.paymentMode === "ONLINE") return "Online";
  if (bill?.paymentMode === "CASH") return "Cash";
  return "Not Recorded";
}

function createEmptyRevenueSummary() {
  return {
    billValue: 0,
    discountsGiven: 0,
    rewardsRedeemed: 0,
    netCollected: 0,
    totalBills: 0,
    pointsDistributed: 0,
    onlineCollected: 0,
    cashCollected: 0,
    notRecordedCollected: 0,
  };
}

function normalizeRevenueSummary(source) {
  const summary = source || {};
  return {
    billValue: getNumber(summary.billValue),
    discountsGiven: getNumber(summary.discountsGiven),
    rewardsRedeemed: getNumber(summary.rewardsRedeemed),
    netCollected: getNumber(summary.netCollected),
    totalBills: getNumber(summary.totalBills),
    pointsDistributed: getNumber(summary.pointsDistributed),
    onlineCollected: getNumber(summary.onlineCollected),
    cashCollected: getNumber(summary.cashCollected),
    notRecordedCollected: getNumber(summary.notRecordedCollected),
  };
}

function getMonthlyCardNetCollected(month) {
  return getNumber(month?.netCollected);
}

function getMonthlyCardAverage(month) {
  const orders = Number(month?.orders || month?.totalBills || 0);
  if (!orders) return 0;
  return Math.round(getMonthlyCardNetCollected(month) / orders);
}

export default function YearRevenue({
  vendorId,
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
  const [selectedBills, setSelectedBills] = useState([]);
  const [selectedMonthSummary, setSelectedMonthSummary] = useState(() =>
    createEmptyRevenueSummary()
  );
  const [loadingBills, setLoadingBills] = useState(false);
  const [expandedBills, setExpandedBills] = useState({});

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
          }),
          fetch(`${API_BASE_URL}/api/vendor/dashboard/fy-monthly?vendorId=${encodeURIComponent(vendorId)}`, {
            cache: "no-store",
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

    loadStylists();

    return () => {
      cancelled = true;
    };
  }, [vendorId, hrEnabled, hrLabelSingular, selectedMonth]);

  useEffect(() => {
    if (!vendorId || !selectedMonth?.startDate || !selectedMonth?.endDate) {
      setSelectedBills([]);
      setSelectedMonthSummary(createEmptyRevenueSummary());
      setExpandedBills({});
      setLoadingBills(false);
      return;
    }

    let cancelled = false;

    const loadBills = async () => {
      try {
        setLoadingBills(true);
        const params = new URLSearchParams({
          vendorId,
          from: selectedMonth.startDate,
          to: selectedMonth.endDate,
          limit: "250",
        });
        const summaryParams = new URLSearchParams({
          vendorId,
          from: selectedMonth.startDate,
          to: selectedMonth.endDate,
        });
        const [summaryRes, billsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/vendor/dashboard/bills-summary?${summaryParams.toString()}`, {
            cache: "no-store",
          }),
          fetch(`${API_BASE_URL}/api/vendor/dashboard/bills?${params.toString()}`, {
            cache: "no-store",
          }),
        ]);

        if (!summaryRes.ok || !billsRes.ok) {
          throw new Error("Failed to load selected month bills");
        }

        const summaryJson = await summaryRes.json();
        const billsJson = await billsRes.json();
        const rawBills = Array.isArray(billsJson)
          ? billsJson
          : Array.isArray(billsJson?.data)
            ? billsJson.data
            : [];

        if (!cancelled) {
          setSelectedMonthSummary(normalizeRevenueSummary(summaryJson?.data));
          setSelectedBills(rawBills.filter((bill) => Number(bill?.total || 0) > 0));
          setExpandedBills({});
        }
      } catch (error) {
        console.error("Failed to fetch selected month bills", error);
        if (!cancelled) {
          setSelectedMonthSummary(createEmptyRevenueSummary());
          setSelectedBills([]);
          setExpandedBills({});
        }
      } finally {
        if (!cancelled) {
          setLoadingBills(false);
        }
      }
    };

    loadBills();

    return () => {
      cancelled = true;
    };
  }, [vendorId, selectedMonth]);

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
    };
  }, [months, summary]);

  const selectedMonthLabel = selectedMonth?.label || selectedMonth?.month || "Selected Month";
  const toggleBill = (billKey) => {
    setExpandedBills((prev) => ({
      ...prev,
      [billKey]: !prev[billKey],
    }));
  };

  return (
    <section className="revenue-panel">
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
            <div className="revenue-panel-stat-grid">
              <div className="revenue-panel-stat-card">
                <div className="revenue-panel-stat-label">Bill Value</div>
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
            </div>

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
                <div className="revenue-panel-month-grid">
                  {months.map((month) => (
                    <button
                      type="button"
                      key={month.monthKey || `${month.month}-${month.year || ""}`}
                      className={`revenue-panel-month-card ${
                        month.isCurrentMonth ? "active" : ""
                      } ${
                        month.monthKey === selectedMonth?.monthKey ? "selected" : ""
                      }`}
                      onClick={() => setSelectedMonthKey(month.monthKey)}
                    >
                      <div className="revenue-panel-month-name">{month.month}</div>
                      {month.year ? (
                        <div className="revenue-panel-month-year">{month.year}</div>
                      ) : null}
                      <div className="revenue-panel-month-revenue">
                        {currencyFmt.format(getMonthlyCardNetCollected(month))}
                      </div>
                      <div className="revenue-panel-month-meta">
                        {Number(month.orders || 0)} orders • Avg{" "}
                        {currencyFmt.format(getMonthlyCardAverage(month))}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="revenue-panel-section">
              <div className="revenue-panel-section-title">{selectedMonthLabel} Summary</div>
              <div className="revenue-panel-stat-grid">
                <div className="revenue-panel-stat-card">
                  <div className="revenue-panel-stat-label">Bill Value</div>
                  <div className="revenue-panel-stat-value">
                    {currencyFmt.format(selectedMonthSummary.billValue || 0)}
                  </div>
                </div>
                <div className="revenue-panel-stat-card">
                  <div className="revenue-panel-stat-label">Discounts Given</div>
                  <div className="revenue-panel-stat-value">
                    {currencyFmt.format(selectedMonthSummary.discountsGiven || 0)}
                  </div>
                </div>
                <div className="revenue-panel-stat-card">
                  <div className="revenue-panel-stat-label">Rewards Redeemed</div>
                  <div className="revenue-panel-stat-value">
                    {currencyFmt.format(selectedMonthSummary.rewardsRedeemed || 0)}
                  </div>
                </div>
                <div className="revenue-panel-stat-card">
                  <div className="revenue-panel-stat-label">Net Collected</div>
                  <div className="revenue-panel-stat-value">
                    {currencyFmt.format(selectedMonthSummary.netCollected || 0)}
                  </div>
                </div>
                <div className="revenue-panel-stat-card">
                  <div className="revenue-panel-stat-label">Total Bills</div>
                  <div className="revenue-panel-stat-value">{selectedMonthSummary.totalBills}</div>
                </div>
                <div className="revenue-panel-stat-card">
                  <div className="revenue-panel-stat-label">Points Distributed</div>
                  <div className="revenue-panel-stat-value">
                    {selectedMonthSummary.pointsDistributed}
                  </div>
                </div>
              </div>

              <div className="revenue-panel-payment-breakdown">
                <div className="revenue-panel-payment-title">Payment Breakdown</div>
                <div className="revenue-panel-payment-row">
                  <span>Online</span>
                  <strong>{currencyFmt.format(selectedMonthSummary.onlineCollected || 0)}</strong>
                </div>
                <div className="revenue-panel-payment-row">
                  <span>Cash</span>
                  <strong>{currencyFmt.format(selectedMonthSummary.cashCollected || 0)}</strong>
                </div>
                <div className="revenue-panel-payment-row">
                  <span>Not Recorded</span>
                  <strong>{currencyFmt.format(selectedMonthSummary.notRecordedCollected || 0)}</strong>
                </div>
              </div>
            </div>

            <div className="revenue-panel-section">
              <div className="revenue-panel-section-title">
                {selectedMonthLabel} Bills
                {selectedBills.length > 0 ? (
                  <span className="revenue-panel-section-note">
                    {selectedBills.length} bill{selectedBills.length === 1 ? "" : "s"}
                  </span>
                ) : null}
              </div>
              {loadingBills ? (
                <div className="revenue-panel-loading">Loading selected month bills...</div>
              ) : selectedBills.length === 0 ? (
                <div className="revenue-panel-empty">No bill details found for {selectedMonthLabel}.</div>
              ) : (
                <div className="revenue-panel-list">
                  {selectedBills.map((bill) => {
                    const billKey = bill.billId || `${bill.phone}-${bill.createdAt}`;
                    const isExpanded = expandedBills[billKey] === true;
                    const billItems = Array.isArray(bill.items) ? bill.items : [];
                    const financials = getBillFinancials(bill);

                    return (
                      <div key={billKey} className="revenue-panel-list-item">
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
                            <span className="revenue-panel-chip">
                              Payment {getPaymentModeLabel(bill)}
                            </span>
                            <span className="revenue-panel-chip">Earned {Number(bill.earned || 0)}</span>
                            <span className="revenue-panel-chip">{billItems.length} item(s)</span>
                          </div>
                          <div className="revenue-panel-bill-meta">
                            {isExpanded ? "Expanded item details" : "Tap to inspect bill items"}
                          </div>

                          {isExpanded && billItems.length > 0 ? (
                            <div className="revenue-panel-items-list">
                              {billItems.map((item, index) => (
                                <div
                                  key={`${billKey}-item-${item.itemId || item.name || index}`}
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
                          {billItems.length > 0 ? (
                            <button
                              type="button"
                              className="revenue-panel-expand-btn"
                              onClick={() => toggleBill(billKey)}
                            >
                              {isExpanded ? "Hide items" : "View items"}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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
