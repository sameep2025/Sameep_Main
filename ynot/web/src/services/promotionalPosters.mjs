const DEFAULT_BACKEND_BASE_URL = "https://newsameep-backend.go-kar.net";

function normalizePoster(value) {
  const imageUrl = String(value?.imageUrl || "").trim();
  const altText = String(value?.altText || "").trim();
  const width = Number(value?.width);
  const height = Number(value?.height);
  if (
    !imageUrl.startsWith("https://") ||
    !altText ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1
  ) {
    return null;
  }

  return {
    id: String(value?.id || imageUrl),
    imageUrl,
    altText,
    displayOrder: Number.isInteger(Number(value?.displayOrder))
      ? Number(value.displayOrder)
      : 0,
    width,
    height,
  };
}

export async function fetchPublishedPromotionalPosters({
  fetchImpl = fetch,
  backendBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_BACKEND_BASE_URL,
  timeoutMs = 3000,
} = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(
      `${String(backendBaseUrl).replace(/\/$/, "")}/api/app-config/promotional-posters/public`,
      {
        signal: controller.signal,
        next: { revalidate: 300 },
      }
    );
    if (!response.ok) return [];
    const payload = await response.json();
    return (Array.isArray(payload?.posters) ? payload.posters : [])
      .map(normalizePoster)
      .filter(Boolean)
      .sort(
        (left, right) =>
          left.displayOrder - right.displayOrder || left.id.localeCompare(right.id)
      );
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
