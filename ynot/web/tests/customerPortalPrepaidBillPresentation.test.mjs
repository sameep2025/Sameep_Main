import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const pageSource = fs.readFileSync(
  path.join(testDir, "../src/app/mybills/page.js"),
  "utf8"
);

test("Customer Portal shows authoritative prepaid settlement separately from amount collected", () => {
  assert.match(pageSource, /bill\.paymentMode === "PREPAID_VALUE" && bill\.prepaidSettlement/);
  assert.match(pageSource, /bill\.paymentMode === "PREPAID_SESSIONS" && bill\.prepaidSettlement/);
  assert.match(pageSource, /Prepaid Wallet \$\{isCancelled \? "Restored" : "Redeemed"\}/);
  assert.match(pageSource, /Prepaid Package \$\{isCancelled \? "Restored" : "Redeemed"\}/);
  assert.match(pageSource, /Balance Due/);
  assert.match(pageSource, /formatPaise\(prepaidSettlement\.balanceDuePaise\)/);
  assert.match(pageSource, /Remaining Wallet Balance/);
  assert.match(pageSource, /remainingAmountPaiseAfterRedemption/);
  assert.match(pageSource, /Remaining Package Sessions/);
  assert.match(pageSource, /remainingQuantityAfterRedemption/);
});

test("Customer Portal keeps standard payment modes and amount-paid presentation", () => {
  assert.match(pageSource, /if \(bill\.paymentMode === "SPLIT"\)/);
  assert.match(pageSource, /if \(bill\.paymentMode === "CASH"\) return "Cash"/);
  assert.match(pageSource, /if \(bill\.paymentMode === "ONLINE"\) return "Online"/);
  assert.match(pageSource, /bill\.prepaidSettlement \? "Balance Due" : "Amount Paid"/);
});
