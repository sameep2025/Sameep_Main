// src/config.js
const ENV_URL =
  process.env.REACT_APP_API_BASE_URL ||
  process.env.VITE_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "";

const API_BASE_URL = (() => {
  if (ENV_URL && typeof ENV_URL === "string" && ENV_URL.trim()) {
    return ENV_URL.trim().replace(/\/$/, "");
  }
  try {
    const loc = typeof window !== 'undefined' ? window.location : null;
    const host = loc ? loc.hostname : '';
    const port = loc ? String(loc.port || '') : '';
    if (host === 'localhost' || host === '127.0.0.1') {
      // If running the frontend on :3001 dev server, prefer Next proxy on :3000 to avoid CORS
      if (port === '3001') return "http://localhost:3000";
      return "http://localhost:5000";
    }
  } catch {}
  return process.env.NODE_ENV === "development" ? "http://localhost:5000" : "/api";
})();

export default API_BASE_URL;
export const PREVIEW_BASE_URL = (() => {
  const ENV_PREVIEW =
    process.env.REACT_APP_PREVIEW_BASE_URL ||
    process.env.VITE_PREVIEW_BASE_URL ||
    process.env.NEXT_PUBLIC_PREVIEW_BASE_URL ||
    "";
  if (ENV_PREVIEW && typeof ENV_PREVIEW === "string" && ENV_PREVIEW.trim()) {
    return ENV_PREVIEW.trim().replace(/\/$/, "");
  }
  if (typeof window !== "undefined" && window.location && window.location.origin) {
    return window.location.origin;
  }
  return "";
})();
