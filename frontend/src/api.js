import axios from "axios";
import API_BASE_URL from "./config";
import { getToken } from "./utils/adminAuth";

const API = axios.create({
  baseURL: API_BASE_URL,
});

const attachAdminToken = (config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
};

API.interceptors.request.use(attachAdminToken);
axios.interceptors?.request?.use(attachAdminToken);

if (
  typeof window !== "undefined" &&
  typeof window.fetch === "function" &&
  !window.__ynotAdminFetchAuthInstalled
) {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, options = {}) => {
    const token = getToken();
    const rawUrl = typeof input === "string" ? input : input?.url || "";
    const isBackendApi = rawUrl.startsWith("/api/") || rawUrl.startsWith(`${API_BASE_URL}/api/`);
    if (!token || !isBackendApi) return nativeFetch(input, options);

    const headers = new Headers(options.headers || (typeof input !== "string" ? input?.headers : undefined));
    headers.set("Authorization", `Bearer ${token}`);
    return nativeFetch(input, { ...options, headers });
  };
  window.__ynotAdminFetchAuthInstalled = true;
}

export default API;
