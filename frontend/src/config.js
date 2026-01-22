// src/config.js
const ENV_URL =
  process.env.REACT_APP_API_BASE_URL ||
  process.env.VITE_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "";

const API_BASE_URL = (() => {
  try {
    const loc = typeof window !== 'undefined' ? window.location : null;
    const host = loc ? loc.hostname : '';
    const port = loc ? String(loc.port || '') : '';
    const isLocal = host === 'localhost' || host === '127.0.0.1';

    // In local development, always talk to local backend to avoid CORS with remote domains
    if (isLocal) {
      if (port === '3001') return 'http://localhost:5000';
      if (port === '3000') return 'http://localhost:5000';
      return 'http://localhost:5000';
    }

    // Non-local hosts: prefer explicit ENV_URL if provided
    if (ENV_URL && typeof ENV_URL === 'string' && ENV_URL.trim()) {
      return ENV_URL.trim().replace(/\/$/, '');
    }
  } catch {}

  // Fallbacks when window is not available or host not detected
  if (ENV_URL && typeof ENV_URL === 'string' && ENV_URL.trim()) {
    return ENV_URL.trim().replace(/\/$/, '');
  }

  return process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : '/api';
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
  // Default preview-site to port 3000 in local dev
  try {
    const loc = typeof window !== 'undefined' ? window.location : null;
    const host = loc ? loc.hostname : '';
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:3000';
  } catch {}
  if (typeof window !== "undefined" && window.location && window.location.origin) {
    return window.location.origin;
  }
  return "";
})();

export const NIKS_PREVIEW_BASE_URL = (() => {
  const ENV_NIKS =
    process.env.REACT_APP_NIKS_PREVIEW_BASE_URL ||
    process.env.VITE_NIKS_PREVIEW_BASE_URL ||
    process.env.NEXT_PUBLIC_NIKS_PREVIEW_BASE_URL ||
    "";
  if (ENV_NIKS && typeof ENV_NIKS === "string" && ENV_NIKS.trim()) {
    return ENV_NIKS.trim().replace(/\/$/, "");
  }
  // Default nikspreview-site to port 3001 in local dev
  try {
    const loc = typeof window !== 'undefined' ? window.location : null;
    const host = loc ? loc.hostname : '';
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:3001';
    // Production/testing default: Amplify URL
    if (host) return 'https://main.d3t45ap4sbsqgp.amplifyapp.com';
  } catch {}
  if (typeof window !== "undefined" && window.location && window.location.origin) {
    return window.location.origin;
  }
  return "";
})();
