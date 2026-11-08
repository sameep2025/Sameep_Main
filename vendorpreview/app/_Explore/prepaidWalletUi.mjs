function normalizeIdentity(value) {
  return String(value || "").trim();
}

function toOptionalNonNegativeInteger(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

export function getPrepaidWalletSelectionAction({
  currentCustomerId,
  nextCustomerId,
  walletStatus,
} = {}) {
  const currentId = normalizeIdentity(currentCustomerId);
  const nextId = normalizeIdentity(nextCustomerId);
  if (!nextId || currentId !== nextId) return "RESET";
  return walletStatus === "idle" || walletStatus === "error" ? "RETRY" : "PRESERVE";
}

export function getPrepaidWalletQuote({
  wallet,
  cartItems = [],
  finalPayablePaise = 0,
  hasManualDiscount = false,
  redeemPoints = 0,
}) {
  if (!wallet) return { eligible: false, reason: "No active prepaid wallet is available." };
  if (hasManualDiscount || Number(redeemPoints) > 0) {
    return {
      eligible: false,
      reason: "Prepaid wallet payment cannot be combined with discounts, Discount Membership benefits, or loyalty redemption.",
    };
  }

  if (wallet.walletType === "PREPAID_VALUE") {
    const deduction = Number(finalPayablePaise);
    const available = Number(wallet.remainingAmountPaise);
    if (!Number.isSafeInteger(deduction) || deduction < 1) {
      return { eligible: false, reason: "The final payable amount must be greater than zero." };
    }
    if (!Number.isSafeInteger(available) || available < deduction) {
      return { eligible: false, reason: "The prepaid wallet balance is insufficient for this bill." };
    }
    return {
      eligible: true,
      paymentMode: "PREPAID_VALUE",
      amountPaise: deduction,
      expectedRemainingAmountPaise: available - deduction,
    };
  }

  if (wallet.walletType !== "PREPAID_SESSIONS") {
    return { eligible: false, reason: "This prepaid wallet type is not supported." };
  }

  const eligibleItemId = normalizeIdentity(wallet.eligibleItem?.itemId);
  const eligibleItemSource = normalizeIdentity(wallet.eligibleItem?.itemSource);
  if (!eligibleItemId || !eligibleItemSource || !cartItems.length) {
    return { eligible: false, reason: "Add the wallet's eligible service or package to the bill." };
  }

  let quantity = 0;
  for (const item of cartItems) {
    if (
      normalizeIdentity(item?.itemId) !== eligibleItemId ||
      normalizeIdentity(item?.itemSource) !== eligibleItemSource
    ) {
      return {
        eligible: false,
        reason: "A Sessions wallet bill can contain only its exact eligible service or package.",
      };
    }
    const itemQuantity = Number(item?.qty);
    if (!Number.isSafeInteger(itemQuantity) || itemQuantity < 1) {
      return { eligible: false, reason: "The selected service quantity is invalid." };
    }
    quantity += itemQuantity;
  }

  const available = Number(wallet.remainingQuantity);
  if (!Number.isSafeInteger(available) || quantity > available) {
    return { eligible: false, reason: "There are not enough prepaid session credits for this bill." };
  }
  return {
    eligible: true,
    paymentMode: "PREPAID_SESSIONS",
    quantity,
    expectedRemainingQuantity: available - quantity,
  };
}

export function createPrepaidAuthorizationBinding({
  walletId,
  customerId,
  cartItems = [],
  finalPayablePaise = 0,
  amountPaise = 0,
  quantity = 0,
}) {
  const items = cartItems.map((item) => ({
    itemId: normalizeIdentity(item?.itemId),
    itemSource: normalizeIdentity(item?.itemSource),
    quantity: Number(item?.qty),
    price: Number(item?.price),
  }));
  return JSON.stringify({
    walletId: normalizeIdentity(walletId),
    customerId: normalizeIdentity(customerId),
    items,
    finalPayablePaise: Number(finalPayablePaise),
    amountPaise: Number(amountPaise),
    quantity: Number(quantity),
  });
}

export function buildPrepaidBillPresentation({ paymentMode, snapshot, cartItems = [] } = {}) {
  const mode = normalizeIdentity(paymentMode).toUpperCase();
  if (!snapshot || normalizeIdentity(snapshot.walletType).toUpperCase() !== mode) return null;

  if (mode === "PREPAID_VALUE") {
    const redeemedAmountPaise = Number(snapshot.authorizedAmountPaise);
    const remainingAmountPaiseAfterRedemption = toOptionalNonNegativeInteger(
      snapshot.remainingAmountPaiseAfterRedemption
    );
    if (!Number.isSafeInteger(redeemedAmountPaise) || redeemedAmountPaise < 1) return null;
    return {
      paymentMode: mode,
      paymentMethodLabel: "Prepaid Wallet",
      redeemedAmountPaise,
      ...(remainingAmountPaiseAfterRedemption !== null
        ? { remainingAmountPaiseAfterRedemption }
        : {}),
      balanceDuePaise: 0,
    };
  }

  if (mode !== "PREPAID_SESSIONS") return null;
  const redeemedQuantity = Number(snapshot.authorizedQuantity);
  const eligibleItemId = normalizeIdentity(snapshot.eligibleItemId);
  const eligibleItemSource = normalizeIdentity(snapshot.eligibleItemSource);
  const remainingQuantityAfterRedemption = toOptionalNonNegativeInteger(
    snapshot.remainingQuantityAfterRedemption
  );
  if (!Number.isSafeInteger(redeemedQuantity) || redeemedQuantity < 1 || !eligibleItemId || !eligibleItemSource) {
    return null;
  }
  const item = cartItems.find(
    (candidate) =>
      normalizeIdentity(candidate?.itemId) === eligibleItemId &&
      normalizeIdentity(candidate?.itemSource) === eligibleItemSource
  );
  return {
    paymentMode: mode,
    paymentMethodLabel: "Prepaid Package",
    redeemedQuantity,
    redeemedItemName: normalizeIdentity(item?.name),
    ...(remainingQuantityAfterRedemption !== null
      ? { remainingQuantityAfterRedemption }
      : {}),
    balanceDuePaise: 0,
  };
}
