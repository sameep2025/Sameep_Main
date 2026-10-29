const RATE_DENOMINATOR = 10000;
const UTGST_STATE_CODES = new Set(["04", "25", "26", "31", "35", "38", "97"]);

class GstCalculationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "GstCalculationError";
    this.code = code;
  }
}

function assertSafeNonNegativeInteger(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new GstCalculationError(
      `${field} must be a non-negative safe integer`,
      "invalid_integer_amount"
    );
  }
}

function safeSum(values, field) {
  return values.reduce((total, value) => {
    const next = total + value;
    if (!Number.isSafeInteger(next)) {
      throw new GstCalculationError(`${field} exceeds safe range`, "amount_out_of_range");
    }
    return next;
  }, 0);
}

function roundRatioHalfUp(numerator, denominator) {
  const top = BigInt(numerator);
  const bottom = BigInt(denominator);
  if (bottom <= 0n || top < 0n) {
    throw new GstCalculationError("Invalid rounding ratio", "invalid_rounding_ratio");
  }
  const rounded = (top + bottom / 2n) / bottom;
  const result = Number(rounded);
  if (!Number.isSafeInteger(result)) {
    throw new GstCalculationError("Calculated amount exceeds safe range", "amount_out_of_range");
  }
  return result;
}

function allocateProportionally(totalPaise, weights) {
  assertSafeNonNegativeInteger(totalPaise, "totalPaise");
  weights.forEach((weight, index) =>
    assertSafeNonNegativeInteger(weight, `weights[${index}]`)
  );

  const weightTotal = safeSum(weights, "allocation weight total");
  if (totalPaise > weightTotal) {
    throw new GstCalculationError("Discount exceeds allocatable amount", "discount_exceeds_amount");
  }
  if (totalPaise === 0) return weights.map(() => 0);
  if (weightTotal === 0) {
    throw new GstCalculationError("Cannot allocate discount across zero values", "zero_allocation_base");
  }

  const total = BigInt(totalPaise);
  const denominator = BigInt(weightTotal);
  const allocations = weights.map((weight, index) => {
    const numerator = total * BigInt(weight);
    return {
      index,
      value: Number(numerator / denominator),
      remainder: numerator % denominator,
    };
  });
  let unallocated = totalPaise - allocations.reduce((sum, entry) => sum + entry.value, 0);

  [...allocations]
    .sort((left, right) => {
      if (left.remainder === right.remainder) return left.index - right.index;
      return left.remainder > right.remainder ? -1 : 1;
    })
    .forEach((entry) => {
      if (unallocated > 0) {
        allocations[entry.index].value += 1;
        unallocated -= 1;
      }
    });

  return allocations.map((entry) => entry.value);
}

function normalizeStateCode(value, field) {
  const normalized = String(value || "").trim();
  if (!/^\d{2}$/.test(normalized)) {
    throw new GstCalculationError(`${field} must be a two-digit state code`, "invalid_state_code");
  }
  return normalized;
}

function calculateGst({
  lines,
  pricingMode,
  supplierStateCode,
  placeOfSupplyStateCode,
  totalDiscountPaise,
}) {
  if (!Array.isArray(lines)) {
    throw new GstCalculationError("lines must be an array", "invalid_lines");
  }
  if (pricingMode !== "inclusive" && pricingMode !== "exclusive") {
    throw new GstCalculationError(
      "pricingMode must be inclusive or exclusive",
      "invalid_pricing_mode"
    );
  }

  const supplierState = normalizeStateCode(supplierStateCode, "supplierStateCode");
  const placeOfSupply = normalizeStateCode(placeOfSupplyStateCode, "placeOfSupplyStateCode");
  const isIntrastate = supplierState === placeOfSupply;

  const normalizedLines = lines.map((line, index) => {
    const amountPaise = line?.amountPaise;
    const gstRateBps = line?.gstRateBps;
    const fixedDiscountPaise = line?.discountPaise ?? 0;
    assertSafeNonNegativeInteger(amountPaise, `lines[${index}].amountPaise`);
    assertSafeNonNegativeInteger(gstRateBps, `lines[${index}].gstRateBps`);
    assertSafeNonNegativeInteger(fixedDiscountPaise, `lines[${index}].discountPaise`);
    if (gstRateBps > RATE_DENOMINATOR) {
      throw new GstCalculationError("GST rate cannot exceed 10000 bps", "invalid_gst_rate");
    }
    if (fixedDiscountPaise > amountPaise) {
      throw new GstCalculationError("Line discount exceeds line amount", "discount_exceeds_amount");
    }
    const itemType = String(line?.itemType || "SERVICE").toUpperCase();
    if (itemType !== "SERVICE" && itemType !== "PRODUCT") {
      throw new GstCalculationError("itemType must be SERVICE or PRODUCT", "invalid_item_type");
    }
    return { ...line, itemType, amountPaise, gstRateBps, fixedDiscountPaise };
  });

  const fixedDiscountTotal = safeSum(
    normalizedLines.map((line) => line.fixedDiscountPaise),
    "fixed discount total"
  );
  const grossAmountPaise = safeSum(
    normalizedLines.map((line) => line.amountPaise),
    "gross amount"
  );
  const requestedDiscount = totalDiscountPaise ?? fixedDiscountTotal;
  assertSafeNonNegativeInteger(requestedDiscount, "totalDiscountPaise");
  if (requestedDiscount < fixedDiscountTotal || requestedDiscount > grossAmountPaise) {
    throw new GstCalculationError("Total discount is inconsistent with line amounts", "invalid_discount");
  }

  const remainingDiscount = requestedDiscount - fixedDiscountTotal;
  const allocationWeights = normalizedLines.map(
    (line) => line.amountPaise - line.fixedDiscountPaise
  );
  const allocatedDiscounts = allocateProportionally(remainingDiscount, allocationWeights);

  const calculatedLines = normalizedLines.map((line, index) => {
    const discountPaise = line.fixedDiscountPaise + allocatedDiscounts[index];
    const discountedAmountPaise = line.amountPaise - discountPaise;
    let taxableValuePaise;
    let totalTaxPaise;
    let invoiceAmountPaise;

    if (pricingMode === "inclusive") {
      taxableValuePaise = roundRatioHalfUp(
        BigInt(discountedAmountPaise) * BigInt(RATE_DENOMINATOR),
        BigInt(RATE_DENOMINATOR + line.gstRateBps)
      );
      totalTaxPaise = discountedAmountPaise - taxableValuePaise;
      invoiceAmountPaise = discountedAmountPaise;
    } else {
      taxableValuePaise = discountedAmountPaise;
      totalTaxPaise = roundRatioHalfUp(
        BigInt(taxableValuePaise) * BigInt(line.gstRateBps),
        BigInt(RATE_DENOMINATOR)
      );
      invoiceAmountPaise = taxableValuePaise + totalTaxPaise;
      if (!Number.isSafeInteger(invoiceAmountPaise)) {
        throw new GstCalculationError("Calculated amount exceeds safe range", "amount_out_of_range");
      }
    }

    const usesUtgst = isIntrastate && UTGST_STATE_CODES.has(supplierState);
    const cgstPaise = isIntrastate ? Math.floor(totalTaxPaise / 2) : 0;
    const sgstPaise = isIntrastate && !usesUtgst ? totalTaxPaise - cgstPaise : 0;
    const utgstPaise = usesUtgst ? totalTaxPaise - cgstPaise : 0;
    const igstPaise = isIntrastate ? 0 : totalTaxPaise;

    return {
      id: line.id ?? null,
      itemType: line.itemType,
      classificationCode:
        line.itemType === "PRODUCT" ? line.hsn || "" : line.sac || "",
      sac: line.itemType === "SERVICE" ? line.sac || "" : "",
      hsn: line.itemType === "PRODUCT" ? line.hsn || "" : "",
      gstRateBps: line.gstRateBps,
      amountPaise: line.amountPaise,
      discountPaise,
      discountedAmountPaise,
      taxableValuePaise,
      cgstPaise,
      sgstPaise,
      utgstPaise,
      igstPaise,
      totalTaxPaise,
      invoiceAmountPaise,
    };
  });

  const sum = (field) => safeSum(calculatedLines.map((line) => line[field]), field);
  return {
    pricingMode,
    supplyType: isIntrastate ? "intrastate" : "interstate",
    supplierStateCode: supplierState,
    placeOfSupplyStateCode: placeOfSupply,
    lines: calculatedLines,
    totals: {
      grossAmountPaise,
      discountPaise: sum("discountPaise"),
      discountedAmountPaise: sum("discountedAmountPaise"),
      taxableValuePaise: sum("taxableValuePaise"),
      cgstPaise: sum("cgstPaise"),
      sgstPaise: sum("sgstPaise"),
      utgstPaise: sum("utgstPaise"),
      igstPaise: sum("igstPaise"),
      totalTaxPaise: sum("totalTaxPaise"),
      invoiceAmountPaise: sum("invoiceAmountPaise"),
    },
  };
}

module.exports = {
  UTGST_STATE_CODES,
  GstCalculationError,
  allocateProportionally,
  calculateGst,
  roundRatioHalfUp,
};
