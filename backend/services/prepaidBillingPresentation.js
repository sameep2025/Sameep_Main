const PREPAID_PAYMENT_MODES = new Set(["PREPAID_VALUE", "PREPAID_SESSIONS"]);

function normalizeId(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function toPositiveInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function toNonNegativeInteger(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function buildPrepaidBillingPresentation({ bill = {}, transaction = null } = {}) {
  const paymentMode = String(bill.paymentMode || transaction?.paymentMode || "")
    .trim()
    .toUpperCase();
  if (!PREPAID_PAYMENT_MODES.has(paymentMode)) return null;

  const snapshot = bill.prepaidSettlementSnapshot || transaction?.prepaidSettlementSnapshot;
  if (!snapshot || String(snapshot.walletType || "").trim().toUpperCase() !== paymentMode) {
    return null;
  }

  if (paymentMode === "PREPAID_VALUE") {
    const redeemedAmountPaise = toPositiveInteger(snapshot.authorizedAmountPaise);
    const remainingAmountPaiseAfterRedemption = toNonNegativeInteger(
      snapshot.remainingAmountPaiseAfterRedemption
    );
    if (!redeemedAmountPaise) return null;
    return {
      paymentMode,
      paymentMethodLabel: "Prepaid Wallet",
      redeemedAmountPaise,
      ...(remainingAmountPaiseAfterRedemption !== null
        ? { remainingAmountPaiseAfterRedemption }
        : {}),
      balanceDuePaise: 0,
    };
  }

  const redeemedQuantity = toPositiveInteger(snapshot.authorizedQuantity);
  const eligibleItemId = normalizeId(snapshot.eligibleItemId);
  const eligibleItemSource = normalizeId(snapshot.eligibleItemSource).toLowerCase();
  const remainingQuantityAfterRedemption = toNonNegativeInteger(
    snapshot.remainingQuantityAfterRedemption
  );
  if (!redeemedQuantity || !eligibleItemId || !eligibleItemSource) return null;

  const matchedItem = (Array.isArray(bill.cartItems) ? bill.cartItems : []).find(
    (item) =>
      normalizeId(item?.itemId) === eligibleItemId &&
      normalizeId(item?.itemSource).toLowerCase() === eligibleItemSource
  );

  return {
    paymentMode,
    paymentMethodLabel: "Prepaid Package",
    redeemedQuantity,
    redeemedItemName: String(matchedItem?.name || "").trim(),
    ...(remainingQuantityAfterRedemption !== null
      ? { remainingQuantityAfterRedemption }
      : {}),
    balanceDuePaise: 0,
  };
}

module.exports = {
  PREPAID_PAYMENT_MODES,
  buildPrepaidBillingPresentation,
};
