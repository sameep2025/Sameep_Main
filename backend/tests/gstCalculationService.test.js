const assert = require("node:assert/strict");
const test = require("node:test");

const {
  GstCalculationError,
  allocateProportionally,
  calculateGst,
} = require("../services/gstCalculationService");

test("extracts inclusive intrastate GST without increasing invoice amount", () => {
  const result = calculateGst({
    pricingMode: "inclusive",
    supplierStateCode: "36",
    placeOfSupplyStateCode: "36",
    lines: [{ id: "service-1", amountPaise: 11800, gstRateBps: 1800, sac: "999723" }],
  });

  assert.equal(result.supplyType, "intrastate");
  assert.deepEqual(result.totals, {
    grossAmountPaise: 11800,
    discountPaise: 0,
    discountedAmountPaise: 11800,
    taxableValuePaise: 10000,
    cgstPaise: 900,
    sgstPaise: 900,
    utgstPaise: 0,
    igstPaise: 0,
    totalTaxPaise: 1800,
    invoiceAmountPaise: 11800,
  });
});

test("adds interstate IGST for exclusive pricing", () => {
  const result = calculateGst({
    pricingMode: "exclusive",
    supplierStateCode: "36",
    placeOfSupplyStateCode: "29",
    lines: [{ amountPaise: 10000, gstRateBps: 1800 }],
  });

  assert.equal(result.supplyType, "interstate");
  assert.equal(result.totals.taxableValuePaise, 10000);
  assert.equal(result.totals.igstPaise, 1800);
  assert.equal(result.totals.invoiceAmountPaise, 11800);
  assert.equal(result.totals.cgstPaise, 0);
  assert.equal(result.totals.sgstPaise, 0);
});

test("supports mixed GST rates and preserves line-level reconciliation", () => {
  const result = calculateGst({
    pricingMode: "inclusive",
    supplierStateCode: "36",
    placeOfSupplyStateCode: "36",
    lines: [
      { id: "five", itemType: "PRODUCT", hsn: "3305", amountPaise: 10500, gstRateBps: 500 },
      { id: "eighteen", itemType: "SERVICE", sac: "999723", amountPaise: 11800, gstRateBps: 1800 },
    ],
  });

  assert.equal(result.totals.taxableValuePaise, 20000);
  assert.equal(result.totals.totalTaxPaise, 2300);
  assert.equal(result.totals.invoiceAmountPaise, 22300);
  for (const line of result.lines) {
    assert.equal(line.taxableValuePaise + line.totalTaxPaise, line.invoiceAmountPaise);
    assert.equal(line.cgstPaise + line.sgstPaise, line.totalTaxPaise);
  }
  assert.deepEqual(
    result.lines.map(({ itemType, classificationCode }) => ({ itemType, classificationCode })),
    [
      { itemType: "PRODUCT", classificationCode: "3305" },
      { itemType: "SERVICE", classificationCode: "999723" },
    ]
  );
});

test("splits applicable Union Territory intrastate tax into CGST and UTGST", () => {
  const result = calculateGst({
    pricingMode: "exclusive",
    supplierStateCode: "04",
    placeOfSupplyStateCode: "04",
    lines: [{ itemType: "SERVICE", sac: "999723", amountPaise: 10000, gstRateBps: 1800 }],
  });

  assert.equal(result.totals.cgstPaise, 900);
  assert.equal(result.totals.sgstPaise, 0);
  assert.equal(result.totals.utgstPaise, 900);
  assert.equal(result.totals.totalTaxPaise, 1800);
});

test("allocates discounts deterministically with largest remainder and stable ties", () => {
  assert.deepEqual(allocateProportionally(2, [100, 100, 100]), [1, 1, 0]);

  const result = calculateGst({
    pricingMode: "inclusive",
    supplierStateCode: "36",
    placeOfSupplyStateCode: "36",
    totalDiscountPaise: 102,
    lines: [
      { id: "first", amountPaise: 1000, discountPaise: 100, gstRateBps: 1800 },
      { id: "second", amountPaise: 1000, gstRateBps: 1800 },
      { id: "third", amountPaise: 1000, gstRateBps: 1800 },
    ],
  });

  assert.deepEqual(
    result.lines.map((line) => line.discountPaise),
    [100, 1, 1]
  );
  assert.equal(result.totals.discountPaise, 102);
  assert.equal(result.totals.discountedAmountPaise, 2898);
});

test("assigns an odd intrastate tax paise deterministically without losing value", () => {
  const result = calculateGst({
    pricingMode: "exclusive",
    supplierStateCode: "36",
    placeOfSupplyStateCode: "36",
    lines: [{ amountPaise: 10100, gstRateBps: 100 }],
  });
  assert.equal(result.lines[0].totalTaxPaise, 101);
  assert.equal(result.lines[0].cgstPaise, 50);
  assert.equal(result.lines[0].sgstPaise, 51);
});

test("handles zero-value invoices", () => {
  const result = calculateGst({
    pricingMode: "inclusive",
    supplierStateCode: "36",
    placeOfSupplyStateCode: "36",
    totalDiscountPaise: 0,
    lines: [{ amountPaise: 0, gstRateBps: 1800 }],
  });
  assert.equal(result.totals.invoiceAmountPaise, 0);
  assert.equal(result.totals.totalTaxPaise, 0);
});

test("rejects fractional paise, invalid rates and excessive discounts", () => {
  const base = {
    pricingMode: "inclusive",
    supplierStateCode: "36",
    placeOfSupplyStateCode: "36",
  };
  assert.throws(
    () => calculateGst({ ...base, lines: [{ amountPaise: 10.5, gstRateBps: 1800 }] }),
    GstCalculationError
  );
  assert.throws(
    () => calculateGst({ ...base, lines: [{ amountPaise: 100, gstRateBps: 10001 }] }),
    /GST rate/
  );
  assert.throws(
    () =>
      calculateGst({
        ...base,
        totalDiscountPaise: 101,
        lines: [{ amountPaise: 100, gstRateBps: 1800 }],
      }),
    /discount/i
  );
});
