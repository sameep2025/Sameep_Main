import { getAverageServiceValue } from "./staffPerformanceMath.mjs";
import "./StaffPerformanceMetrics.css";

const currencyFmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export default function StaffPerformanceMetrics({ row, fallbackName }) {
  const averageServiceValue = getAverageServiceValue(row?.revenue, row?.services);
  const hasCustomerCount = Number.isFinite(Number(row?.customersAttended));
  const unidentifiedCustomerBills = Number(row?.unidentifiedCustomerBills || 0);

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
        <div className="staff-performance-metric staff-performance-customers">
          <span>Customers Attended</span>
          <strong>{hasCustomerCount ? Number(row.customersAttended) : "—"}</strong>
          {unidentifiedCustomerBills > 0 && (
            <small>{unidentifiedCustomerBills} bill{unidentifiedCustomerBills === 1 ? "" : "s"} without customer identity</small>
          )}
        </div>
      </div>
    </div>
  );
}
