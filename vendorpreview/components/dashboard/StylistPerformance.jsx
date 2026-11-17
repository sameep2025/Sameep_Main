"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../config";
import { getVendorAuthHeaders } from "../../app/utils/vendorAuth";
import StylistReconciliationWarning from "../../app/components/dashboard/StylistReconciliationWarning";
import {
  createCompleteStylistReconciliation,
  normalizeStylistPerformanceResponse,
} from "../../app/components/dashboard/stylistReconciliation.mjs";

export default function StylistPerformance({ vendorId }) {
  const [range, setRange] = useState("today");
  const [data, setData] = useState([]);
  const [reconciliation, setReconciliation] = useState(
    createCompleteStylistReconciliation
  );

  useEffect(() => {
    if (!vendorId) return;

    let cancelled = false;

    fetch(
      `${API_BASE_URL}/api/vendor/dashboard/stylist-performance?vendorId=${vendorId}&range=${range}`,
      { headers: getVendorAuthHeaders(vendorId) }
    )
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load stylist performance");
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        const normalized = normalizeStylistPerformanceResponse(json);
        setData(normalized.data);
        setReconciliation(normalized.reconciliation);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error(error);
        setData([]);
        setReconciliation(createCompleteStylistReconciliation());
      });

    return () => {
      cancelled = true;
    };
  }, [vendorId, range]);

  const visibleData = vendorId ? data : [];
  const visibleReconciliation = vendorId
    ? reconciliation
    : createCompleteStylistReconciliation();

  return (
    <div className="dashboardCard" style={{ marginTop: 20 }}>
      <div className="dashboardHeader" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3>Stylist Performance</h3>

        <select value={range} onChange={(e) => setRange(e.target.value)}>
          <option value="today">Today</option>
          <option value="mtd">Month To Date</option>
          <option value="ytd">Year To Date</option>
        </select>
      </div>

      <StylistReconciliationWarning reconciliation={visibleReconciliation} />

      <table className="stylistTable" style={{ width: "100%", marginTop: 12 }}>
        <thead>
          <tr>
            <th align="left">Stylist</th>
            <th align="right">Revenue</th>
            <th align="right">Services</th>
          </tr>
        </thead>

        <tbody>
          {visibleData.map((row) => (
            <tr key={row._id}>
              <td>{row.stylist || "-"}</td>
              <td align="right">₹{Number(row.revenue || 0).toLocaleString("en-IN")}</td>
              <td align="right">{Number(row.services || 0)}</td>
            </tr>
          ))}
          {!visibleData.length && (
            <tr>
              <td colSpan={3} style={{ opacity: 0.6, paddingTop: 8 }}>
                {visibleReconciliation.complete
                  ? "No data available"
                  : "No reconciled stylist data available for this period"}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
