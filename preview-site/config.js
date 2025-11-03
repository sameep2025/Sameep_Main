// preview-site/config.js
const API_BASE_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:5000"
    : "/api";

export default API_BASE_URL;
