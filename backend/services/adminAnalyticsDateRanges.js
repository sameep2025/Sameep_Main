const IST_TIMEZONE = "Asia/Kolkata";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const SUPPORTED_PERIODS = new Set(["today", "thisMonth", "thisYear", "allTime", "month"]);

function getIstDateParts(date) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
}

function istStartToUtc({ year, month, day }) {
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0) - IST_OFFSET_MS);
}

function isValidMonthValue(month) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ""))) return false;
  const [year, monthNumber] = String(month).split("-").map(Number);
  return year >= 1970 && monthNumber >= 1 && monthNumber <= 12;
}

function getAdminAnalyticsDateRange(period, now = new Date(), options = {}) {
  if (!SUPPORTED_PERIODS.has(period)) {
    const error = new Error("Invalid analytics period");
    error.statusCode = 400;
    error.code = "invalid_period";
    throw error;
  }

  const parts = getIstDateParts(now);
  let from = null;
  let to = now;
  let month = null;

  if (period === "today") {
    from = istStartToUtc(parts);
  } else if (period === "thisMonth") {
    from = istStartToUtc({ year: parts.year, month: parts.month, day: 1 });
  } else if (period === "thisYear") {
    from = istStartToUtc({ year: parts.year, month: 0, day: 1 });
  } else if (period === "month") {
    month = String(options.month || "").trim();
    if (!month) {
      const error = new Error("Month is required for historical month analytics");
      error.statusCode = 400;
      error.code = "month_required";
      throw error;
    }

    if (!isValidMonthValue(month)) {
      const error = new Error("Invalid analytics month");
      error.statusCode = 400;
      error.code = "invalid_month";
      throw error;
    }

    const [year, monthNumber] = month.split("-").map(Number);
    const selectedMonthIndex = monthNumber - 1;
    const currentMonthStart = istStartToUtc({
      year: parts.year,
      month: parts.month,
      day: 1,
    });
    from = istStartToUtc({ year, month: selectedMonthIndex, day: 1 });
    to = istStartToUtc({ year, month: selectedMonthIndex + 1, day: 1 });

    if (from >= currentMonthStart) {
      const error = new Error("Historical month must be before the current month");
      error.statusCode = 400;
      error.code = "month_not_completed";
      throw error;
    }
  }

  return {
    period,
    timezone: IST_TIMEZONE,
    month,
    from,
    to,
  };
}

function buildCreatedAtMatch(range) {
  const createdAt = { $lte: range.to };
  if (range.from) {
    createdAt.$gte = range.from;
  }
  return { createdAt };
}

module.exports = {
  IST_TIMEZONE,
  SUPPORTED_PERIODS,
  buildCreatedAtMatch,
  getAdminAnalyticsDateRange,
  isValidMonthValue,
};
