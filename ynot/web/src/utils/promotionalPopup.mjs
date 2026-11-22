export const PROMOTIONAL_POPUP_SESSION_KEY = "ynotSalonPromotionShown";

export function shouldOpenPromotionalPopup(storage, posters) {
  if (!Array.isArray(posters) || posters.length === 0 || !storage) return false;
  try {
    return storage.getItem(PROMOTIONAL_POPUP_SESSION_KEY) !== "1";
  } catch {
    return false;
  }
}

export function markPromotionalPopupShown(storage) {
  try {
    storage?.setItem(PROMOTIONAL_POPUP_SESSION_KEY, "1");
  } catch {
    // Storage can be unavailable in privacy-restricted browsing contexts.
  }
}

export function getPromotionalPosterPage(posters, pageStart, pageSize) {
  const available = Array.isArray(posters) ? posters : [];
  const size = pageSize === 2 ? 2 : 1;
  const maxStart = Math.max(0, Math.floor((available.length - 1) / size) * size);
  const safeStart = Math.min(Math.max(Number(pageStart) || 0, 0), maxStart);
  return {
    posters: available.slice(safeStart, safeStart + size),
    start: safeStart,
    end: Math.min(safeStart + size, available.length),
    total: available.length,
  };
}

export function movePromotionalPosterPage(pageStart, direction, pageSize, total) {
  const size = pageSize === 2 ? 2 : 1;
  const count = Math.max(Number(total) || 0, 0);
  if (count <= size) return 0;
  const maxStart = Math.max(0, Math.floor((count - 1) / size) * size);
  const next = (Number(pageStart) || 0) + (direction > 0 ? size : -size);
  if (next > maxStart) return 0;
  if (next < 0) return maxStart;
  return next;
}
