import { getAverageServiceValue } from "./staffPerformanceMath.mjs";
import "./StaffPerformanceMetrics.css";

const currencyFmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export default function StaffPerformanceMetrics({ row, fallbackName }) {
  const averageServiceValue = getAverageServiceValue(row?.revenue, row?.services);

  return (
    <div className="staff-performance-row">
      <div className="staff-performance-name">
        {row?.stylist || fallbackName}
      </div>
      <div className="staff-performance-metrics">
        <div className="staff-performance-metric">
          <span>Revenue</span>
          <strong>{currencyFmt.format(Number(row?.revenue || 0))}</strong>
        </div>
        <div className="staff-performance-metric">
          <span>Services</span>
          <strong>{row?.services ?? 0}</strong>
        </div>
        <div className="staff-performance-metric">
          <span>Avg. Service Value</span>
          <strong>
            {averageServiceValue === null ? "—" : currencyFmt.format(averageServiceValue)}
          </strong>
        </div>
      </div>
    </div>
  );
}
