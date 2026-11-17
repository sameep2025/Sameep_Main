import { getAverageServiceValue } from "./staffPerformanceMath.mjs";
import "./StaffPerformanceMetrics.css";

const currencyFmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export default function StaffPerformanceMetrics({ row, fallbackName }) {
  const netRevenue = Number(row?.netRevenue ?? row?.revenue ?? 0);
  const grossRevenue = Number(row?.grossRevenue ?? netRevenue);
  const allocatedDiscounts = Number(
    row?.allocatedDiscounts ?? Math.max(grossRevenue - netRevenue, 0)
  );
  const averageServiceValue = getAverageServiceValue(netRevenue, row?.services);
  const hasCustomerCount = Number.isFinite(Number(row?.customersAttended));
  const unidentifiedCustomerBills = Number(row?.unidentifiedCustomerBills || 0);

  return (
    <div className="staff-performance-row">
      <div className="staff-performance-name">
        {row?.stylist || fallbackName}
      </div>
      <div className="staff-performance-metrics">
        <div className="staff-performance-metric">
          <span>Gross Revenue</span>
          <strong>{currencyFmt.format(grossRevenue)}</strong>
        </div>
        <div className="staff-performance-metric">
          <span>Allocated Discounts</span>
          <strong>{currencyFmt.format(allocatedDiscounts)}</strong>
        </div>
        <div className="staff-performance-metric">
          <span>Net Revenue</span>
          <strong>{currencyFmt.format(netRevenue)}</strong>
        </div>
        <div className="staff-performance-metric">
          <span>Services</span>
          <strong>{row?.services ?? 0}</strong>
        </div>
        <div className="staff-performance-metric">
          <span>Avg. Net Service Value</span>
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
