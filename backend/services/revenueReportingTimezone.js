const REPORTING_TIMEZONE = "Asia/Kolkata";
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

function getIstDayBounds(now = new Date()) {
  const parts = getIstDateParts(now);
  return {
    start: istCalendarStartToUtc(parts),
    endExclusive: istCalendarStartToUtc({ ...parts, day: parts.day + 1 }),
  };
}

function getIstMonthStart(now = new Date()) {
  const parts = getIstDateParts(now);
  return istCalendarStartToUtc({ year: parts.year, month: parts.month, day: 1 });
}

function getIstMonthBounds(monthKey) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(monthKey || "").trim());
  if (!match) throw new TypeError("Reporting month must use YYYY-MM");
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  return {
    start: istCalendarStartToUtc({ year, month, day: 1 }),
    endExclusive: istCalendarStartToUtc({ year, month: month + 1, day: 1 }),
  };
}

function getIstMonthKey(value) {
  const { year, month } = getIstDateParts(value);
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function getIstDayKey(value) {
  const { year, month, day } = getIstDateParts(value);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isIstCalendarBoundary(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return (
    shifted.getUTCHours() === 0 &&
    shifted.getUTCMinutes() === 0 &&
    shifted.getUTCSeconds() === 0 &&
    shifted.getUTCMilliseconds() === 0
  );
}

function getIstDayKeys(start, endExclusive, maxDays = 366) {
  const startDate = start instanceof Date ? start : new Date(start);
  const endDate = endExclusive instanceof Date ? endExclusive : new Date(endExclusive);
  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime()) ||
    startDate >= endDate
  ) {
    throw new TypeError("Valid reporting range required");
  }

  const keys = [];
  let cursor = getIstDayBounds(startDate).start;
  while (cursor < endDate) {
    if (keys.length >= maxDays) throw new RangeError("Reporting range is too large");
    keys.push(getIstDayKey(cursor));
    const parts = getIstDateParts(cursor);
    cursor = istCalendarStartToUtc({ ...parts, day: parts.day + 1 });
  }
  return keys;
}

function getIstRollingMonthWindow(now = new Date(), monthCount = 12) {
  if (!Number.isInteger(monthCount) || monthCount < 1) {
    throw new TypeError("Positive reporting month count required");
  }
  const current = getIstDateParts(now);
  const startIndex = current.month - monthCount + 1;
  const start = istCalendarStartToUtc({ year: current.year, month: startIndex, day: 1 });
  const endExclusive = istCalendarStartToUtc({
    year: current.year,
    month: current.month + 1,
    day: 1,
  });
  const months = Array.from({ length: monthCount }, (_, index) => {
    const calendar = new Date(Date.UTC(current.year, startIndex + index, 1));
    const year = calendar.getUTCFullYear();
    const month = calendar.getUTCMonth();
    return {
      year,
      month,
      monthKey: `${year}-${String(month + 1).padStart(2, "0")}`,
      start: istCalendarStartToUtc({ year, month, day: 1 }),
      endExclusive: istCalendarStartToUtc({ year, month: month + 1, day: 1 }),
      isCurrentMonth: year === current.year && month === current.month,
    };
  });
  return { start, endExclusive, months };
}

module.exports = {
  REPORTING_TIMEZONE,
  getIstDateParts,
  getIstDayBounds,
  getIstDayKey,
  getIstDayKeys,
  getIstMonthBounds,
  getIstMonthKey,
  getIstMonthStart,
  getIstRollingMonthWindow,
  isIstCalendarBoundary,
  istCalendarStartToUtc,
};
