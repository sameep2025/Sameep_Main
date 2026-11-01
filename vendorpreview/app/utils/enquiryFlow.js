"use client";

export const ENQUIRY_OPEN_EVENT = "ynot-open-enquiry";
export const CART_UPDATED_EVENT = "ynot-cart-updated";

export function createEnquirySubmissionKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `enquiry-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function getEnquiryFieldLabel(field) {
  const override = String(field?.labelOverride || "").trim();
  if (override) return override;
  return String(field?.name || "Question").trim();
}

export function getEnquiryFieldPlaceholder(field) {
  const override = String(field?.placeholderOverride || "").trim();
  if (override) return override;
  return `Enter ${String(getEnquiryFieldLabel(field) || "value").toLowerCase()}`;
}

export function getEnquiryTypeLabel(enquiryType) {
  const normalized = String(enquiryType || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  if (normalized === "appointment" || normalized === "appointment_request") {
    return "Appointment Request";
  }

  if (normalized === "order" || normalized === "order_request") {
    return "Order Request";
  }

  if (
    normalized === "enquiry" ||
    normalized === "service_enquiry" ||
    normalized === "service"
  ) {
    return "Service Enquiry";
  }

  return "Service Enquiry";
}

export function getEnquiryInputType(fieldType) {
  const normalized = String(fieldType || "text").trim().toLowerCase();
  if (
    normalized === "datetime" ||
    normalized === "datetime-local" ||
    normalized === "date & time" ||
    normalized === "dateandtime" ||
    normalized === "date_time"
  ) {
    return "datetime-local";
  }

  if (normalized === "phone") return "tel";
  if (normalized === "location") return "text";
  if (["text", "number", "date", "time", "email", "tel"].includes(normalized)) {
    return normalized;
  }

  return "text";
}

export function isLikelyPhoneField(field) {
  const inputType = getEnquiryInputType(field?.fieldType);
  const name = String(field?.name || "").trim().toLowerCase();
  const label = String(field?.labelOverride || field?.name || "").trim().toLowerCase();

  return (
    inputType === "tel" ||
    name.includes("mobile") ||
    name.includes("phone") ||
    label.includes("mobile") ||
    label.includes("phone")
  );
}

export function sanitizeEnquiryValue(field, rawValue) {
  const inputType = getEnquiryInputType(field?.fieldType);
  const value = String(rawValue ?? "");

  if (isLikelyPhoneField(field)) {
    return value.replace(/\D/g, "").slice(0, 10);
  }

  if (inputType === "number") {
    return value.replace(/\D/g, "");
  }

  if (inputType === "text") {
    const normalizedName = String(field?.name || "").trim().toLowerCase();
    const normalizedLabel = String(field?.labelOverride || "").trim().toLowerCase();
    const isNameField =
      normalizedName === "name" ||
      normalizedName.includes("full name") ||
      normalizedLabel === "name" ||
      normalizedLabel.includes("full name");

    if (isNameField) {
      return value.replace(/[^a-zA-Z\s.'-]/g, "");
    }
  }

  return value;
}

export function getEnquiryInputMode(field) {
  if (isLikelyPhoneField(field)) return "numeric";

  const inputType = getEnquiryInputType(field?.fieldType);
  if (inputType === "number") return "numeric";
  if (inputType === "email") return "email";
  if (inputType === "tel") return "tel";
  return undefined;
}

export function getTimeSlotOptions() {
  const slots = [];

  for (let hour = 0; hour < 24; hour += 1) {
    for (let minute = 0; minute < 60; minute += 30) {
      const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      const displayHour = ((hour + 11) % 12) + 1;
      const amPm = hour >= 12 ? "PM" : "AM";
      const displayMinute = String(minute).padStart(2, "0");
      slots.push({
        value,
        label: `${displayHour}:${displayMinute} ${amPm}`,
      });
    }
  }

  return slots;
}

function parseHourMinuteTo24Hour(value, meridiem) {
  let hour = Number(value || 0);
  const minute = Number(String(value).split(":")[1] || 0);
  const suffix = String(meridiem || "").trim().toUpperCase();

  if (suffix === "PM" && hour < 12) hour += 12;
  if (suffix === "AM" && hour === 12) hour = 0;

  return {
    hour,
    minute,
  };
}

function parseBusinessHoursRange(hoursText) {
  const normalized = String(hoursText || "")
    .replace(/[–—]/g, "-")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return null;
  if (/closed/i.test(normalized)) return null;
  if (/open\s*24\s*hours?/i.test(normalized)) {
    return { startMinutes: 0, endMinutes: 24 * 60 };
  }

  const parts = normalized.split("-");
  if (parts.length !== 2) return null;

  const timePattern = /(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i;
  const startMatch = parts[0].match(timePattern);
  const endMatch = parts[1].match(timePattern);

  if (!startMatch || !endMatch) return null;

  const start = parseHourMinuteTo24Hour(
    `${startMatch[1]}:${startMatch[2] || "00"}`,
    startMatch[3]
  );
  const end = parseHourMinuteTo24Hour(
    `${endMatch[1]}:${endMatch[2] || "00"}`,
    endMatch[3]
  );

  const startMinutes = start.hour * 60 + start.minute;
  let endMinutes = end.hour * 60 + end.minute;

  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
  }

  return { startMinutes, endMinutes };
}

function formatSlotLabel(totalMinutes) {
  const normalizedMinutes = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hour24 = Math.floor(normalizedMinutes / 60);
  const minute = normalizedMinutes % 60;
  const displayHour = ((hour24 + 11) % 12) + 1;
  const amPm = hour24 >= 12 ? "PM" : "AM";
  return `${displayHour}:${String(minute).padStart(2, "0")} ${amPm}`;
}

function buildTimeSlotsFromRange(range, intervalMinutes = 30) {
  if (!range) return [];

  const slots = [];

  for (
    let totalMinutes = range.startMinutes;
    totalMinutes <= range.endMinutes - intervalMinutes;
    totalMinutes += intervalMinutes
  ) {
    const normalizedMinutes = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
    const hour24 = Math.floor(normalizedMinutes / 60);
    const minute = normalizedMinutes % 60;

    slots.push({
      value: `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      label: formatSlotLabel(totalMinutes),
    });
  }

  return slots;
}

function getWeekdayNameFromDate(dateValue) {
  if (!dateValue) {
    return new Date().toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
  }

  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
}

export function getTimeSlotOptionsForDate(businessHours, dateValue) {
  const weekday = getWeekdayNameFromDate(dateValue);

  if (!weekday) {
    return getTimeSlotOptions();
  }

  if (!Array.isArray(businessHours) || businessHours.length === 0) {
    return getTimeSlotOptions();
  }

  const dayEntry = businessHours.find((item) => {
    const dayName = String(item?.day || "").trim().toLowerCase();
    return dayName === weekday;
  });

  if (!dayEntry) {
    return getTimeSlotOptions();
  }

  const rawHours = String(dayEntry?.hours || dayEntry?.time || "").trim();
  const range = parseBusinessHoursRange(rawHours);
  if (!range) {
    return /closed/i.test(rawHours) ? [] : getTimeSlotOptions();
  }

  const slots = buildTimeSlotsFromRange(range);
  return slots.length > 0 ? slots : getTimeSlotOptions();
}

export function splitDateTimeValue(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return { date: "", time: "" };
  }

  if (normalized.includes("T")) {
    const [datePart = "", timePart = ""] = normalized.split("T");
    return {
      date: datePart,
      time: timePart.slice(0, 5),
    };
  }

  if (normalized.includes(" ")) {
    const [datePart = "", timePart = ""] = normalized.split(" ");
    return {
      date: datePart,
      time: timePart.slice(0, 5),
    };
  }

  return { date: normalized, time: "" };
}

export function mergeDateTimeValue(dateValue, timeValue) {
  if (!dateValue && !timeValue) return "";
  if (!dateValue) return "";
  if (!timeValue) return dateValue;
  return `${dateValue}T${timeValue}`;
}

export function getCommonPathPrefix(paths) {
  const normalizedPaths = (Array.isArray(paths) ? paths : [])
    .filter((path) => Array.isArray(path) && path.length > 0)
    .map((path) => path.map((segment) => String(segment || "").trim()).filter(Boolean))
    .filter((path) => path.length > 0);

  if (normalizedPaths.length === 0) return [];
  if (normalizedPaths.length === 1) return normalizedPaths[0];

  const shortestLength = Math.min(...normalizedPaths.map((path) => path.length));
  const prefix = [];

  for (let index = 0; index < shortestLength; index += 1) {
    const current = normalizedPaths[0][index];
    if (!current) break;
    const matches = normalizedPaths.every((path) => path[index] === current);
    if (!matches) break;
    prefix.push(current);
  }

  return prefix;
}

export function formatCurrency(amount) {
  const value = Number(amount || 0);
  return `Rs${value.toLocaleString("en-IN")}`;
}

export function getCartHierarchyLabel(item) {
  const path = Array.isArray(item?.categoryPath)
    ? item.categoryPath
    : Array.isArray(item?.nodePath)
      ? item.nodePath
      : [];

  const normalizedPath = path
    .map((segment) => String(segment || "").trim())
    .filter(Boolean);

  if (normalizedPath.length > 0) {
    return normalizedPath.join(" - ");
  }

  return String(item?.name || item?.serviceName || "Service").trim() || "Service";
}

export function normalizeCartItems(cartItems) {
  return (Array.isArray(cartItems) ? cartItems : []).map((item, index) => {
    const categoryPath = Array.isArray(item?.categoryPath)
      ? item.categoryPath
      : Array.isArray(item?.nodePath)
        ? item.nodePath
        : [];
    const qty = Number(item?.qty || 0) || 1;
    const unitPrice = Number(item?.price || 0) || 0;
    const total = Number(item?.total || 0) || unitPrice * qty;

    return {
      cartKey: String(item?.cartKey || item?.itemId || `cart-item-${index}`),
      itemId: String(item?.itemId || item?.categoryId || item?._id || item?.id || ""),
      categoryId: String(item?.categoryId || item?.itemId || item?._id || item?.id || ""),
      name: String(item?.name || "").trim(),
      label: getCartHierarchyLabel(item),
      qty,
      price: unitPrice,
      total,
      mrp: item?.mrp == null || item?.mrp === "" ? null : Number(item.mrp) || null,
      discountPercent:
        item?.discountPercent == null || item?.discountPercent === ""
          ? null
          : Number(item.discountPercent) || null,
      itemCode: String(item?.itemCode || "").trim(),
      unitLabel: String(item?.unitLabel || "").trim(),
      categoryPath: categoryPath.map((segment) => String(segment || "").trim()).filter(Boolean),
      categoryPathIds: (Array.isArray(item?.categoryPathIds) ? item.categoryPathIds : [])
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    };
  });
}
