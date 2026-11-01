const PAYMENT_MODES = Object.freeze(["CASH", "ONLINE", "SPLIT"]);

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
  return ["ONLINE", "CASH"].includes(value) ? value : null;
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

function derivePaymentMode(cashAmountPaise, onlineAmountPaise, zeroPayableMode = "ONLINE") {
  if (cashAmountPaise > 0 && onlineAmountPaise > 0) return "SPLIT";
  if (cashAmountPaise > 0) return "CASH";
  if (onlineAmountPaise > 0) return "ONLINE";
  return normalizeLegacyPaymentMode(zeroPayableMode) || "ONLINE";
}

function buildPaymentAllocation({ finalPaidAmount, paymentMode, paymentBreakdown }) {
  const finalPayablePaise = moneyToPaise(finalPaidAmount);

  if (paymentBreakdown === undefined || paymentBreakdown === null) {
    const legacyMode = normalizeLegacyPaymentMode(paymentMode);
    if (!legacyMode) {
      throw new PaymentAllocationError("Invalid payment mode. Please choose Online or Cash.");
    }
    return {
      paymentMode: legacyMode,
      paymentBreakdown: {
        cashAmountPaise: legacyMode === "CASH" ? finalPayablePaise : 0,
        onlineAmountPaise: legacyMode === "ONLINE" ? finalPayablePaise : 0,
      },
      finalPayablePaise,
    };
  }

  if (typeof paymentBreakdown !== "object" || Array.isArray(paymentBreakdown)) {
    throw new PaymentAllocationError("Payment amounts are invalid.");
  }

  const cashAmountPaise = parseSubmittedPaise(paymentBreakdown.cashAmountPaise, "Cash");
  const onlineAmountPaise = parseSubmittedPaise(paymentBreakdown.onlineAmountPaise, "Online");

  if (cashAmountPaise + onlineAmountPaise !== finalPayablePaise) {
    throw new PaymentAllocationError(
      "Cash and Online amounts must equal the current final payable amount. Please review the payment split and try again.",
      "payment_allocation_mismatch"
    );
  }

  return {
    paymentMode: derivePaymentMode(cashAmountPaise, onlineAmountPaise, paymentMode),
    paymentBreakdown: { cashAmountPaise, onlineAmountPaise },
    finalPayablePaise,
  };
}

function getStoredPaymentAllocation({ paymentMode, paymentBreakdown, finalPaidAmount }) {
  const finalPayablePaise = Math.max(moneyToPaise(finalPaidAmount || 0), 0);
  const mode = PAYMENT_MODES.includes(paymentMode) ? paymentMode : null;
  const cashAmountPaise = paymentBreakdown?.cashAmountPaise;
  const onlineAmountPaise = paymentBreakdown?.onlineAmountPaise;
  const hasValidBreakdown =
    Number.isInteger(cashAmountPaise) && cashAmountPaise >= 0 &&
    Number.isInteger(onlineAmountPaise) && onlineAmountPaise >= 0 &&
    cashAmountPaise + onlineAmountPaise === finalPayablePaise;

  if (hasValidBreakdown && mode) {
    return { paymentMode: mode, paymentBreakdown: { cashAmountPaise, onlineAmountPaise } };
  }
  if (mode === "CASH") {
    return { paymentMode: mode, paymentBreakdown: { cashAmountPaise: finalPayablePaise, onlineAmountPaise: 0 } };
  }
  if (mode === "ONLINE") {
    return { paymentMode: mode, paymentBreakdown: { cashAmountPaise: 0, onlineAmountPaise: finalPayablePaise } };
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
