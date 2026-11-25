const DEFAULT_BACKEND_BASE_URL = "https://newsameep-backend.go-kar.net";
const LOG_PREFIX = "[PromotionalPosters]";

function getBackendHostname(value) {
  try {
    return new URL(String(value || "").trim()).hostname || "invalid";
  } catch {
    return "invalid";
  }
}

function logPosterFetch(level, details) {
  if (typeof window !== "undefined") return;
  const logger = level === "error" ? console.error : console.info;
  logger(LOG_PREFIX, details);
}

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
  const startedAt = Date.now();
  const backendHostname = getBackendHostname(backendBaseUrl);
  let responseStatus = null;
  try {
    const response = await fetchImpl(
      `${String(backendBaseUrl).replace(/\/$/, "")}/api/app-config/promotional-posters/public`,
      {
        signal: controller.signal,
        next: { revalidate: 300 },
      }
    );
    responseStatus = Number.isInteger(response.status) ? response.status : null;
    if (!response.ok) {
      logPosterFetch("error", {
        event: "fetch_failed",
        backendHostname,
        httpStatus: responseStatus,
        durationMs: Date.now() - startedAt,
        apiPosterCount: null,
        normalizedPosterCount: 0,
        timedOut: false,
        errorName: "HTTPError",
        errorCode: responseStatus === null ? "HTTP_ERROR" : `HTTP_${responseStatus}`,
      });
      return [];
    }
    const payload = await response.json();
    const apiPosters = Array.isArray(payload?.posters) ? payload.posters : [];
    const posters = apiPosters
      .map(normalizePoster)
      .filter(Boolean)
      .sort(
        (left, right) =>
          left.displayOrder - right.displayOrder || left.id.localeCompare(right.id)
      );
    logPosterFetch("info", {
      event: "fetch_succeeded",
      backendHostname,
      httpStatus: responseStatus,
      durationMs: Date.now() - startedAt,
      apiPosterCount: apiPosters.length,
      normalizedPosterCount: posters.length,
      timedOut: false,
      errorName: null,
      errorCode: null,
    });
    return posters;
  } catch (error) {
    const timedOut = controller.signal.aborted || error?.name === "AbortError";
    logPosterFetch("error", {
      event: "fetch_failed",
      backendHostname,
      httpStatus: responseStatus,
      durationMs: Date.now() - startedAt,
      apiPosterCount: null,
      normalizedPosterCount: 0,
      timedOut,
      errorName: String(error?.name || "Error").slice(0, 80),
      errorCode: String(error?.code || (timedOut ? "REQUEST_TIMEOUT" : "FETCH_ERROR")).slice(0, 80),
    });
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
