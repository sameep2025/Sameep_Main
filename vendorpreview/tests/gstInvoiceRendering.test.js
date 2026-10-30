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
    assert.match(source, /if \(!error && data\?\.gstInvoice\)/);
    assert.match(source, /<GstInvoiceDetails data=\{data\}/);
    assert.doesNotMatch(source, /<GstInvoiceDetails invoice=/);
  }
  assert.match(component, /if \(!invoice\) return null/);
  assert.match(component, /CGST/);
  assert.match(component, /SGST/);
  assert.match(component, /UTGST/);
  assert.match(component, /IGST/);
  assert.match(component, /gstRateBps/);
  assert.match(component, /invoice\.supplier\?\.gstin/);
  assert.match(component, /item\.unitPricePaise/);
  assert.match(component, /item\.grossAmountPaise/);
  assert.doesNotMatch(component, /classificationCode/);
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
  assert.match(receipt, /if \(gstInvoice\)/);
  assert.match(receipt, /GST TEST RECORD/);
  assert.match(receipt, /gstInvoice\.items/);
  assert.match(receipt, /return true;[\s\S]*addText\("BILL"/);
  assert.match(receipt, /textContent =/);
  assert.doesNotMatch(receipt, /innerHTML\s*=/);
});

test("non-GST receipt and public bill behavior remain conditional", () => {
  const receipt = read("app/utils/receiptPrint.js");
  const component = read("app/components/billing/GstInvoiceDetails.jsx");
  assert.match(receipt, /addText\("BILL", "title center"\)/);
  assert.match(receipt, /addRow\("NET COLLECTED"/);
  assert.match(component, /if \(!invoice\) return null/);
});

test("GST TEST invoices remain visibly non-tax across bill links, history and print", () => {
  const component = read("app/components/billing/GstInvoiceDetails.jsx");
  const receipt = read("app/utils/receiptPrint.js");
  const portal = read("../ynot/web/src/app/mybills/page.js");
  assert.match(component, /invoice\.documentMode === "TEST"/);
  assert.match(component, /GST Test Invoice/);
  assert.match(component, /Non-production test record · Not a tax invoice/);
  assert.match(receipt, /gstInvoice\.documentMode === "TEST"/);
  assert.match(receipt, /GST TEST RECORD/);
  assert.match(portal, /GST Test Record/);
  assert.match(portal, /Non-production test record · Not a tax invoice/);
  assert.doesNotMatch(component, /documentNotice/);
  assert.doesNotMatch(portal, /portalGstDocumentNotice/);
});

test("production documents with missing classification are never labelled tax invoices", () => {
  const component = read("app/components/billing/GstInvoiceDetails.jsx");
  const receipt = read("app/utils/receiptPrint.js");
  const portal = read("../ynot/web/src/app/mybills/page.js");
  for (const source of [component, receipt, portal]) {
    assert.match(source, /NON_TAX_INVOICE/);
    assert.match(source, /not a tax invoice/i);
    assert.doesNotMatch(source, /Tax classification needs to be completed/);
    assert.doesNotMatch(source, /not provided/);
  }
  assert.match(receipt, /GST CALCULATION STATEMENT/);
});

test("GST printing and Customer Portal use exclusive GST or legacy branches", () => {
  const receipt = read("app/utils/receiptPrint.js");
  const portal = read("../ynot/web/src/app/mybills/page.js");
  const gstBranch = receipt.indexOf("if (gstInvoice) {");
  const gstReturn = receipt.indexOf("return true;", gstBranch);
  const legacyItems = receipt.indexOf("(receiptSnapshot.items || []).forEach");

  assert.ok(gstBranch >= 0 && gstReturn > gstBranch && legacyItems > gstReturn);
  assert.match(portal, /bill\.gstInvoice \? \(/);
  assert.match(portal, /<GstInvoicePanel invoice=\{bill\.gstInvoice\} bill=\{bill\} \/>/);
  assert.match(portal, /\) : \(\s*<>[\s\S]*<BillRows bill=\{bill\} detailed \/>/);
});

test("required GST totals remain visible for legitimate zero-value invoices", () => {
  const component = read("app/components/billing/GstInvoiceDetails.jsx");
  assert.match(component, /hideWhenZero = false/);
  assert.match(component, /<TaxRow label="Taxable value" value=\{totals\.taxableValuePaise\} \/>/);
  assert.match(component, /<TaxRow label="Total GST" value=\{totals\.totalGstPaise\} \/>/);
  assert.match(component, /<TaxRow label="Invoice total" value=\{totals\.invoiceTotalPaise\} strong \/>/);
  assert.match(component, /label="CGST"[\s\S]*hideWhenZero/);
});

test("GST presentation uses snapshot-backed service and discount amounts without classifications", () => {
  const component = read("app/components/billing/GstInvoiceDetails.jsx");
  const receipt = read("app/utils/receiptPrint.js");
  const portal = read("../ynot/web/src/app/mybills/page.js");

  for (const source of [component, receipt, portal]) {
    assert.match(source, /grossAmountPaise/);
    assert.match(source, /membershipDiscountPaise/);
    assert.match(source, /manualDiscountPaise/);
    assert.match(source, /loyaltyRedemptionPaise/);
    assert.doesNotMatch(source, /classificationCode/);
  }
  assert.match(component, /Services subtotal/);
  assert.match(component, /Membership discount ·/);
  assert.match(component, /Manual discount/);
  assert.match(component, /Loyalty redemption/);
  assert.match(component, /hideWhenZero/);
});

test("GST items retain quantity, optional unit price, category and staff presentation", () => {
  const component = read("app/components/billing/GstInvoiceDetails.jsx");
  const explore = read("app/_Explore/Explore.jsx");
  const history = read("app/components/dashboard/CustomerSearch.jsx");
  const portal = read("../ynot/web/src/app/mybills/page.js");

  assert.match(component, /data-label="Qty"/);
  assert.match(component, /data-label="Unit price"/);
  assert.match(component, /data-label="Line total"/);
  assert.match(component, /item\.hierarchy/);
  assert.match(component, /Staff:/);
  assert.match(explore, /hierarchy: Array\.isArray\(item\.nodePath\)/);
  assert.match(explore, /resourceName: String\(item\.resourceName/);
  assert.match(history, /hierarchy: String\(item\.hierarchy/);
  assert.match(portal, /bill\.items\?\.\[index\]\?\.staffName/);
});

test("GST inclusive and exclusive documents explain pricing without recalculating totals", () => {
  const component = read("app/components/billing/GstInvoiceDetails.jsx");
  const receipt = read("app/utils/receiptPrint.js");
  const portal = read("../ynot/web/src/app/mybills/page.js");

  for (const source of [component, receipt, portal]) {
    assert.match(source, /pricingMode === "inclusive"/);
    assert.match(source, /GST is included/);
    assert.match(source, /GST is added/);
  }
});

test("public GST invoices retain the global Discover More section", () => {
  const layout = read("app/layout.jsx");
  const seo = read("app/components/ServerSeoContentSection.jsx");
  assert.match(layout, /<ServerSeoContentSection vendorInfo=\{vendorContext\} \/>/);
  assert.match(layout, /\{children\}[\s\S]*<ServerSeoContentSection/);
  assert.match(seo, /Discover More/);
});
