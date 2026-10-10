"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../../config";
import { getVendorAuthHeaders } from "../../utils/vendorAuth";
import "./RevenuePanels.css";

const PAGE_LIMIT = 10;
const INACTIVE_DAY_OPTIONS = [30, 45, 60, 75, 90, 120, 180];
const SPENDING_THRESHOLDS = [500, 1000, 1500, 2000, 3000, 5000, 10000];
const ANALYTICS_SECTIONS = [
  { key: "top", label: "Top Customers", hint: "Highest spend" },
  { key: "inactive", label: "Inactive Customers", hint: "Follow-up list" },
  { key: "threshold", label: "By Spending", hint: "Value bands" },
  { key: "items", label: "Top Items", hint: "Best sellers" },
];

const currencyFmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function formatCurrency(value) {
  return currencyFmt.format(Number(value || 0));
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-IN");
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function CustomerList({
  subtitle,
  rows,
  loading,
  error,
  hasMore,
  loadingMore,
  onLoadMore,
  emptyText,
  showInactiveDays = false,
}) {
  return (
    <div className="customer-analytics-section-body">
      {subtitle ? <div className="revenue-panel-action-note">{subtitle}</div> : null}

      {error ? (
        <div className="revenue-panel-empty" style={{ color: "#fca5a5" }}>
          {error}
        </div>
      ) : loading ? (
        <div className="revenue-panel-loading">Loading customers...</div>
      ) : rows.length ? (
        <>
          <div className="customer-analytics-rows">
            {rows.map((customer) => (
              <div key={`${customer.customerId}-${customer.lastVisit}`} className="customer-analytics-row">
                <div className="customer-analytics-row-main">
                  <div className="customer-analytics-row-title">{customer.phone || customer.name || "Customer"}</div>
                  <div className="customer-analytics-row-meta">
                    {formatNumber(customer.visitCount)} completed visit{Number(customer.visitCount) === 1 ? "" : "s"}
                    {" · "}
                    Last {formatDate(customer.lastVisit)}
                  </div>
                  {showInactiveDays && customer.daysSinceLastVisit !== null ? (
                    <div className="customer-analytics-row-meta warning">
                      {formatNumber(customer.daysSinceLastVisit)} days since last visit
                    </div>
                  ) : null}
                </div>
                <div className="customer-analytics-row-value">
                  {formatCurrency(customer.totalSpend)}
                </div>
              </div>
            ))}
          </div>
          {hasMore ? (
            <button
              type="button"
              className="revenue-panel-action-btn"
              onClick={onLoadMore}
              disabled={loadingMore}
              style={{ marginTop: 12 }}
            >
              {loadingMore ? "Loading..." : "Load More"}
            </button>
          ) : null}
        </>
      ) : (
        <div className="revenue-panel-empty">{emptyText}</div>
      )}
    </div>
  );
}

export default function CustomerAnalyticsDashboard({ vendorId }) {
  const [activeSection, setActiveSection] = useState("top");
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState("");

  const [topCustomers, setTopCustomers] = useState({ items: [], nextOffset: 0, hasMore: false });
  const [topLoading, setTopLoading] = useState(true);
  const [topLoadingMore, setTopLoadingMore] = useState(false);
  const [topError, setTopError] = useState("");

  const [inactiveDays, setInactiveDays] = useState(30);
  const [inactiveCustomers, setInactiveCustomers] = useState({ items: [], nextOffset: 0, hasMore: false });
  const [inactiveLoading, setInactiveLoading] = useState(true);
  const [inactiveLoadingMore, setInactiveLoadingMore] = useState(false);
  const [inactiveError, setInactiveError] = useState("");

  const [threshold, setThreshold] = useState(1000);
  const [thresholdCustomers, setThresholdCustomers] = useState({ items: [], nextOffset: 0, hasMore: false });
  const [thresholdLoading, setThresholdLoading] = useState(true);
  const [thresholdLoadingMore, setThresholdLoadingMore] = useState(false);
  const [thresholdError, setThresholdError] = useState("");

  const [itemSort, setItemSort] = useState("revenue");
  const [items, setItems] = useState({ items: [], nextOffset: 0, hasMore: false });
  const [itemsLoading, setItemsLoading] = useState(true);
  const [itemsLoadingMore, setItemsLoadingMore] = useState(false);
  const [itemsError, setItemsError] = useState("");

  async function fetchJson(path) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        ...getVendorAuthHeaders(vendorId),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.message || "Failed to load customer analytics");
    }
    return data;
  }

  async function loadCustomerSegment({ segment, append = false, offset = 0, days, spendThreshold }) {
    const params = new URLSearchParams({
      vendorId,
      segment,
      limit: String(PAGE_LIMIT),
      offset: String(offset),
    });
    if (days) params.set("days", String(days));
    if (spendThreshold) params.set("threshold", String(spendThreshold));

    const data = await fetchJson(`/api/vendor/dashboard/customer-analytics/customers?${params.toString()}`);
    const payload = data?.data || {};
    const nextState = {
      items: payload.items || [],
      hasMore: Boolean(payload.pagination?.hasMore),
      nextOffset: payload.pagination?.nextOffset ?? null,
    };

    if (!append) return nextState;
    return {
      ...nextState,
      items: [],
      appendedItems: payload.items || [],
    };
  }

  async function loadItems({ append = false, offset = 0, sortBy = itemSort }) {
    const params = new URLSearchParams({
      vendorId,
      sortBy,
      limit: String(PAGE_LIMIT),
      offset: String(offset),
    });
    const data = await fetchJson(`/api/vendor/dashboard/customer-analytics/items?${params.toString()}`);
    const payload = data?.data || {};
    const nextState = {
      items: payload.items || [],
      hasMore: Boolean(payload.pagination?.hasMore),
      nextOffset: payload.pagination?.nextOffset ?? null,
    };

    if (!append) return nextState;
    return {
      ...nextState,
      items: [],
      appendedItems: payload.items || [],
    };
  }

  useEffect(() => {
    if (!vendorId) return;

    let cancelled = false;
    async function loadSummary() {
      try {
        setSummaryLoading(true);
        setSummaryError("");
        const params = new URLSearchParams({ vendorId });
        const data = await fetchJson(`/api/vendor/dashboard/customer-analytics/summary?${params.toString()}`);
        if (!cancelled) setSummary(data?.data || null);
      } catch (error) {
        if (!cancelled) {
          setSummaryError(error?.message || "Failed to load customer analytics summary");
          setSummary(null);
        }
      } finally {
        if (!cancelled) setSummaryLoading(false);
      }
    }

    loadSummary();
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  useEffect(() => {
    if (!vendorId) return;

    let cancelled = false;
    async function loadTopCustomers() {
      try {
        setTopLoading(true);
        setTopError("");
        const nextState = await loadCustomerSegment({ segment: "top_spenders" });
        if (!cancelled) setTopCustomers(nextState);
      } catch (error) {
        if (!cancelled) setTopError(error?.message || "Failed to load top customers");
      } finally {
        if (!cancelled) setTopLoading(false);
      }
    }

    loadTopCustomers();
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  useEffect(() => {
    if (!vendorId) return;

    let cancelled = false;
    async function loadInactive() {
      try {
        setInactiveLoading(true);
        setInactiveError("");
        const nextState = await loadCustomerSegment({ segment: "inactive", days: inactiveDays });
        if (!cancelled) setInactiveCustomers(nextState);
      } catch (error) {
        if (!cancelled) setInactiveError(error?.message || "Failed to load inactive customers");
      } finally {
        if (!cancelled) setInactiveLoading(false);
      }
    }

    loadInactive();
    return () => {
      cancelled = true;
    };
  }, [inactiveDays, vendorId]);

  useEffect(() => {
    if (!vendorId) return;

    let cancelled = false;
    async function loadThreshold() {
      try {
        setThresholdLoading(true);
        setThresholdError("");
        const nextState = await loadCustomerSegment({
          segment: "threshold",
          spendThreshold: threshold,
        });
        if (!cancelled) setThresholdCustomers(nextState);
      } catch (error) {
        if (!cancelled) setThresholdError(error?.message || "Failed to load threshold customers");
      } finally {
        if (!cancelled) setThresholdLoading(false);
      }
    }

    loadThreshold();
    return () => {
      cancelled = true;
    };
  }, [threshold, vendorId]);

  useEffect(() => {
    if (!vendorId) return;

    let cancelled = false;
    async function loadTopItems() {
      try {
        setItemsLoading(true);
        setItemsError("");
        const nextState = await loadItems({ sortBy: itemSort });
        if (!cancelled) setItems(nextState);
      } catch (error) {
        if (!cancelled) setItemsError(error?.message || "Failed to load top items");
      } finally {
        if (!cancelled) setItemsLoading(false);
      }
    }

    loadTopItems();
    return () => {
      cancelled = true;
    };
  }, [itemSort, vendorId]);

  async function loadMoreCustomers(kind) {
    if (kind === "top") {
      try {
        setTopLoadingMore(true);
        const nextState = await loadCustomerSegment({
          segment: "top_spenders",
          append: true,
          offset: topCustomers.nextOffset || 0,
        });
        setTopCustomers((current) => ({
          items: [...current.items, ...(nextState.appendedItems || [])],
          hasMore: nextState.hasMore,
          nextOffset: nextState.nextOffset,
        }));
      } catch (error) {
        setTopError(error?.message || "Failed to load more top customers");
      } finally {
        setTopLoadingMore(false);
      }
    }

    if (kind === "inactive") {
      try {
        setInactiveLoadingMore(true);
        const nextState = await loadCustomerSegment({
          segment: "inactive",
          append: true,
          offset: inactiveCustomers.nextOffset || 0,
          days: inactiveDays,
        });
        setInactiveCustomers((current) => ({
          items: [...current.items, ...(nextState.appendedItems || [])],
          hasMore: nextState.hasMore,
          nextOffset: nextState.nextOffset,
        }));
      } catch (error) {
        setInactiveError(error?.message || "Failed to load more inactive customers");
      } finally {
        setInactiveLoadingMore(false);
      }
    }

    if (kind === "threshold") {
      try {
        setThresholdLoadingMore(true);
        const nextState = await loadCustomerSegment({
          segment: "threshold",
          append: true,
          offset: thresholdCustomers.nextOffset || 0,
          spendThreshold: threshold,
        });
        setThresholdCustomers((current) => ({
          items: [...current.items, ...(nextState.appendedItems || [])],
          hasMore: nextState.hasMore,
          nextOffset: nextState.nextOffset,
        }));
      } catch (error) {
        setThresholdError(error?.message || "Failed to load more threshold customers");
      } finally {
        setThresholdLoadingMore(false);
      }
    }
  }

  async function loadMoreItems() {
    try {
      setItemsLoadingMore(true);
      const nextState = await loadItems({
        append: true,
        offset: items.nextOffset || 0,
        sortBy: itemSort,
      });
      setItems((current) => ({
        items: [...current.items, ...(nextState.appendedItems || [])],
        hasMore: nextState.hasMore,
        nextOffset: nextState.nextOffset,
      }));
    } catch (error) {
      setItemsError(error?.message || "Failed to load more items");
    } finally {
      setItemsLoadingMore(false);
    }
  }

  const customerLinked = summary?.customerLinked || {};
  const allCompletedBills = summary?.allCompletedBills || {};

  return (
    <div className="revenue-panel customer-analytics-panel">
      <div className="revenue-panel-header customer-analytics-header">
        <div className="revenue-panel-title">Customer Analytics</div>
        <div className="revenue-panel-subtitle">
          Customer value, inactive customers, spending bands, and best sellers.
        </div>
      </div>

      {summaryError ? (
        <div className="revenue-panel-empty" style={{ color: "#fca5a5" }}>
          {summaryError}
        </div>
      ) : summaryLoading ? (
        <div className="revenue-panel-loading">Loading customer analytics...</div>
      ) : (
        <>
          <div className="customer-analytics-summary-grid">
            <div className="revenue-panel-stat-card customer-analytics-stat-card">
              <div className="revenue-panel-stat-label">Customers</div>
              <div className="revenue-panel-stat-value">{formatNumber(customerLinked.totalCustomers)}</div>
            </div>
            <div className="revenue-panel-stat-card customer-analytics-stat-card">
              <div className="revenue-panel-stat-label">Repeat Customers</div>
              <div className="revenue-panel-stat-value">{formatNumber(customerLinked.repeatCustomers)}</div>
            </div>
            <div className="revenue-panel-stat-card customer-analytics-stat-card">
              <div className="revenue-panel-stat-label">Avg. Bill</div>
              <div className="revenue-panel-stat-value">
                {formatCurrency(allCompletedBills.averageCompletedBillValue)}
              </div>
            </div>
            <div className="revenue-panel-stat-card customer-analytics-stat-card">
              <div className="revenue-panel-stat-label">Net Sales</div>
              <div className="revenue-panel-stat-value">
                {formatCurrency(allCompletedBills.totalNetCollected)}
              </div>
            </div>
          </div>
        </>
      )}

      <div className="customer-analytics-tile-grid" role="tablist" aria-label="Customer analytics sections">
        {ANALYTICS_SECTIONS.map((section) => (
          <button
            key={section.key}
            type="button"
            className={`customer-analytics-tile ${activeSection === section.key ? "active" : ""}`}
            onClick={() => setActiveSection(section.key)}
            role="tab"
            aria-selected={activeSection === section.key}
          >
            <span>{section.label}</span>
            <small>{section.hint}</small>
          </button>
        ))}
      </div>

      {activeSection === "top" && (
        <div className="customer-analytics-active-section">
          <div className="customer-analytics-section-head">
            <div>
              <div className="customer-analytics-section-title">Top Customers</div>
              <div className="customer-analytics-section-subtitle">Lifetime net spending from completed bills.</div>
            </div>
          </div>
          <CustomerList
            subtitle=""
            rows={topCustomers.items}
            loading={topLoading}
            error={topError}
            hasMore={topCustomers.hasMore}
            loadingMore={topLoadingMore}
            onLoadMore={() => loadMoreCustomers("top")}
            emptyText="No customer-linked spending data yet."
          />
        </div>
      )}

      {activeSection === "inactive" && (
        <div className="customer-analytics-active-section">
          <div className="customer-analytics-section-head">
            <div>
              <div className="customer-analytics-section-title">Inactive Customers</div>
              <div className="customer-analytics-section-subtitle">Based on latest completed visit.</div>
            </div>
            <select
              className="revenue-panel-input customer-analytics-filter"
              value={inactiveDays}
              onChange={(event) => setInactiveDays(Number(event.target.value))}
            >
              {INACTIVE_DAY_OPTIONS.map((days) => (
                <option key={days} value={days}>
                  {days}+ days
                </option>
              ))}
            </select>
          </div>
          <CustomerList
            subtitle={`Customers inactive for at least ${inactiveDays} days.`}
            rows={inactiveCustomers.items}
            loading={inactiveLoading}
            error={inactiveError}
            hasMore={inactiveCustomers.hasMore}
            loadingMore={inactiveLoadingMore}
            onLoadMore={() => loadMoreCustomers("inactive")}
            emptyText={`No customers inactive for ${inactiveDays}+ days.`}
            showInactiveDays
          />
        </div>
      )}

      {activeSection === "threshold" && (
        <div className="customer-analytics-active-section">
          <div className="customer-analytics-section-head">
            <div>
              <div className="customer-analytics-section-title">By Spending</div>
              <div className="customer-analytics-section-subtitle">Customers crossing lifetime spend bands.</div>
            </div>
            <select
              className="revenue-panel-input customer-analytics-filter"
              value={threshold}
              onChange={(event) => setThreshold(Number(event.target.value))}
            >
              {SPENDING_THRESHOLDS.map((value) => (
                <option key={value} value={value}>
                  {formatCurrency(value)}+
                </option>
              ))}
            </select>
          </div>
          <CustomerList
            subtitle={`Lifetime net spending of ${formatCurrency(threshold)} or more.`}
            rows={thresholdCustomers.items}
            loading={thresholdLoading}
            error={thresholdError}
            hasMore={thresholdCustomers.hasMore}
            loadingMore={thresholdLoadingMore}
            onLoadMore={() => loadMoreCustomers("threshold")}
            emptyText={`No customers have crossed ${formatCurrency(threshold)} yet.`}
          />
        </div>
      )}

      {activeSection === "items" && (
        <div className="customer-analytics-active-section">
          <div className="customer-analytics-section-head">
            <div>
              <div className="customer-analytics-section-title">Top Items</div>
              <div className="customer-analytics-section-subtitle">Completed bill snapshots, including walk-ins.</div>
            </div>
            <select
              className="revenue-panel-input customer-analytics-filter"
              value={itemSort}
              onChange={(event) => setItemSort(event.target.value)}
            >
              <option value="revenue">Revenue</option>
              <option value="quantity">Quantity</option>
            </select>
          </div>
          {itemsError ? (
            <div className="revenue-panel-empty" style={{ color: "#fca5a5" }}>
              {itemsError}
            </div>
          ) : itemsLoading ? (
            <div className="revenue-panel-loading">Loading top items...</div>
          ) : items.items.length ? (
            <>
              <div className="customer-analytics-rows">
                {items.items.map((item) => (
                  <div key={item.key} className="customer-analytics-row">
                    <div className="customer-analytics-row-main">
                      <div className="customer-analytics-row-title">{item.name}</div>
                      <div className="customer-analytics-row-meta">
                        {formatNumber(item.quantitySold)} sold
                        {item.samplePath?.length ? ` · ${item.samplePath.join(" / ")}` : ""}
                      </div>
                    </div>
                    <div className="customer-analytics-row-value">
                      {formatCurrency(item.grossSales)}
                    </div>
                  </div>
                ))}
              </div>
              {items.hasMore ? (
                <button
                  type="button"
                  className="revenue-panel-action-btn"
                  onClick={loadMoreItems}
                  disabled={itemsLoadingMore}
                  style={{ marginTop: 12 }}
                >
                  {itemsLoadingMore ? "Loading..." : "Load More"}
                </button>
              ) : null}
            </>
          ) : (
            <div className="revenue-panel-empty">No completed item sales yet.</div>
          )}
        </div>
      )}
    </div>
  );
}
