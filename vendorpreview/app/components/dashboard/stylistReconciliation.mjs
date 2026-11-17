export function createCompleteStylistReconciliation() {
  return {
    complete: true,
    unreconciledBillCount: 0,
    unreconciledGrossRevenue: 0,
    unreconciledDiscounts: 0,
    unreconciledNetRevenue: 0,
    issues: [],
  };
}

export function normalizeStylistPerformanceResponse(payload) {
  if (Array.isArray(payload)) {
    return { data: payload, reconciliation: createCompleteStylistReconciliation() };
  }
  const reconciliation = payload?.reconciliation || {};
  const count = Math.max(Number(reconciliation.unreconciledBillCount) || 0, 0);
  const amountOrNull = (value) => typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
  return {
    data: Array.isArray(payload?.data) ? payload.data : [],
    reconciliation: {
      complete: reconciliation.complete !== false && count === 0,
      unreconciledBillCount: count,
      unreconciledGrossRevenue: amountOrNull(reconciliation.unreconciledGrossRevenue),
      unreconciledDiscounts: amountOrNull(reconciliation.unreconciledDiscounts),
      unreconciledNetRevenue: amountOrNull(reconciliation.unreconciledNetRevenue),
      issues: Array.isArray(reconciliation.issues) ? reconciliation.issues : [],
    },
  };
}

export function buildStylistReconciliationWarning(reconciliation, formatCurrency) {
  if (!reconciliation || reconciliation.complete !== false) return "";

  const count = Math.max(Number(reconciliation.unreconciledBillCount) || 0, 0);
  const billLabel = count === 1 ? "bill" : "bills";
  const excludedLabel = count === 1 ? "that bill" : "those bills";
  let message = `Partial report: ${count} historical ${billLabel} could not be attributed to stylists. The figures shown exclude ${excludedLabel}.`;
  const netRevenue = reconciliation.unreconciledNetRevenue;

  if (typeof netRevenue === "number" && Number.isFinite(netRevenue)) {
    const formatted = typeof formatCurrency === "function"
      ? formatCurrency(netRevenue)
      : String(netRevenue);
    message += ` Unattributed net revenue: ${formatted}.`;
  }

  return message;
}
