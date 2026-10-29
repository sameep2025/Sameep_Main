const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const mongoose = require("mongoose");

const BillingSession = require("../models/BillingSession");
const GstInvoiceCounter = require("../models/GstInvoiceCounter");
const {
  allocateGstInvoiceNumber,
  formatGstInvoiceNumber,
  getIndianFinancialYear,
} = require("../services/gstInvoiceNumberService");
const {
  GstInvoiceError,
  buildGstInvoiceSnapshot,
  persistInitialGstInvoiceSnapshot,
  _private,
} = require("../services/gstInvoiceService");

const VENDOR_A = new mongoose.Types.ObjectId("692403a24d4d3a1b6a7f0ae5");
const VENDOR_B = new mongoose.Types.ObjectId("692403a24d4d3a1b6a7f0ae6");
const ITEM_A = new mongoose.Types.ObjectId("692403a24d4d3a1b6a7f0ae7");
const ITEM_B = new mongoose.Types.ObjectId("692403a24d4d3a1b6a7f0ae8");

function settings(overrides = {}) {
  return {
    enabled: true,
    updatedAt: new Date(),
    gstin: "36ABCDE1234F1Z5",
    legalBusinessName: "Example Salon Private Limited",
    registeredAddress: "Hyderabad, Telangana",
    registeredStateCode: "36",
    defaultGstRateBps: 1800,
    defaultSac: "999723",
    pricingMode: "inclusive",
    ...overrides,
  };
}

function line(overrides = {}) {
  return {
    itemId: ITEM_A,
    itemSource: "vendor_menu_node",
    name: "Hair Spa",
    quantity: 1,
    itemType: "SERVICE",
    sac: "999723",
    hsn: "",
    gstRateBps: 1800,
    unitPricePaise: 11800,
    grossAmountPaise: 11800,
    membershipDiscountPaise: 0,
    manualDiscountPaise: 0,
    ...overrides,
  };
}

function allocation(overrides = {}) {
  return {
    financialYear: "26-27",
    sequence: 1,
    invoiceNumber: "GST/26-27/00001",
    ...overrides,
  };
}

test("invoice format and Indian financial year rollover are deterministic", () => {
  assert.equal(getIndianFinancialYear("2027-03-31T18:29:59.000Z"), "26-27");
  assert.equal(getIndianFinancialYear("2027-03-31T18:30:00.000Z"), "27-28");
  assert.equal(formatGstInvoiceNumber("26-27", 1), "GST/26-27/00001");
  assert.equal(formatGstInvoiceNumber("26-27", 99999), "GST/26-27/99999");
  assert.equal(formatGstInvoiceNumber("26-27", 100000), "GST/26-27/100000");
  assert.equal(formatGstInvoiceNumber("26-27", 999999), "GST/26-27/999999");
  assert.equal(formatGstInvoiceNumber("26-27", 1).length, 15);
  assert.equal(formatGstInvoiceNumber("26-27", 100000).length, 16);
  assert.throws(() => formatGstInvoiceNumber("26-27", 1000000), /exhausted/);
});

test("counter indexes isolate sequences by vendor and financial year", () => {
  const indexes = GstInvoiceCounter.schema.indexes();
  assert.ok(indexes.some(([fields, options]) =>
    fields.vendorId === 1 && fields.financialYear === 1 && options.unique === true
  ));
  const billingIndexes = BillingSession.schema.indexes();
  assert.ok(billingIndexes.some(([fields, options]) =>
    fields.vendorId === 1 &&
    fields["gstInvoiceSnapshot.invoiceNumber"] === 1 &&
    options.unique === true
  ));
});

test("atomic allocator is vendor-specific, concurrency-safe, and session-bound", async () => {
  const counters = new Map();
  const calls = [];
  const CounterModel = {
    async findOneAndUpdate(filter, update, options) {
      calls.push({ filter, update, options });
      const key = `${filter.vendorId}:${filter.financialYear}`;
      const next = (counters.get(key) || 0) + update.$inc.sequence;
      counters.set(key, next);
      await Promise.resolve();
      return { sequence: next };
    },
  };
  const session = { transaction: "test" };
  const issueDate = new Date("2026-10-29T10:00:00.000Z");
  const results = await Promise.all([
    allocateGstInvoiceNumber({ vendorId: VENDOR_A, issueDate, session, CounterModel }),
    allocateGstInvoiceNumber({ vendorId: VENDOR_A, issueDate, session, CounterModel }),
    allocateGstInvoiceNumber({ vendorId: VENDOR_B, issueDate, session, CounterModel }),
  ]);
  assert.deepEqual(results.map((result) => result.invoiceNumber), [
    "GST/26-27/00001",
    "GST/26-27/00002",
    "GST/26-27/00001",
  ]);
  assert.ok(calls.every((call) => call.options.session === session));
  assert.ok(calls.every((call) => call.options.upsert === true && call.options.new === true));
  await assert.rejects(
    allocateGstInvoiceNumber({ vendorId: VENDOR_A, issueDate, session: null, CounterModel }),
    (error) => error.code === "invoice_transaction_required"
  );
});

test("atomic allocator expands past 99,999 and fails closed when the sequence is exhausted", async () => {
  let sequence = 99999;
  const CounterModel = {
    async findOneAndUpdate() {
      sequence += 1;
      return { sequence };
    },
  };
  const input = {
    vendorId: VENDOR_A,
    issueDate: new Date("2026-10-29T10:00:00.000Z"),
    session: { transaction: "test" },
    CounterModel,
  };

  const expanded = await allocateGstInvoiceNumber(input);
  assert.equal(expanded.invoiceNumber, "GST/26-27/100000");
  assert.equal(expanded.invoiceNumber.length, 16);

  sequence = 999999;
  await assert.rejects(
    allocateGstInvoiceNumber(input),
    (error) => error.code === "invoice_sequence_exhausted"
  );
});

test("rolled-back allocation is not consumed and a transaction retry can reuse it", async () => {
  let committedSequence = 0;
  const CounterModel = {
    async findOneAndUpdate(_filter, _update, options) {
      options.session.pendingSequence = committedSequence + 1;
      return { sequence: options.session.pendingSequence };
    },
  };
  const firstAttempt = { pendingSequence: null };
  const rolledBack = await allocateGstInvoiceNumber({
    vendorId: VENDOR_A,
    issueDate: new Date("2026-10-29T10:00:00.000Z"),
    session: firstAttempt,
    CounterModel,
  });
  assert.equal(rolledBack.invoiceNumber, "GST/26-27/00001");
  firstAttempt.pendingSequence = null;

  const retry = { pendingSequence: null };
  const committed = await allocateGstInvoiceNumber({
    vendorId: VENDOR_A,
    issueDate: new Date("2026-10-29T10:00:00.000Z"),
    session: retry,
    CounterModel,
  });
  committedSequence = retry.pendingSequence;
  assert.equal(committed.invoiceNumber, "GST/26-27/00001");
  assert.equal(committedSequence, 1);
});

test("inclusive snapshot preserves total while mixed rates and membership discounts reconcile", () => {
  const snapshot = buildGstInvoiceSnapshot({
    settings: settings(),
    lines: [
      line({ membershipDiscountPaise: 1180 }),
      line({
        itemId: ITEM_B,
        name: "Shampoo",
        itemType: "PRODUCT",
        sac: "",
        hsn: "3305",
        gstRateBps: 500,
        unitPricePaise: 10500,
        grossAmountPaise: 10500,
        manualDiscountPaise: 1000,
      }),
    ],
    totalDiscountPaise: 2180,
    loyaltyRedemptionPaise: 1000,
    placeOfSupplyStateCode: "36",
    issueDate: new Date("2026-10-29T10:00:00.000Z"),
    allocation: allocation(),
  });
  assert.equal(snapshot.items.length, 2);
  assert.equal(snapshot.items[0].gstRateBps, 1800);
  assert.equal(snapshot.items[1].gstRateBps, 500);
  assert.equal(snapshot.totals.invoiceTotalPaise, 20120);
  assert.equal(snapshot.totals.customerPayablePaise, 19120);
  assert.equal(
    snapshot.totals.taxableValuePaise + snapshot.totals.totalGstPaise,
    snapshot.totals.invoiceTotalPaise
  );
  const validation = new BillingSession({
    vendorId: VENDOR_A,
    gstInvoiceSnapshot: snapshot,
  }).validateSync();
  assert.equal(validation, undefined);
});

test("exclusive snapshot adds GST without changing immutable source settings", () => {
  const source = settings({ pricingMode: "exclusive" });
  const snapshot = buildGstInvoiceSnapshot({
    settings: source,
    lines: [line({ grossAmountPaise: 10000, unitPricePaise: 10000 })],
    totalDiscountPaise: 0,
    loyaltyRedemptionPaise: 0,
    placeOfSupplyStateCode: "36",
    issueDate: new Date("2026-10-29T10:00:00.000Z"),
    allocation: allocation(),
  });
  source.legalBusinessName = "Changed Later";
  source.defaultGstRateBps = 500;
  assert.equal(snapshot.supplier.legalName, "Example Salon Private Limited");
  assert.equal(snapshot.items[0].gstRateBps, 1800);
  assert.equal(snapshot.totals.invoiceTotalPaise, 11800);
  assert.equal(BillingSession.schema.path("gstInvoiceSnapshot").options.immutable, true);
});

test("invoice creation keeps tax invoices strict while non-tax documents allow missing classification", () => {
  assert.throws(
    () => buildGstInvoiceSnapshot({
      settings: settings(),
      lines: [line({ sac: "" })],
      totalDiscountPaise: 0,
      loyaltyRedemptionPaise: 0,
      placeOfSupplyStateCode: "36",
      issueDate: new Date(),
      allocation: allocation(),
    }),
    (error) => error instanceof GstInvoiceError && error.code === "classification_missing"
  );
  assert.throws(
    () => buildGstInvoiceSnapshot({
      settings: settings(),
      lines: [line({ itemType: "PRODUCT", sac: "", hsn: "" })],
      totalDiscountPaise: 0,
      loyaltyRedemptionPaise: 0,
      placeOfSupplyStateCode: "36",
      issueDate: new Date(),
      allocation: allocation(),
    }),
    (error) => error instanceof GstInvoiceError && error.code === "classification_missing"
  );
  const testDocument = buildGstInvoiceSnapshot({
    settings: settings(),
    lines: [line({ name: "Boy Hair Cut", sac: "", unitPricePaise: 10000, grossAmountPaise: 10000 })],
    totalDiscountPaise: 0,
    loyaltyRedemptionPaise: 0,
    placeOfSupplyStateCode: "36",
    issueDate: new Date("2026-10-29T10:00:00.000Z"),
    allocation: allocation(),
    documentMode: "TEST",
  });
  assert.equal(testDocument.documentMode, "TEST");
  assert.equal(testDocument.items[0].name, "Boy Hair Cut");
  assert.equal(testDocument.items[0].sac, "");
  assert.equal(testDocument.totals.taxableValuePaise, 8475);
  assert.equal(testDocument.totals.totalGstPaise, 1525);
  assert.equal(testDocument.totals.invoiceTotalPaise, 10000);
  assert.equal(testDocument.complianceWarnings[0].code, "classification_missing");

  const nonTaxDocument = buildGstInvoiceSnapshot({
    settings: settings(),
    lines: [line({ sac: "" })],
    totalDiscountPaise: 0,
    loyaltyRedemptionPaise: 0,
    placeOfSupplyStateCode: "36",
    issueDate: new Date("2026-10-29T10:00:00.000Z"),
    allocation: _private.buildNonTaxDocumentAllocation({
      billingId: "692403a24d4d3a1b6a7f0ae8",
      issueDate: new Date("2026-10-29T10:00:00.000Z"),
    }),
    documentMode: "NON_TAX_INVOICE",
  });
  assert.equal(nonTaxDocument.invoiceNumber, "NTI/3a1b6a7f0ae8");
  assert.equal(nonTaxDocument.documentMode, "NON_TAX_INVOICE");
  assert.equal(nonTaxDocument.complianceWarnings.length, 1);
  const nonTaxValidation = new BillingSession({
    vendorId: VENDOR_A,
    gstInvoiceSnapshot: nonTaxDocument,
  }).validateSync();
  assert.equal(nonTaxValidation, undefined);
  assert.throws(
    () => _private.validateInvoiceSettings({ gstSettings: settings({ enabled: false }) }),
    (error) => error.code === "gst_invoicing_not_enabled"
  );
  assert.throws(
    () => buildGstInvoiceSnapshot({
      settings: settings(),
      lines: [line()],
      totalDiscountPaise: 0,
      loyaltyRedemptionPaise: 0,
      placeOfSupplyStateCode: "29",
      issueDate: new Date(),
      allocation: allocation(),
    }),
    (error) => error.code === "interstate_gst_not_supported" && error.status === 422
  );
});

test("non-tax fallback does not consume the statutory GST invoice counter", async () => {
  let statutoryAllocations = 0;
  const result = await _private.allocateInvoiceDocument({
    documentMode: "NON_TAX_INVOICE",
    billingId: "692403a24d4d3a1b6a7f0ae8",
    vendorId: VENDOR_A,
    issueDate: new Date("2026-10-29T10:00:00.000Z"),
    session: { transaction: "test" },
    allocator: async () => {
      statutoryAllocations += 1;
      return allocation();
    },
  });
  assert.equal(statutoryAllocations, 0);
  assert.equal(result.invoiceNumber, "NTI/3a1b6a7f0ae8");
});

test("atomic completion persists the immutable snapshot once without allowing overwrite", async () => {
  const snapshot = buildGstInvoiceSnapshot({
    settings: settings(),
    lines: [line()],
    totalDiscountPaise: 0,
    loyaltyRedemptionPaise: 0,
    placeOfSupplyStateCode: "36",
    issueDate: new Date("2026-10-29T10:00:00.000Z"),
    allocation: allocation(),
    documentMode: "TEST",
  });
  const ordinaryUpdate = BillingSession.findOneAndUpdate(
    { _id: ITEM_B },
    { $set: { status: "COMPLETED", gstInvoiceSnapshot: snapshot } }
  );
  const castOrdinaryUpdate = ordinaryUpdate._castUpdate(ordinaryUpdate.getUpdate());
  assert.equal(Object.hasOwn(castOrdinaryUpdate.$set, "gstInvoiceSnapshot"), false);

  const originalUpdateOne = BillingSession.collection.updateOne;
  let captured;
  BillingSession.collection.updateOne = async (filter, update, options) => {
    captured = { filter, update, options };
    return { modifiedCount: 1 };
  };
  const session = { transaction: "test" };
  try {
    const persisted = await persistInitialGstInvoiceSnapshot({
      BillingSessionModel: BillingSession,
      billingId: ITEM_B,
      snapshot,
      session,
    });
    assert.equal(persisted.invoiceNumber, "GST/26-27/00001");
    assert.equal(captured.filter.status, "COMPLETED");
    assert.deepEqual(captured.filter.gstInvoiceSnapshot, { $exists: false });
    assert.equal(captured.options.session, session);
    assert.equal(captured.update.$set.gstInvoiceSnapshot.documentMode, "TEST");

    BillingSession.collection.updateOne = async () => ({ modifiedCount: 0 });
    await assert.rejects(
      persistInitialGstInvoiceSnapshot({
        BillingSessionModel: BillingSession,
        billingId: ITEM_B,
        snapshot,
        session,
      }),
      (error) => error.code === "gst_invoice_snapshot_conflict"
    );
  } finally {
    BillingSession.collection.updateOne = originalUpdateOne;
  }
});

test("GST completion is selected only from the session-locked mode and ordinary flow remains unchanged", () => {
  const controller = fs.readFileSync(
    path.join(__dirname, "../controllers/billingController.js"),
    "utf8"
  );
  assert.match(controller, /\["TEST", "LIVE"\]\.includes\(billing\.gstInvoiceMode\)/);
  assert.match(controller, /prepareGstInvoiceForCompletion/);
  assert.match(controller, /persistInitialGstInvoiceSnapshot/);
  assert.doesNotMatch(controller, /req\.body\.(gst|gstEnabled|enableGst|gstInvoice)/);
  const completionStart = controller.indexOf("exports.completeBillingSession");
  const activeCheck = controller.indexOf('billing.status !== "ACTIVE"', completionStart);
  const gstPreparation = controller.indexOf("prepareGstInvoiceForCompletion", completionStart);
  const transactionEnd = controller.indexOf("const { billing, closed", completionStart);
  const whatsappDispatch = controller.indexOf("sendCompletedBillWhatsApp({", transactionEnd);
  assert.ok(activeCheck > completionStart && activeCheck < gstPreparation);
  assert.ok(transactionEnd > gstPreparation && whatsappDispatch > transactionEnd);
});
