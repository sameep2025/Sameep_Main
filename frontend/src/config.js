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
  return process.env.NODE_ENV === "development"
    ? "http://localhost:5000"
    : "/api";
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
