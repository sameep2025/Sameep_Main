// preview-site/config.js
const isDev = process.env.NODE_ENV === "development";

// For API calls from the Next.js app
export const API_BASE_URL = isDev ? "http://localhost:5000" : "/api";

// For static assets (images) that are served directly by the backend, not under /api
export const ASSET_BASE_URL = isDev
  ? "http://localhost:5000"
  : "https://newsameep-backend.go-kar.net";

export default API_BASE_URL;
