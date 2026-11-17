import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildStylistReconciliationWarning,
  normalizeStylistPerformanceResponse,
} from "../app/components/dashboard/stylistReconciliation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("normalizes complete and legacy stylist performance responses", () => {
  const legacyRows = [{ stylist: "Ravi", revenue: 900 }];
  const legacy = normalizeStylistPerformanceResponse(legacyRows);
  assert.deepEqual(legacy.data, legacyRows);
  assert.equal(legacy.reconciliation.complete, true);

  const complete = normalizeStylistPerformanceResponse({
    data: legacyRows,
    reconciliation: { complete: true, unreconciledBillCount: 0 },
  });
  assert.deepEqual(complete.data, legacyRows);
  assert.equal(complete.reconciliation.complete, true);
});

test("preserves partial metadata and unavailable amounts", () => {
  const normalized = normalizeStylistPerformanceResponse({
    data: [],
    reconciliation: {
      complete: false,
      unreconciledBillCount: 2,
      unreconciledGrossRevenue: null,
      unreconciledDiscounts: 50,
      unreconciledNetRevenue: null,
      issues: [{ billingSessionId: "safe-id", code: "allocation_unavailable" }],
    },
  });

  assert.equal(normalized.reconciliation.complete, false);
  assert.equal(normalized.reconciliation.unreconciledGrossRevenue, null);
  assert.equal(normalized.reconciliation.unreconciledDiscounts, 50);
  assert.equal(normalized.reconciliation.unreconciledNetRevenue, null);
  assert.equal(normalized.reconciliation.issues.length, 1);
});

test("builds nonblocking partial warning with authoritative net revenue only", () => {
  const message = buildStylistReconciliationWarning({
    complete: false,
    unreconciledBillCount: 2,
    unreconciledNetRevenue: 2170,
  }, (value) => `INR ${value}`);
  assert.match(message, /Partial report: 2 historical bills/);
  assert.match(message, /figures shown exclude those bills/);
  assert.match(message, /Unattributed net revenue: INR 2170/);

  const unavailable = buildStylistReconciliationWarning({
    complete: false,
    unreconciledBillCount: 1,
    unreconciledNetRevenue: null,
  });
  assert.match(unavailable, /1 historical bill/);
  assert.doesNotMatch(unavailable, /Unattributed net revenue/);
  assert.equal(buildStylistReconciliationWarning({ complete: true }), "");
});

test("Today, Month, Year and legacy consumers render partial-report state", () => {
  const files = [
    "app/components/dashboard/TodayRevenue.jsx",
    "app/components/dashboard/MonthRevenue.jsx",
    "app/components/dashboard/YearRevenue.jsx",
    "components/dashboard/StylistPerformance.jsx",
  ];

  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(source, /normalizeStylistPerformanceResponse/);
    assert.match(source, /<StylistReconciliationWarning/);
    assert.match(source, /No reconciled/);
  }
});
