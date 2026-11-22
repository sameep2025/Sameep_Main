const crypto = require("node:crypto");

const MAX_PROMOTIONAL_POSTERS = 12;
const POSTER_KEY_PREFIX = "promotional/";

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function isManagedPosterKey(value) {
  const key = cleanText(value, 512);
  return key.startsWith(POSTER_KEY_PREFIX) && !key.includes("..") && !key.includes("\\");
}

function normalizeImageUrl(value, key) {
  const imageUrl = cleanText(value, 2048);
  let parsed;
  try {
    parsed = new URL(imageUrl);
  } catch {
    throw new Error("Each promotional poster must have a valid image URL");
  }

  if (parsed.protocol !== "https:" || !parsed.hostname.toLowerCase().endsWith(".amazonaws.com")) {
    throw new Error("Promotional poster images must use managed HTTPS storage");
  }

  let urlKey = parsed.pathname.replace(/^\/+/, "");
  try {
    urlKey = decodeURIComponent(urlKey);
  } catch {
    // Keep the raw path if it is not valid percent-encoding.
  }
  if (urlKey !== key) {
    throw new Error("Promotional poster image URL does not match its managed object key");
  }

  return imageUrl;
}

function normalizeDimension(value, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 10000) return fallback;
  return number;
}

function normalizePromotionalPosters(value, { createIds = false } = {}) {
  const input = Array.isArray(value) ? value : [];
  if (input.length > MAX_PROMOTIONAL_POSTERS) {
    throw new Error(`A maximum of ${MAX_PROMOTIONAL_POSTERS} promotional posters is allowed`);
  }

  const ids = new Set();
  const keys = new Set();
  const posters = input.map((entry, index) => {
    const key = cleanText(entry?.key, 512);
    if (!isManagedPosterKey(key)) {
      throw new Error("Promotional poster object key is not managed by YNOT");
    }

    const id = cleanText(entry?.id, 80) || (createIds ? crypto.randomUUID() : "");
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
      throw new Error("Each promotional poster must have a valid ID");
    }
    if (ids.has(id) || keys.has(key)) {
      throw new Error("Duplicate promotional poster IDs or images are not allowed");
    }
    ids.add(id);
    keys.add(key);

    const altText = cleanText(entry?.altText, 180);
    const published = entry?.published === true;
    if (published && !altText) {
      throw new Error("Published promotional posters require descriptive alt text");
    }

    return {
      id,
      key,
      imageUrl: normalizeImageUrl(entry?.imageUrl, key),
      altText,
      displayOrder: Math.min(
        Math.max(Number.isInteger(Number(entry?.displayOrder)) ? Number(entry.displayOrder) : index, 0),
        999
      ),
      published,
      width: normalizeDimension(entry?.width, 1600),
      height: normalizeDimension(entry?.height, 900),
    };
  });

  return posters.sort(
    (left, right) =>
      left.displayOrder - right.displayOrder || left.id.localeCompare(right.id)
  );
}

function buildPublicPromotionalPosters(value) {
  let posters;
  try {
    posters = normalizePromotionalPosters(value);
  } catch {
    return [];
  }

  return posters
    .filter((poster) => poster.published && poster.altText)
    .map(({ id, imageUrl, altText, displayOrder, width, height }) => ({
      id,
      imageUrl,
      altText,
      displayOrder,
      width,
      height,
    }));
}

function collectRemovedPosterKeys(previousValue, nextValue) {
  const previousKeys = new Set(
    (Array.isArray(previousValue) ? previousValue : [])
      .map((poster) => cleanText(poster?.key, 512))
      .filter(isManagedPosterKey)
  );
  const nextKeys = new Set(
    (Array.isArray(nextValue) ? nextValue : [])
      .map((poster) => cleanText(poster?.key, 512))
      .filter(isManagedPosterKey)
  );
  return [...previousKeys].filter((key) => !nextKeys.has(key));
}

module.exports = {
  MAX_PROMOTIONAL_POSTERS,
  POSTER_KEY_PREFIX,
  buildPublicPromotionalPosters,
  collectRemovedPosterKeys,
  isManagedPosterKey,
  normalizePromotionalPosters,
};
