// preview-site/config.js
const isDev = process.env.NODE_ENV === "development";

// For API calls from the Next.js app. Prefer env, then dev/prod defaults.
// IMPORTANT: API_BASE_URL should be the backend origin (without trailing slash).
export const API_BASE_URL = (() => {
  const env =
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.REACT_APP_API_BASE_URL ||
    process.env.VITE_API_URL ||
    "";
  if (env && typeof env === "string" && env.trim()) {
    return env.trim().replace(/\/$/, "");
  }
  return isDev ? "http://localhost:5000" : "https://newsameep-backend.go-kar.net";
})();

// For static assets (images) that are served directly by the backend, not under /api
export const ASSET_BASE_URL = isDev
  ? "http://localhost:5000"
  : "https://newsameep-backend.go-kar.net";

export default API_BASE_URL;
