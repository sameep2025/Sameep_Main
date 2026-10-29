const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const mongoose = require("mongoose");

const BillingSession = require("../models/BillingSession");
const {
  normalizeBillingQuantity,
  toPlainBillingItem,
} = require("../utils/billingItemQuantity");

test("billing quantity normalization accepts existing positive quantity values", () => {
  assert.equal(normalizeBillingQuantity(1), 1);
  assert.equal(normalizeBillingQuantity("1"), 1);
  assert.equal(normalizeBillingQuantity(0.5), 0.5);
});

test("billing quantity normalization rejects genuinely invalid quantities", () => {
  for (const value of [undefined, null, "", 0, -1, "invalid", Infinity, NaN]) {
    assert.equal(normalizeBillingQuantity(value), null);
  }
});

test("Mongoose billing item conversion preserves qty and canonical item fields", () => {
  const itemId = new mongoose.Types.ObjectId();
  const billing = new BillingSession({
    vendorId: new mongoose.Types.ObjectId(),
    cartItems: [{ itemId, name: "Hair Spa", price: 500, qty: 1, total: 500 }],
  });
  const plain = toPlainBillingItem(billing.cartItems[0]);
  assert.equal(plain.qty, 1);
  assert.equal(plain.price, 500);
  assert.equal(String(plain.itemId), String(itemId));
});

test("membership merge and GST paths use the shared quantity contract", () => {
  const billingController = fs.readFileSync(
    path.join(__dirname, "../controllers/billingController.js"),
    "utf8"
  );
  const previewService = fs.readFileSync(
    path.join(__dirname, "../services/gstBillPreviewService.js"),
    "utf8"
  );
  const invoiceService = fs.readFileSync(
    path.join(__dirname, "../services/gstInvoiceService.js"),
    "utf8"
  );
  assert.match(billingController, /const plainItem = toPlainBillingItem\(item\)/);
  assert.match(billingController, /normalizeBillingQuantity\(item\?\.qty\)/);
  assert.match(previewService, /normalizeBillingQuantity\(input\.qty\)/);
  assert.match(invoiceService, /normalizeBillingQuantity\(billingItem\.qty\)/);
});
