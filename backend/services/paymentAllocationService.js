const PAYMENT_MODES = Object.freeze(["CASH", "ONLINE", "CARD", "SPLIT"]);

class PaymentAllocationError extends Error {
  constructor(message, code = "invalid_payment_allocation") {
    super(message);
    this.name = "PaymentAllocationError";
    this.code = code;
    this.statusCode = 400;
    this.publicMessage = message;
  }
}

function moneyToPaise(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new PaymentAllocationError("Final payable amount is invalid.");
  }
  return Math.round((amount + Number.EPSILON) * 100);
}

function normalizeLegacyPaymentMode(value) {
  if (value === undefined || value === null || value === "") return "ONLINE";
  if (typeof value !== "string") return null;
  return ["ONLINE", "CASH", "CARD"].includes(value) ? value : null;
}

function parseSubmittedPaise(value, label) {
  if (value === undefined || value === null || value === "") {
    throw new PaymentAllocationError(`${label} amount is required.`);
  }
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new PaymentAllocationError(`${label} amount must be a valid amount with at most two decimal places.`);
  }
  if (value < 0) {
    throw new PaymentAllocationError(`${label} amount cannot be negative.`);
  }
  return value;
}

function derivePaymentMode(
  cashAmountPaise,
  onlineAmountPaise,
  cardAmountPaise = 0,
  zeroPayableMode = "ONLINE"
) {
  const positiveMethodCount = [cashAmountPaise, onlineAmountPaise, cardAmountPaise]
    .filter((amount) => amount > 0).length;
  if (positiveMethodCount >= 2) return "SPLIT";
  if (cashAmountPaise > 0) return "CASH";
  if (onlineAmountPaise > 0) return "ONLINE";
  if (cardAmountPaise > 0) return "CARD";
  return normalizeLegacyPaymentMode(zeroPayableMode) || "ONLINE";
}

function buildPaymentAllocation({ finalPaidAmount, paymentMode, paymentBreakdown }) {
  const finalPayablePaise = moneyToPaise(finalPaidAmount);

  if (paymentBreakdown === undefined || paymentBreakdown === null) {
    const legacyMode = normalizeLegacyPaymentMode(paymentMode);
    if (!legacyMode) {
      throw new PaymentAllocationError("Invalid payment mode. Please choose Online, Cash or Card.");
    }
    return {
      paymentMode: legacyMode,
      paymentBreakdown: {
        cashAmountPaise: legacyMode === "CASH" ? finalPayablePaise : 0,
        onlineAmountPaise: legacyMode === "ONLINE" ? finalPayablePaise : 0,
        ...(legacyMode === "CARD" ? { cardAmountPaise: finalPayablePaise } : {}),
      },
      finalPayablePaise,
    };
  }

  if (typeof paymentBreakdown !== "object" || Array.isArray(paymentBreakdown)) {
    throw new PaymentAllocationError("Payment amounts are invalid.");
  }

  const cashAmountPaise = parseSubmittedPaise(paymentBreakdown.cashAmountPaise, "Cash");
  const onlineAmountPaise = parseSubmittedPaise(paymentBreakdown.onlineAmountPaise, "Online");
  const cardAmountPaise = paymentBreakdown.cardAmountPaise == null
    ? 0
    : parseSubmittedPaise(paymentBreakdown.cardAmountPaise, "Card");

  if (cashAmountPaise + onlineAmountPaise + cardAmountPaise !== finalPayablePaise) {
    throw new PaymentAllocationError(
      "Payment amounts must equal the current final payable amount. Please review the payment method and try again.",
      "payment_allocation_mismatch"
    );
  }

  const derivedMode = derivePaymentMode(
    cashAmountPaise,
    onlineAmountPaise,
    cardAmountPaise,
    paymentMode
  );
  if (paymentMode === "SPLIT" && derivedMode !== "SPLIT") {
    throw new PaymentAllocationError(
      "Split payment requires at least two payment methods with positive amounts.",
      "split_requires_multiple_methods"
    );
  }
  return {
    paymentMode: derivedMode,
    paymentBreakdown: {
      cashAmountPaise,
      onlineAmountPaise,
      ...(derivedMode === "CARD" || (derivedMode === "SPLIT" && cardAmountPaise > 0)
        ? { cardAmountPaise }
        : {}),
    },
    finalPayablePaise,
  };
}

function getStoredPaymentAllocation({ paymentMode, paymentBreakdown, finalPaidAmount }) {
  const finalPayablePaise = Math.max(moneyToPaise(finalPaidAmount || 0), 0);
  const mode = PAYMENT_MODES.includes(paymentMode) ? paymentMode : null;
  const cashAmountPaise = paymentBreakdown?.cashAmountPaise;
  const onlineAmountPaise = paymentBreakdown?.onlineAmountPaise;
  const cardAmountPaise = paymentBreakdown?.cardAmountPaise ?? 0;
  const derivedMode = derivePaymentMode(
    Number.isInteger(cashAmountPaise) ? cashAmountPaise : 0,
    Number.isInteger(onlineAmountPaise) ? onlineAmountPaise : 0,
    Number.isInteger(cardAmountPaise) ? cardAmountPaise : 0,
    mode
  );
  const hasValidBreakdown =
    Number.isInteger(cashAmountPaise) && cashAmountPaise >= 0 &&
    Number.isInteger(onlineAmountPaise) && onlineAmountPaise >= 0 &&
    Number.isInteger(cardAmountPaise) && cardAmountPaise >= 0 &&
    cashAmountPaise + onlineAmountPaise + cardAmountPaise === finalPayablePaise &&
    derivedMode === mode;

  if (hasValidBreakdown && mode) {
    return {
      paymentMode: mode,
      paymentBreakdown: {
        cashAmountPaise,
        onlineAmountPaise,
        ...(mode === "CARD" || (mode === "SPLIT" && cardAmountPaise > 0)
          ? { cardAmountPaise }
          : {}),
      },
    };
  }
  if (mode === "CASH") {
    return { paymentMode: mode, paymentBreakdown: { cashAmountPaise: finalPayablePaise, onlineAmountPaise: 0 } };
  }
  if (mode === "ONLINE") {
    return { paymentMode: mode, paymentBreakdown: { cashAmountPaise: 0, onlineAmountPaise: finalPayablePaise } };
  }
  if (mode === "CARD") {
    return {
      paymentMode: mode,
      paymentBreakdown: {
        cashAmountPaise: 0,
        onlineAmountPaise: 0,
        cardAmountPaise: finalPayablePaise,
      },
    };
  }
  return { paymentMode: null, paymentBreakdown: null };
}

module.exports = {
  PAYMENT_MODES,
  PaymentAllocationError,
  buildPaymentAllocation,
  derivePaymentMode,
  getStoredPaymentAllocation,
  moneyToPaise,
  normalizeLegacyPaymentMode,
};
