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
