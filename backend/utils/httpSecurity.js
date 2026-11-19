const SENSITIVE_KEY = /(authorization|cookie|credential|password|secret|token|otp|authkey|api[-_]?key)/i;
const SECRET_TEXT = [
  /bearer\s+[a-z0-9._~-]+/gi,
  /\beyj[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+\b/gi,
  /mongodb(?:\+srv)?:\/\/[^\s]+/gi,
  /(?:token|secret|password|credential|authkey|api[-_]?key|otp)=([^&\s]+)/gi,
];

function redactText(value) {
  let output = String(value || "");
  for (const pattern of SECRET_TEXT) output = output.replace(pattern, "[REDACTED]");
  return output;
}

function sanitizeValue(value, { errorResponse = false } = {}, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactText(value);
  if (typeof value !== "object") return value;
  if (seen.has(value)) return "[REDACTED]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((entry) => sanitizeValue(entry, { errorResponse }, seen));

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (SENSITIVE_KEY.test(key) || key.toLowerCase() === "stack") return [key, "[REDACTED]"];
      if (errorResponse && key.toLowerCase() === "error") return [key, "Internal error"];
      return [key, sanitizeValue(entry, { errorResponse }, seen)];
    })
  );
}

function sanitizeErrorResponses(req, res, next) {
  const originalJson = res.json.bind(res);
  res.json = (payload) =>
    originalJson(res.statusCode >= 400 ? sanitizeValue(payload, { errorResponse: true }) : payload);
  return next();
}

function safeErrorForLog(error) {
  return {
    name: String(error?.name || "Error"),
    code: String(error?.code || ""),
    message: redactText(error?.message || error || "Unknown error"),
  };
}

function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  if (req.secure || String(req.headers?.["x-forwarded-proto"] || "").toLowerCase() === "https") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return next();
}

function isTrustedProxyAddress(address) {
  const ip = String(address || "").replace(/^::ffff:/, "").toLowerCase();
  if (ip === "::1" || ip === "127.0.0.1") return true;
  if (/^10\./.test(ip) || /^192\.168\./.test(ip) || /^169\.254\./.test(ip)) return true;
  const match = ip.match(/^172\.(\d+)\./);
  if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return true;
  return ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80:");
}

module.exports = {
  isTrustedProxyAddress,
  redactText,
  safeErrorForLog,
  sanitizeErrorResponses,
  sanitizeValue,
  securityHeaders,
};
