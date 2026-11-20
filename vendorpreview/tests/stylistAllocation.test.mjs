import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildEqualStylistAllocations,
  getCartStylistAllocationError,
  getStylistAllocationTotalPercent,
  getStylistSelectionSummary,
  serializeStylistAllocations,
  toggleStylistAllocation,
  updateStylistAllocationPercent,
} from "../app/_Explore/stylistAllocation.mjs";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const exploreSource = fs.readFileSync(path.join(testDir, "../app/_Explore/Explore.jsx"), "utf8");
const selectorSource = fs.readFileSync(
  path.join(testDir, "../app/_Explore/components/MultiStylistSelector.jsx"),
  "utf8"
);

const A = { _id: "a", name: "A" };
const B = { _id: "b", name: "B" };
const C = { _id: "c", name: "C" };

test("equal allocations are deterministic for one, two, three and four stylists", () => {
  assert.deepEqual(buildEqualStylistAllocations([A]).map((row) => row.allocationPercent), ["100"]);
  assert.deepEqual(buildEqualStylistAllocations([A, B]).map((row) => row.allocationPercent), ["50", "50"]);
  assert.deepEqual(
    buildEqualStylistAllocations([A, B, C]).map((row) => row.allocationPercent),
    ["33.33", "33.33", "33.34"]
  );
  assert.deepEqual(
    buildEqualStylistAllocations([A, B, C, { _id: "d", name: "D" }])
      .map((row) => row.allocationPercent),
    ["25", "25", "25", "25"]
  );
});

test("manual allocation is preserved until the selected stylist set changes", () => {
  const selected = { stylistAllocations: buildEqualStylistAllocations([A, B]) };
  const manual = updateStylistAllocationPercent(selected, "a", "60");
  const completed = updateStylistAllocationPercent({ stylistAllocations: manual }, "b", "40");
  assert.deepEqual(serializeStylistAllocations({ stylistAllocations: completed }), [
    { resourceId: "a", allocationBps: 6000 },
    { resourceId: "b", allocationBps: 4000 },
  ]);
  assert.equal(getCartStylistAllocationError([{ name: "Colour", stylistAllocations: completed }]), "");

  const recalculated = toggleStylistAllocation({ stylistAllocations: completed }, C);
  assert.deepEqual(recalculated.map((row) => row.allocationPercent), ["33.33", "33.33", "33.34"]);
  const removed = toggleStylistAllocation({ stylistAllocations: recalculated }, B);
  assert.deepEqual(removed.map((row) => row.allocationPercent), ["50", "50"]);
});

test("services keep independent selections and invalid totals block submission", () => {
  const first = { name: "Cut", stylistAllocations: buildEqualStylistAllocations([A]) };
  const second = { name: "Colour", stylistAllocations: buildEqualStylistAllocations([B, C]) };
  assert.equal(first.stylistAllocations[0].resourceId, "a");
  assert.deepEqual(second.stylistAllocations.map((row) => row.resourceId), ["b", "c"]);

  const invalid = updateStylistAllocationPercent(second, "b", "60");
  assert.match(
    getCartStylistAllocationError([first, { ...second, stylistAllocations: invalid }]),
    /total exactly 100/
  );
});

test("compact summaries and totals cover zero, one, two and three selections", () => {
  const none = {};
  const one = { stylistAllocations: buildEqualStylistAllocations([A]) };
  const two = { stylistAllocations: buildEqualStylistAllocations([A, B]) };
  const three = { stylistAllocations: buildEqualStylistAllocations([A, B, C]) };

  assert.equal(getStylistSelectionSummary(none, "Stylist"), "Select Stylist");
  assert.equal(getStylistSelectionSummary(one), "A");
  assert.equal(getStylistSelectionSummary(two), "A, B");
  assert.equal(getStylistSelectionSummary(three), "3 stylists selected");
  assert.equal(getStylistAllocationTotalPercent(three), 100);

  const invalid = {
    stylistAllocations: updateStylistAllocationPercent(two, "a", "60"),
  };
  assert.equal(getStylistAllocationTotalPercent(invalid), 110);
});

test("Quick Billing renders a compact multi-select and serializes allocations", () => {
  assert.match(selectorSource, /type="checkbox"/);
  assert.match(selectorSource, /<details ref=\{detailsRef\}/);
  assert.match(selectorSource, /<summary>/);
  assert.match(selectorSource, /allocations\.length > 1/);
  assert.match(selectorSource, /allocation\?\.allocationPercent/);
  assert.match(selectorSource, /disabled=\{Boolean\(error\)\}/);
  assert.match(selectorSource, />\s*Done\s*</);
  assert.match(exploreSource, /const stylistAllocations = serializeStylistAllocations\(item\)/);
  assert.match(exploreSource, /\n\s*stylistAllocations,\r?\n/);
  assert.match(exploreSource, /!stylistAllocationError/);
  assert.equal((exploreSource.match(/<MultiStylistSelector/g) || []).length, 2);
});
