const net = require("node:net");

// Environment-specific origins must be configured explicitly. Keeping this
// export avoids breaking existing imports while removing implicit cross-env trust.
const DEFAULT_EXACT_ORIGINS = Object.freeze([]);

const LOCAL_PORTS = new Set(["3000", "3001", "3002", "4000", "6001"]);

function configuredOrigins(env = process.env) {
  return String(env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function normalizeDomainSuffix(value) {
  const suffix = String(value || "").trim().toLowerCase();
  if (
    !suffix ||
    suffix.length > 253 ||
    suffix.includes("*") ||
    suffix.includes(":") ||
    suffix.includes("/") ||
    suffix.includes("\\") ||
    suffix.startsWith(".") ||
    suffix.endsWith(".") ||
    net.isIP(suffix)
  ) {
    return "";
  }

  const labels = suffix.split(".");
  if (labels.length < 2) return "";
  if (labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    return "";
  }
  return suffix;
}

function configuredDomainSuffixes(env = process.env) {
  return String(env.CORS_ALLOWED_DOMAIN_SUFFIXES || "")
    .split(",")
    .map(normalizeDomainSuffix)
    .filter(Boolean);
}

function normalizeExactOrigin(value) {
  try {
    const parsed = new URL(String(value || "").trim());
    if (!/^https?:$/.test(parsed.protocol) || parsed.pathname !== "/" || parsed.search || parsed.hash) {
      return "";
    }
    return parsed.origin.toLowerCase();
  } catch {
    return "";
  }
}

function isAllowedOrigin(origin, env = process.env) {
  if (!origin) return true;

  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (!/^https?:$/.test(parsed.protocol) || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    return false;
  }

  const normalized = parsed.origin.toLowerCase();
  const exactOrigins = new Set(
    [...DEFAULT_EXACT_ORIGINS, ...configuredOrigins(env)]
      .map(normalizeExactOrigin)
      .filter(Boolean)
  );
  if (exactOrigins.has(normalized)) return true;

  const host = parsed.hostname.toLowerCase();
  const domainSuffixAllowed = configuredDomainSuffixes(env).some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`)
  );
  if (parsed.protocol === "https:" && !parsed.port && domainSuffixAllowed) {
    return true;
  }

  const isLocalHost =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "127.0.0.1" ||
    host === "::1";
  return parsed.protocol === "http:" && isLocalHost && LOCAL_PORTS.has(parsed.port);
}

function corsOrigin(origin, callback) {
  if (isAllowedOrigin(origin)) return callback(null, true);
  const error = new Error("Origin not allowed by CORS policy");
  error.statusCode = 403;
  return callback(error, false);
}

module.exports = { DEFAULT_EXACT_ORIGINS, corsOrigin, isAllowedOrigin };
