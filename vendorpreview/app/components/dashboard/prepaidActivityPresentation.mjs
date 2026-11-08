const ACTIVITY_PRESENTATION = {
  CREDIT: {
    label: "Credited",
    description: "Added to wallet",
    sign: "+",
    tone: "incoming",
  },
  REDEMPTION: {
    label: "Redeemed",
    description: "Used from wallet",
    sign: "−",
    tone: "redeemed",
  },
  CANCELLATION_REVERSAL: {
    label: "Restored after bill cancellation",
    description: "Returned to wallet",
    sign: "+",
    tone: "incoming",
  },
  EXPIRY: {
    label: "Expired",
    description: "Wallet credit expired",
    sign: "",
    tone: "neutral",
  },
};

function getPresentation(eventType) {
  return ACTIVITY_PRESENTATION[String(eventType || "").trim().toUpperCase()] || {
    label: "Wallet activity",
    description: "Immutable wallet entry",
    sign: "",
    tone: "neutral",
  };
}

export function getPrepaidActivityPresentation(eventType) {
  return getPresentation(eventType);
}

export function formatPrepaidActivityValue(entry = {}) {
  const { sign } = getPresentation(entry.eventType);
  if (Number.isSafeInteger(entry.amountPaise) && entry.amountPaise >= 0) {
    const rupees = entry.amountPaise / 100;
    const amount = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: rupees % 1 === 0 ? 0 : 2,
    }).format(rupees);
    return `${sign}${amount}`;
  }
  if (Number.isSafeInteger(entry.quantity) && entry.quantity >= 0) {
    return `${sign}${entry.quantity} ${entry.quantity === 1 ? "session" : "sessions"}`;
  }
  return "-";
}
