const IST_OFFSET_MS = 330 * 60 * 1000;

function getIstDateParts(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError("Valid reporting date required");
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
}

function istCalendarStartToUtc({ year, month, day = 1 }) {
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0) - IST_OFFSET_MS);
}

function inclusiveEnd(endExclusive) {
  return new Date(endExclusive.getTime() - 1);
}

export function getIstTodayRange(now = new Date()) {
  const parts = getIstDateParts(now);
  const start = istCalendarStartToUtc(parts);
  const end = inclusiveEnd(istCalendarStartToUtc({ ...parts, day: parts.day + 1 }));
  return { from: start.toISOString(), to: end.toISOString() };
}

export function getIstMonthToDateRange(now = new Date()) {
  const parts = getIstDateParts(now);
  const start = istCalendarStartToUtc({ year: parts.year, month: parts.month, day: 1 });
  const end = inclusiveEnd(istCalendarStartToUtc({ ...parts, day: parts.day + 1 }));
  return { from: start.toISOString(), to: end.toISOString() };
}
