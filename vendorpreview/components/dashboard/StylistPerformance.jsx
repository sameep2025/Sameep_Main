"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../config";
import { getVendorAuthHeaders } from "../../app/utils/vendorAuth";

export default function StylistPerformance({ vendorId }) {
  const [range, setRange] = useState("today");
  const [data, setData] = useState([]);

  useEffect(() => {
    if (!vendorId) return;

    fetch(
      `${API_BASE_URL}/api/vendor/dashboard/stylist-performance?vendorId=${vendorId}&range=${range}`,
      { headers: getVendorAuthHeaders(vendorId) }
    )
      .then((res) => res.json())
      .then((json) => setData(Array.isArray(json) ? json : []))
      .catch(console.error);
  }, [vendorId, range]);

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

      <table className="stylistTable" style={{ width: "100%", marginTop: 12 }}>
        <thead>
          <tr>
            <th align="left">Stylist</th>
            <th align="right">Revenue</th>
            <th align="right">Services</th>
          </tr>
        </thead>

        <tbody>
          {data.map((row) => (
            <tr key={row._id}>
              <td>{row.stylist || "-"}</td>
              <td align="right">₹{Number(row.revenue || 0).toLocaleString("en-IN")}</td>
              <td align="right">{Number(row.services || 0)}</td>
            </tr>
          ))}
          {!data.length && (
            <tr>
              <td colSpan={3} style={{ opacity: 0.6, paddingTop: 8 }}>
                No data available
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
