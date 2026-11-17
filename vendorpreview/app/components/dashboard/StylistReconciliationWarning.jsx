import "./StaffPerformanceMetrics.css";
import { buildStylistReconciliationWarning } from "./stylistReconciliation.mjs";

const currencyFmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export default function StylistReconciliationWarning({ reconciliation }) {
  const message = buildStylistReconciliationWarning(
    reconciliation,
    (value) => currencyFmt.format(value)
  );
  if (!message) return null;

  return (
    <div className="staff-performance-warning" role="status">
      <strong>Partial report</strong>
      <span>{message.replace(/^Partial report:\s*/, "")}</span>
    </div>
  );
}
