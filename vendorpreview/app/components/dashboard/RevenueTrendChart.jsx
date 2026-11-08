"use client";

import { useState } from "react";
import { formatCompactInr } from "./revenueAnalytics.mjs";

const currencyFmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export default function RevenueTrendChart({
  points,
  selectedKey,
  onSelect,
  keyField = "date",
  labelField = "label",
  valueField = "netCollected",
  countField = "completedBills",
  ariaLabel = "Revenue trend",
  defaultType = "bar",
}) {
  const [chartType, setChartType] = useState(defaultType);
  const maxValue = Math.max(1, ...points.map((point) => Number(point?.[valueField] || 0)));
  const selectedPoint = points.find((point) => String(point?.[keyField] || "") === selectedKey) || null;
  const selectedValue = Number(selectedPoint?.[valueField] || 0);
  const selectedCount = Number(selectedPoint?.[countField] || 0);
  const linePointSpacing = 64;
  const linePointCenter = 29;
  const lineWidth = Math.max(points.length * linePointSpacing, linePointSpacing);
  const linePoints = points.map((point, index) => {
    const value = Number(point?.[valueField] || 0);
    return `${index * linePointSpacing + linePointCenter},${22 + (1 - value / maxValue) * 78}`;
  }).join(" ");

  return (
    <div className="revenue-trend-shell" aria-label={ariaLabel}>
      <div className="revenue-trend-toolbar">
        <div className="revenue-trend-legend">
          <span><i className="revenue-trend-legend-swatch" />Net collected</span>
          <span>Bill count is shown as ×N</span>
        </div>
        <div className="revenue-trend-toggle" role="group" aria-label="Chart type">
          {[
            ["bar", "Bar"],
            ["line", "Line"],
          ].map(([type, label]) => (
            <button
              type="button"
              key={type}
              className={chartType === type ? "active" : ""}
              aria-pressed={chartType === type}
              onClick={() => setChartType(type)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {selectedPoint ? (
        <div className="revenue-trend-selected" aria-live="polite">
          <strong>{selectedPoint?.[labelField] || selectedKey}</strong>
          <span>Net Collected {currencyFmt.format(selectedValue)}</span>
          <span>{selectedCount} completed bill{selectedCount === 1 ? "" : "s"}</span>
        </div>
      ) : null}
      <div className="revenue-trend-scroll">
        <div
          className={`revenue-trend-plot ${points.length > 16 ? "dense" : ""} ${chartType}`}
          style={{ "--trend-points": Math.max(points.length, 1) }}
        >
          {chartType === "line" ? (
            <svg
              className="revenue-trend-line-svg"
              viewBox={`0 0 ${lineWidth} 110`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <polyline className="revenue-trend-line" points={linePoints} />
              {points.map((point, index) => {
                const key = String(point?.[keyField] || "");
                const value = Number(point?.[valueField] || 0);
                const x = index * linePointSpacing + linePointCenter;
                const y = 22 + (1 - value / maxValue) * 78;
                return (
                  <g key={key}>
                    {value !== 0 ? (
                      <text className="revenue-trend-line-value" x={x} y={y - 8} textAnchor="middle">
                        {formatCompactInr(value)}
                      </text>
                    ) : null}
                    <circle
                      className={`revenue-trend-line-dot ${selectedKey === key ? "selected" : ""}`}
                      cx={x}
                      cy={y}
                      r={selectedKey === key ? 5 : 3}
                    />
                  </g>
                );
              })}
            </svg>
          ) : null}
          {points.map((point) => {
            const key = String(point?.[keyField] || "");
            const value = Number(point?.[valueField] || 0);
            const count = Number(point?.[countField] || 0);
            const height = value > 0 ? Math.max(8, Math.round((value / maxValue) * 100)) : 2;
            return (
              <button
                type="button"
                key={key}
                className={`revenue-trend-point ${chartType} ${selectedKey === key ? "selected" : ""}`}
                onClick={() => onSelect(key)}
                aria-pressed={selectedKey === key}
                aria-label={`${point?.[labelField] || key}: ${currencyFmt.format(value)}, ${count} completed bill${count === 1 ? "" : "s"}`}
              >
                <span className="revenue-trend-bar-track">
                  {chartType === "bar" ? <span className="revenue-trend-bar" style={{ height: `${height}%` }} /> : null}
                </span>
                <span className="revenue-trend-label">{point?.[labelField] || key}</span>
                <span className="revenue-trend-count" title={`${count} completed bills`}>×{count}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
