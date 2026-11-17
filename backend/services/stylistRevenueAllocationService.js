class StylistRevenueAllocationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "StylistRevenueAllocationError";
    this.code = code;
  }
}

function toPaise(value, field) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new StylistRevenueAllocationError(
      `${field} must be a non-negative amount`,
      "invalid_reporting_amount"
    );
  }
  return Math.round(amount * 100);
}

function fromPaise(value) {
  return Math.round(Number(value || 0)) / 100;
}

function allocateProportionally(totalPaise, weights) {
  if (!Number.isSafeInteger(totalPaise) || totalPaise < 0) {
    throw new StylistRevenueAllocationError(
      "Discount allocation must use non-negative integer paise",
      "invalid_discount_allocation"
    );
  }
  if (totalPaise === 0) return weights.map(() => 0);

  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  if (!Number.isSafeInteger(weightTotal) || weightTotal < totalPaise || weightTotal <= 0) {
    throw new StylistRevenueAllocationError(
      "Persisted bill discount exceeds eligible line value",
      "discount_exceeds_eligible_lines"
    );
  }

  const denominator = BigInt(weightTotal);
  const allocations = weights.map((weight, index) => {
    const numerator = BigInt(totalPaise) * BigInt(weight);
    return {
      index,
      paise: Number(numerator / denominator),
      remainder: numerator % denominator,
    };
  });
  let remaining = totalPaise - allocations.reduce((sum, row) => sum + row.paise, 0);

  [...allocations]
    .sort((left, right) => {
      if (left.remainder === right.remainder) return left.index - right.index;
      return left.remainder > right.remainder ? -1 : 1;
    })
    .forEach((row) => {
      if (remaining <= 0) return;
      allocations[row.index].paise += 1;
      remaining -= 1;
    });

  return allocations.map((row) => row.paise);
}

function reconcileStylistBillRevenue({
  bill = {},
  lineBreakdown = [],
  membershipAllocationUnavailable = false,
} = {}) {
  const rows = (Array.isArray(lineBreakdown) ? lineBreakdown : []).map((entry, index) => {
    const item = entry?.item || {};
    const gross = item.total !== undefined
      ? item.total
      : Number(item.price || 0) * Number(item.qty || 0);
    const grossPaise = toPaise(gross, `lineBreakdown[${index}].gross`);
    const explicitDiscountPaise = entry.existingDiscountAmount !== undefined
      ? toPaise(entry.existingDiscountAmount, `lineBreakdown[${index}].existingDiscountAmount`)
      : null;
    const finalLinePaise = entry.finalLineAmount !== undefined
      ? toPaise(entry.finalLineAmount, `lineBreakdown[${index}].finalLineAmount`)
      : null;
    const impliedDiscountPaise = finalLinePaise === null ? null : grossPaise - finalLinePaise;

    if (impliedDiscountPaise !== null && impliedDiscountPaise < 0) {
      throw new StylistRevenueAllocationError(
        "Persisted line net value exceeds its gross value",
        "line_net_exceeds_gross"
      );
    }
    if (
      explicitDiscountPaise !== null &&
      impliedDiscountPaise !== null &&
      explicitDiscountPaise !== impliedDiscountPaise
    ) {
      throw new StylistRevenueAllocationError(
        "Persisted line discount conflicts with its net value",
        "line_discount_conflict"
      );
    }

    const existingDiscountPaise = explicitDiscountPaise ?? impliedDiscountPaise ?? 0;
    if (existingDiscountPaise > grossPaise) {
      throw new StylistRevenueAllocationError(
        "Persisted line discount exceeds its gross value",
        "line_discount_exceeds_gross"
      );
    }

    return {
      item,
      grossPaise,
      existingDiscountPaise,
      remainingPaise: grossPaise - existingDiscountPaise,
      residualEligible: entry.manualDiscountEligible !== false,
    };
  });

  const existingDiscountPaise = rows.reduce((sum, row) => sum + row.existingDiscountPaise, 0);
  const billDiscountPaise = typeof bill.discountAmount === "number" && Number.isFinite(bill.discountAmount)
    ? toPaise(bill.discountAmount, "bill.discountAmount")
    : existingDiscountPaise;

  if (membershipAllocationUnavailable && billDiscountPaise > existingDiscountPaise) {
    throw new StylistRevenueAllocationError(
      "Historical membership discount eligibility is unavailable",
      "membership_allocation_unavailable"
    );
  }
  if (existingDiscountPaise > billDiscountPaise) {
    throw new StylistRevenueAllocationError(
      "Item-level discounts exceed the persisted bill discount",
      "item_discounts_exceed_bill_discount"
    );
  }

  const residualDiscountPaise = billDiscountPaise - existingDiscountPaise;
  const eligibleWeights = rows.map((row) => row.residualEligible ? row.remainingPaise : 0);
  const residualAllocations = allocateProportionally(residualDiscountPaise, eligibleWeights);
  const totalGrossPaise = rows.reduce((sum, row) => sum + row.grossPaise, 0);
  const totalAllocatedPaise = rows.reduce(
    (sum, row, index) => sum + row.existingDiscountPaise + residualAllocations[index],
    0
  );
  if (totalAllocatedPaise !== billDiscountPaise) {
    throw new StylistRevenueAllocationError(
      "Allocated line discounts do not reconcile to the persisted bill discount",
      "discount_reconciliation_failed"
    );
  }
  const lines = rows.map((row, index) => {
    const allocatedDiscountPaise = row.existingDiscountPaise + residualAllocations[index];
    return {
      item: row.item,
      grossRevenue: fromPaise(row.grossPaise),
      allocatedDiscounts: fromPaise(allocatedDiscountPaise),
      netRevenue: fromPaise(row.grossPaise - allocatedDiscountPaise),
    };
  });

  return {
    lines,
    totals: {
      grossRevenue: fromPaise(totalGrossPaise),
      allocatedDiscounts: fromPaise(totalAllocatedPaise),
      netRevenue: fromPaise(totalGrossPaise - totalAllocatedPaise),
    },
  };
}

module.exports = {
  StylistRevenueAllocationError,
  allocateProportionally,
  reconcileStylistBillRevenue,
};
