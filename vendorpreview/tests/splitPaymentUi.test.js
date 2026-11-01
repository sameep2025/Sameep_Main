/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app", "_Explore", "Explore.jsx"), "utf8");
const css = fs.readFileSync(path.join(root, "app", "_Explore", "ExploreInline.css"), "utf8");
const receiptSource = fs.readFileSync(path.join(root, "app", "utils", "receiptPrint.js"), "utf8");

function extractFunction(name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} should exist`);
  const closingParenthesis = source.indexOf(")", start);
  const opening = source.indexOf("{", closingParenthesis);
  let depth = 0;
  for (let index = opening; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unable to extract ${name}`);
}

const context = { module: { exports: {} } };
vm.runInNewContext(
  `${extractFunction("parsePaymentAmountToPaise")}\n` +
  `${extractFunction("formatPaymentPaiseInput")}\n` +
  `${extractFunction("getBalancedPaymentInputs")}\n` +
  "module.exports = { parsePaymentAmountToPaise, getBalancedPaymentInputs };",
  context
);
const { parsePaymentAmountToPaise, getBalancedPaymentInputs } = context.module.exports;

test("editing either amount auto-balances the other in paise", () => {
  const cash = getBalancedPaymentInputs({ editedField: "cash", value: "200", totalPaise: 50000 });
  assert.equal(cash.valid, true);
  assert.equal(cash.cashAmountPaise, 20000);
  assert.equal(cash.onlineAmountPaise, 30000);
  assert.equal(cash.onlineInput, "300.00");

  const online = getBalancedPaymentInputs({ editedField: "online", value: "350.25", totalPaise: 50000 });
  assert.equal(online.cashAmountPaise, 14975);
  assert.equal(online.onlineAmountPaise, 35025);
});

test("edited allocation rebalances when discounts, rewards or GST change the payable", () => {
  const discounted = getBalancedPaymentInputs({
    editedField: "cash",
    value: "200",
    totalPaise: 45000,
  });
  assert.equal(discounted.valid, true);
  assert.equal(discounted.cashAmountPaise, 20000);
  assert.equal(discounted.onlineAmountPaise, 25000);

  const adjusted = getBalancedPaymentInputs({
    editedField: "online",
    value: "350",
    totalPaise: 60000,
  });
  assert.equal(adjusted.valid, true);
  assert.equal(adjusted.cashAmountPaise, 25000);
  assert.equal(adjusted.onlineAmountPaise, 35000);
});

test("empty, over-payable and excess-decimal input remains invalid without clamping", () => {
  assert.equal(parsePaymentAmountToPaise("").valid, false);
  assert.equal(parsePaymentAmountToPaise("1.234").valid, false);
  const excessive = getBalancedPaymentInputs({ editedField: "cash", value: "500.01", totalPaise: 50000 });
  assert.equal(excessive.valid, false);
  assert.match(excessive.error, /cannot exceed/);
});

test("payment UI uses two mobile-friendly amount inputs and no mode buttons", () => {
  assert.match(source, /Cash Amount/);
  assert.match(source, /Online \/ UPI Amount/);
  assert.match(source, /inputMode="decimal"/);
  assert.equal(source.includes('setPaymentMode('), false);
  assert.match(css, /\.quick-billing-payment-inputs/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(receiptSource, /mode === "SPLIT"/);
  assert.match(receiptSource, /Cash \$\{cash\} \+ Online \$\{online\}/);
});
