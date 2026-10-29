/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("public bill routes share conditional GST invoice rendering", () => {
  const shortCodePage = read("app/b/[code]/page.jsx");
  const tokenPage = read("app/bill/[billingId]/page.jsx");
  const component = read("app/components/billing/GstInvoiceDetails.jsx");

  for (const source of [shortCodePage, tokenPage]) {
    assert.match(source, /import GstInvoiceDetails/);
    assert.match(source, /<GstInvoiceDetails invoice=\{data\?\.gstInvoice\}/);
  }
  assert.match(component, /if \(!invoice\) return null/);
  assert.match(component, /CGST/);
  assert.match(component, /SGST/);
  assert.match(component, /UTGST/);
  assert.match(component, /IGST/);
  assert.match(component, /classificationType/);
  assert.match(component, /gstRateBps/);
  assert.match(component, /invoice\.supplier\?\.gstin/);
  assert.match(component, /item\.taxableValuePaise/);
  assert.match(component, /totals\.cgstPaise/);
  assert.match(component, /totals\.sgstPaise/);
  assert.match(component, /totals\.invoiceTotalPaise/);
});

test("immediate print and historical reprint use the server GST snapshot", () => {
  const explore = read("app/_Explore/Explore.jsx");
  const history = read("app/components/dashboard/CustomerSearch.jsx");
  const receipt = read("app/utils/receiptPrint.js");

  assert.match(explore, /gstInvoice: completeData\?\.gstInvoice \|\| null/);
  assert.match(history, /gstInvoice: detail\?\.gstInvoice \|\| null/);
  assert.match(history, /printReceiptSnapshot\(buildReceiptSnapshotFromBillDetail\(detail\)\)/);
  assert.match(receipt, /isNonTaxGstDocument \? "GST CALCULATION STATEMENT" : "GST TAX INVOICE"/);
  assert.match(receipt, /if \(gstInvoice\)/);
  assert.match(receipt, /textContent =/);
  assert.doesNotMatch(receipt, /innerHTML\s*=/);
});

test("non-GST receipt and public bill behavior remain conditional", () => {
  const receipt = read("app/utils/receiptPrint.js");
  const component = read("app/components/billing/GstInvoiceDetails.jsx");
  assert.match(receipt, /isNonTaxGstDocument \? "GST CALCULATION STATEMENT" : "GST TAX INVOICE"/);
  assert.match(receipt, /else \{\s*addRow\("NET COLLECTED"/);
  assert.match(component, /if \(!invoice\) return null/);
});

test("GST TEST invoices remain visibly non-tax across bill links, history and print", () => {
  const component = read("app/components/billing/GstInvoiceDetails.jsx");
  const history = read("app/components/dashboard/CustomerSearch.jsx");
  const receipt = read("app/utils/receiptPrint.js");
  assert.match(component, /invoice\.documentMode === "TEST"/);
  assert.match(component, /TEST — NOT A TAX INVOICE/);
  assert.match(history, /invoice\.documentMode === "TEST"/);
  assert.match(receipt, /gstInvoice\?\.documentMode === "TEST"/);
  assert.match(receipt, /TEST — NOT A TAX INVOICE/);
});

test("production documents with missing classification are never labelled tax invoices", () => {
  const component = read("app/components/billing/GstInvoiceDetails.jsx");
  const history = read("app/components/dashboard/CustomerSearch.jsx");
  const receipt = read("app/utils/receiptPrint.js");
  for (const source of [component, history, receipt]) {
    assert.match(source, /NON_TAX_INVOICE/);
    assert.match(source, /NOT A TAX INVOICE — TAX CLASSIFICATION REQUIRED/);
    assert.match(source, /not provided/);
  }
  assert.match(component, /Tax classification needs to be completed/);
  assert.match(receipt, /GST CALCULATION STATEMENT/);
});
