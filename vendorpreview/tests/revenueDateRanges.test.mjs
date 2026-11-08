import assert from "node:assert/strict";
import test from "node:test";

import {
  getIstMonthToDateRange,
  getIstTodayRange,
} from "../app/components/dashboard/revenueDateRanges.mjs";

test("Today range follows the IST date across the October-November UTC boundary", () => {
  const before = getIstTodayRange(new Date("2026-10-31T18:29:59.999Z"));
  const after = getIstTodayRange(new Date("2026-10-31T18:30:00.000Z"));
  assert.deepEqual(before, {
    from: "2026-10-30T18:30:00.000Z",
    to: "2026-10-31T18:29:59.999Z",
  });
  assert.deepEqual(after, {
    from: "2026-10-31T18:30:00.000Z",
    to: "2026-11-01T18:29:59.999Z",
  });
});

test("Today range follows the IST year across the December-January UTC boundary", () => {
  const before = getIstTodayRange(new Date("2026-12-31T18:29:59.999Z"));
  const after = getIstTodayRange(new Date("2026-12-31T18:30:00.000Z"));
  assert.equal(before.from, "2026-12-30T18:30:00.000Z");
  assert.equal(after.from, "2026-12-31T18:30:00.000Z");
});

test("This Month range starts at IST month midnight and ends at the current IST day", () => {
  assert.deepEqual(
    getIstMonthToDateRange(new Date("2026-11-06T16:00:00.000Z")),
    {
      from: "2026-10-31T18:30:00.000Z",
      to: "2026-11-06T18:29:59.999Z",
    }
  );
});
