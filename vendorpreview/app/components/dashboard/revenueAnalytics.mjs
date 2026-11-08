const IST_OFFSET_MS = 330 * 60 * 1000;

function assertDateKey(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) throw new TypeError("Valid YYYY-MM-DD date required");
  return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
}

export function getIstDayRange(dateKey) {
  const parts = assertDateKey(dateKey);
  const from = new Date(Date.UTC(parts.year, parts.month, parts.day) - IST_OFFSET_MS);
  const endExclusive = new Date(Date.UTC(parts.year, parts.month, parts.day + 1) - IST_OFFSET_MS);
  return { from: from.toISOString(), to: endExclusive.toISOString(), endMode: "exclusive" };
}

export function getMonthKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError("Valid date required");
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function normalizeTrendPoint(source = {}) {
  const date = String(source.date || source?._id?.date || "");
  return {
    ...source,
    date,
    label: date ? String(Number(date.slice(-2))) : "",
    netCollected: Number(source.netCollected || 0),
    completedBills: Number(source.completedBills ?? source.orders ?? 0),
  };
}

export function chooseInitialDay(points, preferredDate = "") {
  if (preferredDate && points.some((point) => point.date === preferredDate)) return preferredDate;
  const active = [...points].reverse().find((point) => point.completedBills > 0);
  return active?.date || points[points.length - 1]?.date || "";
}

export function mergeBillPages(current, incoming) {
  const seen = new Set();
  return [...current, ...incoming].filter((bill) => {
    const key = String(bill?.billId || `${bill?.createdAt || ""}:${bill?.phone || ""}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function calculateRevenueAverages({ grossBillValue = 0, netCollected = 0, completedBills = 0 } = {}) {
  const count = Number(completedBills);
  if (!Number.isFinite(count) || count <= 0) {
    return { averageBillValue: 0, averageCollection: 0 };
  }
  return {
    averageBillValue: Number(grossBillValue || 0) / count,
    averageCollection: Number(netCollected || 0) / count,
  };
}

export function formatCompactInr(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount === 0) return "";
  if (Math.abs(amount) < 1000) {
    return `₹${Math.round(amount).toLocaleString("en-IN")}`;
  }
  return `₹${(amount / 1000).toLocaleString("en-IN", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}K`;
}
