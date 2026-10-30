const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  buildGstInvoicePresentation,
} = require("../services/gstInvoicePresentationService");
const {
  buildBillDetail,
  buildBillListItem,
} = require("../controllers/customerPortalBillsController");

function gstItem(overrides = {}) {
  return {
    name: "Hair <Spa>",
    quantity: 1,
    itemType: "SERVICE",
    sac: "999723",
    hsn: "",
    gstRateBps: 1800,
    unitPricePaise: 11800,
    grossAmountPaise: 11800,
    membershipDiscountPaise: 0,
    manualDiscountPaise: 0,
    totalDiscountPaise: 0,
    taxableValuePaise: 10000,
    cgstPaise: 900,
    sgstPaise: 900,
    utgstPaise: 0,
    igstPaise: 0,
    totalGstPaise: 1800,
    invoiceTotalPaise: 11800,
    ...overrides,
  };
}

function gstSnapshot(overrides = {}) {
  return {
    schemaVersion: 1,
    invoiceNumber: "GST/26-27/00001",
    financialYear: "26-27",
    invoiceIssueDate: new Date("2026-10-29T10:00:00.000Z"),
    supplier: {
      gstin: "36ABCDE1234F1Z5",
      legalName: "Salon <Legal> & Co",
      registeredAddress: "1 <Main> Road",
      registeredStateCode: "36",
    },
    placeOfSupply: { stateCode: "36", supplyType: "intrastate" },
    pricingMode: "inclusive",
    items: [gstItem()],
    totals: {
      grossAmountPaise: 11800,
      membershipDiscountPaise: 0,
      manualDiscountPaise: 0,
      totalDiscountPaise: 0,
      taxableValuePaise: 10000,
      cgstPaise: 900,
      sgstPaise: 900,
      utgstPaise: 0,
      igstPaise: 0,
      totalGstPaise: 1800,
      invoiceTotalPaise: 11800,
      loyaltyRedemptionPaise: 1000,
      customerPayablePaise: 10800,
    },
    ...overrides,
  };
}

test("GST presentation preserves immutable snapshot values and mixed item rates", () => {
  const source = gstSnapshot({
    pricingMode: "exclusive",
    items: [
      gstItem(),
      gstItem({
        name: "Shampoo",
        itemType: "PRODUCT",
        sac: "",
        hsn: "3305",
        gstRateBps: 500,
      }),
    ],
  });
  const result = buildGstInvoicePresentation(source);

  assert.equal(result.invoiceNumber, "GST/26-27/00001");
  assert.equal(result.supplier.gstin, "36ABCDE1234F1Z5");
  assert.equal(result.pricingMode, "exclusive");
  assert.deepEqual(result.items.map((item) => item.gstRateBps), [1800, 500]);
  assert.deepEqual(result.items.map((item) => item.unitPricePaise), [11800, 11800]);
  assert.deepEqual(result.items.map((item) => item.classificationType), ["SAC", "HSN"]);
  assert.equal(result.totals.taxableValuePaise, 10000);
  assert.equal(result.totals.cgstPaise, 900);
  assert.equal(result.totals.sgstPaise, 900);
  assert.equal(result.totals.invoiceTotalPaise, 11800);
  assert.equal(result.totals.customerPayablePaise, 10800);

  source.supplier.legalName = "Changed Current Setting";
  source.items[0].gstRateBps = 2800;
  assert.equal(result.supplier.legalName, "Salon <Legal> & Co");
  assert.equal(result.items[0].gstRateBps, 1800);
});

test("GST presentation preserves CGST, SGST, UTGST and IGST without recalculation", () => {
  const cases = [
    { cgstPaise: 900, sgstPaise: 900, utgstPaise: 0, igstPaise: 0 },
    { cgstPaise: 900, sgstPaise: 0, utgstPaise: 900, igstPaise: 0 },
    { cgstPaise: 0, sgstPaise: 0, utgstPaise: 0, igstPaise: 1800 },
  ];

  for (const tax of cases) {
    const source = gstSnapshot({
      placeOfSupply: {
        stateCode: tax.igstPaise ? "29" : "36",
        supplyType: tax.igstPaise ? "interstate" : "intrastate",
      },
      items: [gstItem(tax)],
      totals: { ...gstSnapshot().totals, ...tax },
    });
    const result = buildGstInvoicePresentation(source);
    assert.deepEqual(
      {
        cgstPaise: result.totals.cgstPaise,
        sgstPaise: result.totals.sgstPaise,
        utgstPaise: result.totals.utgstPaise,
        igstPaise: result.totals.igstPaise,
      },
      tax
    );
  }
});

test("GST presentation preserves quantity, unit price and line total for multi-quantity items", () => {
  const result = buildGstInvoicePresentation(gstSnapshot({
    items: [gstItem({
      quantity: 3,
      unitPricePaise: 5000,
      grossAmountPaise: 15000,
    })],
  }));

  assert.equal(result.items[0].quantity, 3);
  assert.equal(result.items[0].unitPricePaise, 5000);
  assert.equal(result.items[0].grossAmountPaise, 15000);
});

test("missing and malformed GST snapshots are omitted instead of inventing tax data", () => {
  assert.equal(buildGstInvoicePresentation(null), null);
  assert.equal(buildGstInvoicePresentation(gstSnapshot({ invoiceNumber: "frontend-value" })), null);
  assert.equal(buildGstInvoicePresentation(gstSnapshot({ items: [] })), null);
  assert.equal(
    buildGstInvoicePresentation(gstSnapshot({
      totals: { ...gstSnapshot().totals, totalGstPaise: 12.5 },
    })),
    null
  );
});

test("non-tax GST calculations present missing SAC with an actionable warning", () => {
  const result = buildGstInvoicePresentation(gstSnapshot({
    documentMode: "NON_TAX_INVOICE",
    invoiceNumber: "NTI/4d3a1b6a7f0a",
    items: [gstItem({ name: "Boy Hair Cut", sac: "", grossAmountPaise: 10000 })],
    complianceWarnings: [{
      code: "classification_missing",
      message: "Add a valid SAC before issuing a GST tax invoice.",
      itemName: "Boy Hair Cut",
      classificationType: "SAC",
    }],
  }));
  assert.equal(result.documentMode, "NON_TAX_INVOICE");
  assert.equal(result.items[0].classificationCode, "");
  assert.equal(result.complianceWarnings[0].code, "classification_missing");
  assert.equal(
    buildGstInvoicePresentation(gstSnapshot({ items: [gstItem({ sac: "" })] })),
    null
  );
});

test("customer portal detail and list expose GST only from the bill snapshot", () => {
  const bill = {
    _id: "692403a24d4d3a1b6a7f0ae5",
    vendorId: "692403a24d4d3a1b6a7f0ae6",
    status: "COMPLETED",
    createdAt: new Date("2026-10-29T10:00:00.000Z"),
    cartItems: [{
      name: "Hair Spa",
      qty: 1,
      price: 118,
      total: 118,
      nodePath: ["Hair", "Treatments", "Hair Spa"],
      resourceName: "Asha",
    }],
    totalAmount: 118,
    gstInvoiceSnapshot: gstSnapshot(),
  };
  const detail = buildBillDetail(bill);
  const listItem = buildBillListItem(bill);
  assert.equal(detail.gstInvoice.invoiceNumber, "GST/26-27/00001");
  assert.equal(detail.gstInvoice.items[0].unitPricePaise, 11800);
  assert.equal(detail.items[0].hierarchy, "Hair / Treatments / Hair Spa");
  assert.equal(detail.items[0].staffName, "Asha");
  assert.equal(listItem.gstInvoiceNumber, "GST/26-27/00001");
  assert.equal(listItem.gstInvoiceDocumentMode, "TAX_INVOICE");

  const nonTaxSnapshot = gstSnapshot({
    documentMode: "NON_TAX_INVOICE",
    invoiceNumber: "NTI/4d3a1b6a7f0a",
    items: [gstItem({ sac: "" })],
    complianceWarnings: [{
      code: "classification_missing",
      message: "Add a valid SAC before issuing a GST tax invoice.",
      itemName: "Hair <Spa>",
      classificationType: "SAC",
    }],
  });
  const nonTaxDetail = buildBillDetail({ ...bill, gstInvoiceSnapshot: nonTaxSnapshot });
  const nonTaxListItem = buildBillListItem({ ...bill, gstInvoiceSnapshot: nonTaxSnapshot });
  assert.equal(nonTaxDetail.gstInvoice.documentMode, "NON_TAX_INVOICE");
  assert.equal(nonTaxDetail.gstInvoice.items[0].classificationCode, "");
  assert.equal(nonTaxDetail.gstInvoice.complianceWarnings[0].code, "classification_missing");
  assert.equal(nonTaxListItem.gstInvoiceDocumentMode, "NON_TAX_INVOICE");

  const nonGstDetail = buildBillDetail({ ...bill, gstInvoiceSnapshot: undefined });
  const nonGstListItem = buildBillListItem({ ...bill, gstInvoiceSnapshot: undefined });
  assert.equal(Object.hasOwn(nonGstDetail, "gstInvoice"), false);
  assert.equal(Object.hasOwn(nonGstListItem, "gstInvoiceNumber"), false);
});

test("bill APIs preserve existing ownership checks while adding snapshot presentation", () => {
  const billingSource = fs.readFileSync(
    path.join(__dirname, "../controllers/billingController.js"),
    "utf8"
  );
  const portalSource = fs.readFileSync(
    path.join(__dirname, "../controllers/customerPortalBillsController.js"),
    "utf8"
  );
  assert.match(billingSource, /buildGstInvoicePresentation\(bill\.gstInvoiceSnapshot\)/);
  assert.match(billingSource, /buildGstInvoicePresentation\(closed\.gstInvoiceSnapshot\)/);
  assert.match(billingSource, /String\(bill\.vendorId \|\| ""\) !== authorizedVendorId/);
  assert.match(billingSource, /req\.vendorWriteAuth\?\.vendorId/);
  assert.match(portalSource, /_id: billIdentifier,\s*customerId,/);
  assert.doesNotMatch(billingSource, /req\.body\.gstInvoice/);
});

test("printable and React views escape text and share the same GST snapshot", () => {
  const printSource = fs.readFileSync(
    path.join(__dirname, "../../vendorpreview/app/utils/receiptPrint.js"),
    "utf8"
  );
  const publicSource = fs.readFileSync(
    path.join(__dirname, "../../vendorpreview/app/components/billing/GstInvoiceDetails.jsx"),
    "utf8"
  );
  const portalSource = fs.readFileSync(
    path.join(__dirname, "../../ynot/web/src/app/mybills/page.js"),
    "utf8"
  );
  assert.match(printSource, /textContent =/);
  assert.doesNotMatch(printSource, /innerHTML\s*=/);
  assert.match(printSource, /receiptSnapshot\.gstInvoice/);
  assert.match(publicSource, /invoice\.supplier\?\.legalName/);
  assert.doesNotMatch(publicSource, /dangerouslySetInnerHTML/);
  assert.match(portalSource, /function GstInvoicePanel/);
  assert.match(portalSource, /<GstInvoicePanel invoice=\{bill\.gstInvoice\}/);
  assert.doesNotMatch(portalSource, /dangerouslySetInnerHTML/);
});
