const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const cors = require("cors");

const { corsOrigin, isAllowedOrigin } = require("../utils/corsPolicy");
const {
  isTrustedProxyAddress,
  sanitizeErrorResponses,
  securityHeaders,
} = require("../utils/httpSecurity");
const {
  createRateLimiter,
  ipAndFieldsKey,
  requestIp,
  resetRateLimitersForTests,
} = require("../utils/securityRateLimit");
const { buildAnalyticsEventInput, safeOrigin } = require("../routes/siteAnalyticsRoutes");
const siteAnalyticsRoutes = require("../routes/siteAnalyticsRoutes");
const DummyVendor = require("../models/DummyVendor");
const SiteAnalyticsEvent = require("../models/SiteAnalyticsEvent");

const backendRoot = path.join(__dirname, "..");

function source(relativePath) {
  return fs.readFileSync(path.join(backendRoot, relativePath), "utf8");
}

function responseRecorder() {
  return {
    statusCode: 200,
    payload: null,
    headers: {},
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = String(value);
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

test.afterEach(() => resetRateLimitersForTests());

test("M-01 rate limiter allows the boundary then returns 429 without trusting raw forwarded headers", () => {
  const limiter = createRateLimiter({ name: "test", windowMs: 60000, max: 2 });
  const req = {
    ip: "198.51.100.10",
    socket: { remoteAddress: "198.51.100.10" },
    headers: { "x-forwarded-for": "203.0.113.99" },
  };
  assert.equal(requestIp(req), "198.51.100.10");

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const res = responseRecorder();
    let nextCalled = false;
    limiter(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, attempt <= 2);
    assert.equal(res.statusCode, attempt <= 2 ? 200 : 429);
  }
});

test("M-01 scoped keys do not combine unrelated vendors sharing one public IP", () => {
  const keyGenerator = ipAndFieldsKey((req) => req.body?.vendorId);
  const common = { ip: "198.51.100.10", socket: {}, headers: {} };
  assert.notEqual(
    keyGenerator({ ...common, body: { vendorId: "vendor-a" } }),
    keyGenerator({ ...common, body: { vendorId: "vendor-b" } })
  );
});

test("M-01 sensitive routes use scoped rate limiters", () => {
  assert.match(source("routes/adminRoutes.js"), /router\.post\("\/login", adminLoginLimiter/);
  assert.match(source("routes/customerRoutes.js"), /router\.post\("\/request-otp", otpRequestLimiter/);
  assert.match(source("routes/customerRoutes.js"), /router\.post\("\/verify-otp", otpVerifyLimiter/);
  assert.match(source("routes/customerPortalRoutes.js"), /auth\/request-otp", otpRequestLimiter/);
  assert.match(source("routes/enquiryRoutes.js"), /router\.post\('\/', publicEnquiryLimiter/);
  assert.match(source("routes/siteAnalyticsRoutes.js"), /router\.post\("\/track", analyticsIngestionLimiter/);
});

test("M-02 CORS permits only environment-configured roots and genuine subdomains", () => {
  const testEnv = { CORS_ALLOWED_DOMAIN_SUFFIXES: " SAMEEP.APP " };
  const preProdEnv = { CORS_ALLOWED_DOMAIN_SUFFIXES: "ynot-dev.co.in" };
  const prodEnv = { CORS_ALLOWED_DOMAIN_SUFFIXES: "ynot.co.in" };

  assert.equal(isAllowedOrigin("https://sameep.app", testEnv), true);
  assert.equal(isAllowedOrigin("https://beautyspot.sameep.app", testEnv), true);
  assert.equal(isAllowedOrigin("https://nested.beautyspot.sameep.app", testEnv), true);
  assert.equal(isAllowedOrigin("https://admin.ynot-dev.co.in", preProdEnv), true);
  assert.equal(isAllowedOrigin("https://vendor-preview.ynot-dev.co.in", preProdEnv), true);
  assert.equal(isAllowedOrigin("https://hassan-urban-salon.ynot-dev.co.in", preProdEnv), true);
  assert.equal(isAllowedOrigin("https://admin.ynot.co.in", prodEnv), true);

  assert.equal(isAllowedOrigin("https://admin.ynot-dev.co.in", testEnv), false);
  assert.equal(isAllowedOrigin("https://admin.ynot.co.in", preProdEnv), false);
  assert.equal(isAllowedOrigin("https://admin.sameep.app", prodEnv), false);
  assert.equal(isAllowedOrigin("https://sameep.app", {}), false);
});

test("M-02 CORS preserves exact origins and approved localhost development", () => {
  const exactEnv = {
    CORS_ALLOWED_ORIGINS: " https://admin.example.net, https://preview.example.net:8443 ",
  };
  assert.equal(isAllowedOrigin("https://admin.example.net", exactEnv), true);
  assert.equal(isAllowedOrigin("https://preview.example.net:8443", exactEnv), true);
  assert.equal(isAllowedOrigin("https://other.example.net", exactEnv), false);
  assert.equal(isAllowedOrigin("http://localhost:4000"), true);
  assert.equal(isAllowedOrigin("http://hairaffairprsalonspa.localhost:4000"), true);
  assert.equal(isAllowedOrigin("http://deep.localhost:4000"), true);
  assert.equal(isAllowedOrigin(undefined), true);
});

test("M-02 CORS rejects unsafe suffix configuration and malicious origins", () => {
  const env = { CORS_ALLOWED_DOMAIN_SUFFIXES: "ynot.co.in" };
  const invalidSuffixes = [
    "*.ynot.co.in",
    ".ynot.co.in",
    "https://ynot.co.in",
    "ynot.co.in/path",
    "127.0.0.1",
    "localhost",
    "ynot.co.in:443",
  ];
  for (const suffix of invalidSuffixes) {
    assert.equal(
      isAllowedOrigin("https://salon.ynot.co.in", { CORS_ALLOWED_DOMAIN_SUFFIXES: suffix }),
      false,
      suffix
    );
  }

  assert.equal(isAllowedOrigin("https://evilynot.co.in", env), false);
  assert.equal(isAllowedOrigin("https://ynot.co.in.attacker.example", env), false);
  assert.equal(isAllowedOrigin("https://sameep.app.attacker.example", env), false);
  assert.equal(isAllowedOrigin("http://salon.ynot.co.in", env), false);
  assert.equal(isAllowedOrigin("wss://salon.ynot.co.in", env), false);
  assert.equal(isAllowedOrigin("https://salon.ynot.co.in:8443", env), false);
  assert.equal(isAllowedOrigin("not-an-origin", env), false);
  assert.equal(isAllowedOrigin("https://sameep.app.attacker.example"), false);
  assert.equal(isAllowedOrigin("http://localhost.attacker.example:4000"), false);
  assert.equal(isAllowedOrigin("http://evil-localhost:4000"), false);
  assert.equal(isAllowedOrigin("https://hairaffairprsalonspa.localhost:4000"), false);
  assert.equal(isAllowedOrigin("https://evil-example.com"), false);
  assert.equal(isAllowedOrigin("http://localhost:9999"), false);

  let deniedError = null;
  corsOrigin("https://evil-example.com", (error) => {
    deniedError = error;
  });
  assert.equal(deniedError?.statusCode, 403);
});

test("M-02 CORS preflight allows configured applications and rejects other environments", async (t) => {
  const originalSuffixes = process.env.CORS_ALLOWED_DOMAIN_SUFFIXES;
  const originalOrigins = process.env.CORS_ALLOWED_ORIGINS;
  process.env.CORS_ALLOWED_DOMAIN_SUFFIXES = "ynot-dev.co.in";
  delete process.env.CORS_ALLOWED_ORIGINS;
  t.after(() => {
    if (originalSuffixes === undefined) delete process.env.CORS_ALLOWED_DOMAIN_SUFFIXES;
    else process.env.CORS_ALLOWED_DOMAIN_SUFFIXES = originalSuffixes;
    if (originalOrigins === undefined) delete process.env.CORS_ALLOWED_ORIGINS;
    else process.env.CORS_ALLOWED_ORIGINS = originalOrigins;
  });

  const corsMiddleware = cors({
    origin: corsOrigin,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
  });

  function preflight(origin) {
    return new Promise((resolve) => {
      const headers = {};
      const req = {
        method: "OPTIONS",
        headers: {
          origin,
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type",
        },
      };
      const res = {
        statusCode: 200,
        setHeader(name, value) {
          headers[String(name).toLowerCase()] = String(value);
        },
        getHeader(name) {
          return headers[String(name).toLowerCase()];
        },
        end() {
          resolve({ status: this.statusCode, headers });
        },
      };
      corsMiddleware(req, res, (error) => {
        resolve({ status: Number(error?.statusCode) || 500, headers, error });
      });
    });
  }

  for (const origin of [
    "https://admin.ynot-dev.co.in",
    "https://vendor-preview.ynot-dev.co.in",
    "https://hassan-urban-salon.ynot-dev.co.in",
  ]) {
    const response = await preflight(origin);
    assert.equal(response.status, 204, origin);
    assert.equal(response.headers["access-control-allow-origin"], origin);
    assert.match(response.headers.vary || "", /Origin/);
  }

  const rejected = await preflight("https://admin.sameep.app");
  assert.equal(rejected.status, 403);
  assert.equal(rejected.headers["access-control-allow-origin"], undefined);
});

test("M-02 proxy trust is restricted to loopback and private network addresses", () => {
  assert.equal(isTrustedProxyAddress("127.0.0.1"), true);
  assert.equal(isTrustedProxyAddress("10.0.1.20"), true);
  assert.equal(isTrustedProxyAddress("172.31.4.5"), true);
  assert.equal(isTrustedProxyAddress("192.168.1.2"), true);
  assert.equal(isTrustedProxyAddress("203.0.113.10"), false);
});

test("M-03 sanitizes error responses while preserving successful authentication tokens", () => {
  const successRes = responseRecorder();
  sanitizeErrorResponses({}, successRes, () => {});
  successRes.json({ token: "legitimate-success-token" });
  assert.equal(successRes.payload.token, "legitimate-success-token");

  const errorRes = responseRecorder();
  errorRes.statusCode = 500;
  sanitizeErrorResponses({}, errorRes, () => {});
  errorRes.json({
    message: "mongodb+srv://user:password@example/db",
    error: "Bearer private.jwt.value",
    stack: "internal stack",
  });
  assert.equal(errorRes.payload.message, "[REDACTED]");
  assert.equal(errorRes.payload.error, "Internal error");
  assert.equal(errorRes.payload.stack, "[REDACTED]");
});

test("M-05 analytics fields are bounded and ingestion validates vendor and origin", () => {
  const input = buildAnalyticsEventInput(
    {
      visitorId: "v".repeat(500),
      href: `https://example.test/${"x".repeat(3000)}`,
      userAgent: "browser-controlled-value",
    },
    "Trusted-UA/1.0"
  );
  assert.equal(input.visitorId.length, 128);
  assert.equal(input.href.length, 2048);
  assert.equal(input.userAgent, "Trusted-UA/1.0");
  assert.equal(safeOrigin("not a URL"), "");

  const routeSource = source("routes/siteAnalyticsRoutes.js");
  assert.match(routeSource, /16 \* 1024/);
  assert.match(routeSource, /status: "Published"/);
  assert.match(routeSource, /Analytics vendor origin mismatch/);
});

test("M-05 valid anonymous vendor analytics are accepted but cross-vendor subdomains fail closed", async () => {
  const route = siteAnalyticsRoutes.stack.find((layer) => layer.route?.path === "/track");
  const handler = route.route.stack.at(-1).handle;
  const originalFindOne = DummyVendor.findOne;
  const originalCreate = SiteAnalyticsEvent.create;
  let persisted = null;

  DummyVendor.findOne = (query) => ({
    select() {
      this.query = query;
      return this;
    },
    lean: async () => ({ _id: query._id, status: "Published", subdomain: "beautyspot" }),
  });
  SiteAnalyticsEvent.create = async (payload) => {
    persisted = payload;
    return { _id: "event-1" };
  };

  try {
    const validReq = {
      body: {
        pageType: "vendor_preview",
        eventType: "page_view",
        vendorId: "690000000000000000000001",
        origin: "https://beautyspot.sameep.app",
        visitorId: "visitor-1",
      },
      headers: { origin: "https://beautyspot.sameep.app", "user-agent": "Browser/1" },
    };
    const validRes = responseRecorder();
    await handler(validReq, validRes);
    assert.equal(validRes.statusCode, 201);
    assert.equal(persisted.vendorId, validReq.body.vendorId);
    assert.equal(persisted.userAgent, "Browser/1");

    persisted = null;
    const mismatchReq = {
      ...validReq,
      body: { ...validReq.body, origin: "https://another.sameep.app" },
      headers: { ...validReq.headers, origin: "https://another.sameep.app" },
    };
    const mismatchRes = responseRecorder();
    await handler(mismatchReq, mismatchRes);
    assert.equal(mismatchRes.statusCode, 403);
    assert.equal(persisted, null);
  } finally {
    DummyVendor.findOne = originalFindOne;
    SiteAnalyticsEvent.create = originalCreate;
  }
});

test("M-06 onboarding bypass uses explicit enablement and server-side hashed verification", () => {
  const routeSource = source("routes/customerRoutes.js");
  const serviceSource = source("services/onboardingBypassService.js");
  const passcodeService = source("services/adminPasscodeService.js");
  assert.match(routeSource, /router\.post\("\/onboarding-bypass\/authorize", onboardingBypassLimiter/);
  assert.match(serviceSource, /ONBOARDING_OTP_BYPASS_ENABLED === "true"/);
  assert.match(serviceSource, /verifyAdminPasscode/);
  assert.doesNotMatch(serviceSource, /ONBOARDING_OTP_BYPASS_PASSCODE_HASH/);
  assert.match(passcodeService, /bcrypt\.compare/);
  assert.match(passcodeService, /credentialVersion/);
  assert.doesNotMatch(routeSource, /router\.post\("\/bypass-otp"/);
});

test("L-01 sets compatible baseline security headers without an unverified CSP", () => {
  const req = { secure: true, headers: {} };
  const res = responseRecorder();
  let nextCalled = false;
  securityHeaders(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  assert.equal(res.headers["x-content-type-options"], "nosniff");
  assert.equal(res.headers["x-frame-options"], "SAMEORIGIN");
  assert.equal(res.headers["strict-transport-security"], "max-age=31536000; includeSubDomains");
  assert.equal(res.headers["content-security-policy"], undefined);
});
