import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import API from "../api";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: "16px",
  padding: "18px",
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)",
};

const mutedTextStyle = {
  color: "#64748b",
  fontSize: "14px",
};

const analyticsSectionNavItems = [
  { id: "overview", label: "Overview" },
  { id: "billing", label: "Billing" },
  { id: "customers", label: "Customers" },
  { id: "vendors", label: "Vendors" },
  { id: "rewards", label: "Rewards" },
  { id: "subscriptions", label: "Subscriptions" },
];

function getCurrentIstYearMonth() {
  const shifted = new Date(Date.now() + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    monthIndex: shifted.getUTCMonth(),
  };
}

function buildHistoricalMonthOptions() {
  const { year, monthIndex } = getCurrentIstYearMonth();

  return Array.from({ length: 11 }, (_, index) => {
    const date = new Date(Date.UTC(year, monthIndex - index - 1, 1));
    const optionYear = date.getUTCFullYear();
    const optionMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
    const month = `${optionYear}-${optionMonth}`;
    const label = new Intl.DateTimeFormat("en-IN", {
      month: "long",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    }).format(date);

    return {
      label,
      value: `month:${month}`,
      period: "month",
      month,
    };
  });
}

function buildPeriodOptions() {
  return [
    { label: "Today", value: "today", period: "today" },
    { label: "This Month", value: "thisMonth", period: "thisMonth" },
    ...buildHistoricalMonthOptions(),
    { label: "This Year", value: "thisYear", period: "thisYear" },
    { label: "All Time", value: "allTime", period: "allTime" },
  ];
}

function buildAnalyticsParams(periodOption) {
  return periodOption.period === "month"
    ? { period: "month", month: periodOption.month }
    : { period: periodOption.period };
}

function formatInteger(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  });
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDecimal(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  });
}

function formatPercent(value) {
  return `${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 1,
  })}%`;
}

function getSafeCustomerLabel(customerId, index) {
  if (!customerId) return `Customer ${index + 1}`;
  const id = String(customerId);
  return `Customer ${id.slice(-8)}`;
}

function formatRefreshTime(date) {
  if (!date) return "Not refreshed yet";
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
  }).format(date);
}

function formatDateOnly(value) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

function formatTrendBucket(bucket, periodOption) {
  if (!bucket) return "";

  if (periodOption.period === "today") {
    return bucket;
  }

  if (periodOption.period === "thisMonth" || periodOption.period === "month") {
    const [year, month, day] = String(bucket).split("-");
    const date = new Date(
      Date.UTC(Number(year || 1970), Number(month || 1) - 1, Number(day || 1))
    );
    const monthLabel = new Intl.DateTimeFormat("en-IN", {
      month: "short",
      timeZone: "Asia/Kolkata",
    }).format(date);
    return `${Number(day)} ${monthLabel}`;
  }

  const [year, month] = String(bucket).split("-");
  const date = new Date(Date.UTC(Number(year || 1970), Number(month || 1) - 1, 1));
  const monthLabel = new Intl.DateTimeFormat("en-IN", {
    month: "short",
    timeZone: "Asia/Kolkata",
  }).format(date);

  return periodOption.period === "thisYear" ? monthLabel : `${monthLabel} ${year}`;
}

function KpiCard({ label, value, loading, compact = false }) {
  return (
    <div style={{ ...cardStyle, minHeight: compact ? "90px" : "116px" }}>
      <div style={{ ...mutedTextStyle, fontWeight: 700 }}>{label}</div>
      <div
        style={{
          fontSize: compact ? "24px" : "30px",
          lineHeight: 1.15,
          fontWeight: 800,
          marginTop: "12px",
          color: "#0f172a",
        }}
      >
        {loading ? "..." : value}
      </div>
    </div>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom: "16px" }}>
      <h2 style={{ margin: 0, color: "#0f172a" }}>{title}</h2>
      {subtitle ? (
        <p style={{ margin: "6px 0 0", color: "#64748b" }}>{subtitle}</p>
      ) : null}
    </div>
  );
}

function SectionError({ message, onRetry }) {
  return (
    <div
      role="alert"
      style={{
        ...cardStyle,
        borderColor: "#fecaca",
        background: "#fef2f2",
        color: "#991b1b",
        marginBottom: "20px",
      }}
    >
      <div style={{ fontWeight: 800, marginBottom: "8px" }}>{message}</div>
      <button
        type="button"
        onClick={onRetry}
        style={{
          padding: "8px 12px",
          borderRadius: "10px",
          border: "1px solid #fecaca",
          background: "#ffffff",
          color: "#991b1b",
          cursor: "pointer",
          fontWeight: 700,
        }}
      >
        Retry
      </button>
    </div>
  );
}

function BillingTrendChart({ trend, periodOption }) {
  const chartData = Array.isArray(trend) ? trend : [];

  if (!chartData.length) {
    return (
      <div style={{ ...cardStyle, color: "#64748b" }}>
        No billing activity for this period.
      </div>
    );
  }

  const width = 720;
  const height = 190;
  const sidePadding = 34;
  const topPadding = 22;
  const bottomPadding = 42;
  const chartBottom = height - bottomPadding;
  const maxValue = Math.max(
    ...chartData.map((row) => Number(row.grossBillingValue || 0)),
    1
  );
  const xStep =
    chartData.length > 1 ? (width - sidePadding * 2) / (chartData.length - 1) : 0;
  const points = chartData.map((row, index) => {
    const x = sidePadding + index * xStep;
    const y =
      chartBottom -
      (Number(row.grossBillingValue || 0) / maxValue) * (chartBottom - topPadding);
    return { ...row, x, y };
  });
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const labelInterval = (() => {
    const count = chartData.length;
    if (count <= 10) return 1;
    if (periodOption.period === "today") return Math.ceil(count / 6);
    if (periodOption.period === "allTime") return Math.ceil(count / 8);
    return Math.ceil(count / 10);
  })();
  const shouldShowLabel = (index) =>
    index === 0 || index === points.length - 1 || index % labelInterval === 0;

  return (
    <div style={cardStyle}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
          marginBottom: "12px",
        }}
      >
        <div>
          <div style={{ color: "#0f172a", fontWeight: 800 }}>Gross Billing Value Trend</div>
          <div style={mutedTextStyle}>Bill count is shown on each point.</div>
        </div>
        <div style={{ ...mutedTextStyle, fontWeight: 700 }}>
          Peak {formatCurrency(maxValue)}
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Gross billing value trend chart"
          style={{ minWidth: "620px", width: "100%", display: "block" }}
        >
          <line
            x1={sidePadding}
            y1={chartBottom}
            x2={width - sidePadding}
            y2={chartBottom}
            stroke="#e5e7eb"
            strokeWidth="2"
          />
          <path d={path} fill="none" stroke="#0ea5e9" strokeWidth="4" strokeLinecap="round" />
          {points.map((point) => (
            <g key={`${point.bucket}-${point.x}`}>
              <circle cx={point.x} cy={point.y} r="5" fill="#0369a1">
                <title>
                  {`${formatTrendBucket(point.bucket, periodOption)}: ${formatCurrency(
                    point.grossBillingValue
                  )}, ${formatInteger(point.completedBills)} bills`}
                </title>
              </circle>
            </g>
          ))}
          {points.map((point, index) =>
            shouldShowLabel(index) ? (
              <text
                key={`${point.bucket}-label`}
                x={point.x}
                y={chartBottom + 24}
                textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
                fill="#64748b"
                fontSize="12"
                fontWeight="600"
              >
                {formatTrendBucket(point.bucket, periodOption)}
              </text>
            ) : null
          )}
        </svg>
      </div>
    </div>
  );
}

function TopVendorList({ title, rows, metricKey, metricFormatter, secondaryKey }) {
  const items = Array.isArray(rows) ? rows.slice(0, 10) : [];
  const secondaryIsCurrency =
    secondaryKey === "grossBillingValue" || String(secondaryKey || "").includes("BillingValue");

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: "0 0 14px", color: "#0f172a" }}>{title}</h3>
      {items.length ? (
        <div style={{ display: "grid", gap: "10px" }}>
          {items.map((row, index) => (
            <div
              key={`${title}-${row.vendorId || index}`}
              style={{
                display: "grid",
                gridTemplateColumns: "32px 1fr auto",
                gap: "10px",
                alignItems: "center",
              }}
            >
              <strong style={{ color: "#64748b" }}>{index + 1}</strong>
              <div>
                <div style={{ fontWeight: 800, color: "#0f172a" }}>
                  {row.businessName || "Unknown Vendor"}
                </div>
                {secondaryKey ? (
                  <div style={{ ...mutedTextStyle, fontSize: "13px" }}>
                    {secondaryIsCurrency
                      ? formatCurrency(row[secondaryKey])
                      : `${formatInteger(row[secondaryKey])} bills`}
                  </div>
                ) : null}
              </div>
              <strong style={{ color: "#0f172a" }}>{metricFormatter(row[metricKey])}</strong>
            </div>
          ))}
        </div>
      ) : (
        <div style={mutedTextStyle}>No vendors for this period.</div>
      )}
    </div>
  );
}

function RewardTrendChart({ trend, periodOption }) {
  const chartData = Array.isArray(trend) ? trend : [];

  if (!chartData.length) {
    return (
      <div style={{ ...cardStyle, color: "#64748b" }}>
        No reward activity for this period.
      </div>
    );
  }

  const width = 720;
  const height = 190;
  const sidePadding = 34;
  const topPadding = 22;
  const bottomPadding = 42;
  const chartBottom = height - bottomPadding;
  const maxValue = Math.max(
    ...chartData.map((row) =>
      Math.max(Number(row.issuedPoints || 0), Number(row.redeemedPoints || 0))
    ),
    1
  );
  const xStep =
    chartData.length > 1 ? (width - sidePadding * 2) / (chartData.length - 1) : 0;
  const buildPoints = (key) =>
    chartData.map((row, index) => {
      const x = sidePadding + index * xStep;
      const y = chartBottom - (Number(row[key] || 0) / maxValue) * (chartBottom - topPadding);
      return { ...row, x, y, value: row[key] };
    });
  const issuedPoints = buildPoints("issuedPoints");
  const redeemedPoints = buildPoints("redeemedPoints");
  const buildPath = (points) =>
    points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
      .join(" ");
  const labelInterval = (() => {
    const count = chartData.length;
    if (count <= 10) return 1;
    if (periodOption.period === "today") return Math.ceil(count / 6);
    if (periodOption.period === "allTime") return Math.ceil(count / 8);
    return Math.ceil(count / 10);
  })();
  const shouldShowLabel = (index) =>
    index === 0 || index === issuedPoints.length - 1 || index % labelInterval === 0;

  return (
    <div style={cardStyle}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
          marginBottom: "12px",
        }}
      >
        <div>
          <div style={{ color: "#0f172a", fontWeight: 800 }}>Rewards Trend</div>
          <div style={mutedTextStyle}>Issued and redeemed points by bucket.</div>
        </div>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", ...mutedTextStyle }}>
          <span><strong style={{ color: "#f59e0b" }}>●</strong> Issued</span>
          <span><strong style={{ color: "#7c3aed" }}>●</strong> Redeemed</span>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Rewards issued and redeemed trend chart"
          style={{ minWidth: "620px", width: "100%", display: "block" }}
        >
          <line
            x1={sidePadding}
            y1={chartBottom}
            x2={width - sidePadding}
            y2={chartBottom}
            stroke="#e5e7eb"
            strokeWidth="2"
          />
          <path
            d={buildPath(issuedPoints)}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d={buildPath(redeemedPoints)}
            fill="none"
            stroke="#7c3aed"
            strokeWidth="4"
            strokeLinecap="round"
          />
          {issuedPoints.map((point) => (
            <g key={`${point.bucket}-issued-${point.x}`}>
              <circle cx={point.x} cy={point.y} r="5" fill="#d97706">
                <title>
                  {`${formatTrendBucket(point.bucket, periodOption)}: ${formatInteger(
                    point.issuedPoints
                  )} issued points, ${formatInteger(point.earnEvents)} earn events`}
                </title>
              </circle>
            </g>
          ))}
          {redeemedPoints.map((point) => (
            <g key={`${point.bucket}-redeemed-${point.x}`}>
              <circle cx={point.x} cy={point.y} r="4" fill="#6d28d9">
                <title>
                  {`${formatTrendBucket(point.bucket, periodOption)}: ${formatInteger(
                    point.redeemedPoints
                  )} redeemed points, ${formatInteger(point.redeemEvents)} redeem events`}
                </title>
              </circle>
            </g>
          ))}
          {issuedPoints.map((point, index) =>
            shouldShowLabel(index) ? (
              <text
                key={`${point.bucket}-reward-label`}
                x={point.x}
                y={chartBottom + 24}
                textAnchor={
                  index === 0 ? "start" : index === issuedPoints.length - 1 ? "end" : "middle"
                }
                fill="#64748b"
                fontSize="12"
                fontWeight="600"
              >
                {formatTrendBucket(point.bucket, periodOption)}
              </text>
            ) : null
          )}
        </svg>
      </div>
    </div>
  );
}

function TopRewardVendorList({ title, rows, metricKey, secondaryKey }) {
  const items = Array.isArray(rows)
    ? rows.filter((row) => Number(row[metricKey] || 0) > 0).slice(0, 10)
    : [];

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: "0 0 14px", color: "#0f172a" }}>{title}</h3>
      {items.length ? (
        <div style={{ display: "grid", gap: "10px" }}>
          {items.map((row, index) => (
            <div
              key={`${title}-${row.vendorId || index}`}
              style={{
                display: "grid",
                gridTemplateColumns: "32px 1fr auto",
                gap: "10px",
                alignItems: "center",
              }}
            >
              <strong style={{ color: "#64748b" }}>{index + 1}</strong>
              <div>
                <div style={{ fontWeight: 800, color: "#0f172a" }}>
                  {row.businessName || "Unknown Vendor"}
                </div>
                {secondaryKey ? (
                  <div style={{ ...mutedTextStyle, fontSize: "13px" }}>
                    {formatInteger(row[secondaryKey])} events
                  </div>
                ) : null}
              </div>
              <strong style={{ color: "#0f172a" }}>
                {formatInteger(row[metricKey])} pts
              </strong>
            </div>
          ))}
        </div>
      ) : (
        <div style={mutedTextStyle}>No reward vendors for this period.</div>
      )}
    </div>
  );
}

const sortableColumns = {
  completedBills: "Completed Bills",
  grossBillingValue: "Gross Billing Value",
  averageBillValue: "Average Bill Value",
  uniqueCustomers: "Unique Customers",
  walkInBills: "Walk-in Bills",
};

function VendorPerformanceTable({ rows, sortConfig, onSort }) {
  const items = Array.isArray(rows) ? rows : [];

  const renderSortLabel = (key) => {
    if (sortConfig.key !== key) return sortableColumns[key];
    return `${sortableColumns[key]} ${sortConfig.direction === "asc" ? "↑" : "↓"}`;
  };

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: "0 0 14px", color: "#0f172a" }}>Vendor Performance</h3>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "780px" }}>
          <thead>
            <tr>
              <th style={tableHeaderStyle}>Business Name</th>
              {Object.keys(sortableColumns).map((key) => (
                <th key={key} style={tableHeaderStyle}>
                  <button
                    type="button"
                    onClick={() => onSort(key)}
                    style={{
                      border: 0,
                      background: "transparent",
                      cursor: "pointer",
                      fontWeight: 800,
                      color: "#334155",
                      padding: 0,
                    }}
                  >
                    {renderSortLabel(key)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length ? (
              items.map((row, index) => (
                <tr key={row.vendorId || index}>
                  <td style={tableCellStyle}>
                    <strong>{row.businessName || "Unknown Vendor"}</strong>
                  </td>
                  <td style={tableCellStyle}>{formatInteger(row.completedBills)}</td>
                  <td style={tableCellStyle}>{formatCurrency(row.grossBillingValue)}</td>
                  <td style={tableCellStyle}>{formatCurrency(row.averageBillValue)}</td>
                  <td style={tableCellStyle}>{formatInteger(row.uniqueCustomers)}</td>
                  <td style={tableCellStyle}>{formatInteger(row.walkInBills)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6" style={{ ...tableCellStyle, color: "#64748b" }}>
                  No vendor billing activity for this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CustomerTrendChart({ trend, periodOption }) {
  const chartData = Array.isArray(trend) ? trend : [];

  if (!chartData.length) {
    return (
      <div style={{ ...cardStyle, color: "#64748b" }}>
        No customer activity for this period.
      </div>
    );
  }

  const width = 720;
  const height = 190;
  const sidePadding = 34;
  const topPadding = 22;
  const bottomPadding = 42;
  const chartBottom = height - bottomPadding;
  const maxValue = Math.max(...chartData.map((row) => Number(row.activeCustomers || 0)), 1);
  const xStep =
    chartData.length > 1 ? (width - sidePadding * 2) / (chartData.length - 1) : 0;
  const points = chartData.map((row, index) => {
    const x = sidePadding + index * xStep;
    const y =
      chartBottom -
      (Number(row.activeCustomers || 0) / maxValue) * (chartBottom - topPadding);
    return { ...row, x, y };
  });
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const labelInterval = (() => {
    const count = chartData.length;
    if (count <= 10) return 1;
    if (periodOption.period === "today") return Math.ceil(count / 6);
    if (periodOption.period === "allTime") return Math.ceil(count / 8);
    return Math.ceil(count / 10);
  })();
  const shouldShowLabel = (index) =>
    index === 0 || index === points.length - 1 || index % labelInterval === 0;

  return (
    <div style={cardStyle}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
          marginBottom: "12px",
        }}
      >
        <div>
          <div style={{ color: "#0f172a", fontWeight: 800 }}>Active Customers Trend</div>
          <div style={mutedTextStyle}>
            Customer count is distinct within each bucket, not additive.
          </div>
        </div>
        <div style={{ ...mutedTextStyle, fontWeight: 700 }}>
          Peak {formatInteger(maxValue)}
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Active customers trend chart"
          style={{ minWidth: "620px", width: "100%", display: "block" }}
        >
          <line
            x1={sidePadding}
            y1={chartBottom}
            x2={width - sidePadding}
            y2={chartBottom}
            stroke="#e5e7eb"
            strokeWidth="2"
          />
          <path d={path} fill="none" stroke="#16a34a" strokeWidth="4" strokeLinecap="round" />
          {points.map((point) => (
            <g key={`${point.bucket}-${point.x}`}>
              <circle cx={point.x} cy={point.y} r="5" fill="#15803d">
                <title>
                  {`${formatTrendBucket(point.bucket, periodOption)}: ${formatInteger(
                    point.activeCustomers
                  )} active customers, ${formatInteger(
                    point.completedCustomerBills
                  )} customer bills, ${formatCurrency(point.grossCustomerBillingValue)}`}
                </title>
              </circle>
            </g>
          ))}
          {points.map((point, index) =>
            shouldShowLabel(index) ? (
              <text
                key={`${point.bucket}-customer-label`}
                x={point.x}
                y={chartBottom + 24}
                textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
                fill="#64748b"
                fontSize="12"
                fontWeight="600"
              >
                {formatTrendBucket(point.bucket, periodOption)}
              </text>
            ) : null
          )}
        </svg>
      </div>
    </div>
  );
}

function BooleanBadge({ value }) {
  return (
    <span
      style={{
        display: "inline-flex",
        padding: "4px 8px",
        borderRadius: "999px",
        background: value ? "#dcfce7" : "#f1f5f9",
        color: value ? "#166534" : "#475569",
        fontSize: "12px",
        fontWeight: 800,
      }}
    >
      {value ? "Yes" : "No"}
    </span>
  );
}

function TopCustomerList({ title, rows, metricKey, metricFormatter, secondaryKey }) {
  const items = Array.isArray(rows) ? rows.slice(0, 10) : [];

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: "0 0 14px", color: "#0f172a" }}>{title}</h3>
      {items.length ? (
        <div style={{ display: "grid", gap: "10px" }}>
          {items.map((row, index) => (
            <div
              key={`${title}-${row.customerId || index}`}
              style={{
                display: "grid",
                gridTemplateColumns: "32px 1fr auto",
                gap: "10px",
                alignItems: "center",
              }}
            >
              <strong style={{ color: "#64748b" }}>{index + 1}</strong>
              <div>
                <div style={{ fontWeight: 800, color: "#0f172a" }}>
                  {getSafeCustomerLabel(row.customerId, index)}
                </div>
                {secondaryKey ? (
                  <div style={{ ...mutedTextStyle, fontSize: "13px" }}>
                    {secondaryKey === "periodBillingValue"
                      ? formatCurrency(row[secondaryKey])
                      : `${formatInteger(row[secondaryKey])} bills`}
                  </div>
                ) : null}
              </div>
              <strong style={{ color: "#0f172a" }}>{metricFormatter(row[metricKey])}</strong>
            </div>
          ))}
        </div>
      ) : (
        <div style={mutedTextStyle}>No customers for this period.</div>
      )}
    </div>
  );
}

const customerSortableColumns = {
  periodBills: "Period Bills",
  periodBillingValue: "Period Billing Value",
  periodVendorCount: "Period Vendor Count",
  lifetimeBills: "Lifetime Bills",
  lifetimeBillingValue: "Lifetime Billing Value",
  lifetimeVendorCount: "Lifetime Vendor Count",
};

function CustomerPerformanceTable({ rows, sortConfig, onSort }) {
  const items = Array.isArray(rows) ? rows : [];
  const renderSortLabel = (key) => {
    if (sortConfig.key !== key) return customerSortableColumns[key];
    return `${customerSortableColumns[key]} ${sortConfig.direction === "asc" ? "↑" : "↓"}`;
  };

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: "0 0 14px", color: "#0f172a" }}>Customer Performance</h3>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "980px" }}>
          <thead>
            <tr>
              <th style={tableHeaderStyle}>Customer</th>
              {Object.keys(customerSortableColumns).map((key) => (
                <th key={key} style={tableHeaderStyle}>
                  <button
                    type="button"
                    onClick={() => onSort(key)}
                    style={{
                      border: 0,
                      background: "transparent",
                      cursor: "pointer",
                      fontWeight: 800,
                      color: "#334155",
                      padding: 0,
                    }}
                  >
                    {renderSortLabel(key)}
                  </button>
                </th>
              ))}
              <th style={tableHeaderStyle}>New Customer</th>
              <th style={tableHeaderStyle}>Repeat Customer</th>
              <th style={tableHeaderStyle}>Cross-Vendor</th>
            </tr>
          </thead>
          <tbody>
            {items.length ? (
              items.map((row, index) => (
                <tr key={row.customerId || index}>
                  <td style={tableCellStyle}>
                    <strong>{getSafeCustomerLabel(row.customerId, index)}</strong>
                  </td>
                  <td style={tableCellStyle}>{formatInteger(row.periodBills)}</td>
                  <td style={tableCellStyle}>{formatCurrency(row.periodBillingValue)}</td>
                  <td style={tableCellStyle}>{formatInteger(row.periodVendorCount)}</td>
                  <td style={tableCellStyle}>{formatInteger(row.lifetimeBills)}</td>
                  <td style={tableCellStyle}>{formatCurrency(row.lifetimeBillingValue)}</td>
                  <td style={tableCellStyle}>{formatInteger(row.lifetimeVendorCount)}</td>
                  <td style={tableCellStyle}><BooleanBadge value={row.isNewInPeriod} /></td>
                  <td style={tableCellStyle}><BooleanBadge value={row.isRepeatInPeriod} /></td>
                  <td style={tableCellStyle}><BooleanBadge value={row.isCrossVendorInPeriod} /></td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="10" style={{ ...tableCellStyle, color: "#64748b" }}>
                  No identified customer billing activity for this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const vendorCustomerSortableColumns = {
  customerBillingValue: "Customer Billing Value",
  customerBills: "Customer Bills",
  uniqueCustomers: "Active Customers",
  repeatCustomersWithinVendor: "Repeat Customers",
};

function VendorCustomerPerformanceTable({ rows, sortConfig, onSort }) {
  const items = Array.isArray(rows) ? rows : [];
  const renderSortLabel = (key) => {
    if (sortConfig.key !== key) return vendorCustomerSortableColumns[key];
    return `${vendorCustomerSortableColumns[key]} ${sortConfig.direction === "asc" ? "↑" : "↓"}`;
  };

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: "0 0 14px", color: "#0f172a" }}>Vendor Customer Performance</h3>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "780px" }}>
          <thead>
            <tr>
              <th style={tableHeaderStyle}>Business Name</th>
              {Object.keys(vendorCustomerSortableColumns).map((key) => (
                <th key={key} style={tableHeaderStyle}>
                  <button
                    type="button"
                    onClick={() => onSort(key)}
                    style={{
                      border: 0,
                      background: "transparent",
                      cursor: "pointer",
                      fontWeight: 800,
                      color: "#334155",
                      padding: 0,
                    }}
                  >
                    {renderSortLabel(key)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length ? (
              items.map((row, index) => (
                <tr key={row.vendorId || index}>
                  <td style={tableCellStyle}>
                    <strong>{row.businessName || "Unknown Vendor"}</strong>
                  </td>
                  <td style={tableCellStyle}>{formatCurrency(row.customerBillingValue)}</td>
                  <td style={tableCellStyle}>{formatInteger(row.customerBills)}</td>
                  <td style={tableCellStyle}>{formatInteger(row.uniqueCustomers)}</td>
                  <td style={tableCellStyle}>{formatInteger(row.repeatCustomersWithinVendor)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5" style={{ ...tableCellStyle, color: "#64748b" }}>
                  No vendor customer activity for this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const vendorSortableColumns = {
  periodGrossBillingValue: "Gross Billing Value",
  periodCompletedBills: "Completed Bills",
  periodAverageBillValue: "Average Bill Value",
  periodUniqueCustomers: "Unique Customers",
  periodWalkInBills: "Walk-in Bills",
  periodIssuedPoints: "Rewards Issued",
};

const rewardVendorSortableColumns = {
  issuedPoints: "Points Issued",
  redeemedPoints: "Points Redeemed",
  earnEvents: "Earn Events",
  redeemEvents: "Redeem Events",
};

function VendorAnalyticsPerformanceTable({ rows, sortConfig, onSort, showAll, onToggleShowAll }) {
  const items = Array.isArray(rows) ? rows : [];
  const renderSortLabel = (key) => {
    if (sortConfig.key !== key) return vendorSortableColumns[key];
    return `${vendorSortableColumns[key]} ${sortConfig.direction === "asc" ? "↑" : "↓"}`;
  };

  return (
    <div style={cardStyle}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
          marginBottom: "14px",
        }}
      >
        <div>
          <h3 style={{ margin: 0, color: "#0f172a" }}>Vendor Performance</h3>
          <div style={mutedTextStyle}>
            {showAll ? "Showing all vendor records." : "Showing active/relevant vendors."}
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleShowAll}
          style={{
            padding: "8px 12px",
            borderRadius: "10px",
            border: "1px solid #d1d5db",
            background: "#ffffff",
            color: "#0f172a",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          {showAll ? "Active/Relevant Vendors" : "All Vendor Records"}
        </button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "900px" }}>
          <thead>
            <tr>
              <th style={tableHeaderStyle}>Business Name</th>
              {Object.keys(vendorSortableColumns).map((key) => (
                <th key={key} style={tableHeaderStyle}>
                  <button
                    type="button"
                    onClick={() => onSort(key)}
                    style={{
                      border: 0,
                      background: "transparent",
                      cursor: "pointer",
                      fontWeight: 800,
                      color: "#334155",
                      padding: 0,
                    }}
                  >
                    {renderSortLabel(key)}
                  </button>
                </th>
              ))}
              <th style={tableHeaderStyle}>Billing Active</th>
              <th style={tableHeaderStyle}>Rewards Active</th>
            </tr>
          </thead>
          <tbody>
            {items.length ? (
              items.map((row, index) => (
                <tr key={row.vendorId || index}>
                  <td style={tableCellStyle}>
                    <strong>{row.businessName || "Unknown Vendor"}</strong>
                  </td>
                  <td style={tableCellStyle}>{formatCurrency(row.periodGrossBillingValue)}</td>
                  <td style={tableCellStyle}>{formatInteger(row.periodCompletedBills)}</td>
                  <td style={tableCellStyle}>{formatCurrency(row.periodAverageBillValue)}</td>
                  <td style={tableCellStyle}>{formatInteger(row.periodUniqueCustomers)}</td>
                  <td style={tableCellStyle}>{formatInteger(row.periodWalkInBills)}</td>
                  <td style={tableCellStyle}>{formatInteger(row.periodIssuedPoints)}</td>
                  <td style={tableCellStyle}><BooleanBadge value={row.isBillingActiveInPeriod} /></td>
                  <td style={tableCellStyle}><BooleanBadge value={row.isRewardsActiveInPeriod} /></td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="9" style={{ ...tableCellStyle, color: "#64748b" }}>
                  No active/relevant vendors for this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CategoryPerformanceTable({ rows }) {
  const items = Array.isArray(rows) ? rows : [];

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: "0 0 14px", color: "#0f172a" }}>Vendor Activity by Category</h3>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "820px" }}>
          <thead>
            <tr>
              <th style={tableHeaderStyle}>Category</th>
              <th style={tableHeaderStyle}>Vendor Records</th>
              <th style={tableHeaderStyle}>Active Billing Vendors</th>
              <th style={tableHeaderStyle}>Completed Bills</th>
              <th style={tableHeaderStyle}>Gross Billing Value</th>
              <th style={tableHeaderStyle}>Unique Customers</th>
              <th style={tableHeaderStyle}>Rewards Active Vendors</th>
            </tr>
          </thead>
          <tbody>
            {items.length ? (
              items.map((row, index) => (
                <tr key={row.categoryId || `uncategorized-${index}`}>
                  <td style={tableCellStyle}>
                    {row.categoryName || (row.categoryId ? "Unknown Category" : "Uncategorized")}
                  </td>
                  <td style={tableCellStyle}>{formatInteger(row.totalVendors)}</td>
                  <td style={tableCellStyle}>{formatInteger(row.activeBillingVendors)}</td>
                  <td style={tableCellStyle}>{formatInteger(row.completedBills)}</td>
                  <td style={tableCellStyle}>{formatCurrency(row.grossBillingValue)}</td>
                  <td style={tableCellStyle}>{formatInteger(row.uniqueCustomers)}</td>
                  <td style={tableCellStyle}>{formatInteger(row.rewardsActiveVendors)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7" style={{ ...tableCellStyle, color: "#64748b" }}>
                  No category activity for this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PlanDistributionTable({ rows }) {
  const items = Array.isArray(rows) ? rows : [];

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: "0 0 14px", color: "#0f172a" }}>
        Subscription Plan Distribution
      </h3>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "620px" }}>
          <thead>
            <tr>
              <th style={tableHeaderStyle}>Plan Name</th>
              <th style={tableHeaderStyle}>Assigned Vendors</th>
              <th style={tableHeaderStyle}>Published Vendors</th>
              <th style={tableHeaderStyle}>Active Paid Vendors</th>
            </tr>
          </thead>
          <tbody>
            {items.length ? (
              items.map((row, index) => (
                <tr key={row.planName || index}>
                  <td style={tableCellStyle}>{row.planName || "Unknown Plan"}</td>
                  <td style={tableCellStyle}>{formatInteger(row.assignedVendors)}</td>
                  <td style={tableCellStyle}>{formatInteger(row.publishedVendors)}</td>
                  <td style={tableCellStyle}>{formatInteger(row.activePaidVendors)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="4" style={{ ...tableCellStyle, color: "#64748b" }}>
                  No subscription plan distribution available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function VendorRewardPerformanceTable({ rows, sortConfig, onSort }) {
  const items = Array.isArray(rows) ? rows : [];
  const renderSortLabel = (key) => {
    if (sortConfig.key !== key) return rewardVendorSortableColumns[key];
    return `${rewardVendorSortableColumns[key]} ${sortConfig.direction === "asc" ? "↑" : "↓"}`;
  };

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: "0 0 14px", color: "#0f172a" }}>Vendor Reward Performance</h3>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "860px" }}>
          <thead>
            <tr>
              <th style={tableHeaderStyle}>Business Name</th>
              {Object.keys(rewardVendorSortableColumns).map((key) => (
                <th key={key} style={tableHeaderStyle}>
                  <button
                    type="button"
                    onClick={() => onSort(key)}
                    style={{
                      border: 0,
                      background: "transparent",
                      cursor: "pointer",
                      fontWeight: 800,
                      color: "#334155",
                      padding: 0,
                    }}
                  >
                    {renderSortLabel(key)}
                  </button>
                </th>
              ))}
              <th style={tableHeaderStyle}>Customers Earned</th>
              <th style={tableHeaderStyle}>Customers Redeemed</th>
            </tr>
          </thead>
          <tbody>
            {items.length ? (
              items.map((row, index) => (
                <tr key={row.vendorId || index}>
                  <td style={tableCellStyle}>
                    <strong>{row.businessName || "Unknown Vendor"}</strong>
                  </td>
                  <td style={tableCellStyle}>{formatInteger(row.issuedPoints)}</td>
                  <td style={tableCellStyle}>{formatInteger(row.redeemedPoints)}</td>
                  <td style={tableCellStyle}>{formatInteger(row.earnEvents)}</td>
                  <td style={tableCellStyle}>{formatInteger(row.redeemEvents)}</td>
                  <td style={tableCellStyle}>{formatInteger(row.uniqueCustomersEarned)}</td>
                  <td style={tableCellStyle}>{formatInteger(row.uniqueCustomersRedeemed)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7" style={{ ...tableCellStyle, color: "#64748b" }}>
                  No vendor reward activity for this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SubscriptionTrendChart({ trend, periodOption }) {
  const chartData = Array.isArray(trend) ? trend : [];

  if (!chartData.length) {
    return (
      <div style={{ ...cardStyle, color: "#64748b" }}>
        No subscription records were created in this period.
      </div>
    );
  }

  const width = 720;
  const height = 190;
  const sidePadding = 34;
  const topPadding = 22;
  const bottomPadding = 42;
  const chartBottom = height - bottomPadding;
  const maxValue = Math.max(
    ...chartData.map((row) => Number(row.subscriptionRecordsCreated || 0)),
    1
  );
  const xStep =
    chartData.length > 1 ? (width - sidePadding * 2) / (chartData.length - 1) : 0;
  const points = chartData.map((row, index) => {
    const x = sidePadding + index * xStep;
    const y =
      chartBottom -
      (Number(row.subscriptionRecordsCreated || 0) / maxValue) *
        (chartBottom - topPadding);
    return { ...row, x, y };
  });
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const labelInterval = (() => {
    const count = chartData.length;
    if (count <= 10) return 1;
    if (periodOption.period === "today") return Math.ceil(count / 6);
    if (periodOption.period === "allTime") return Math.ceil(count / 8);
    return Math.ceil(count / 10);
  })();
  const shouldShowLabel = (index) =>
    index === 0 || index === points.length - 1 || index % labelInterval === 0;

  return (
    <div style={cardStyle}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
          marginBottom: "12px",
        }}
      >
        <div>
          <div style={{ color: "#0f172a", fontWeight: 800 }}>
            Subscription Records Created
          </div>
          <div style={mutedTextStyle}>
            Trial, non-trial and current paid details are available on each point.
          </div>
        </div>
        <div style={{ ...mutedTextStyle, fontWeight: 700 }}>
          Peak {formatInteger(maxValue)}
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Subscription records created trend chart"
          style={{ minWidth: "620px", width: "100%", display: "block" }}
        >
          <line
            x1={sidePadding}
            y1={chartBottom}
            x2={width - sidePadding}
            y2={chartBottom}
            stroke="#e5e7eb"
            strokeWidth="2"
          />
          <path d={path} fill="none" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" />
          {points.map((point) => (
            <g key={`${point.bucket}-${point.x}`}>
              <circle cx={point.x} cy={point.y} r="5" fill="#1d4ed8">
                <title>
                  {`${formatTrendBucket(point.bucket, periodOption)}: ${formatInteger(
                    point.subscriptionRecordsCreated
                  )} records, ${formatInteger(
                    point.currentTrialPlanRecords
                  )} trial, ${formatInteger(
                    point.currentNonTrialPlanRecords
                  )} non-trial, ${formatInteger(point.currentPaidVendorRecords)} active paid`}
                </title>
              </circle>
            </g>
          ))}
          {points.map((point, index) =>
            shouldShowLabel(index) ? (
              <text
                key={`${point.bucket}-subscription-label`}
                x={point.x}
                y={chartBottom + 24}
                textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
                fill="#64748b"
                fontSize="12"
                fontWeight="600"
              >
                {formatTrendBucket(point.bucket, periodOption)}
              </text>
            ) : null
          )}
        </svg>
      </div>
    </div>
  );
}

function SubscriptionPlanDistributionTable({ rows }) {
  const items = Array.isArray(rows) ? rows : [];

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: "0 0 14px", color: "#0f172a" }}>
        Subscription Plan Distribution
      </h3>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "620px" }}>
          <thead>
            <tr>
              <th style={tableHeaderStyle}>Plan</th>
              <th style={tableHeaderStyle}>Assigned Vendors</th>
              <th style={tableHeaderStyle}>Published Vendors</th>
              <th style={tableHeaderStyle}>Active Paid Vendors</th>
            </tr>
          </thead>
          <tbody>
            {items.length ? (
              items.map((row, index) => (
                <tr key={row.planId || row.planName || index}>
                  <td style={tableCellStyle}>{row.planName || "Missing Plan"}</td>
                  <td style={tableCellStyle}>{formatInteger(row.assignedVendors)}</td>
                  <td style={tableCellStyle}>{formatInteger(row.publishedVendors)}</td>
                  <td style={tableCellStyle}>{formatInteger(row.activePaidVendors)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="4" style={{ ...tableCellStyle, color: "#64748b" }}>
                  No subscription plan distribution available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div style={{ ...mutedTextStyle, marginTop: "10px" }}>
        Assigned Vendors are plan assignments, not subscription revenue.
      </div>
    </div>
  );
}

const subscriptionSortableColumns = {
  planName: "Plan",
  expiryDate: "Expiry Date",
  createdAt: "Created Date",
};

function SubscriptionAssignmentsTable({
  rows,
  sortConfig,
  onSort,
  filter,
  onFilterChange,
}) {
  const items = Array.isArray(rows) ? rows : [];
  const filterOptions = ["All", "Active", "Expired", "Trial", "Non-Trial"];
  const renderSortLabel = (key) => {
    if (sortConfig.key !== key) return subscriptionSortableColumns[key];
    return `${subscriptionSortableColumns[key]} ${sortConfig.direction === "asc" ? "↑" : "↓"}`;
  };

  return (
    <div style={cardStyle}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
          marginBottom: "14px",
        }}
      >
        <div>
          <h3 style={{ margin: 0, color: "#0f172a" }}>Subscription Assignments</h3>
          <div style={mutedTextStyle}>Current assignment records with client-side filtering.</div>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {filterOptions.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onFilterChange(option)}
              style={{
                padding: "8px 10px",
                borderRadius: "999px",
                border: filter === option ? "1px solid #2563eb" : "1px solid #d1d5db",
                background: filter === option ? "#eff6ff" : "#ffffff",
                color: filter === option ? "#1d4ed8" : "#334155",
                cursor: "pointer",
                fontWeight: 800,
              }}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "980px" }}>
          <thead>
            <tr>
              <th style={tableHeaderStyle}>Business Name</th>
              {Object.keys(subscriptionSortableColumns).map((key) => (
                <th key={key} style={tableHeaderStyle}>
                  <button
                    type="button"
                    onClick={() => onSort(key)}
                    style={{
                      border: 0,
                      background: "transparent",
                      cursor: "pointer",
                      fontWeight: 800,
                      color: "#334155",
                      padding: 0,
                    }}
                  >
                    {renderSortLabel(key)}
                  </button>
                </th>
              ))}
              <th style={tableHeaderStyle}>Vendor Status</th>
              <th style={tableHeaderStyle}>Subscription Active</th>
              <th style={tableHeaderStyle}>Current Status</th>
            </tr>
          </thead>
          <tbody>
            {items.length ? (
              items.map((row, index) => (
                <tr key={row.subscriptionId || index}>
                  <td style={tableCellStyle}>
                    <strong>{row.businessName || "Unknown Vendor"}</strong>
                  </td>
                  <td style={tableCellStyle}>{row.planName || "Missing Plan"}</td>
                  <td style={tableCellStyle}>{formatDateOnly(row.expiryDate)}</td>
                  <td style={tableCellStyle}>{formatDateOnly(row.createdAt)}</td>
                  <td style={tableCellStyle}>{row.vendorStatus || "Unknown"}</td>
                  <td style={tableCellStyle}><BooleanBadge value={row.storedActiveFlag} /></td>
                  <td style={tableCellStyle}>
                    {row.isActivePaidVendor
                      ? "Active Paid"
                      : row.isCurrentlyExpired
                        ? "Expired"
                        : row.isTrialPlan
                          ? "Trial"
                          : row.isCurrentlyActive
                            ? "Active"
                            : "Inactive"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7" style={{ ...tableCellStyle, color: "#64748b" }}>
                  No subscription assignments match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UpcomingExpiriesList({ title, rows, emptyText }) {
  const items = Array.isArray(rows) ? rows : [];

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: "0 0 14px", color: "#0f172a" }}>{title}</h3>
      {items.length ? (
        <div style={{ display: "grid", gap: "10px" }}>
          {items.map((row, index) => (
            <div
              key={row.subscriptionId || index}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: "12px",
                alignItems: "center",
                borderBottom: "1px solid #f1f5f9",
                paddingBottom: "10px",
              }}
            >
              <div>
                <div style={{ fontWeight: 800, color: "#0f172a" }}>
                  {row.businessName || "Unknown Vendor"}
                </div>
                <div style={{ ...mutedTextStyle, fontSize: "13px" }}>
                  {row.planName || "Missing Plan"} · {row.vendorStatus || "Unknown"}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <strong style={{ color: "#0f172a" }}>{formatDateOnly(row.expiryDate)}</strong>
                <div style={{ ...mutedTextStyle, fontSize: "13px" }}>
                  {formatInteger(row.daysUntilExpiry)} days
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={mutedTextStyle}>{emptyText}</div>
      )}
    </div>
  );
}

function SubscriptionCategoryCoverageTable({ rows }) {
  const items = Array.isArray(rows) ? rows : [];

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: "0 0 14px", color: "#0f172a" }}>
        Subscription Coverage by Category
      </h3>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "860px" }}>
          <thead>
            <tr>
              <th style={tableHeaderStyle}>Category</th>
              <th style={tableHeaderStyle}>Vendor Count</th>
              <th style={tableHeaderStyle}>With Subscription</th>
              <th style={tableHeaderStyle}>Active Subscriptions</th>
              <th style={tableHeaderStyle}>Active Paid Vendors</th>
              <th style={tableHeaderStyle}>Published Vendors</th>
              <th style={tableHeaderStyle}>Coverage</th>
            </tr>
          </thead>
          <tbody>
            {items.length ? (
              items.map((row, index) => (
                <tr key={row.categoryId || `uncategorized-${index}`}>
                  <td style={tableCellStyle}>
                    {row.categoryName || (row.categoryId ? "Unknown Category" : "Uncategorized")}
                  </td>
                  <td style={tableCellStyle}>{formatInteger(row.totalVendors)}</td>
                  <td style={tableCellStyle}>{formatInteger(row.vendorsWithSubscription)}</td>
                  <td style={tableCellStyle}>{formatInteger(row.currentlyActiveSubscriptions)}</td>
                  <td style={tableCellStyle}>{formatInteger(row.activePaidVendors)}</td>
                  <td style={tableCellStyle}>{formatInteger(row.publishedVendors)}</td>
                  <td style={tableCellStyle}>{formatPercent(row.subscriptionCoverageRate)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7" style={{ ...tableCellStyle, color: "#64748b" }}>
                  No subscription coverage data available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const tableHeaderStyle = {
  textAlign: "left",
  borderBottom: "1px solid #e5e7eb",
  color: "#334155",
  fontSize: "13px",
  padding: "12px 10px",
  whiteSpace: "nowrap",
};

const tableCellStyle = {
  borderBottom: "1px solid #f1f5f9",
  color: "#0f172a",
  padding: "12px 10px",
  whiteSpace: "nowrap",
};

export default function AdminAnalyticsPage() {
  const periodOptions = useMemo(() => buildPeriodOptions(), []);
  const overviewRef = useRef(null);
  const billingRef = useRef(null);
  const customersRef = useRef(null);
  const vendorsRef = useRef(null);
  const rewardsRef = useRef(null);
  const subscriptionsRef = useRef(null);
  const [selectedPeriod, setSelectedPeriod] = useState("thisMonth");
  const [activeSection, setActiveSection] = useState("overview");
  const [overview, setOverview] = useState(null);
  const [billingAnalytics, setBillingAnalytics] = useState(null);
  const [customerAnalytics, setCustomerAnalytics] = useState(null);
  const [vendorAnalytics, setVendorAnalytics] = useState(null);
  const [rewardsAnalytics, setRewardsAnalytics] = useState(null);
  const [subscriptionAnalytics, setSubscriptionAnalytics] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [billingLoading, setBillingLoading] = useState(true);
  const [customerLoading, setCustomerLoading] = useState(true);
  const [vendorLoading, setVendorLoading] = useState(true);
  const [rewardsLoading, setRewardsLoading] = useState(true);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [overviewError, setOverviewError] = useState("");
  const [billingError, setBillingError] = useState("");
  const [customerError, setCustomerError] = useState("");
  const [vendorError, setVendorError] = useState("");
  const [rewardsError, setRewardsError] = useState("");
  const [subscriptionError, setSubscriptionError] = useState("");
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const [vendorSort, setVendorSort] = useState({
    key: "grossBillingValue",
    direction: "desc",
  });
  const [customerSort, setCustomerSort] = useState({
    key: "periodBillingValue",
    direction: "desc",
  });
  const [vendorCustomerSort, setVendorCustomerSort] = useState({
    key: "customerBillingValue",
    direction: "desc",
  });
  const [analyticsVendorSort, setAnalyticsVendorSort] = useState({
    key: "periodGrossBillingValue",
    direction: "desc",
  });
  const [rewardVendorSort, setRewardVendorSort] = useState({
    key: "issuedPoints",
    direction: "desc",
  });
  const [subscriptionSort, setSubscriptionSort] = useState({
    key: "expiryDate",
    direction: "asc",
  });
  const [showAllVendorRecords, setShowAllVendorRecords] = useState(false);
  const [subscriptionFilter, setSubscriptionFilter] = useState("All");
  const sectionRefs = useMemo(
    () => ({
      overview: overviewRef,
      billing: billingRef,
      customers: customersRef,
      vendors: vendorsRef,
      rewards: rewardsRef,
      subscriptions: subscriptionsRef,
    }),
    []
  );
  const selectedPeriodOption =
    periodOptions.find((option) => option.value === selectedPeriod) || periodOptions[1];

  const requestParams = useMemo(
    () => buildAnalyticsParams(selectedPeriodOption),
    [selectedPeriodOption]
  );

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    setOverviewError("");
    try {
      const { data } = await API.get("/api/admin/analytics/overview", {
        params: requestParams,
      });
      setOverview(data || null);
      return true;
    } catch (err) {
      setOverviewError(err?.response?.data?.message || "Unable to load analytics data.");
      return false;
    } finally {
      setOverviewLoading(false);
    }
  }, [requestParams]);

  const loadBilling = useCallback(async () => {
    setBillingLoading(true);
    setBillingError("");
    try {
      const { data } = await API.get("/api/admin/analytics/billing", {
        params: requestParams,
      });
      setBillingAnalytics(data || null);
      return true;
    } catch (err) {
      setBillingError("Unable to load billing analytics.");
      return false;
    } finally {
      setBillingLoading(false);
    }
  }, [requestParams]);

  const loadCustomers = useCallback(async () => {
    setCustomerLoading(true);
    setCustomerError("");
    try {
      const { data } = await API.get("/api/admin/analytics/customers", {
        params: requestParams,
      });
      setCustomerAnalytics(data || null);
      return true;
    } catch (err) {
      setCustomerError("Unable to load customer analytics.");
      return false;
    } finally {
      setCustomerLoading(false);
    }
  }, [requestParams]);

  const loadVendors = useCallback(async () => {
    setVendorLoading(true);
    setVendorError("");
    try {
      const { data } = await API.get("/api/admin/analytics/vendors", {
        params: requestParams,
      });
      setVendorAnalytics(data || null);
      return true;
    } catch (err) {
      setVendorError("Unable to load vendor analytics.");
      return false;
    } finally {
      setVendorLoading(false);
    }
  }, [requestParams]);

  const loadRewards = useCallback(async () => {
    setRewardsLoading(true);
    setRewardsError("");
    try {
      const { data } = await API.get("/api/admin/analytics/rewards", {
        params: requestParams,
      });
      setRewardsAnalytics(data || null);
      return true;
    } catch (err) {
      setRewardsError("Unable to load rewards analytics.");
      return false;
    } finally {
      setRewardsLoading(false);
    }
  }, [requestParams]);

  const loadSubscriptions = useCallback(async () => {
    setSubscriptionLoading(true);
    setSubscriptionError("");
    try {
      const { data } = await API.get("/api/admin/analytics/subscriptions", {
        params: requestParams,
      });
      setSubscriptionAnalytics(data || null);
      return true;
    } catch (err) {
      setSubscriptionError("Unable to load subscription analytics.");
      return false;
    } finally {
      setSubscriptionLoading(false);
    }
  }, [requestParams]);

  const loadDashboard = useCallback(async () => {
    const [
      overviewOk,
      billingOk,
      customerOk,
      vendorOk,
      rewardsOk,
      subscriptionsOk,
    ] = await Promise.all([
      loadOverview(),
      loadBilling(),
      loadCustomers(),
      loadVendors(),
      loadRewards(),
      loadSubscriptions(),
    ]);
    if (overviewOk && billingOk && customerOk && vendorOk && rewardsOk && subscriptionsOk) {
      setLastRefreshedAt(new Date());
    }
  }, [loadBilling, loadCustomers, loadOverview, loadRewards, loadSubscriptions, loadVendors]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const sectionId = visibleEntry?.target?.dataset?.sectionId;
        if (sectionId) {
          setActiveSection(sectionId);
        }
      },
      {
        root: null,
        rootMargin: "-110px 0px -65% 0px",
        threshold: [0.1, 0.25, 0.5],
      }
    );

    analyticsSectionNavItems.forEach((item) => {
      const node = sectionRefs[item.id]?.current;
      if (node) observer.observe(node);
    });

    return () => observer.disconnect();
  }, [sectionRefs]);

  const handleSectionNavigate = useCallback(
    (sectionId) => {
      setActiveSection(sectionId);
      sectionRefs[sectionId]?.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    },
    [sectionRefs]
  );

  const cards = useMemo(() => {
    const billing = overview?.billing || {};
    const customers = overview?.customers || {};
    const vendors = overview?.vendors || {};
    const rewards = overview?.rewards || {};

    return [
      {
        label: "Completed Bills",
        value: formatInteger(billing.completedBills),
      },
      {
        label: "Gross Billing Value",
        value: formatCurrency(billing.grossBillingValue),
      },
      {
        label: "Average Bill Value",
        value: formatCurrency(billing.averageBillValue),
      },
      {
        label: "Unique Customers",
        value: formatInteger(customers.uniqueCustomers),
      },
      {
        label: "Walk-in Bills",
        value: formatInteger(customers.walkInBills),
      },
      {
        label: "Active Billing Vendors",
        value: formatInteger(vendors.activeBillingVendors),
      },
      {
        label: "Rewards Issued",
        value: formatInteger(rewards.issued),
      },
      {
        label: "Rewards Redeemed",
        value: formatInteger(rewards.redeemed),
      },
    ];
  }, [overview]);

  const billingSummary = billingAnalytics?.summary || {};
  const billingSummaryCards = [
    {
      label: "Completed Bills",
      value: formatInteger(billingSummary.completedBills),
    },
    {
      label: "Gross Billing Value",
      value: formatCurrency(billingSummary.grossBillingValue),
    },
    {
      label: "Average Bill Value",
      value: formatCurrency(billingSummary.averageBillValue),
    },
  ];

  const customerSummary = customerAnalytics?.summary || {};
  const customerSummaryCards = [
    {
      label: "Active Customers",
      value: formatInteger(customerSummary.activeCustomers),
    },
    {
      label: "New Customers",
      value: formatInteger(customerSummary.newCustomers),
    },
    {
      label: "Repeat Customers",
      value: formatInteger(customerSummary.repeatCustomers),
    },
    {
      label: "Cross-Vendor Customers",
      value: formatInteger(customerSummary.crossVendorCustomers),
    },
    {
      label: "Customer Bills",
      value: formatInteger(customerSummary.completedCustomerBills),
    },
    {
      label: "Customer Billing Value",
      value: formatCurrency(customerSummary.grossCustomerBillingValue),
    },
    {
      label: "Avg Bills per Customer",
      value: formatDecimal(customerSummary.averageBillsPerCustomer),
    },
    {
      label: "Avg Billing Value per Customer",
      value: formatCurrency(customerSummary.averageBillingValuePerCustomer),
    },
  ];

  const vendorSummary = vendorAnalytics?.summary || {};
  const vendorBilling = vendorAnalytics?.billing || {};
  const currentVendorStatusCards = [
    {
      label: "Active Paid Vendors",
      value: formatInteger(vendorSummary.activePaidVendors),
    },
    {
      label: "Published Vendors",
      value: formatInteger(vendorSummary.publishedVendors),
    },
    {
      label: "Trial Vendors",
      value: formatInteger(vendorSummary.trialVendors),
    },
    {
      label: "Expired Paid Vendors",
      value: formatInteger(vendorSummary.expiredPaidVendors),
    },
    {
      label: "Published Without Active Paid",
      value: formatInteger(vendorSummary.publishedVendorsWithoutActivePaidSubscription),
    },
    {
      label: "Platform Vendor Records",
      value: formatInteger(vendorSummary.totalPlatformVendors),
    },
  ];
  const currentVendorSupportingCards = [
    {
      label: "Lifetime Billing Vendors (All Time)",
      value: formatInteger(vendorSummary.lifetimeBillingVendors),
    },
  ];
  const selectedPeriodVendorCards = [
    {
      label: "Active Billing Vendors",
      value: formatInteger(vendorSummary.activeBillingVendors),
    },
    {
      label: "New Billing Vendors",
      value: formatInteger(vendorSummary.newBillingVendors),
    },
    {
      label: "Repeat Billing Vendors",
      value: formatInteger(vendorSummary.repeatBillingVendors),
    },
    {
      label: "Customer-Active Vendors",
      value: formatInteger(vendorSummary.customerActiveVendors),
    },
    {
      label: "Rewards-Active Vendors",
      value: formatInteger(vendorSummary.rewardsActiveVendors),
    },
  ];
  const vendorSupportingBillingCards = [
    {
      label: "Vendor-generated Bills",
      value: formatInteger(vendorBilling.completedBills),
    },
    {
      label: "Gross Billing Value",
      value: formatCurrency(vendorBilling.grossBillingValue),
    },
    {
      label: "Unique Customers",
      value: formatInteger(vendorBilling.uniqueCustomers),
    },
  ];
  const rewardsSummary = rewardsAnalytics?.summary || {};
  const rewardCurrentStatusCards = [
    {
      label: "Current Outstanding Points",
      value: formatInteger(rewardsSummary.currentOutstandingPoints),
    },
  ];
  const rewardRedemptionRatio =
    Number(rewardsSummary.issuedPoints || 0) > 0
      ? (Number(rewardsSummary.redeemedPoints || 0) /
          Number(rewardsSummary.issuedPoints || 0)) *
        100
      : 0;
  const rewardActivityCards = [
    {
      label: "Rewards Issued",
      value: formatInteger(rewardsSummary.issuedPoints),
    },
    {
      label: "Rewards Redeemed",
      value: formatInteger(rewardsSummary.redeemedPoints),
    },
    {
      label: "Earn Events",
      value: formatInteger(rewardsSummary.earnEvents),
    },
    {
      label: "Redeem Events",
      value: formatInteger(rewardsSummary.redeemEvents),
    },
    {
      label: "Customers Earned",
      value: formatInteger(rewardsSummary.customersEarned),
    },
    {
      label: "Customers Redeemed",
      value: formatInteger(rewardsSummary.customersRedeemed),
    },
    {
      label: "Vendors Issued Rewards",
      value: formatInteger(rewardsSummary.vendorsIssuedRewards),
    },
    {
      label: "Vendors With Redemptions",
      value: formatInteger(rewardsSummary.vendorsWithRedemptions),
    },
    {
      label: "Redemption Ratio (Selected Period)",
      value: formatPercent(rewardRedemptionRatio),
    },
  ];
  const subscriptionSummary = subscriptionAnalytics?.summary || {};
  const subscriptionPeriodActivity = subscriptionAnalytics?.periodActivity || {};
  const subscriptionPrimaryStatusCards = [
    {
      label: "Active Paid Vendors",
      value: formatInteger(subscriptionSummary.activePaidVendors),
    },
    {
      label: "Published Vendors",
      value: formatInteger(subscriptionSummary.publishedVendors),
    },
    {
      label: "Published Without Active Paid",
      value: formatInteger(subscriptionSummary.publishedVendorsWithoutActivePaidSubscription),
    },
    {
      label: "Currently Active Subscriptions",
      value: formatInteger(subscriptionSummary.currentlyActiveSubscriptions),
    },
    {
      label: "Currently Expired Subscriptions",
      value: formatInteger(subscriptionSummary.currentlyExpiredSubscriptions),
    },
  ];
  const subscriptionSupportingStatusCards = [
    {
      label: "Vendors With Subscription",
      value: formatInteger(subscriptionSummary.vendorsWithSubscription),
    },
    {
      label: "Vendors Without Subscription",
      value: formatInteger(subscriptionSummary.vendorsWithoutSubscription),
    },
    {
      label: "Trial Vendors",
      value: formatInteger(subscriptionSummary.trialVendors),
    },
    {
      label: "Non-Trial Plan Vendors",
      value: formatInteger(subscriptionSummary.nonTrialPlanVendors),
    },
    {
      label: "Expired Paid Vendors",
      value: formatInteger(subscriptionSummary.expiredPaidVendors),
    },
    {
      label: "Published Vendors With Active Trial",
      value: formatInteger(subscriptionSummary.publishedVendorsWithActiveTrial),
    },
    {
      label: "Platform Vendor Records",
      value: formatInteger(subscriptionSummary.totalPlatformVendors),
    },
  ];
  const subscriptionActivityCards = [
    {
      label: "Subscription Records Created",
      value: formatInteger(subscriptionPeriodActivity.subscriptionRecordsCreatedInPeriod),
    },
    {
      label: "Trial Assignments Created",
      value: formatInteger(subscriptionPeriodActivity.currentTrialRecordsCreatedInPeriod),
    },
    {
      label: "Non-Trial Assignments Created",
      value: formatInteger(subscriptionPeriodActivity.currentNonTrialRecordsCreatedInPeriod),
    },
    {
      label: "Current Paid Vendor Records Created",
      value: formatInteger(subscriptionPeriodActivity.currentPaidVendorRecordsCreatedInPeriod),
    },
  ];

  const sortedVendorPerformance = useMemo(() => {
    const rows = [...(billingAnalytics?.vendorPerformance || [])];
    const directionMultiplier = vendorSort.direction === "asc" ? 1 : -1;

    return rows.sort((a, b) => {
      const aValue = Number(a[vendorSort.key] || 0);
      const bValue = Number(b[vendorSort.key] || 0);
      if (aValue !== bValue) return (aValue - bValue) * directionMultiplier;
      return String(a.businessName || "").localeCompare(String(b.businessName || ""));
    });
  }, [billingAnalytics, vendorSort]);

  const sortedCustomerPerformance = useMemo(() => {
    const rows = [...(customerAnalytics?.customerPerformance || [])];
    const directionMultiplier = customerSort.direction === "asc" ? 1 : -1;

    return rows.sort((a, b) => {
      const aValue = Number(a[customerSort.key] || 0);
      const bValue = Number(b[customerSort.key] || 0);
      if (aValue !== bValue) return (aValue - bValue) * directionMultiplier;
      return String(a.customerId || "").localeCompare(String(b.customerId || ""));
    });
  }, [customerAnalytics, customerSort]);

  const sortedVendorCustomerPerformance = useMemo(() => {
    const rows = [...(customerAnalytics?.vendorCustomerPerformance || [])];
    const directionMultiplier = vendorCustomerSort.direction === "asc" ? 1 : -1;

    return rows.sort((a, b) => {
      const aValue = Number(a[vendorCustomerSort.key] || 0);
      const bValue = Number(b[vendorCustomerSort.key] || 0);
      if (aValue !== bValue) return (aValue - bValue) * directionMultiplier;
      return String(a.businessName || "").localeCompare(String(b.businessName || ""));
    });
  }, [customerAnalytics, vendorCustomerSort]);

  const sortedAnalyticsVendorPerformance = useMemo(() => {
    const allRows = [...(vendorAnalytics?.vendorPerformance || [])];
    const rows = showAllVendorRecords
      ? allRows
      : allRows.filter(
          (row) =>
            Number(row.periodCompletedBills || 0) > 0 ||
            Number(row.periodIssuedPoints || 0) > 0 ||
            Number(row.periodRedeemedPoints || 0) > 0 ||
            Number(row.periodUniqueCustomers || 0) > 0
        );
    const directionMultiplier = analyticsVendorSort.direction === "asc" ? 1 : -1;

    return rows.sort((a, b) => {
      const aValue = Number(a[analyticsVendorSort.key] || 0);
      const bValue = Number(b[analyticsVendorSort.key] || 0);
      if (aValue !== bValue) return (aValue - bValue) * directionMultiplier;
      return String(a.businessName || "").localeCompare(String(b.businessName || ""));
    });
  }, [analyticsVendorSort, showAllVendorRecords, vendorAnalytics]);

  const sortedRewardVendorPerformance = useMemo(() => {
    const rows = [...(rewardsAnalytics?.vendorPerformance || [])];
    const directionMultiplier = rewardVendorSort.direction === "asc" ? 1 : -1;

    return rows.sort((a, b) => {
      const aValue = Number(a[rewardVendorSort.key] || 0);
      const bValue = Number(b[rewardVendorSort.key] || 0);
      if (aValue !== bValue) return (aValue - bValue) * directionMultiplier;
      return String(a.businessName || "").localeCompare(String(b.businessName || ""));
    });
  }, [rewardVendorSort, rewardsAnalytics]);

  const sortedSubscriptionPerformance = useMemo(() => {
    const rows = [...(subscriptionAnalytics?.subscriptionPerformance || [])].filter((row) => {
      if (subscriptionFilter === "Active") return row.isCurrentlyActive;
      if (subscriptionFilter === "Expired") return row.isCurrentlyExpired;
      if (subscriptionFilter === "Trial") return row.isTrialPlan;
      if (subscriptionFilter === "Non-Trial") return row.isNonTrialPlan;
      return true;
    });
    const directionMultiplier = subscriptionSort.direction === "asc" ? 1 : -1;

    return rows.sort((a, b) => {
      if (subscriptionSort.key === "planName") {
        const result = String(a.planName || "").localeCompare(String(b.planName || ""));
        if (result !== 0) return result * directionMultiplier;
      } else {
        const aDate = a[subscriptionSort.key]
          ? new Date(a[subscriptionSort.key]).getTime()
          : Number.MAX_SAFE_INTEGER;
        const bDate = b[subscriptionSort.key]
          ? new Date(b[subscriptionSort.key]).getTime()
          : Number.MAX_SAFE_INTEGER;
        if (aDate !== bDate) return (aDate - bDate) * directionMultiplier;
      }
      return String(a.businessName || "").localeCompare(String(b.businessName || ""));
    });
  }, [subscriptionAnalytics, subscriptionFilter, subscriptionSort]);

  const handleVendorSort = (key) => {
    setVendorSort((current) => ({
      key,
      direction: current.key === key && current.direction === "desc" ? "asc" : "desc",
    }));
  };

  const handleCustomerSort = (key) => {
    setCustomerSort((current) => ({
      key,
      direction: current.key === key && current.direction === "desc" ? "asc" : "desc",
    }));
  };

  const handleVendorCustomerSort = (key) => {
    setVendorCustomerSort((current) => ({
      key,
      direction: current.key === key && current.direction === "desc" ? "asc" : "desc",
    }));
  };

  const handleAnalyticsVendorSort = (key) => {
    setAnalyticsVendorSort((current) => ({
      key,
      direction: current.key === key && current.direction === "desc" ? "asc" : "desc",
    }));
  };

  const handleRewardVendorSort = (key) => {
    setRewardVendorSort((current) => ({
      key,
      direction: current.key === key && current.direction === "desc" ? "asc" : "desc",
    }));
  };

  const handleSubscriptionSort = (key) => {
    setSubscriptionSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  const refreshDisabled =
    overviewLoading ||
    billingLoading ||
    customerLoading ||
    vendorLoading ||
    rewardsLoading ||
    subscriptionLoading;
  const missingVendorCount = billingAnalytics?.diagnostics?.missingVendorReferences?.length || 0;
  const missingCustomerRefs =
    customerAnalytics?.diagnostics?.missingCustomerReferences?.length || 0;
  const missingCustomerVendorRefs =
    customerAnalytics?.diagnostics?.missingVendorReferences?.length || 0;
  const vendorDiagnostics = vendorAnalytics?.diagnostics || {};
  const vendorDataQuality = vendorDiagnostics.dataQuality || {};
  const vendorWarningCount =
    Number(vendorDiagnostics.missingVendorReferences?.length || 0) +
    Number(vendorDataQuality.subscriptionRowsMissingVendor || 0) +
    Number(vendorDataQuality.subscriptionRowsMissingPlan || 0) +
    Number(vendorDiagnostics.unresolvedCategoryReferencesCount || 0);
  const rewardsDiagnostics = rewardsAnalytics?.diagnostics || {};
  const rewardsDataQuality = rewardsDiagnostics.dataQuality || {};
  const rewardsWarningCount =
    Number(rewardsDiagnostics.missingVendorReferences?.length || 0) +
    Number(rewardsDataQuality.suspiciousDuplicateLedgerRows || 0);
  const subscriptionDiagnostics = subscriptionAnalytics?.diagnostics || {};
  const subscriptionDataQuality = subscriptionDiagnostics.dataQuality || {};
  const subscriptionWarningCount =
    Number(subscriptionDiagnostics.missingVendorReferences?.length || 0) +
    Number(subscriptionDiagnostics.missingPlanReferences?.length || 0) +
    Number(subscriptionDataQuality.subscriptionRecordsMissingExpiryDate || 0) +
    Number(subscriptionDiagnostics.unresolvedCategoryReferencesCount || 0);

  return (
    <main>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "16px",
          flexWrap: "wrap",
          marginBottom: "22px",
        }}
      >
        <div>
          <h1 style={{ margin: 0, color: "#0f172a" }}>Admin Analytics</h1>
          <p style={{ margin: "8px 0 0", color: "#64748b" }}>
            Business performance and platform activity
          </p>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ color: "#475569", fontWeight: 700 }}>Period</span>
            <select
              value={selectedPeriod}
              onChange={(event) => setSelectedPeriod(event.target.value)}
              style={{
                padding: "10px 12px",
                borderRadius: "10px",
                border: "1px solid #d1d5db",
                background: "#ffffff",
                minWidth: "150px",
              }}
            >
              {periodOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={loadDashboard}
            disabled={refreshDisabled}
            style={{
              padding: "10px 14px",
              borderRadius: "10px",
              border: "1px solid #d1d5db",
              background: refreshDisabled ? "#f1f5f9" : "#ffffff",
              color: "#0f172a",
              cursor: refreshDisabled ? "not-allowed" : "pointer",
              fontWeight: 700,
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      <div style={{ ...mutedTextStyle, marginBottom: "18px" }}>
        Last refreshed: {formatRefreshTime(lastRefreshedAt)}
      </div>

      <nav
        aria-label="Analytics sections"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "rgba(248, 250, 252, 0.96)",
          backdropFilter: "blur(10px)",
          border: "1px solid #e5e7eb",
          borderRadius: "16px",
          padding: "8px",
          marginBottom: "18px",
          overflowX: "auto",
          boxShadow: "0 10px 24px rgba(15, 23, 42, 0.08)",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "8px",
            minWidth: "max-content",
          }}
        >
          {analyticsSectionNavItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSectionNavigate(item.id)}
                style={{
                  border: isActive ? "1px solid #2563eb" : "1px solid #d1d5db",
                  background: isActive ? "#eff6ff" : "#ffffff",
                  color: isActive ? "#1d4ed8" : "#334155",
                  borderRadius: "999px",
                  padding: "8px 12px",
                  cursor: "pointer",
                  fontWeight: 800,
                  whiteSpace: "nowrap",
                  boxShadow: isActive ? "0 6px 16px rgba(37, 99, 235, 0.12)" : "none",
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>

      {overviewError ? (
        <SectionError message={overviewError} onRetry={loadOverview} />
      ) : null}

      <section
        ref={overviewRef}
        id="overview"
        data-section-id="overview"
        aria-label="Overview analytics"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
          scrollMarginTop: "92px",
        }}
      >
        {cards.map((card) => (
          <KpiCard
            key={card.label}
            label={card.label}
            value={card.value}
            loading={overviewLoading}
          />
        ))}
      </section>

      <section
        ref={billingRef}
        id="billing"
        data-section-id="billing"
        style={{ marginTop: "34px", scrollMarginTop: "92px" }}
      >
        <SectionHeader
          title="Billing Analytics"
          subtitle="Billing activity and vendor performance"
        />

        {billingError ? (
          <SectionError message={billingError} onRetry={loadBilling} />
        ) : null}

        {missingVendorCount > 0 ? (
          <div
            style={{
              ...cardStyle,
              borderColor: "#fde68a",
              background: "#fffbeb",
              color: "#92400e",
              marginBottom: "16px",
              minHeight: "auto",
            }}
          >
            Some billing records could not be matched to vendor profiles.
          </div>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
            gap: "16px",
            marginBottom: "16px",
          }}
        >
          {billingSummaryCards.map((card) => (
            <KpiCard
              key={`billing-${card.label}`}
              label={card.label}
              value={card.value}
              loading={billingLoading}
              compact
            />
          ))}
        </div>

        <div style={{ marginBottom: "16px" }}>
          {billingLoading && !billingAnalytics ? (
            <div style={{ ...cardStyle, color: "#64748b" }}>Loading billing trend...</div>
          ) : (
            <BillingTrendChart
              trend={billingAnalytics?.trend || []}
              periodOption={selectedPeriodOption}
            />
          )}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "16px",
            marginBottom: "16px",
          }}
        >
          <TopVendorList
            title="Top by Bill Count"
            rows={billingAnalytics?.topVendors?.topByBillCount || []}
            metricKey="completedBills"
            metricFormatter={formatInteger}
            secondaryKey="grossBillingValue"
          />
          <TopVendorList
            title="Top by Billing Value"
            rows={billingAnalytics?.topVendors?.topByBillingValue || []}
            metricKey="grossBillingValue"
            metricFormatter={formatCurrency}
            secondaryKey="completedBills"
          />
        </div>

        {billingLoading && !billingAnalytics ? (
          <div style={{ ...cardStyle, color: "#64748b" }}>Loading vendor performance...</div>
        ) : (
          <VendorPerformanceTable
            rows={sortedVendorPerformance}
            sortConfig={vendorSort}
            onSort={handleVendorSort}
          />
        )}
      </section>

      <section
        ref={customersRef}
        id="customers"
        data-section-id="customers"
        style={{ marginTop: "34px", scrollMarginTop: "92px" }}
      >
        <SectionHeader
          title="Customer Analytics"
          subtitle="Customer activity, repeat behavior and billing value"
        />

        {customerError ? (
          <SectionError message={customerError} onRetry={loadCustomers} />
        ) : null}

        {missingCustomerRefs > 0 || missingCustomerVendorRefs > 0 ? (
          <div
            style={{
              ...cardStyle,
              borderColor: "#fde68a",
              background: "#fffbeb",
              color: "#92400e",
              marginBottom: "16px",
              minHeight: "auto",
            }}
          >
            Some customer analytics records could not be matched to customer or vendor profiles.
          </div>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
            gap: "16px",
            marginBottom: "12px",
          }}
        >
          {customerSummaryCards.map((card) => (
            <KpiCard
              key={`customer-${card.label}`}
              label={card.label}
              value={card.value}
              loading={customerLoading}
              compact
            />
          ))}
        </div>

        <div style={{ ...mutedTextStyle, marginBottom: "16px" }}>
          Walk-in bills: {customerLoading ? "..." : formatInteger(customerSummary.walkInBills)}.
          Walk-in bills are excluded from identified customer counts and customer billing value.
        </div>

        <div style={{ marginBottom: "16px" }}>
          {customerLoading && !customerAnalytics ? (
            <div style={{ ...cardStyle, color: "#64748b" }}>Loading customer trend...</div>
          ) : (
            <CustomerTrendChart
              trend={customerAnalytics?.trend || []}
              periodOption={selectedPeriodOption}
            />
          )}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "16px",
            marginBottom: "16px",
          }}
        >
          <TopCustomerList
            title="Top by Bill Count"
            rows={customerAnalytics?.topCustomers?.topByBillCount || []}
            metricKey="periodBills"
            metricFormatter={formatInteger}
            secondaryKey="periodBillingValue"
          />
          <TopCustomerList
            title="Top by Billing Value"
            rows={customerAnalytics?.topCustomers?.topByBillingValue || []}
            metricKey="periodBillingValue"
            metricFormatter={formatCurrency}
            secondaryKey="periodBills"
          />
        </div>

        {customerLoading && !customerAnalytics ? (
          <div style={{ ...cardStyle, color: "#64748b" }}>Loading customer performance...</div>
        ) : (
          <div style={{ display: "grid", gap: "16px" }}>
            <CustomerPerformanceTable
              rows={sortedCustomerPerformance}
              sortConfig={customerSort}
              onSort={handleCustomerSort}
            />
            <VendorCustomerPerformanceTable
              rows={sortedVendorCustomerPerformance}
              sortConfig={vendorCustomerSort}
              onSort={handleVendorCustomerSort}
            />
          </div>
        )}
      </section>

      <section
        ref={vendorsRef}
        id="vendors"
        data-section-id="vendors"
        style={{ marginTop: "34px", scrollMarginTop: "92px" }}
      >
        <SectionHeader
          title="Vendor Analytics"
          subtitle="Vendor adoption, billing activity and paid-customer status"
        />

        {vendorError ? (
          <SectionError message={vendorError} onRetry={loadVendors} />
        ) : null}

        {vendorWarningCount > 0 ? (
          <div
            style={{
              ...cardStyle,
              borderColor: "#fde68a",
              background: "#fffbeb",
              color: "#92400e",
              marginBottom: "16px",
              minHeight: "auto",
            }}
          >
            Some vendor analytics records or subscription references could not be fully resolved.
          </div>
        ) : null}

        <div style={{ marginBottom: "16px" }}>
          <h3 style={{ margin: "0 0 8px", color: "#0f172a" }}>Current Vendor Status</h3>
          <div style={{ ...mutedTextStyle, marginBottom: "12px" }}>
            Active Paid Vendor = Published vendor with an active non-trial subscription and valid
            unexpired expiry date.
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: "16px",
            }}
          >
            {currentVendorStatusCards.map((card, index) => (
              <KpiCard
                key={`vendor-status-${card.label}`}
                label={card.label}
                value={card.value}
                loading={vendorLoading}
                compact={index !== 0}
              />
            ))}
          </div>
          {!vendorLoading ? (
            <div style={{ ...mutedTextStyle, marginTop: "10px" }}>
              {formatInteger(vendorSummary.activePaidVendors)} of{" "}
              {formatInteger(vendorSummary.publishedVendors)} published vendors currently have an
              active paid subscription. Platform Vendor Records includes all vendor profiles
              created in the system, including trial and inactive profiles.
            </div>
          ) : null}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: "16px",
              marginTop: "16px",
            }}
          >
            {currentVendorSupportingCards.map((card) => (
              <KpiCard
                key={`vendor-supporting-${card.label}`}
                label={card.label}
                value={card.value}
                loading={vendorLoading}
                compact
              />
            ))}
          </div>
        </div>

        <div style={{ marginBottom: "16px" }}>
          <h3 style={{ margin: "0 0 12px", color: "#0f172a" }}>
            Selected Period Activity
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: "16px",
              marginBottom: "16px",
            }}
          >
            {selectedPeriodVendorCards.map((card) => (
              <KpiCard
                key={`vendor-period-${card.label}`}
                label={card.label}
                value={card.value}
                loading={vendorLoading}
                compact
              />
            ))}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: "16px",
            }}
          >
            {vendorSupportingBillingCards.map((card) => (
              <KpiCard
                key={`vendor-billing-${card.label}`}
                label={card.label}
                value={card.value}
                loading={vendorLoading}
                compact
              />
            ))}
          </div>
        </div>

        {vendorLoading && !vendorAnalytics ? (
          <div style={{ ...cardStyle, color: "#64748b" }}>Loading vendor analytics...</div>
        ) : (
          <div style={{ display: "grid", gap: "16px" }}>
            <VendorAnalyticsPerformanceTable
              rows={sortedAnalyticsVendorPerformance}
              sortConfig={analyticsVendorSort}
              onSort={handleAnalyticsVendorSort}
              showAll={showAllVendorRecords}
              onToggleShowAll={() => setShowAllVendorRecords((current) => !current)}
            />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "16px",
              }}
            >
              <TopVendorList
                title="Top Vendors by Bill Count"
                rows={vendorAnalytics?.topVendors?.topByBillCount || []}
                metricKey="periodCompletedBills"
                metricFormatter={formatInteger}
                secondaryKey="periodGrossBillingValue"
              />
              <TopVendorList
                title="Top Vendors by Billing Value"
                rows={vendorAnalytics?.topVendors?.topByBillingValue || []}
                metricKey="periodGrossBillingValue"
                metricFormatter={formatCurrency}
                secondaryKey="periodCompletedBills"
              />
            </div>

            <CategoryPerformanceTable rows={vendorAnalytics?.categoryPerformance || []} />
            <PlanDistributionTable rows={vendorAnalytics?.subscriptionPlanDistribution || []} />
          </div>
        )}
      </section>

      <section
        ref={rewardsRef}
        id="rewards"
        data-section-id="rewards"
        style={{ marginTop: "34px", scrollMarginTop: "92px" }}
      >
        <SectionHeader
          title="Rewards Analytics"
          subtitle="Reward issuance, redemption and outstanding loyalty points"
        />

        {rewardsError ? (
          <SectionError message={rewardsError} onRetry={loadRewards} />
        ) : null}

        {rewardsWarningCount > 0 ? (
          <div
            style={{
              ...cardStyle,
              borderColor: "#fde68a",
              background: "#fffbeb",
              color: "#92400e",
              marginBottom: "16px",
              minHeight: "auto",
            }}
          >
            Some rewards analytics records need review because vendor references or duplicate
            ledger rows look unusual.
          </div>
        ) : null}

        <div style={{ marginBottom: "16px" }}>
          <h3 style={{ margin: "0 0 8px", color: "#0f172a" }}>
            Current Rewards Status
          </h3>
          <div style={{ ...mutedTextStyle, marginBottom: "12px" }}>
            Current Outstanding Points is a live balance and does not represent the selected
            historical period.
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "16px",
            }}
          >
            {rewardCurrentStatusCards.map((card) => (
              <KpiCard
                key={`reward-current-${card.label}`}
                label={card.label}
                value={card.value}
                loading={rewardsLoading}
              />
            ))}
          </div>
          {rewardsSummary.expiredPoints === null ? (
            <div style={{ ...mutedTextStyle, marginTop: "10px" }}>
              Expired-points analytics is not available historically because reward expiry is not
              captured as a separate ledger event.
            </div>
          ) : null}
        </div>

        <div style={{ marginBottom: "16px" }}>
          <h3 style={{ margin: "0 0 12px", color: "#0f172a" }}>
            Selected Period Rewards Activity
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: "16px",
            }}
          >
            {rewardActivityCards.map((card) => (
              <KpiCard
                key={`reward-activity-${card.label}`}
                label={card.label}
                value={card.value}
                loading={rewardsLoading}
                compact
              />
            ))}
          </div>
        </div>

        <div style={{ marginBottom: "16px" }}>
          {rewardsLoading && !rewardsAnalytics ? (
            <div style={{ ...cardStyle, color: "#64748b" }}>Loading rewards trend...</div>
          ) : (
            <RewardTrendChart
              trend={rewardsAnalytics?.trend || []}
              periodOption={selectedPeriodOption}
            />
          )}
        </div>

        {rewardsLoading && !rewardsAnalytics ? (
          <div style={{ ...cardStyle, color: "#64748b" }}>Loading reward performance...</div>
        ) : (
          <div style={{ display: "grid", gap: "16px" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "16px",
              }}
            >
              <TopRewardVendorList
                title="Top Vendors by Points Issued"
                rows={rewardsAnalytics?.topVendors?.topByPointsIssued || []}
                metricKey="issuedPoints"
                secondaryKey="earnEvents"
              />
              <TopRewardVendorList
                title="Top Vendors by Points Redeemed"
                rows={rewardsAnalytics?.topVendors?.topByPointsRedeemed || []}
                metricKey="redeemedPoints"
                secondaryKey="redeemEvents"
              />
            </div>

            <VendorRewardPerformanceTable
              rows={sortedRewardVendorPerformance}
              sortConfig={rewardVendorSort}
              onSort={handleRewardVendorSort}
            />
          </div>
        )}
      </section>

      <section
        ref={subscriptionsRef}
        id="subscriptions"
        data-section-id="subscriptions"
        style={{ marginTop: "34px", scrollMarginTop: "92px" }}
      >
        <SectionHeader
          title="Subscription Analytics"
          subtitle="Subscription status, plan adoption and upcoming expiries"
        />

        {subscriptionError ? (
          <SectionError message={subscriptionError} onRetry={loadSubscriptions} />
        ) : null}

        {subscriptionWarningCount > 0 ? (
          <div
            style={{
              ...cardStyle,
              borderColor: "#fde68a",
              background: "#fffbeb",
              color: "#92400e",
              marginBottom: "16px",
              minHeight: "auto",
            }}
          >
            Some subscription analytics records need review because vendor, plan or expiry
            references are incomplete.
          </div>
        ) : null}

        <div style={{ ...cardStyle, marginBottom: "16px", minHeight: "auto" }}>
          <strong style={{ color: "#0f172a" }}>
            Subscription assignments are currently managed manually after offline payment.
          </strong>
          <div style={{ ...mutedTextStyle, marginTop: "6px" }}>
            This section tracks subscription status and adoption only. It does not report
            subscription revenue, MRR, ARR or payment collection.
          </div>
        </div>

        <div style={{ marginBottom: "16px" }}>
          <h3 style={{ margin: "0 0 8px", color: "#0f172a" }}>
            Current Subscription Status
          </h3>
          <div style={{ ...mutedTextStyle, marginBottom: "12px" }}>
            Active Paid Vendor = Published vendor with an active non-trial subscription and valid
            unexpired expiry date.
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: "16px",
              marginBottom: "16px",
            }}
          >
            {subscriptionPrimaryStatusCards.map((card, index) => (
              <KpiCard
                key={`subscription-primary-${card.label}`}
                label={card.label}
                value={card.value}
                loading={subscriptionLoading}
                compact={index !== 0}
              />
            ))}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: "16px",
            }}
          >
            {subscriptionSupportingStatusCards.map((card) => (
              <KpiCard
                key={`subscription-supporting-${card.label}`}
                label={card.label}
                value={card.value}
                loading={subscriptionLoading}
                compact
              />
            ))}
          </div>
          {!subscriptionLoading ? (
            <div style={{ ...mutedTextStyle, marginTop: "10px" }}>
              {formatInteger(subscriptionSummary.activePaidVendors)} of{" "}
              {formatInteger(subscriptionSummary.publishedVendors)} published vendors currently
              have an active paid subscription. Platform Vendor Records includes all vendor
              profiles created in the system, including trial and inactive profiles.
            </div>
          ) : null}
        </div>

        <div style={{ marginBottom: "16px" }}>
          <h3 style={{ margin: "0 0 12px", color: "#0f172a" }}>
            Selected Period Subscription Activity
          </h3>
          <div style={{ ...mutedTextStyle, marginBottom: "12px" }}>
            Selected-period activity is based on subscription records created during the period.
            Subscription assignments are managed manually by Admin.
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: "16px",
            }}
          >
            {subscriptionActivityCards.map((card) => (
              <KpiCard
                key={`subscription-activity-${card.label}`}
                label={card.label}
                value={card.value}
                loading={subscriptionLoading}
                compact
              />
            ))}
          </div>
        </div>

        <div style={{ marginBottom: "16px" }}>
          {subscriptionLoading && !subscriptionAnalytics ? (
            <div style={{ ...cardStyle, color: "#64748b" }}>Loading subscription trend...</div>
          ) : (
            <SubscriptionTrendChart
              trend={subscriptionAnalytics?.trend || []}
              periodOption={selectedPeriodOption}
            />
          )}
        </div>

        {subscriptionLoading && !subscriptionAnalytics ? (
          <div style={{ ...cardStyle, color: "#64748b" }}>
            Loading subscription details...
          </div>
        ) : (
          <div style={{ display: "grid", gap: "16px" }}>
            <SubscriptionPlanDistributionTable
              rows={subscriptionAnalytics?.planDistribution || []}
            />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "16px",
              }}
            >
              <UpcomingExpiriesList
                title="Expiring in Next 7 Days"
                rows={subscriptionAnalytics?.expiryPipeline?.next7Days || []}
                emptyText="No active subscriptions expire in the next 7 days."
              />
              <UpcomingExpiriesList
                title="Expiring in Days 8-30"
                rows={subscriptionAnalytics?.expiryPipeline?.next30Days || []}
                emptyText="No active subscriptions expire in days 8-30."
              />
            </div>

            <SubscriptionAssignmentsTable
              rows={sortedSubscriptionPerformance}
              sortConfig={subscriptionSort}
              onSort={handleSubscriptionSort}
              filter={subscriptionFilter}
              onFilterChange={setSubscriptionFilter}
            />

            <SubscriptionCategoryCoverageTable
              rows={subscriptionAnalytics?.categoryCoverage || []}
            />
          </div>
        )}
      </section>
    </main>
  );
}
