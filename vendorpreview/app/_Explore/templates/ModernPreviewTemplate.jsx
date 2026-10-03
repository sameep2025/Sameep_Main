"use client";

import { useEffect, useMemo, useState } from "react";
import { LuLogOut } from "react-icons/lu";
import { API_BASE_URL } from "../../../config";
import { SOCIAL_ICONS } from "../../Icons/SocialIcons";
import {
  buildVendorPreviewAnalyticsPayload,
  trackVendorPreviewEvent,
} from "../../utils/siteAnalytics";
import { openAdminDashboard, openAdminMenu } from "../../utils/adminQuickActions";
import "./ModernPreviewTemplate.css";

const DEFAULT_NAV = [
  { label: "Services", href: "#services" },
  { label: "Our Story", href: "#our-story" },
  { label: "Contact", href: "#contact" },
];

const GOOGLE_TRANSLATE_ENDPOINT =
  "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=te&dt=t&q=";

const heroTranslationCache = new Map();

function getPoweredByUrl() {
  return (
    process.env.NEXT_PUBLIC_VENDOR_PREVIEW_ROOT_URL ||
    process.env.NEXT_PUBLIC_PREVIEW_BASE_URL ||
    "http://localhost:4000"
  )
    .trim()
    .replace(/\/$/, "");
}

async function translateTeluguText(text) {
  const normalized = String(text || "").trim();
  if (!normalized) return normalized;
  if (/[\u0C00-\u0C7F]/.test(normalized)) return normalized;
  if (heroTranslationCache.has(normalized)) return heroTranslationCache.get(normalized);

  try {
    const translateChunk = async (value) => {
      const response = await fetch(
        `${GOOGLE_TRANSLATE_ENDPOINT}${encodeURIComponent(value)}`
      );
      const data = await response.json();
      return Array.isArray(data?.[0])
        ? data[0].map((part) => part?.[0] || "").join("").trim()
        : "";
    };

    let translated = await translateChunk(normalized);

    if (!translated || translated === normalized) {
      const chunks = normalized
        .split(/(?<=[,.!?])\s+/)
        .map((part) => part.trim())
        .filter(Boolean);

      if (chunks.length > 1) {
        const translatedChunks = [];
        for (const chunk of chunks) {
          const translatedChunk = await translateChunk(chunk);
          translatedChunks.push(translatedChunk || chunk);
        }
        translated = translatedChunks.join(" ");
      }
    }

    const finalValue = translated || normalized;
    heroTranslationCache.set(normalized, finalValue);
    return finalValue;
  } catch {
    heroTranslationCache.set(normalized, normalized);
    return normalized;
  }
}

function getEnquiryFieldLabel(field) {
  const override = String(field?.labelOverride || "").trim();
  if (override) return override;
  return String(field?.name || "Question").trim();
}

function getEnquiryFieldPlaceholder(field) {
  const override = String(field?.placeholderOverride || "").trim();
  if (override) return override;
  return `Enter ${String(getEnquiryFieldLabel(field) || "value").toLowerCase()}`;
}

function getEnquiryTypeLabel(enquiryType) {
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

function getEnquiryInputType(fieldType) {
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

function getTimeSlotOptions() {
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
  const normalizedLower = normalized.toLowerCase();

  if (
    normalizedLower === "24 hours" ||
    normalizedLower === "open 24 hours" ||
    normalizedLower === "open 24 hrs" ||
    normalizedLower === "24 hrs" ||
    normalizedLower === "24/7" ||
    normalizedLower === "open 24/7"
  ) {
    return {
      startMinutes: 0,
      endMinutes: 24 * 60,
    };
  }
  if (normalizedLower.includes("closed")) return null;

  const match = normalized.match(
    /(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*(?:-|to)\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i
  );

  if (!match) return null;

  const [
    ,
    startHour,
    startMinute = "00",
    startMeridiem,
    endHour,
    endMinute = "00",
    endMeridiem,
  ] = match;
  const start = parseHourMinuteTo24Hour(`${startHour}:${startMinute}`, startMeridiem);
  const end = parseHourMinuteTo24Hour(`${endHour}:${endMinute}`, endMeridiem);

  const startMinutes = start.hour * 60 + start.minute;
  let endMinutes = end.hour * 60 + end.minute;

  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
  }

  return {
    startMinutes,
    endMinutes,
  };
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

function getTimeSlotOptionsForDate(businessHours, dateValue) {
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

function splitDateTimeValue(value) {
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

function mergeDateTimeValue(dateValue, timeValue) {
  if (!dateValue && !timeValue) return "";
  if (!dateValue) return "";
  if (!timeValue) return dateValue;
  return `${dateValue}T${timeValue}`;
}

function isLikelyPhoneField(field) {
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

function sanitizeEnquiryValue(field, rawValue) {
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

function getEnquiryInputMode(field) {
  if (isLikelyPhoneField(field)) return "numeric";

  const inputType = getEnquiryInputType(field?.fieldType);
  if (inputType === "number") return "numeric";
  if (inputType === "email") return "email";
  if (inputType === "tel") return "tel";
  return undefined;
}

function formatDateInputValue(date, inputType) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";

  const pad = (value) => String(value).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());

  if (inputType === "date") {
    return `${year}-${month}-${day}`;
  }

  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function getEnquiryDateConstraints(field) {
  const inputType = getEnquiryInputType(field?.fieldType);
  if (!["date", "datetime-local"].includes(inputType)) {
    return {};
  }

  const rules = field?.rules || {};
  const now = new Date();
  const constraints = {};

  if (rules.noPastDates) {
    constraints.min = formatDateInputValue(now, inputType);
  }

  if (rules.maxDaysAhead != null && rules.maxDaysAhead !== "") {
    const maxDate = new Date(now);
    maxDate.setDate(maxDate.getDate() + Number(rules.maxDaysAhead || 0));
    constraints.max = formatDateInputValue(maxDate, inputType);
  }

  return constraints;
}

function getEnquiryDateOnlyConstraints(field) {
  const constraints = getEnquiryDateConstraints(field);
  const normalize = (value) => (String(value || "").includes("T") ? String(value).split("T")[0] : value);

  return {
    min: constraints.min ? normalize(constraints.min) : undefined,
    max: constraints.max ? normalize(constraints.max) : undefined,
  };
}

function scrollToElementById(id) {
  if (typeof window === "undefined") return;
  const target = document.getElementById(id);
  if (!target) return;

  target.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function formatCurrency(value) {
  const amount = Number(value || 0);
  if (amount <= 0) return "Contact";
  return `₹${amount.toLocaleString("en-IN")}`;
}

function toAnchor(label) {
  return String(label || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");
}

function normalizeSocialKey(label) {
  return String(label || "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

function getSocialHref(key, value) {
  if (!value) return "#";
  if (value.startsWith("http")) return value;
  if (key === "email") return `mailto:${value}`;
  if (key === "whatsapp") {
    const digits = String(value).replace(/\D/g, "");
    const normalized =
      digits.length === 10
        ? `91${digits}`
        : digits.length === 11 && digits.startsWith("0")
        ? `91${digits.slice(1)}`
        : digits;
    return normalized ? `https://wa.me/${normalized}` : "#";
  }
  return `https://${key}.com/${value}`;
}

function buildCartPath(...segments) {
  const normalized = segments
    .map((segment) => String(segment || "").trim())
    .filter(Boolean);

  return normalized.filter((segment, index) => {
    if (index === 0) return true;
    return segment.toLowerCase() !== normalized[index - 1].toLowerCase();
  });
}

function getCartHierarchyLabel(item) {
  const pathSource = Array.isArray(item?.nodePath) && item.nodePath.length > 0
    ? item.nodePath
    : Array.isArray(item?.categoryPath)
      ? item.categoryPath
      : [];
  const path = Array.isArray(pathSource)
    ? pathSource
        .map((segment) => String(segment || "").trim())
        .filter(Boolean)
    : [];
  const itemName = String(item?.name || "").trim();

  if (path.length === 0) return itemName || "Selected service";
  if (!itemName) return path.join(" - ");

  const lastPathSegment = path[path.length - 1];
  if (lastPathSegment?.toLowerCase() === itemName.toLowerCase()) {
    return path.join(" - ");
  }

  return [...path, itemName].join(" - ");
}

function getCommonPathPrefix(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return [];

  const normalizedPaths = paths
    .filter((path) => Array.isArray(path) && path.length > 0)
    .map((path) =>
      path.map((segment) => String(segment || "").trim()).filter(Boolean)
    )
    .filter((path) => path.length > 0);

  if (normalizedPaths.length === 0) return [];

  const shortestLength = Math.min(...normalizedPaths.map((path) => path.length));
  const prefix = [];

  for (let index = 0; index < shortestLength; index += 1) {
    const candidate = normalizedPaths[0][index];
    const matches = normalizedPaths.every(
      (path) => String(path[index] || "").toLowerCase() === candidate.toLowerCase()
    );

    if (!matches) break;
    prefix.push(candidate);
  }

  return prefix;
}

function getCardImage(card) {
  if (card?.img) return card.img;

  if (Array.isArray(card?.options)) {
    for (const option of card.options) {
      if (option?.imageUrl) return option.imageUrl;

      if (Array.isArray(option?.subOptions)) {
        for (const subOption of option.subOptions) {
          if (subOption?.imageUrl) return subOption.imageUrl;
        }
      }
    }
  }

  return "";
}

function getCardDescription(card) {
  if (card?.offerText?.trim()) return card.offerText.trim();
  return "";
}

function isOffersLabel(value) {
  return String(value || "").trim().toLowerCase() === "offers";
}

function isOfferLikeCard(card, sectionName) {
  if (!card) return false;
  if (isOffersLabel(sectionName)) return true;
  if (isOffersLabel(card.title)) return true;

  const hasOptionOffers =
    Array.isArray(card.options) &&
    card.options.some((option) => {
      const ownOffer = typeof option?.offerText === "string" && option.offerText.trim();
      const nestedOffer =
        Array.isArray(option?.subOptions) &&
        option.subOptions.some((subOption) => {
          const subOffer = typeof subOption?.offerText === "string" && subOption.offerText.trim();
          const deepOffer =
            Array.isArray(subOption?.subSubOptions) &&
            subOption.subSubOptions.some(
              (leaf) => typeof leaf?.offerText === "string" && leaf.offerText.trim()
            );
          return subOffer || deepOffer;
        });
      return ownOffer || nestedOffer;
    });

  return hasOptionOffers && isOffersLabel(card.title);
}

function flattenOfferCards(cards, sectionName) {
  return (cards || []).flatMap((card, cardIndex) => {
    if (!isOfferLikeCard(card, sectionName)) return [];

    const sourceLabel = !isOffersLabel(sectionName)
      ? sectionName
      : !isOffersLabel(card?.title)
        ? card.title
        : "";

    const normalizedCard = {
      ...card,
      id: card?.id || `offer-${cardIndex}`,
      title: card?.title || `Offer ${cardIndex + 1}`,
      sourceLabel,
    };

    if (Array.isArray(card?.options) && card.options.length > 0) {
      return card.options
        .map((option, optionIndex) => ({
          id: `${normalizedCard.id}-option-${optionIndex}`,
          title: option?.label || normalizedCard.title,
          offerText: option?.offerText || normalizedCard.offerText || "",
          terms: option?.terms || normalizedCard.terms || [],
          img: option?.imageUrl || normalizedCard.img || "",
          sourceLabel: normalizedCard.sourceLabel,
        }))
        .filter((offer) => {
          const hasText = typeof offer.offerText === "string" && offer.offerText.trim();
          const hasTerms = Array.isArray(offer.terms)
            ? offer.terms.length > 0
            : !!String(offer.terms || "").trim();
          return offer.title || hasText || hasTerms;
        });
    }

    const hasText =
      typeof normalizedCard.offerText === "string" && normalizedCard.offerText.trim();
    const hasTerms = Array.isArray(normalizedCard.terms)
      ? normalizedCard.terms.length > 0
      : !!String(normalizedCard.terms || "").trim();

    return normalizedCard.title || hasText || hasTerms ? [normalizedCard] : [];
  });
}

function getOfferCards(orderedCategories) {
  return (orderedCategories || []).flatMap((section) =>
    flattenOfferCards(section?.cards, section?.sectionName)
  );
}

function isDisplayableCard(card) {
  if (!card) return false;
  if (card.simple) return true;
  if (Number(card.base || 0) > 0) return true;
  if (Array.isArray(card.terms) && card.terms.length > 0) return true;
  if (typeof card.offerText === "string" && card.offerText.trim()) return true;
  if (typeof card.packagesIncludes === "string" && card.packagesIncludes.trim()) return true;
  if (Array.isArray(card.options) && card.options.length > 0) return true;
  return false;
}

function getTermsSummary(terms) {
  if (Array.isArray(terms) && terms.length > 0) {
    return terms.map((item) => String(item || "").trim()).filter(Boolean).join(" • ");
  }

  if (typeof terms === "string" && terms.trim()) {
    return terms.trim();
  }

  return "";
}

function getPackageSummary(packagesIncludes) {
  return String(packagesIncludes || "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join(" • ");
}

function renderPriceText(value, { startsFrom = false } = {}) {
  const formatted = formatCurrency(value);
  if (formatted === "Contact") return formatted;
  return startsFrom ? `Starts from ${formatted}` : formatted;
}

function prettifyLabel(key, { isTelugu = false } = {}) {
  const normalized = String(key || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.toLowerCase() === "experience years") {
    if (isTelugu) return "అనుభవ సంవత్సరాలు";
    return "Years Experience";
  }

  if (isTelugu) {
    const lower = normalized.toLowerCase();
    if (lower === "customers served") return "సేవలందించిన కస్టమర్లు";
    if (lower === "google rating") return "గూగుల్ రేటింగ్";
    if (lower === "service points") return "సేవ పాయింట్లు";
    if (lower === "branches") return "శాఖలు";
  }

  return normalized;
}

function getStatAccent(label) {
  const normalized = String(label || "").toLowerCase();

  if (normalized.includes("google rating")) return "star";
  if (normalized.includes("experience")) return "years";
  if (
    normalized.includes("stylist") ||
    normalized.includes("trainer") ||
    normalized.includes("team")
  ) {
    return "team";
  }
  if (normalized.includes("customer")) return "reach";
  return "info";
}

function splitHeroDescription(text) {
  const normalized = String(text || "").trim();
  if (!normalized) return { lead: "", supporting: "" };

  const parts = normalized
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    return { lead: normalized, supporting: "" };
  }

  return {
    lead: parts[0],
    supporting: parts.slice(1).join(" "),
  };
}

function buildFallbackHeroSummary({ categoryName, address, isTelugu = false }) {
  const place = String(address || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(", ");

  if (categoryName && place) {
    if (isTelugu) {
      return `${place}లో ప్రీమియం ${String(categoryName).toLowerCase()} సేవలు.`;
    }
    return `Premium ${String(categoryName).toLowerCase()} services in ${place}.`;
  }

  if (categoryName) {
    if (isTelugu) {
      return `రోజువారీ సంరక్షణ కోసం ప్రత్యేకంగా రూపొందించిన ప్రీమియం ${String(categoryName).toLowerCase()} సేవలు.`;
    }
    return `Premium ${String(categoryName).toLowerCase()} services tailored for everyday care.`;
  }

  return "";
}

function stripDuplicateTrustPhrases(text) {
  const normalized = String(text || "").trim();
  if (!normalized) return "";

  const cleaned = normalized
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => {
      const lower = part.toLowerCase();
      if (lower.includes("rated") && lower.includes("google")) return false;
      if (lower.includes("year") && lower.includes("experience")) return false;
      if (lower.includes("customer served")) return false;
      if (lower.includes("google rating")) return false;
      return true;
    })
    .join(" ");

  return cleaned || normalized;
}

function getRefinedHeroCopy({ heroDescription, categoryName, address, isTelugu = false }) {
  const stripped = stripDuplicateTrustPhrases(heroDescription);
  const fallback = buildFallbackHeroSummary({ categoryName, address, isTelugu });
  const source = stripped || fallback;
  return splitHeroDescription(source);
}

function getHeroHighlights({
  vendorInfo,
  categoryName,
  isTelugu = false,
}) {
  const customHighlights = Array.isArray(vendorInfo?.customFields?.quickHighlights)
    ? vendorInfo.customFields.quickHighlights
        .map((item) => String(item || "").trim().slice(0, 80))
        .filter(Boolean)
        .slice(0, 3)
    : [];

  if (customHighlights.length > 0) {
    return customHighlights;
  }

  const highlights = [];
  const address = String(vendorInfo?.location?.address || "").trim();
  const addressParts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (categoryName) {
    if (isTelugu) {
      highlights.push(`మీ అవసరాలకు అనుగుణంగా ${categoryName} అనుభవాలు`);
    } else {
    highlights.push(`${categoryName} experiences tailored to your needs`);
    }
  }

  if (addressParts.length > 0) {
    highlights.push(addressParts.slice(0, 2).join(", "));
  }

  if (typeof vendorInfo?.googlePlace?.rating === "number") {
    if (isTelugu) {
      highlights.push(`గూగుల్‌లో ${vendorInfo.googlePlace.rating}* రేటింగ్`);
    } else {
      highlights.push(`Rated ${vendorInfo.googlePlace.rating}* on Google`);
    }
  }

  return highlights.slice(0, 3);
}

function ModernServiceRow({ card, sectionName, onAddToCart }) {
  const [selectedMain, setSelectedMain] = useState(card?.defaultMain || card?.options?.[0]?.label || null);
  const [selectedSub, setSelectedSub] = useState(card?.defaultSub || null);
  const [selectedSubSub, setSelectedSubSub] = useState(null);

  const mainOption =
    card?.options?.find((option) => option.label === selectedMain) ||
    card?.options?.[0] ||
    null;
  const effectiveSelectedMain = mainOption?.label || null;

  const secondaryOptions = Array.isArray(mainOption?.subOptions) ? mainOption.subOptions : [];
  const subOption =
    secondaryOptions.find((option) => option.label === selectedSub) ||
    secondaryOptions.find((option) => option.label === card?.defaultSub) ||
    secondaryOptions[0] ||
    null;
  const effectiveSelectedSub = subOption?.label || null;

  const tertiaryOptions = Array.isArray(subOption?.subSubOptions) ? subOption.subSubOptions : [];
  const subSubOption =
    tertiaryOptions.find((option) => option.label === selectedSubSub) ||
    tertiaryOptions[0] ||
    null;
  const effectiveSelectedSubSub = subSubOption?.label || null;

  const currentImage =
    subSubOption?.imageUrl ||
    subOption?.imageUrl ||
    mainOption?.imageUrl ||
    getCardImage(card);

  const hasHierarchy = Array.isArray(card?.options) && card.options.length > 0;
  const currentDescription = hasHierarchy ? "" : getCardDescription(card);

  const optionStartingPrice = (option) => {
    if (!option) return 0;
    if (Array.isArray(option.subOptions) && option.subOptions.length > 0) {
      const nestedPrices = option.subOptions.flatMap((child) => {
        if (Array.isArray(child.subSubOptions) && child.subSubOptions.length > 0) {
          return child.subSubOptions.map((leaf) => Number(option.price || 0) + Number(leaf.price || 0));
        }
        return [Number(option.price || 0) + Number(child.price || 0)];
      });

      return nestedPrices.length > 0 ? Math.min(...nestedPrices) : Number(option.price || 0);
    }

    return Number(option.price || 0);
  };

  const currentPackagesIncludes =
    (selectedSubSub ? subSubOption?.packagesIncludes : "") ||
    (selectedSub && !selectedSubSub ? subOption?.packagesIncludes : "") ||
    (!secondaryOptions.length ? mainOption?.packagesIncludes : "") ||
    card?.packagesIncludes ||
    "";
  const currentTerms =
    (selectedSubSub ? subSubOption?.terms : null) ||
    (selectedSub && !selectedSubSub ? subOption?.terms : null) ||
    (!secondaryOptions.length ? mainOption?.terms : null) ||
    card?.terms ||
    null;

  let currentPrice = Number(card?.base || 0);

  if (card?.simple) {
    currentPrice = Number(card?.base || 0);
  } else if (!selectedMain) {
    currentPrice = Number(card?.base || 0);
  } else if (!selectedSub && mainOption) {
    currentPrice = optionStartingPrice(mainOption) || Number(card?.base || 0);
  } else {
    let total = Number(mainOption?.price || 0);

    if (subOption && !subOption?.subSubOptions) {
      total += Number(subOption?.price || 0);
    }

    if (subSubOption) {
      total += Number(subSubOption?.price || 0);
    }

    currentPrice = total || Number(card?.base || 0);
  }

  const handleAddSelected = () => {
    if (typeof onAddToCart !== "function") return;

    const categoryPath = buildCartPath(
      sectionName,
      card.title,
      selectedMain,
      selectedSub,
      selectedSubSub
    );
    const serviceId = card.id || card._id || card.categoryId || card.title;
    const serviceName = selectedSubSub || selectedSub || selectedMain || card.title;
    const cartKey = [serviceId, selectedMain, selectedSub, selectedSubSub].filter(Boolean).join("_");

    onAddToCart(
      {
        _id: serviceId,
        categoryId: serviceId,
        cartKey,
        name: serviceName,
        price: Number(currentPrice) || 0,
      },
      categoryPath,
      []
    );
  };

  const renderMenuText = (label, terms, packagesIncludes) => {
    const summary = getTermsSummary(terms);
    const packageSummary = getPackageSummary(packagesIncludes);

    return (
      <span className="modern-menu-copy">
        <span className="modern-menu-name">{label}</span>
        {summary ? (
          <span className="modern-menu-meta">
            <span className="modern-menu-meta-label">Terms</span>
            <span className="modern-menu-terms">{summary}</span>
          </span>
        ) : null}
        {packageSummary ? (
          <span className="modern-menu-meta">
            <span className="modern-menu-meta-label">Package Includes</span>
            <span className="modern-menu-package-line">{packageSummary}</span>
          </span>
        ) : null}
      </span>
    );
  };

  const renderMenuBranch = () => {
    if (!Array.isArray(card?.options) || card.options.length === 0) return null;

    return (
      <div className="modern-menu-tree">
        {card.options.map((option) => {
          const isSelectedMain = effectiveSelectedMain === option.label;
          const hasChildren = Array.isArray(option.subOptions) && option.subOptions.length > 0;

          return (
            <div
              key={`${card.id}-${option.label}`}
              className={`modern-menu-group ${isSelectedMain ? "is-active" : ""}`}
            >
              <button
                type="button"
                className={`modern-menu-row modern-menu-row-main ${isSelectedMain ? "is-active" : ""}`}
                onClick={() => {
                  setSelectedMain(option.label);

                  if (!hasChildren) {
                    setSelectedSub(null);
                    setSelectedSubSub(null);
                    return;
                  }

                  setSelectedSub(null);
                  setSelectedSubSub(null);
                }}
              >
                {renderMenuText(
                  option.label,
                  hasChildren ? null : option.terms,
                  hasChildren ? null : option.packagesIncludes
                )}
                <span className="modern-menu-dots" />
                <span className={`modern-menu-price ${hasChildren ? "is-starting" : ""}`}>
                  {renderPriceText(optionStartingPrice(option), { startsFrom: hasChildren })}
                </span>
              </button>

              {isSelectedMain && hasChildren ? (
                <div className="modern-menu-children">
                  {option.subOptions.map((child) => {
                    const hasGrandChildren = Array.isArray(child.subSubOptions) && child.subSubOptions.length > 0;
                    const isSelectedSub = effectiveSelectedSub === child.label;

                    if (hasGrandChildren) {
                      return (
                        <div
                          key={`${card.id}-${option.label}-${child.label}`}
                          className={`modern-menu-subgroup ${isSelectedSub ? "is-active" : ""}`}
                        >
                          <button
                            type="button"
                            className={`modern-menu-subgroup-title ${isSelectedSub ? "is-active" : ""}`}
                            onClick={() => {
                              setSelectedSub(child.label);
                              setSelectedSubSub(null);
                            }}
                          >
                            {child.label}
                          </button>

                          <div className="modern-menu-grandchildren">
                            {child.subSubOptions.map((leaf) => {
                              const isSelectedLeaf = isSelectedSub && effectiveSelectedSubSub === leaf.label;

                              return (
                                <button
                                  key={`${card.id}-${child.label}-${leaf.label}`}
                                  type="button"
                                  className={`modern-menu-row modern-menu-row-leaf ${isSelectedLeaf ? "is-active" : ""}`}
                                  onClick={() => {
                                    setSelectedSub(child.label);
                                    setSelectedSubSub(leaf.label);
                                  }}
                                >
                                  {renderMenuText(leaf.label, leaf.terms, leaf.packagesIncludes)}
                                  <span className="modern-menu-dots" />
                                  <span className="modern-menu-price">
                                    {renderPriceText(Number(option.price || 0) + Number(leaf.price || 0))}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <button
                        key={`${card.id}-${option.label}-${child.label}`}
                        type="button"
                        className={`modern-menu-row modern-menu-row-child ${isSelectedSub ? "is-active" : ""}`}
                        onClick={() => {
                          setSelectedSub(child.label);
                          setSelectedSubSub(null);
                        }}
                      >
                        {renderMenuText(child.label, child.terms, child.packagesIncludes)}
                        <span className="modern-menu-dots" />
                        <span className="modern-menu-price">
                          {renderPriceText(Number(option.price || 0) + Number(child.price || 0))}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <article className="modern-service-row">
      <div className="modern-service-media">
        {currentImage ? <img src={currentImage} alt={card.title} /> : <span>{card.title.charAt(0)}</span>}
      </div>
      <div className="modern-service-copy">
        <h3>{card.title}</h3>
        {currentDescription ? <p>{currentDescription}</p> : null}
        {!hasHierarchy && (getTermsSummary(currentTerms) || getPackageSummary(currentPackagesIncludes)) ? (
          <div className="modern-inline-package-copy">
            {getTermsSummary(currentTerms) ? (
              <div className="modern-inline-meta-block">
                <div className="modern-inline-meta-label">Terms</div>
                <div className="modern-inline-meta-value">{getTermsSummary(currentTerms)}</div>
              </div>
            ) : null}
            {getPackageSummary(currentPackagesIncludes) ? (
              <div className="modern-inline-meta-block">
                <div className="modern-inline-meta-label">Package Includes</div>
                <div className="modern-inline-meta-value">{getPackageSummary(currentPackagesIncludes)}</div>
              </div>
            ) : null}
          </div>
        ) : null}

        {!card?.simple && Array.isArray(card?.options) && card.options.length > 0 ? (
          renderMenuBranch()
        ) : null}

        <div className="modern-row-actions">
          <button type="button" className="modern-row-add-btn" onClick={handleAddSelected}>
            Add to Cart
          </button>
          <span className="modern-row-price">{formatCurrency(currentPrice)}</span>
        </div>
      </div>
    </article>
  );
}

export default function ModernPreviewTemplate({
  vendorInfo,
  category,
  enquiryConfig,
  orderedCategories,
  sectionsWithHeading,
  cardsWithoutHeading,
  mergedHeroImages,
  vendorGalleryImages,
  heroTagline,
  heroDescription,
  onOpenMenu,
  onOpenGallery,
  cartItems,
  cartTotal,
  onAddToCart,
  onIncreaseQty,
  onDecreaseQty,
  templateVariant = "modern",
  colorScheme = "ivory",
}) {
  const isTelugu = String(vendorInfo?.languagePreference || "").trim().toLowerCase() === "te";
  const isAstrologyTheme = templateVariant === "astrology";
  const modernThemeKey =
    String(colorScheme || "ivory").trim().toLowerCase() || "ivory";
  const [serviceModeLabel, setServiceModeLabel] = useState("Service Modes");
  const [activeSectionName, setActiveSectionName] = useState("");
  const [activeCardId, setActiveCardId] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [galleryStartIndex, setGalleryStartIndex] = useState(0);
  const [hasVendorSession, setHasVendorSession] = useState(false);
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  const [selectedInquiryInterest, setSelectedInquiryInterest] = useState("");
  const [dynamicInquiryValues, setDynamicInquiryValues] = useState({});
  const [isSubmittingInquiry, setIsSubmittingInquiry] = useState(false);
  const [inquiryFeedback, setInquiryFeedback] = useState("");
  const [translatedHeroCopy, setTranslatedHeroCopy] = useState(null);
  const [activeShowcaseItemIndex, setActiveShowcaseItemIndex] = useState(null);
  const [activeShowcaseImageIndex, setActiveShowcaseImageIndex] = useState(0);

  const navItems = useMemo(() => {
    const webMenu = Array.isArray(category?.webMenu) ? category.webMenu : [];
    const mapped = webMenu
      .map((item) => {
        const normalized = String(item || "").trim().toLowerCase();
        if (!normalized) return null;

        if (normalized === "categories") return { label: item, href: "#services" };
        if (normalized === "gallery") return { label: item, href: "#gallery", action: "gallery" };
        if (normalized === "about" || normalized === "why us") {
          return { label: item, href: "#our-story" };
        }
        if (normalized === "contact") return { label: item, href: "#contact" };
        return { label: item, href: `#${toAnchor(item)}` };
      })
      .filter(Boolean);

    return mapped.length > 0 ? mapped : DEFAULT_NAV;
  }, [category]);

  const handleNavClick = (event, item) => {
    if (item?.action === "gallery") {
      event.preventDefault();
      onOpenGallery?.();
      setMobileMenuOpen(false);
    }
  };

  const heroCopy = useMemo(
    () =>
      getRefinedHeroCopy({
        heroDescription,
        categoryName: category?.name,
        address: vendorInfo?.location?.address,
        isTelugu,
      }),
    [category?.name, heroDescription, vendorInfo?.location?.address, isTelugu]
  );

  useEffect(() => {
    let cancelled = false;

    if (!isTelugu) {
      setTranslatedHeroCopy(null);
      return undefined;
    }

    const translateHeroCopy = async () => {
      const lead = await translateTeluguText(heroCopy?.lead || "");
      const supporting = await translateTeluguText(heroCopy?.supporting || "");
      if (!cancelled) {
        setTranslatedHeroCopy({
          lead,
          supporting,
        });
      }
    };

    translateHeroCopy();

    return () => {
      cancelled = true;
    };
  }, [heroCopy?.lead, heroCopy?.supporting, isTelugu]);

  const displayHeroCopy = isTelugu && translatedHeroCopy ? translatedHeroCopy : heroCopy;
  const trustSummary = vendorInfo?.trustSummary || vendorInfo?.trust || {};
  const trustEntries = Object.entries(trustSummary || {}).filter(
    ([, value]) => value !== null && value !== undefined && value !== ""
  );
  const trustCategoryId = vendorInfo?.categoryId || category?._id || category?.id;
  const [trustQuestionLabels, setTrustQuestionLabels] = useState({});
  const serviceModeEntry = trustEntries.find(
    ([key, value]) =>
      Array.isArray(value) &&
      /(service|mode|delivery|format|type)/i.test(String(key))
  );
  const serviceModes = Array.isArray(serviceModeEntry?.[1])
    ? serviceModeEntry[1].map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const serviceModeTrustKey = String(serviceModeEntry?.[0] || "").trim();
  const listTrustEntries = trustEntries
    .filter(([, value]) => Array.isArray(value))
    .map(([key, value]) => ({
      key,
      label: trustQuestionLabels[key] || prettifyLabel(key, { isTelugu }),
      values: value.map((item) => String(item || "").trim()).filter(Boolean),
    }))
    .filter((entry) => entry.values.length > 0);
  const extraListEntries = listTrustEntries.filter((entry) => entry.key !== serviceModeTrustKey);
  const statEntries = Object.entries(trustSummary).filter(([key, value]) => {
    if (value === null || value === undefined || value === "") return false;
    if (key === serviceModeTrustKey) return false;
    return !Array.isArray(value);
  });
  const mapsLink = useMemo(() => {
    const googleMapsUrl = vendorInfo?.googlePlace?.mapsUrl;
    if (!googleMapsUrl) return "#";

    let placeId = "";
    if (googleMapsUrl.startsWith("place_id:")) {
      placeId = googleMapsUrl.replace("place_id:", "");
    } else if (googleMapsUrl.includes("place_id:")) {
      placeId = googleMapsUrl.split("place_id:")[1];
    }

    if (!placeId) return googleMapsUrl;

    const queryName = encodeURIComponent(heroTagline || vendorInfo?.businessName || "");
    return `https://www.google.com/maps/search/?api=1&query=${queryName}&query_place_id=${placeId}`;
  }, [heroTagline, vendorInfo?.businessName, vendorInfo?.googlePlace?.mapsUrl]);
  const socialsToRender = useMemo(() => {
    const socialLinks = vendorInfo?.socialLinks || {};
    const enabledSocials = Array.isArray(category?.socialHandle)
      ? category.socialHandle
          .map((label) => normalizeSocialKey(label))
          .filter((key) => Boolean(key) && Boolean(SOCIAL_ICONS[key]))
      : [];

    const buildWhatsappEntry = () => {
      const whatsappValue = String(socialLinks.whatsapp || vendorInfo?.phone || "").trim();
      return whatsappValue ? { key: "whatsapp", value: whatsappValue } : null;
    };

    if (enabledSocials.length > 0) {
      const mapped = enabledSocials
        .map((key) => {
          const value = String(
            key === "whatsapp" ? socialLinks.whatsapp || vendorInfo?.phone || "" : socialLinks[key] || ""
          ).trim();
          if (!value || !SOCIAL_ICONS[key]) return null;
          return { key, value };
        })
        .filter(Boolean);

      if (!mapped.some(({ key }) => key === "whatsapp")) {
        const whatsappEntry = buildWhatsappEntry();
        if (whatsappEntry) mapped.push(whatsappEntry);
      }

      return mapped;
    }

    const mapped = Object.entries(socialLinks)
      .map(([key, rawValue]) => {
        const normalizedKey = normalizeSocialKey(key);
        const value = String(rawValue || "").trim();
        if (!value || !SOCIAL_ICONS[normalizedKey]) return null;
        return { key: normalizedKey, value };
      })
      .filter(Boolean);

    if (!mapped.some(({ key }) => key === "whatsapp")) {
      const whatsappEntry = buildWhatsappEntry();
      if (whatsappEntry) mapped.push(whatsappEntry);
    }

    return mapped;
  }, [category, vendorInfo?.phone, vendorInfo?.socialLinks]);

  useEffect(() => {
    let cancelled = false;

    async function loadTrustQuestionMeta() {
      if (!trustCategoryId || listTrustEntries.length === 0) {
        if (!cancelled) {
          setServiceModeLabel("Service Modes");
          setTrustQuestionLabels({});
        }
        return;
      }

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/trust/questions?categoryId=${encodeURIComponent(String(trustCategoryId))}`
        );
        const data = await response.json();
        const questions = Array.isArray(data?.questions) ? data.questions : [];
        const labelMap = {};
        questions.forEach((question) => {
          const id = String(question?.id || "").trim();
          if (!id) return;
          labelMap[id] = String(question?.label || id);
        });

        if (!cancelled) {
          setTrustQuestionLabels(labelMap);
          setServiceModeLabel(
            String(
              (serviceModeTrustKey && labelMap[serviceModeTrustKey]) ||
              serviceModeTrustKey ||
              "Service Modes"
            )
          );
        }
      } catch {
        if (!cancelled) {
          setTrustQuestionLabels({});
          setServiceModeLabel(String(serviceModeTrustKey || "Service Modes"));
        }
      }
    }

    loadTrustQuestionMeta();

    return () => {
      cancelled = true;
    };
  }, [listTrustEntries.length, serviceModeTrustKey, trustCategoryId]);

  const serviceSections = useMemo(() => {
    const flatSections = [];

    (sectionsWithHeading || []).forEach((section) => {
      const normalized = String(section?.sectionName || "").trim().toLowerCase();
      if (normalized === "offers") return;

      const filteredCards = (Array.isArray(section.cards) ? section.cards : []).filter(
        (card) => !isOfferLikeCard(card, section.sectionName)
      );
      if (filteredCards.length === 0) return;

      flatSections.push({
        sectionName: section.sectionName,
        cards: filteredCards,
      });
    });

    if (Array.isArray(cardsWithoutHeading) && cardsWithoutHeading.length > 0) {
      const filteredStandaloneCards = cardsWithoutHeading.filter(
        (card) => !isOfferLikeCard(card, card?.title)
      );

      if (filteredStandaloneCards.length > 0) {
      flatSections.unshift({
        sectionName: "Featured Services",
        cards: filteredStandaloneCards,
      });
      }
    }

    return flatSections
      .map((section) => ({
        ...section,
        cards: section.cards
          .map((card, index) => ({
            ...card,
            id: card?.id || `${section.sectionName}-${index}`,
            title: card?.title || section.sectionName,
          }))
          .filter(isDisplayableCard),
      }))
      .filter((section) => section.cards.length > 0);
  }, [sectionsWithHeading, cardsWithoutHeading]);

  const rotatingGalleryImages = useMemo(() => {
    const serviceImages = [];

    serviceSections.forEach((section) => {
      (section.cards || []).forEach((card) => {
        const imageUrl = getCardImage(card);
        if (imageUrl) serviceImages.push(imageUrl);
      });
    });

    const galleryImages = Array.isArray(vendorGalleryImages)
      ? vendorGalleryImages.map((item) => String(item || "").trim()).filter(Boolean)
      : [];

    const fallbackImages = Array.isArray(mergedHeroImages)
      ? mergedHeroImages.map((item) => String(item || "").trim()).filter(Boolean)
      : [];

    const preferredPool = [...new Set([...galleryImages, ...serviceImages])];
    return preferredPool.length > 0 ? preferredPool : [...new Set(fallbackImages)];
  }, [mergedHeroImages, serviceSections, vendorGalleryImages]);

  useEffect(() => {
    if (rotatingGalleryImages.length <= 1) return undefined;

    const interval = window.setInterval(() => {
      setGalleryStartIndex((prev) => (prev + 1) % rotatingGalleryImages.length);
    }, 4000);

    return () => window.clearInterval(interval);
  }, [rotatingGalleryImages]);

  const rotatingGalleryWindow = useMemo(() => {
    if (rotatingGalleryImages.length === 0) return [];

    const count = Math.min(4, rotatingGalleryImages.length);
    return Array.from({ length: count }, (_, index) => {
      const imageIndex = (galleryStartIndex + index) % rotatingGalleryImages.length;
      return rotatingGalleryImages[imageIndex];
    });
  }, [galleryStartIndex, rotatingGalleryImages]);

  const heroImage = rotatingGalleryWindow[0] || "";
  const storyImages = rotatingGalleryWindow.slice(1);

  const offerCards = useMemo(() => getOfferCards(orderedCategories), [orderedCategories]);
  const vendorWhyUs =
    vendorInfo?.customFields?.whyUs && typeof vendorInfo.customFields.whyUs === "object"
      ? vendorInfo.customFields.whyUs
      : {};
  const vendorWhyUsCards = Array.isArray(vendorWhyUs?.cards)
    ? vendorWhyUs.cards.filter((card) => card?.title || card?.description)
    : [];
  const founderAbout =
    vendorInfo?.customFields?.founderAbout && typeof vendorInfo.customFields.founderAbout === "object"
      ? vendorInfo.customFields.founderAbout
      : {};
  const featureCards = vendorWhyUsCards.length
    ? vendorWhyUsCards
    : Array.isArray(category?.whyUs?.cards)
      ? category.whyUs.cards.filter(Boolean)
      : [];
  const about = category?.about || {};
  const storyHeading =
    String(vendorWhyUs?.heading || "").trim() ||
    about?.heading ||
    `Crafting confidence at ${vendorInfo?.businessName || "our studio"}`;
  const storyDescription =
    String(vendorWhyUs?.subHeading || "").trim() ||
    about?.mainText ||
    category?.whyUs?.subHeading ||
    heroDescription;
  const founderHeading = String(founderAbout?.heading || "").trim() || "Meet the Founder";
  const founderBody = String(founderAbout?.body || "").trim();
  const founderName = String(founderAbout?.founderName || "").trim();
  const founderRole = String(founderAbout?.founderRole || "").trim();
  const founderImageUrl = String(founderAbout?.founderImageUrl || "").trim();
  const founderParagraphs = founderBody
    ? founderBody
        .split(/\n\s*\n+/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
    : [];
  const showcaseSection =
    vendorInfo?.customFields?.showcaseSection &&
    typeof vendorInfo.customFields.showcaseSection === "object"
      ? vendorInfo.customFields.showcaseSection
      : {};
  const showcaseItems = Array.isArray(showcaseSection?.items)
    ? showcaseSection.items
        .map((item) => ({
          name: String(item?.name || item?.title || "").trim(),
          description: String(item?.description || "").trim(),
          imageUrls: Array.isArray(item?.imageUrls)
            ? item.imageUrls.map((url) => String(url || "").trim()).filter(Boolean)
            : [],
        }))
        .filter((item) => item.name || item.description || item.imageUrls.length)
    : [];
  const showcaseHeading = String(showcaseSection?.heading || "").trim() || "Featured Showcase";
  const showcaseSubHeading = String(showcaseSection?.subHeading || "").trim();
  const showcaseItemLabel = String(showcaseSection?.itemLabel || "").trim() || "Profile";
  const showFounderAbout =
    !isAstrologyTheme && Boolean(founderBody || founderName || founderRole || founderImageUrl);
  const showShowcaseSection = !isAstrologyTheme && showcaseItems.length > 0;
  const activeShowcaseItem =
    activeShowcaseItemIndex !== null && activeShowcaseItemIndex >= 0 && activeShowcaseItemIndex < showcaseItems.length
      ? showcaseItems[activeShowcaseItemIndex]
      : null;
  const activeShowcaseImageCount = Array.isArray(activeShowcaseItem?.imageUrls)
    ? activeShowcaseItem.imageUrls.length
    : 0;
  const activeShowcaseImage =
    activeShowcaseItem?.imageUrls?.[activeShowcaseImageIndex] || activeShowcaseItem?.imageUrls?.[0] || "";
  const canNavigateShowcaseImages = activeShowcaseImageCount > 1;
  const showPreviousShowcaseImage = () => {
    if (!canNavigateShowcaseImages) return;
    setActiveShowcaseImageIndex((prev) =>
      prev <= 0 ? activeShowcaseImageCount - 1 : prev - 1
    );
  };
  const showNextShowcaseImage = () => {
    if (!canNavigateShowcaseImages) return;
    setActiveShowcaseImageIndex((prev) =>
      prev >= activeShowcaseImageCount - 1 ? 0 : prev + 1
    );
  };
  const locationAddress = vendorInfo?.location?.address || "Location not available";
  const businessHours = Array.isArray(vendorInfo?.businessHours)
    ? vendorInfo.businessHours
    : Array.isArray(vendorInfo?.hours)
      ? vendorInfo.hours
      : [];
  const locationLat = Number(vendorInfo?.location?.lat);
  const locationLng = Number(vendorInfo?.location?.lng);
  const hasEmbeddedMap = Number.isFinite(locationLat) && Number.isFinite(locationLng);
  const phoneNumbers = [
    vendorInfo?.phone,
    ...(Array.isArray(vendorInfo?.secondaryPhones) ? vendorInfo.secondaryPhones : []),
  ].filter(Boolean);
  const poweredByUrl = getPoweredByUrl();
  const customerPortalUrl = `${poweredByUrl}/mybills`;
  const vendorId = vendorInfo?._id || vendorInfo?.vendorId || vendorInfo?.vendor?._id || "";
  const rootCategoryId =
    vendorInfo?.categoryId ||
    vendorInfo?.rootCategoryId ||
    vendorInfo?.category?._id ||
    category?._id ||
    category?.id ||
    "";
  const isEnquiryFlowEnabled = Boolean(enquiryConfig?.enabled);
  const enquiryTypeLabel = getEnquiryTypeLabel(enquiryConfig?.enquiryType);
  const activeEnquiryFields = useMemo(() => {
    if (!isEnquiryFlowEnabled) return [];

    return (Array.isArray(enquiryConfig?.fields) ? enquiryConfig.fields : [])
      .filter((field) => field && field.active !== false && String(field.name || "").trim())
      .slice()
      .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0));
  }, [enquiryConfig, isEnquiryFlowEnabled]);
  const supportedEnquiryFields = activeEnquiryFields;
  const shouldShowServiceInterestField = isEnquiryFlowEnabled
    ? Boolean(enquiryConfig?.cartBasedEnquiry)
    : true;
  const requiresCartSelection = Boolean(isEnquiryFlowEnabled && enquiryConfig?.cartBasedEnquiry);
  const heroHighlights = getHeroHighlights({
    vendorInfo,
    categoryName: category?.name,
    isTelugu,
  });
  const activeSection =
    serviceSections.find((section) => section.sectionName === activeSectionName) ||
    serviceSections[0] ||
    null;
  const activeCard =
    activeSection?.cards?.find((card) => card.id === activeCardId) ||
    activeSection?.cards?.[0] ||
    null;
  const inquiryInterestOptions = useMemo(() => {
    if (Array.isArray(cartItems) && cartItems.length > 0) {
      return cartItems.map((item, index) => {
        const qty = Number(item?.qty || 0) || 1;
        const lineTotal = Number(item?.price || 0) * qty;
        const hierarchyLabel = getCartHierarchyLabel(item);

        return {
          value: String(item?.cartKey || item?.itemId || item?.name || `cart-item-${index}`),
          label: `${hierarchyLabel} x${qty} • ${formatCurrency(lineTotal)}`,
        };
      });
    }

    return [
      {
        value: "no-cart-items",
        label: "Add items to cart",
      },
    ];
  }, [cartItems]);
  const activeInquiryInterest =
    inquiryInterestOptions.some((option) => option.value === selectedInquiryInterest)
      ? selectedInquiryInterest
      : inquiryInterestOptions[0]?.value || "";
  const selectedInquiryItem = useMemo(() => {
    if (!Array.isArray(cartItems) || cartItems.length === 0) return null;

    return (
      cartItems.find((item, index) => {
        const value = String(item?.cartKey || item?.itemId || item?.name || `cart-item-${index}`);
        return value === activeInquiryInterest;
      }) || null
    );
  }, [activeInquiryInterest, cartItems]);

  useEffect(() => {
    setDynamicInquiryValues((prev) => {
      const next = {};
      supportedEnquiryFields.forEach((field) => {
        next[field.name] = prev?.[field.name] || "";
      });
      return next;
    });
  }, [supportedEnquiryFields]);

  const goToQuickInquiry = () => {
    scrollToElementById("quick-inquiry");
  };

  const handleInquiryFieldChange = (field, value) => {
    setInquiryFeedback("");
    setDynamicInquiryValues((prev) => ({
      ...prev,
      [field.name]: sanitizeEnquiryValue(field, value),
    }));
  };

  const handleInquiryInterestChange = (value) => {
    setInquiryFeedback("");
    setSelectedInquiryInterest(value);
  };

  const handleSubmitInquiry = async () => {
    if (isSubmittingInquiry) return;

    if (!vendorId || !rootCategoryId) {
      setInquiryFeedback("Vendor or category details are missing for this enquiry.");
      return;
    }

    const missingRequiredField = supportedEnquiryFields.find((field) => {
      if (!field?.required) return false;
      return !String(dynamicInquiryValues[field.name] || "").trim();
    });

    if (missingRequiredField) {
      setInquiryFeedback(`Please enter ${getEnquiryFieldLabel(missingRequiredField)}.`);
      return;
    }

    const invalidPhoneField = supportedEnquiryFields.find((field) => {
      if (!isLikelyPhoneField(field)) return false;
      const value = String(dynamicInquiryValues[field.name] || "").trim();
      return value && value.length !== 10;
    });

    if (invalidPhoneField) {
      setInquiryFeedback(`Please enter a valid 10-digit ${getEnquiryFieldLabel(invalidPhoneField)}.`);
      return;
    }

    if (requiresCartSelection && activeInquiryInterest === "no-cart-items") {
      setInquiryFeedback("Add a service to the cart before submitting this enquiry.");
      return;
    }

    const attributes = supportedEnquiryFields.reduce((acc, field) => {
      const value = String(dynamicInquiryValues[field.name] || "").trim();
      if (!value) return acc;
      acc[field.name] = value;
      return acc;
    }, {});

    const phoneField = supportedEnquiryFields.find((field) => isLikelyPhoneField(field));
    const storedUser = (() => {
      if (typeof window === "undefined") return {};

      try {
        return JSON.parse(localStorage.getItem("userData") || "{}");
      } catch {
        return {};
      }
    })();
    const phoneValue = phoneField ? String(dynamicInquiryValues[phoneField.name] || "").trim() : "";
    const enquiryCartItems =
      requiresCartSelection && Array.isArray(cartItems) && cartItems.length > 0
        ? cartItems
        : selectedInquiryItem
          ? [selectedInquiryItem]
          : [];
    const normalizedCartItems = enquiryCartItems.map((item, index) => {
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
        categoryPath: categoryPath.map((segment) => String(segment || "").trim()).filter(Boolean),
        categoryPathIds: (Array.isArray(item?.categoryPathIds) ? item.categoryPathIds : [])
          .map((id) => String(id || "").trim())
          .filter(Boolean),
      };
    });
    const aggregateCategoryPath = getCommonPathPrefix(
      normalizedCartItems.map((item) => item.categoryPath)
    );
    const aggregateCategoryIds = [
      ...new Set(
        normalizedCartItems.flatMap((item) => item.categoryPathIds || []).filter(Boolean)
      ),
    ];
    const totalQty = normalizedCartItems.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
    const totalPrice = normalizedCartItems.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
    const inventorySummary = normalizedCartItems.length
      ? normalizedCartItems
          .map((item) => `${item.label} x${item.qty}${item.total > 0 ? ` • ${formatCurrency(item.total)}` : ""}`)
          .join(", ")
      : "";
    const serviceNameSummary =
      normalizedCartItems.length > 1
        ? `${normalizedCartItems[0]?.name || enquiryTypeLabel} +${normalizedCartItems.length - 1} more`
        : normalizedCartItems[0]?.name || category?.name || enquiryTypeLabel;
    const sourceSummary =
      aggregateCategoryPath[0] ||
      normalizedCartItems[0]?.categoryPath?.[0] ||
      category?.name ||
      "modern-preview";

    if (inventorySummary) {
      attributes.inventoryName = inventorySummary;
      attributes.inventoryNames = normalizedCartItems.map((item) => item.label);
    }

    const payload = {
      vendorId: String(vendorId),
      categoryId: String(rootCategoryId),
      customerId: storedUser?.customerId ? String(storedUser.customerId) : "",
      phone: phoneValue || String(storedUser?.phone || "").trim(),
      serviceName: serviceNameSummary,
      source: sourceSummary,
      categoryPath: aggregateCategoryPath,
      categoryIds: aggregateCategoryIds.length > 0 ? aggregateCategoryIds : [String(rootCategoryId)],
      attributes,
      price: totalPrice > 0 ? totalPrice : null,
      terms: "",
      meta: {
        template: "modern-preview",
        enquiryType: String(enquiryConfig?.enquiryType || "").trim(),
        serviceInterest: activeInquiryInterest === "no-cart-items" ? "" : activeInquiryInterest,
        serviceInterestLabel: selectedInquiryItem ? getCartHierarchyLabel(selectedInquiryItem) : "",
        cartQty: totalQty,
        cartLineCount: normalizedCartItems.length,
        cartItems: normalizedCartItems,
        cartSummary: inventorySummary,
      },
    };

    try {
      setIsSubmittingInquiry(true);
      setInquiryFeedback("");

      const response = await fetch(`${API_BASE_URL}/api/enquiries`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setInquiryFeedback(data?.message || "Failed to submit enquiry.");
        return;
      }

      setInquiryFeedback("Enquiry submitted successfully.");
      trackVendorPreviewEvent(
        API_BASE_URL,
        buildVendorPreviewAnalyticsPayload({
          vendorId,
          eventType: "enquiry_submit",
          meta: {
            sourceLabel: String(enquiryConfig?.enquiryType || "service_enquiry") || "service_enquiry",
            utmContent: String(rootCategoryId || ""),
          },
        })
      );
      setDynamicInquiryValues(
        supportedEnquiryFields.reduce((acc, field) => {
          acc[field.name] = "";
          return acc;
        }, {})
      );
      if (shouldShowServiceInterestField && Array.isArray(cartItems) && cartItems.length > 0) {
        setSelectedInquiryInterest("");
      }
    } catch (error) {
      setInquiryFeedback("Unable to submit enquiry right now.");
    } finally {
      setIsSubmittingInquiry(false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const syncSessionState = () => {
      const vendorId =
        vendorInfo?._id || vendorInfo?.vendor?._id || null;
      const sessionVendorId = localStorage.getItem("vendorSessionVendorId");
      const vendorToken = vendorId ? localStorage.getItem(`vendorToken:${vendorId}`) : null;
      const hasActiveVendorSession =
        Boolean(vendorToken) &&
        (!sessionVendorId || String(sessionVendorId) === String(vendorId));

      setHasVendorSession(hasActiveVendorSession);
    };

    syncSessionState();
    window.addEventListener("storage", syncSessionState);
    window.addEventListener("auth-changed", syncSessionState);
    window.addEventListener("session-expired", syncSessionState);
    window.addEventListener("focus", syncSessionState);

    return () => {
      window.removeEventListener("storage", syncSessionState);
      window.removeEventListener("auth-changed", syncSessionState);
      window.removeEventListener("session-expired", syncSessionState);
      window.removeEventListener("focus", syncSessionState);
    };
  }, [vendorInfo?._id, vendorInfo?.vendor?._id]);

  const handleLogout = () => {
    if (typeof window === "undefined") return;

    const vendorId =
      vendorInfo?._id || vendorInfo?.vendor?._id || null;

    localStorage.removeItem("authToken");
    localStorage.removeItem("token");
    localStorage.removeItem("userData");
    localStorage.removeItem("loginTime");
    localStorage.removeItem("vendorLoginTime");
    localStorage.removeItem("vendorSessionVendorId");
    localStorage.removeItem("sessionHour");
    localStorage.removeItem("sessionDeviceId");

    if (vendorId) {
      localStorage.removeItem(`vendorToken:${vendorId}`);
    }

    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith("vendorToken:")) {
        localStorage.removeItem(key);
      }
    });

    window.dispatchEvent(new Event("storage"));
    window.dispatchEvent(new Event("auth-changed"));
    setMobileMenuOpen(false);
  };

  const logoUrl =
    typeof vendorInfo?.logoUrl === "string" ? vendorInfo.logoUrl.trim() : "";

  return (
    <div
      className={`modern-template-shell ${
        isAstrologyTheme ? "modern-template-shell--astrology" : ""
      } ${!isAstrologyTheme ? `theme-${modernThemeKey}` : ""}`}
    >
      <header className="modern-header" id="home">
        <a className="modern-brand" href="#home">
          {logoUrl ? (
            <img
              className="modern-brand-logo"
              src={logoUrl}
              alt={`${vendorInfo?.businessName || "Business"} logo`}
            />
          ) : (
            <span className="modern-brand-mark">
              {(vendorInfo?.businessName || category?.name || "B").charAt(0).toUpperCase()}
            </span>
          )}
          <span className="modern-brand-text">{vendorInfo?.businessName || "Business"}</span>
        </a>

        <nav className="modern-nav" aria-label="Primary">
          {navItems.map((item) => (
            <a key={`${item.label}-${item.href}`} href={item.href} onClick={(event) => handleNavClick(event, item)}>
              {item.label}
            </a>
          ))}
          <a href={customerPortalUrl} target="_blank" rel="noopener noreferrer">
            My Bills & Rewards
          </a>
        </nav>

        <div className="modern-admin-menu">
          <button
            type="button"
            className="modern-admin-btn"
            onClick={() => setShowAdminMenu((current) => !current)}
          >
            Admin
          </button>
          {showAdminMenu ? (
            <div className="modern-admin-dropdown">
              <button
                type="button"
                onClick={() => {
                  setShowAdminMenu(false);
                  openAdminMenu();
                }}
              >
                Menu
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAdminMenu(false);
                  openAdminDashboard();
                }}
              >
                Dashboard
              </button>
            </div>
          ) : null}
        </div>

        <button type="button" className="modern-book-btn" onClick={goToQuickInquiry}>
          {enquiryTypeLabel}
        </button>

        {hasVendorSession ? (
          <button
            type="button"
            className="modern-logout-btn"
            onClick={handleLogout}
            aria-label="Logout"
            title="Logout"
          >
            <LuLogOut />
          </button>
        ) : null}

        <button
          type="button"
          className={`modern-mobile-menu-toggle ${mobileMenuOpen ? "is-open" : ""}`}
          aria-expanded={mobileMenuOpen}
          aria-controls="modern-mobile-menu"
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          onClick={() => setMobileMenuOpen((current) => !current)}
        >
          <span />
          <span />
          <span />
        </button>

        <div
          id="modern-mobile-menu"
          className={`modern-mobile-menu ${mobileMenuOpen ? "is-open" : ""}`}
        >
          <nav className="modern-mobile-menu-links" aria-label="Mobile">
            {navItems.map((item) => (
              <a
                key={`mobile-${item.label}-${item.href}`}
                href={item.href}
                onClick={(event) => {
                  handleNavClick(event, item);
                  if (item?.action !== "gallery") setMobileMenuOpen(false);
                }}
              >
                {item.label}
              </a>
            ))}
            <a
              href={customerPortalUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMobileMenuOpen(false)}
            >
              My Bills & Rewards
            </a>
          </nav>
          <button
            type="button"
            className="modern-mobile-menu-book"
            onClick={() => {
              setMobileMenuOpen(false);
              goToQuickInquiry();
            }}
          >
            {enquiryTypeLabel}
          </button>

          <div className="modern-mobile-admin-menu">
            <button
              type="button"
              className="modern-mobile-menu-book modern-mobile-menu-admin"
              onClick={() => setShowAdminMenu((current) => !current)}
            >
              Admin
            </button>
            {showAdminMenu ? (
              <div className="modern-admin-dropdown modern-admin-dropdown-mobile">
                <button
                  type="button"
                  onClick={() => {
                    setShowAdminMenu(false);
                    setMobileMenuOpen(false);
                    openAdminMenu();
                  }}
                >
                  Menu
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAdminMenu(false);
                    setMobileMenuOpen(false);
                    openAdminDashboard();
                  }}
                >
                  Dashboard
                </button>
              </div>
            ) : null}
          </div>

          {hasVendorSession ? (
            <button
              type="button"
              className="modern-mobile-menu-logout"
              onClick={handleLogout}
            >
              Logout
            </button>
          ) : null}
        </div>
      </header>

      <section className="modern-hero">
        <div className="modern-hero-copy">
          <h1>{heroTagline}</h1>
          <div className="modern-hero-description">
            {displayHeroCopy?.lead ? <p className="modern-hero-lead">{displayHeroCopy.lead}</p> : null}
            {displayHeroCopy?.supporting ? (
              <p className="modern-hero-supporting">{displayHeroCopy.supporting}</p>
            ) : null}
          </div>

          <div className="modern-stats">
            {statEntries.slice(0, 3).map(([key, value]) => {
              const label = prettifyLabel(key, { isTelugu });

              return (
                <div key={key} className="modern-stat-card">
                  <span className={`modern-stat-accent is-${getStatAccent(label)}`} aria-hidden="true" />
                  <strong>{String(value ?? "").trim()}</strong>
                  <span className="modern-stat-label">{label}</span>
                </div>
              );
            })}
            {typeof vendorInfo?.googlePlace?.rating === "number" ? (
              <a
                className="modern-stat-card modern-stat-card-link"
                href={mapsLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="modern-stat-accent is-star" aria-hidden="true" />
                <strong>{vendorInfo.googlePlace.rating}*</strong>
                <span className="modern-stat-label">
                  {isTelugu ? "గూగుల్ రేటింగ్" : "Google Rating"}
                  {vendorInfo?.googlePlace?.userRatingsTotal
                    ? ` (${vendorInfo.googlePlace.userRatingsTotal})`
                    : ""}
                </span>
                <span className="modern-stat-link-hint">Google profile</span>
              </a>
            ) : (
              <div className="modern-stat-card">
                <span className="modern-stat-accent is-info" aria-hidden="true" />
                <strong>Top Rated</strong>
                <span className="modern-stat-label">Quality Service</span>
              </div>
            )}
          </div>

          {serviceModes.length > 0 ? (
            <div className="modern-service-modes">
              <div className="modern-service-modes-label">{serviceModeLabel}</div>
              <div className="modern-service-mode-list">
                {serviceModes.map((mode) => (
                  <span key={mode} className="modern-service-mode-chip">
                    <span className="modern-service-mode-chip-icon" aria-hidden="true">
                      ✓
                    </span>
                    {mode}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {extraListEntries.map((entry) => (
            <div key={entry.key} className="modern-service-modes">
              <div className="modern-service-modes-label">{entry.label}</div>
              <div className="modern-service-mode-list">
                {entry.values.map((value) => (
                  <span key={`${entry.key}-${value}`} className="modern-service-mode-chip">
                    <span className="modern-service-mode-chip-icon" aria-hidden="true">
                      ✓
                    </span>
                    {value}
                  </span>
                ))}
              </div>
            </div>
          ))}

        </div>

        <div className="modern-hero-visual">
          {heroImage ? <img src={heroImage} alt={heroTagline} /> : null}
          <div className="modern-hero-note">
            <div className="modern-hero-note-kicker">Quick Highlights</div>
            <div className="modern-hero-note-title">{vendorInfo?.businessName || "Business"}</div>
            <ul className="modern-hero-note-list">
              {heroHighlights.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {offerCards.length > 0 ? (
        <section className="modern-offers" id="offers">
          <div className="modern-offers-header">
            <div>
              <span className="modern-section-kicker">Offers</span>
              <h2>Current Offers</h2>
            </div>
          </div>

          <div className="modern-offers-track">
            {offerCards.map((offer) => {
              const offerTerms = Array.isArray(offer.terms)
                ? offer.terms.map((item) => String(item || "").trim()).filter(Boolean)
                : String(offer.terms || "")
                    .split(/\r?\n|,/)
                    .map((item) => item.trim())
                    .filter(Boolean);

              const offerImage = getCardImage(offer);

              return (
                <article key={offer.id} className="modern-offer-card">
                  {offerImage ? (
                    <div className="modern-offer-card-image">
                      <img src={offerImage} alt={offer.title} />
                    </div>
                  ) : null}

                  <div className="modern-offer-card-body">
                    <h3>{offer.title}</h3>

                    {offer.offerText ? (
                      <div className="modern-offer-card-copy">
                        <p>{offer.offerText}</p>
                      </div>
                    ) : null}

                    {offerTerms.length > 0 ? (
                      <div className="modern-offer-card-terms">
                        {offerTerms.map((term, index) => (
                          <span key={`${offer.id}-term-${index}`} className="modern-offer-term">
                            {term}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="modern-services" id="services">
        <div className="modern-section-header">
          <span className="modern-section-kicker">Service Menu</span>
          <h2>The Service Menu</h2>
        </div>

        <div className="modern-service-tabs">
          {serviceSections.map((section) => (
            <button
              key={section.sectionName}
              type="button"
              className={`modern-service-tab ${activeSection?.sectionName === section.sectionName ? "is-active" : ""}`}
              onClick={() => setActiveSectionName(section.sectionName)}
            >
              {section.sectionName}
              {section.cards.length > 0 ? (
                <span className="modern-service-tab-count">{section.cards.length}</span>
              ) : null}
            </button>
          ))}
        </div>

        {activeSection ? (
          <div
            key={activeSection.sectionName}
            className="modern-service-section"
            id={`section-${toAnchor(activeSection.sectionName)}`}
          >
            <div className="modern-service-heading">{activeSection.sectionName}</div>

            {activeSection.cards.length > 1 ? (
              <div className="modern-card-switcher" aria-label={`${activeSection.sectionName} services`}>
                {activeSection.cards.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    className={`modern-card-switcher-btn ${activeCard?.id === card.id ? "is-active" : ""}`}
                    onClick={() => setActiveCardId(card.id)}
                  >
                    <span className="modern-card-switcher-title">{card.title}</span>
                    {card.base ? (
                      <span className="modern-card-switcher-meta">
                        {Array.isArray(card.options) && card.options.length > 0
                          ? renderPriceText(card.base, { startsFrom: true })
                          : formatCurrency(card.base)}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}

            {activeCard ? (
              <div className="modern-service-list">
                <ModernServiceRow
                  key={activeCard.id}
                  card={activeCard}
                  sectionName={
                    activeSection.sectionName === "Featured Services"
                      ? activeCard.title
                      : activeSection.sectionName
                  }
                  onAddToCart={onAddToCart}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {cartItems.length > 0 ? (
        <div className="modern-cart-bar">
          <div className="modern-cart-bar-copy">
            <strong>{cartItems.length} item(s) in cart</strong>
            <span>{formatCurrency(cartTotal)}</span>
          </div>
          <div className="modern-cart-bar-items">
            {cartItems.slice(0, 3).map((item, index) => (
              <div key={`${item.cartKey || item.itemId}-${index}`} className="modern-cart-pill">
                <span>{item.name}</span>
                <div className="modern-cart-pill-controls">
                  <button type="button" onClick={() => onDecreaseQty?.(item.cartKey || item.itemId)}>-</button>
                  <span>{item.qty}</span>
                  <button type="button" onClick={() => onIncreaseQty?.(item.cartKey || item.itemId)}>+</button>
                </div>
              </div>
            ))}
          </div>
          <div className="modern-cart-bar-actions">
            {hasVendorSession ? (
              <button type="button" className="modern-cart-bar-btn" onClick={onOpenMenu}>
                Go to Cart
              </button>
            ) : (
              <button
                type="button"
                className="modern-cart-bar-btn modern-cart-bar-btn-secondary"
                onClick={goToQuickInquiry}
              >
                {enquiryTypeLabel}
              </button>
            )}
          </div>
        </div>
      ) : null}

      <section className="modern-story" id="our-story">
        <div className="modern-story-gallery">
          {storyImages.map((imageUrl, index) => (
            <div key={`${imageUrl}-${index}`} className={`modern-story-image modern-story-image-${index + 1}`}>
              <img src={imageUrl} alt={`${vendorInfo?.businessName || "Business"} ${index + 1}`} />
            </div>
          ))}
        </div>

        <div className="modern-story-copy">
          <span className="modern-section-kicker">Our Story</span>
          <h2>{storyHeading}</h2>
          <p>{storyDescription}</p>

          <div className="modern-feature-list">
            {featureCards.slice(0, 4).map((card, index) => (
              <div key={card?._id || `${card?.title}-${index}`} className="modern-feature-item">
                <span className="modern-feature-badge">{index + 1}</span>
                <div>
                  <strong>{card?.title || "Why choose us"}</strong>
                  <p>{card?.description || "Built from your current category content."}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {showFounderAbout ? (
        <section className="modern-founder" id="about">
          <div className="modern-founder-copy">
            <span className="modern-section-kicker">Founder Story</span>
            <h2>{founderHeading}</h2>
            {founderBody ? (
              <div className="modern-founder-body">
                {(founderParagraphs.length ? founderParagraphs : [founderBody]).map((paragraph, index) => (
                  <p
                    key={`${paragraph.slice(0, 32)}-${index}`}
                    className={index === 0 ? "modern-founder-lead" : ""}
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            ) : null}
            {founderName || founderRole ? (
              <div className="modern-founder-signoff">
                <div className="modern-founder-signoff-line" />
                <div className="modern-founder-signoff-copy">
                  {founderName ? <strong>{founderName}</strong> : null}
                  {founderRole ? <span>{founderRole}</span> : null}
                </div>
              </div>
            ) : null}
          </div>

          <div className="modern-founder-visual">
            {founderImageUrl ? (
              <div className="modern-founder-image">
                <img
                  src={founderImageUrl}
                  alt={founderName || `${vendorInfo?.businessName || "Business"} founder`}
                />
              </div>
            ) : (
              <div className="modern-founder-placeholder">
                <span>
                  {(founderName || vendorInfo?.businessName || "Founder").charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {showShowcaseSection ? (
        <section className="modern-showcase" id="showcase">
          <div className="modern-showcase-header">
            <h2>{showcaseHeading}</h2>
            {showcaseSubHeading ? <p>{showcaseSubHeading}</p> : null}
          </div>

          <div className="modern-showcase-grid">
            {showcaseItems.map((item, index) => {
              const previewImage = item.imageUrls[0] || heroImage || profileImage || "";
              return (
                <button
                  key={`${item.name || showcaseItemLabel}-${index}`}
                  type="button"
                  className="modern-showcase-card"
                  onClick={() => {
                    setActiveShowcaseItemIndex(index);
                    setActiveShowcaseImageIndex(0);
                  }}
                >
                  <div className="modern-showcase-card-image">
                    {previewImage ? (
                      <img src={previewImage} alt={item.name || `${showcaseItemLabel} ${index + 1}`} />
                    ) : (
                      <div className="modern-showcase-card-placeholder">
                        {(item.name || showcaseItemLabel).charAt(0).toUpperCase()}
                      </div>
                    )}
                    {item.imageUrls.length > 1 ? (
                      <span className="modern-showcase-count">{item.imageUrls.length} images</span>
                    ) : null}
                  </div>

                  <div className="modern-showcase-card-copy">
                    <strong>{item.name || `${showcaseItemLabel} ${index + 1}`}</strong>
                    {item.description ? <p>{item.description}</p> : null}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="modern-contact" id="contact">
        <div className="modern-contact-left">
          <span className="modern-section-kicker">Visit the Sanctuary</span>
          <h2>{vendorInfo?.businessName || "Reach us"}</h2>
          <p>{locationAddress}</p>

          <div className="modern-contact-list">
            {phoneNumbers.map((phone, index) => (
              <a key={`${phone}-${index}`} href={`tel:${phone}`}>
                {phone}
              </a>
            ))}
          </div>

          <div className="modern-hours-card">
            <h3>Business Hours</h3>
            {businessHours.length > 0 ? (
              <ul>
                {businessHours.map((item, index) => (
                  <li key={item?._id || `${item?.day}-${index}`}>
                    <span>{item?.day || "Day"}</span>
                    <span>{item?.hours || "Closed"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Business hours not available.</p>
            )}
          </div>

          {hasEmbeddedMap ? (
            <div className="modern-hours-card modern-map-card">
              <h3>Location Map</h3>
              <div className="modern-map-frame">
                <iframe
                  title="Business location map"
                  width="100%"
                  height="240"
                  loading="lazy"
                  src={`https://www.google.com/maps?q=${locationLat},${locationLng}&z=15&output=embed`}
                />
              </div>
            </div>
          ) : null}
        </div>

          <div className="modern-contact-right">
          <div className="modern-contact-card" id="quick-inquiry">
            <h3>{enquiryTypeLabel}</h3>
            {supportedEnquiryFields.length > 0 ? (
              <div className="modern-inquiry-dynamic">
                {supportedEnquiryFields.map((field) => {
                  const inputType = getEnquiryInputType(field.fieldType);
                  const label = getEnquiryFieldLabel(field);
                  const isPhoneField = isLikelyPhoneField(field);
                  const isDateTimeField = inputType === "datetime-local";
                  const dateTimeValue = splitDateTimeValue(dynamicInquiryValues[field.name] || "");
                  const dateAwareTimeSlots = isDateTimeField
                    ? getTimeSlotOptionsForDate(businessHours, dateTimeValue.date)
                    : [];
                  const hasAvailableDateSlots = dateAwareTimeSlots.length > 0;
                  const commonProps = {
                    required: Boolean(field.required),
                    placeholder: getEnquiryFieldPlaceholder(field),
                    value: dynamicInquiryValues[field.name] || "",
                    onChange: (event) => handleInquiryFieldChange(field, event.target.value),
                  };

                  return (
                    <div
                      key={field.name}
                      className={`modern-inquiry-field ${
                        inputType === "textarea" || isDateTimeField ? "is-full" : ""
                      }`}
                    >
                      <label className="modern-inquiry-label">
                        {label}
                        {field.required ? <span className="modern-inquiry-required">*</span> : null}
                      </label>

                      {field.fieldType === "textarea" ? (
                        <textarea
                          {...commonProps}
                          rows={4}
                          minLength={field?.rules?.minLength || undefined}
                          maxLength={field?.rules?.maxLength || undefined}
                        />
                      ) : isDateTimeField ? (
                        <div className="modern-datetime-input">
                          <input
                            className="modern-datetime-date"
                            type="date"
                            required={Boolean(field.required)}
                            value={dateTimeValue.date}
                            onChange={(event) =>
                              setDynamicInquiryValues((prev) => {
                                const nextSlots = getTimeSlotOptionsForDate(
                                  businessHours,
                                  event.target.value
                                );
                                const nextTime = nextSlots.some(
                                  (slot) => slot.value === dateTimeValue.time
                                )
                                  ? dateTimeValue.time
                                  : "";

                                return {
                                  ...prev,
                                  [field.name]: mergeDateTimeValue(
                                    event.target.value,
                                    nextTime
                                  ),
                                };
                              })
                            }
                            {...getEnquiryDateOnlyConstraints(field)}
                          />
                          <select
                            required={Boolean(field.required)}
                            value={dateTimeValue.time}
                            onChange={(event) =>
                              setDynamicInquiryValues((prev) => ({
                                ...prev,
                                [field.name]: mergeDateTimeValue(
                                  dateTimeValue.date,
                                  event.target.value
                                ),
                              }))
                            }
                            className="modern-datetime-slot"
                            disabled={Boolean(dateTimeValue.date) && !hasAvailableDateSlots}
                          >
                            <option value="">
                              {Boolean(dateTimeValue.date) && !hasAvailableDateSlots
                                ? "No slots available"
                                : "Select time"}
                            </option>
                            {dateAwareTimeSlots.map((slot) => (
                              <option key={`${field.name}-${slot.value}`} value={slot.value}>
                                {slot.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : isPhoneField ? (
                        <div className="modern-phone-input">
                          <span className="modern-phone-prefix">+91</span>
                          <input
                            {...commonProps}
                            type="tel"
                            inputMode="numeric"
                            pattern="[0-9]{10}"
                            maxLength={10}
                            autoComplete="tel-national"
                          />
                        </div>
                      ) : (
                        <input
                          {...commonProps}
                          type={inputType}
                          {...getEnquiryDateConstraints(field)}
                          step={inputType === "datetime-local" ? 60 : undefined}
                          inputMode={getEnquiryInputMode(field)}
                          minLength={
                            inputType === "text" ? field?.rules?.minLength || undefined : undefined
                          }
                          maxLength={
                            inputType === "text"
                              ? field?.rules?.maxLength || undefined
                              : inputType === "number"
                                ? field?.rules?.maxLength || undefined
                                : undefined
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null}

            {shouldShowServiceInterestField ? (
              <div className="modern-inquiry-field is-full">
                <label className="modern-inquiry-label">Service Interest</label>
                <select
                  value={activeInquiryInterest}
                  onChange={(event) => handleInquiryInterestChange(event.target.value)}
                  disabled={inquiryInterestOptions[0]?.value === "no-cart-items"}
                >
                  <option value="" disabled>
                    Service Interest
                  </option>
                  {inquiryInterestOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <button
              type="button"
              className="modern-request-btn"
              onClick={handleSubmitInquiry}
              disabled={isSubmittingInquiry}
            >
              {isSubmittingInquiry ? "Submitting..." : enquiryTypeLabel}
            </button>
            {inquiryFeedback ? (
              <p className="modern-inquiry-feedback">{inquiryFeedback}</p>
            ) : null}
          </div>
        </div>
      </section>

      {activeShowcaseItem ? (
        <div
          className="modern-showcase-modal-backdrop"
          role="presentation"
          onClick={() => {
            setActiveShowcaseItemIndex(null);
            setActiveShowcaseImageIndex(0);
          }}
        >
          <div
            className="modern-showcase-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`${showcaseItemLabel} details`}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="modern-showcase-close"
              onClick={() => {
                setActiveShowcaseItemIndex(null);
                setActiveShowcaseImageIndex(0);
              }}
              aria-label="Close showcase viewer"
            >
              ×
            </button>

            <div className="modern-showcase-modal-media">
              {canNavigateShowcaseImages ? (
                <>
                  <button
                    type="button"
                    className="modern-showcase-nav modern-showcase-nav-prev"
                    onClick={showPreviousShowcaseImage}
                    aria-label="Show previous image"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className="modern-showcase-nav modern-showcase-nav-next"
                    onClick={showNextShowcaseImage}
                    aria-label="Show next image"
                  >
                    ›
                  </button>
                  <span className="modern-showcase-modal-count">
                    {activeShowcaseImageIndex + 1} / {activeShowcaseImageCount}
                  </span>
                </>
              ) : null}
              {activeShowcaseImage ? (
                <img
                  src={activeShowcaseImage}
                  alt={activeShowcaseItem.name || `${showcaseItemLabel} image`}
                />
              ) : (
                <div className="modern-showcase-card-placeholder modern-showcase-modal-placeholder">
                  {(activeShowcaseItem.name || showcaseItemLabel).charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            <div className="modern-showcase-modal-copy">
              <span className="modern-section-kicker">{showcaseItemLabel}</span>
              <h3>{activeShowcaseItem.name || `${showcaseItemLabel} Details`}</h3>
              {activeShowcaseItem.description ? <p>{activeShowcaseItem.description}</p> : null}
            </div>
          </div>
        </div>
      ) : null}

      <footer className="modern-footer">
        <div className="modern-footer-brand">
          <span className="modern-brand-mark">
            {(vendorInfo?.businessName || category?.name || "B").charAt(0).toUpperCase()}
          </span>
          <span>{vendorInfo?.businessName || "Business"}</span>
        </div>

        <div className="modern-footer-links">
          {navItems.map((item) => (
            <a key={`${item.label}-footer`} href={item.href} onClick={(event) => handleNavClick(event, item)}>
              {item.label}
            </a>
          ))}
        </div>

        {socialsToRender.length > 0 ? (
          <div className="modern-footer-socials" aria-label="Follow us">
            {socialsToRender.map(({ key, value }) => {
              const Icon = SOCIAL_ICONS[key];

              return (
                <a
                  key={`${key}-${value}`}
                  href={getSocialHref(key, value)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={key}
                  title={key}
                >
                  <Icon />
                </a>
              );
            })}
          </div>
        ) : null}

        <div className="modern-footer-copy">
          {cartItems.length > 0 ? `Cart: ${cartItems.length} item(s) • Rs ${cartTotal}` : ""}
        </div>

        <a
          className="modern-footer-powered"
          href={poweredByUrl}
          target="_blank"
          rel="noreferrer"
        >
          <img src="/favicon.svg" alt="Ynot" className="modern-footer-powered-logo" />
          <span>Powered by Ynot</span>
        </a>
      </footer>
    </div>
  );
}
