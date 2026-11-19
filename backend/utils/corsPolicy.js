const DEFAULT_EXACT_ORIGINS = [
  "https://newsameep.go-kar.net",
  "https://main.d2vss5b9fy3xv.amplifyapp.com",
  "https://main.d18xuzvz5wtiup.amplifyapp.com",
  "https://main.d3t45ap4sbsqgp.amplifyapp.com",
];

const LOCAL_PORTS = new Set(["3000", "3001", "3002", "4000", "6001"]);

function configuredOrigins(env = process.env) {
  return String(env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
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
    [...DEFAULT_EXACT_ORIGINS, ...configuredOrigins(env)].map((value) => {
      try {
        return new URL(value).origin.toLowerCase();
      } catch {
        return "";
      }
    })
  );
  if (exactOrigins.has(normalized)) return true;

  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol === "https:" && (host === "sameep.app" || host.endsWith(".sameep.app"))) {
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
