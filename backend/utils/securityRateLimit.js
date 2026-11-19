const crypto = require("crypto");

const stores = new Set();

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function requestIp(req) {
  return String(req.ip || req.socket?.remoteAddress || "unknown").trim().toLowerCase();
}

function hashedKey(parts) {
  return crypto
    .createHash("sha256")
    .update(parts.map((part) => String(part || "").trim().toLowerCase()).join("|"))
    .digest("base64url");
}

function ipAndFieldsKey(...fieldReaders) {
  return (req) =>
    hashedKey([
      requestIp(req),
      ...fieldReaders.map((reader) => (typeof reader === "function" ? reader(req) : "")),
    ]);
}

function createRateLimiter({ name, windowMs, max, keyGenerator = requestIp }) {
  const entries = new Map();
  stores.add(entries);

  return (req, res, next) => {
    const now = Date.now();
    const key = `${name}:${keyGenerator(req)}`;
    let state = entries.get(key);
    if (!state || state.resetAt <= now) {
      state = { count: 0, resetAt: now + windowMs };
    }
    state.count += 1;
    entries.set(key, state);

    if (entries.size > 10000) {
      for (const [entryKey, entry] of entries) {
        if (entry.resetAt <= now) entries.delete(entryKey);
      }
    }

    const setHeader = (header, value) => {
      if (typeof res.setHeader === "function") res.setHeader(header, value);
      else if (typeof res.set === "function") res.set(header, value);
    };
    setHeader("RateLimit-Limit", String(max));
    setHeader("RateLimit-Remaining", String(Math.max(max - state.count, 0)));
    setHeader("RateLimit-Reset", String(Math.ceil(state.resetAt / 1000)));

    if (state.count > max) {
      setHeader("Retry-After", String(Math.max(Math.ceil((state.resetAt - now) / 1000), 1)));
      return res.status(429).json({
        success: false,
        message: "Too many requests. Please try again later.",
        code: "rate_limited",
      });
    }

    return next();
  };
}

function resetRateLimitersForTests() {
  for (const store of stores) store.clear();
}

module.exports = {
  createRateLimiter,
  hashedKey,
  ipAndFieldsKey,
  positiveInteger,
  requestIp,
  resetRateLimitersForTests,
};
