const assert = require("node:assert/strict");
const test = require("node:test");

const {
  PaymentAllocationError,
  buildPaymentAllocation,
  getStoredPaymentAllocation,
} = require("../services/paymentAllocationService");

test("derives cash, online and split modes from integer-paise allocations", () => {
  assert.deepEqual(
    buildPaymentAllocation({
      finalPaidAmount: 500,
      paymentBreakdown: { cashAmountPaise: 50000, onlineAmountPaise: 0 },
    }),
    {
      paymentMode: "CASH",
      paymentBreakdown: { cashAmountPaise: 50000, onlineAmountPaise: 0 },
      finalPayablePaise: 50000,
    }
  );
  assert.equal(
    buildPaymentAllocation({
      finalPaidAmount: 500,
      paymentBreakdown: { cashAmountPaise: 0, onlineAmountPaise: 50000 },
    }).paymentMode,
    "ONLINE"
  );
  assert.equal(
    buildPaymentAllocation({
      finalPaidAmount: 500,
      paymentBreakdown: { cashAmountPaise: 20000, onlineAmountPaise: 30000 },
    }).paymentMode,
    "SPLIT"
  );
});

test("supports decimal payable amounts without floating-point equality", () => {
  const result = buildPaymentAllocation({
    finalPaidAmount: 1700.55,
    paymentBreakdown: { cashAmountPaise: 70025, onlineAmountPaise: 100030 },
  });
  assert.equal(result.finalPayablePaise, 170055);
  assert.equal(result.paymentMode, "SPLIT");
});

test("rejects missing, negative, fractional-paise and stale allocations", () => {
  const invalid = [
    { cashAmountPaise: 10000 },
    { cashAmountPaise: -1, onlineAmountPaise: 50001 },
    { cashAmountPaise: 100.5, onlineAmountPaise: 49899.5 },
    { cashAmountPaise: 20000, onlineAmountPaise: 29999 },
  ];
  for (const paymentBreakdown of invalid) {
    assert.throws(
      () => buildPaymentAllocation({ finalPaidAmount: 500, paymentBreakdown }),
      PaymentAllocationError
    );
  }
});

test("preserves legacy modes and zero-payable completion semantics", () => {
  assert.deepEqual(
    buildPaymentAllocation({ finalPaidAmount: 100, paymentMode: "CASH" }),
    {
      paymentMode: "CASH",
      paymentBreakdown: { cashAmountPaise: 10000, onlineAmountPaise: 0 },
      finalPayablePaise: 10000,
    }
  );
  assert.deepEqual(
    buildPaymentAllocation({
      finalPaidAmount: 0,
      paymentBreakdown: { cashAmountPaise: 0, onlineAmountPaise: 0 },
    }),
    {
      paymentMode: "ONLINE",
      paymentBreakdown: { cashAmountPaise: 0, onlineAmountPaise: 0 },
      finalPayablePaise: 0,
    }
  );
});

test("infers legacy historical allocations and fails closed for malformed split records", () => {
  assert.deepEqual(
    getStoredPaymentAllocation({ paymentMode: "CASH", finalPaidAmount: 125.5 }),
    {
      paymentMode: "CASH",
      paymentBreakdown: { cashAmountPaise: 12550, onlineAmountPaise: 0 },
    }
  );
  assert.deepEqual(
    getStoredPaymentAllocation({ paymentMode: "SPLIT", finalPaidAmount: 100 }),
    { paymentMode: null, paymentBreakdown: null }
  );
});
