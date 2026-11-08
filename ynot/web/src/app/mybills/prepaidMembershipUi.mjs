const PREPAID_TYPES = new Set(["PREPAID_VALUE", "PREPAID_SESSIONS"]);
const STATUS_LABELS = {
  ACTIVE: "ACTIVE",
  SCHEDULED: "SCHEDULED",
  DEPLETED: "EXHAUSTED",
  EXHAUSTED: "EXHAUSTED",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
};
const ACTIVITY_LABELS = {
  CREDIT: "Credited",
  REDEMPTION: "Redeemed",
  CANCELLATION_REVERSAL: "Restored after bill cancellation",
  EXPIRY: "Expired",
};
const ACTIVITY_DIRECTIONS = {
  CREDIT: { sign: "+", tone: "incoming" },
  REDEMPTION: { sign: "−", tone: "redeemed" },
  CANCELLATION_REVERSAL: { sign: "+", tone: "incoming" },
};

export function isPrepaidMembership(membership) {
  return PREPAID_TYPES.has(String(membership?.membershipType || "").trim().toUpperCase());
}

export function getMembershipTypeLabel(membershipType) {
  const normalized = String(membershipType || "").trim().toUpperCase();
  if (normalized === "DISCOUNT") return "Discount Membership";
  if (normalized === "PREPAID_VALUE") return "Prepaid Wallet";
  if (normalized === "PREPAID_SESSIONS") return "Prepaid Packages";
  return "Membership";
}

export function getPrepaidStatusLabel(status) {
  const normalized = String(status || "").trim().toUpperCase();
  return STATUS_LABELS[normalized] || "ACTIVE";
}

export function getPrepaidStatusClass(status) {
  return getPrepaidStatusLabel(status).toLowerCase();
}

export function formatPrepaidPaise(value) {
  const paise = Number(value);
  if (!Number.isSafeInteger(paise) || paise < 0) return "-";
  const rupees = paise / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: rupees % 1 === 0 ? 0 : 2,
  }).format(rupees);
}

export function getPrepaidActivityLabel(eventType) {
  return ACTIVITY_LABELS[String(eventType || "").trim().toUpperCase()] || "Activity";
}

export function getPrepaidActivityTone(eventType) {
  return ACTIVITY_DIRECTIONS[String(eventType || "").trim().toUpperCase()]?.tone || "neutral";
}

export function formatPrepaidActivityValue(entry = {}) {
  const direction = ACTIVITY_DIRECTIONS[String(entry.eventType || "").trim().toUpperCase()];
  const sign = direction?.sign || "";
  if (Number.isSafeInteger(entry.amountPaise) && entry.amountPaise >= 0) {
    return `${sign}${formatPrepaidPaise(entry.amountPaise)}`;
  }
  if (Number.isSafeInteger(entry.quantity) && entry.quantity >= 0) {
    return `${sign}${entry.quantity} ${entry.quantity === 1 ? "session" : "sessions"}`;
  }
  return "-";
}

export function mergePrepaidActivityItems(current = [], incoming = []) {
  const merged = [];
  const seen = new Set();
  [...current, ...incoming].forEach((entry) => {
    const id = String(entry?.id || "").trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    merged.push(entry);
  });
  return merged;
}
