const DEFAULT_OFFER_TIME_ZONE = "Asia/Kolkata";

function normalizeOfferDateInput(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const raw = String(value || "").trim();
  if (!raw) return null;

  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) {
    const [, year, month, day] = ymd;
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (
      parsed.getUTCFullYear() === Number(year) &&
      parsed.getUTCMonth() === Number(month) - 1 &&
      parsed.getUTCDate() === Number(day)
    ) {
      return `${year}-${month}-${day}`;
    }
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);

  return "INVALID_DATE";
}

function offerDateToStorageValue(value) {
  const normalized = normalizeOfferDateInput(value);
  if (normalized === undefined) return undefined;
  if (normalized === null) return null;
  if (normalized === "INVALID_DATE") {
    const error = new Error("Offer dates must be valid calendar dates");
    error.status = 400;
    throw error;
  }
  return new Date(`${normalized}T00:00:00.000Z`);
}

function offerDateToYmd(value) {
  const normalized = normalizeOfferDateInput(value);
  return normalized && normalized !== "INVALID_DATE" ? normalized : "";
}

function validateOfferDateRange(startValue, endValue) {
  const start = offerDateToYmd(startValue);
  const end = offerDateToYmd(endValue);
  if (start && end && end < start) {
    const error = new Error("Offer End Date cannot be earlier than Offer Start Date");
    error.status = 400;
    throw error;
  }
}

function getTodayYmd(timeZone = DEFAULT_OFFER_TIME_ZONE, now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone || DEFAULT_OFFER_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function isOfferCurrentlyValid(node, options = {}) {
  const today = options.todayYmd || getTodayYmd(options.timeZone, options.now);
  const start = offerDateToYmd(node?.offerStartDate);
  const end = offerDateToYmd(node?.offerEndDate);

  if (start && today < start) return false;
  if (end && today > end) return false;
  return true;
}

function applyOfferDateFields(target, input = {}) {
  if (Object.prototype.hasOwnProperty.call(input, "offerStartDate")) {
    target.offerStartDate = offerDateToStorageValue(input.offerStartDate);
  }
  if (Object.prototype.hasOwnProperty.call(input, "offerEndDate")) {
    target.offerEndDate = offerDateToStorageValue(input.offerEndDate);
  }

  validateOfferDateRange(target.offerStartDate, target.offerEndDate);
}

module.exports = {
  DEFAULT_OFFER_TIME_ZONE,
  applyOfferDateFields,
  getTodayYmd,
  isOfferCurrentlyValid,
  offerDateToStorageValue,
  offerDateToYmd,
  validateOfferDateRange,
};
