const PREPAID_TYPES = new Set(["PREPAID_VALUE", "PREPAID_SESSIONS"]);

export function getMembershipRenewalAvailability(membership = {}) {
  const membershipType = String(membership.membershipType || "").toUpperCase();
  const status = String(membership.status || "").toUpperCase();

  if (!PREPAID_TYPES.has(membershipType)) {
    return {
      allowed: ["ACTIVE", "EXPIRED"].includes(status),
      reason: "",
    };
  }
  if (status === "SCHEDULED") {
    return { allowed: false, reason: "A scheduled prepaid renewal already exists." };
  }
  if (["DEPLETED", "EXPIRED"].includes(status)) {
    return { allowed: true, reason: "" };
  }
  if (status !== "ACTIVE") {
    return { allowed: false, reason: "This prepaid membership cannot be renewed." };
  }

  const balanceField = membershipType === "PREPAID_VALUE"
    ? "remainingAmountPaise"
    : "remainingQuantity";
  const balance = Number(membership.wallet?.[balanceField]);
  if (Number.isSafeInteger(balance) && balance === 0) {
    return { allowed: true, reason: "" };
  }
  return {
    allowed: false,
    reason: "Renewal is available after the current wallet balance is exhausted or the membership expires.",
  };
}
