const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const jwt = require("jsonwebtoken");

const axios = require("axios");
const Customer = require("../models/Customer");
const Session = require("../models/Session");
const controller = require("../controllers/customerPortalAuthController");
const {
  CUSTOMER_PORTAL_SESSION_DAYS,
  CUSTOMER_PORTAL_SESSION_TYPE,
  requireCustomerPortalSession,
  signCustomerPortalToken,
  validateCustomerPortalSession,
} = require("../utils/customerPortalAuth");

function mockReq({ body = {}, headers = {}, ip = "127.0.0.1", auth = null } = {}) {
  return {
    body,
    headers,
    ip,
    socket: { remoteAddress: ip },
    auth,
  };
}

function mockRes() {
  return {
    statusCode: 200,
    payload: null,
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

function withMockedPortalDependencies(fn) {
  return async () => {
    const originals = {
      axiosPost: axios.post,
      customerFindOneAndUpdate: Customer.findOneAndUpdate,
      customerFindById: Customer.findById,
      sessionCreate: Session.create,
      sessionUpdateOne: Session.updateOne,
      sessionFindOne: Session.findOne,
    };

    controller.__resetRateLimitersForTests();

    try {
      await fn();
    } finally {
      axios.post = originals.axiosPost;
      Customer.findOneAndUpdate = originals.customerFindOneAndUpdate;
      Customer.findById = originals.customerFindById;
      Session.create = originals.sessionCreate;
      Session.updateOne = originals.sessionUpdateOne;
      Session.findOne = originals.sessionFindOne;
      controller.__resetRateLimitersForTests();
    }
  };
}

function installSuccessfulMsg91Mock() {
  const calls = [];
  axios.post = async (url, payload) => {
    calls.push({ url, payload });
    return { data: { type: "success" } };
  };
  return calls;
}

test("customer portal phone normalization follows existing India behavior", () => {
  assert.deepEqual(controller.normalizePortalPhone({ countryCode: "91", phone: "93815 20396" }), {
    countryCode: "91",
    phone: "9381520396",
    fullNumber: "919381520396",
  });
  assert.deepEqual(controller.normalizePortalPhone({ countryCode: "+91", phone: "+91-93815-20396" }), {
    countryCode: "91",
    phone: "9381520396",
    fullNumber: "919381520396",
  });
  assert.equal(controller.normalizePortalPhone({ countryCode: "91", phone: "123" }), null);
});

test("customer portal OTP request sends MSG91 OTP without vendorId or wallet deduction", withMockedPortalDependencies(async () => {
  const calls = installSuccessfulMsg91Mock();
  const req = mockReq({ body: { countryCode: "91", phone: "9381520396" } });
  const res = mockRes();

  await controller.requestOtp(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.success, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.mobile, "919381520396");
  assert.equal(Object.prototype.hasOwnProperty.call(req.body, "vendorId"), false);
}));

test("customer portal OTP request rejects invalid mobile before MSG91", withMockedPortalDependencies(async () => {
  let msg91Calls = 0;
  axios.post = async () => {
    msg91Calls += 1;
    return { data: { type: "success" } };
  };

  const res = mockRes();
  await controller.requestOtp(mockReq({ body: { countryCode: "91", phone: "123" } }), res);

  assert.equal(res.statusCode, 400);
  assert.equal(msg91Calls, 0);
}));

test("customer portal OTP request applies resend protection", withMockedPortalDependencies(async () => {
  installSuccessfulMsg91Mock();

  const first = mockRes();
  await controller.requestOtp(
    mockReq({ body: { countryCode: "91", phone: "9381520396" }, ip: "10.0.0.1" }),
    first
  );

  const second = mockRes();
  await controller.requestOtp(
    mockReq({ body: { countryCode: "91", phone: "9381520396" }, ip: "10.0.0.1" }),
    second
  );

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 429);
}));

test("customer portal verify reuses existing customer and creates 30-day portal session", withMockedPortalDependencies(async () => {
  installSuccessfulMsg91Mock();

  const existingCustomer = {
    _id: "customer-existing",
    countryCode: "91",
    phone: "9381520396",
    fullNumber: "919381520396",
  };
  const createdSessions = [];
  const updatedSessions = [];

  Customer.findOneAndUpdate = async () => existingCustomer;
  Session.create = async (doc) => {
    const session = { _id: "portal-session-1", ...doc };
    createdSessions.push(session);
    return session;
  };
  Session.updateOne = async (query, update) => {
    updatedSessions.push({ query, update });
    return { modifiedCount: 1 };
  };

  const res = mockRes();
  await controller.verifyOtp(
    mockReq({ body: { countryCode: "91", phone: "9381520396", otp: "123456" } }),
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.success, true);
  assert.ok(res.payload.token);
  assert.equal(createdSessions.length, 1);
  assert.equal(createdSessions[0].sessionType, CUSTOMER_PORTAL_SESSION_TYPE);
  assert.equal(createdSessions[0].vendorId, "");
  assert.equal(createdSessions[0].categoryId, "");

  const durationDays = Math.round(
    (new Date(createdSessions[0].expiryTime).getTime() - new Date(createdSessions[0].loginTime).getTime()) /
      (24 * 60 * 60 * 1000)
  );
  assert.equal(durationDays, CUSTOMER_PORTAL_SESSION_DAYS);
  assert.equal(updatedSessions[0].query.sessionType, CUSTOMER_PORTAL_SESSION_TYPE);
}));

test("customer portal verify creates unknown customer once across repeated login", withMockedPortalDependencies(async () => {
  installSuccessfulMsg91Mock();

  const customers = new Map();
  let inserts = 0;
  Customer.findOneAndUpdate = async (query, update) => {
    const fullNumber = query.fullNumber;
    if (!customers.has(fullNumber)) {
      inserts += 1;
      customers.set(fullNumber, {
        _id: `customer-${inserts}`,
        ...update.$setOnInsert,
      });
    }
    return customers.get(fullNumber);
  };
  Session.create = async (doc) => ({ _id: `session-${Math.random()}`, ...doc });
  Session.updateOne = async () => ({ modifiedCount: 1 });

  const first = mockRes();
  await controller.verifyOtp(
    mockReq({ body: { countryCode: "91", phone: "9381520396", otp: "123456" } }),
    first
  );
  const second = mockRes();
  await controller.verifyOtp(
    mockReq({ body: { countryCode: "91", phone: "9381520396", otp: "123456" } }),
    second
  );

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(inserts, 1);
}));

test("customer portal verify rejects invalid OTP response", withMockedPortalDependencies(async () => {
  axios.post = async () => ({ data: { type: "error", message: "Invalid OTP" } });

  const res = mockRes();
  await controller.verifyOtp(
    mockReq({ body: { countryCode: "91", phone: "9381520396", otp: "000000" } }),
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.message, "Invalid or expired OTP.");
}));

test("customer portal token validates only active CUSTOMER_PORTAL sessions", withMockedPortalDependencies(async () => {
  const token = signCustomerPortalToken({
    customerId: "customer-1",
    sessionId: "session-1",
  });

  Session.findOne = () => ({
    lean: async () => ({
      _id: "session-1",
      userId: "customer-1",
      sessionType: CUSTOMER_PORTAL_SESSION_TYPE,
      isActive: true,
      expiryTime: new Date(Date.now() + 10000),
    }),
  });

  const result = await validateCustomerPortalSession(token);
  assert.equal(result.ok, true);
  assert.equal(result.customerId, "customer-1");
}));

test("normal non-portal JWT cannot access customer portal auth", withMockedPortalDependencies(async () => {
  const token = jwt.sign(
    {
      customerId: "customer-1",
      sessionId: "session-1",
    },
    process.env.JWT_SECRET || "dev_jwt_secret_change_me",
    { expiresIn: "1h" }
  );

  const result = await validateCustomerPortalSession(token);
  assert.equal(result.ok, false);
  assert.equal(result.code, "invalid_portal_token");
}));

test("/me derives customer identity from portal auth context, not browser body", withMockedPortalDependencies(async () => {
  Customer.findById = () => ({
    lean: async () => ({
      _id: "customer-authenticated",
      fullNumber: "919381520396",
    }),
  });

  const req = mockReq({
    auth: {
      customerId: "customer-authenticated",
      sessionId: "session-1",
      sessionType: CUSTOMER_PORTAL_SESSION_TYPE,
    },
    body: {
      customerId: "customer-attacker",
    },
  });
  const res = mockRes();

  await controller.me(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.data.customer.phone, "+919381520396");
}));

test("logout invalidates only the current CUSTOMER_PORTAL session", withMockedPortalDependencies(async () => {
  const updates = [];
  Session.updateOne = async (query, update) => {
    updates.push({ query, update });
    return { modifiedCount: 1 };
  };

  const req = mockReq({
    auth: {
      customerId: "customer-1",
      sessionId: "session-current",
      sessionType: CUSTOMER_PORTAL_SESSION_TYPE,
    },
  });
  const res = mockRes();

  await controller.logout(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0].query, {
    _id: "session-current",
    userId: "customer-1",
    sessionType: CUSTOMER_PORTAL_SESSION_TYPE,
  });
  assert.equal(updates[0].update.$set.isActive, false);
}));

test("customer portal middleware rejects non-portal token before controller", async () => {
  const token = jwt.sign(
    {
      customerId: "customer-1",
      sessionId: "session-1",
      sessionType: "STANDARD",
    },
    process.env.JWT_SECRET || "dev_jwt_secret_change_me",
    { expiresIn: "1h" }
  );
  const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
  const res = mockRes();
  let nextCalled = false;

  await requireCustomerPortalSession(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test("customer portal auth source does not depend on vendor wallet deduction", () => {
  const controllerSource = fs.readFileSync(
    path.join(__dirname, "../controllers/customerPortalAuthController.js"),
    "utf8"
  );
  const routesSource = fs.readFileSync(
    path.join(__dirname, "../routes/customerPortalRoutes.js"),
    "utf8"
  );

  assert.doesNotMatch(controllerSource, /deductOTP|hasAvailableOTPBalance|vendorWalletService/);
  assert.doesNotMatch(routesSource, /deductOTP|hasAvailableOTPBalance|vendorWalletService/);
});

test("customer portal route is mounted under /api/customer-portal", () => {
  const serverSource = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");

  assert.match(serverSource, /customerPortalRoutes/);
  assert.match(serverSource, /app\.use\("\/api\/customer-portal", customerPortalRoutes\)/);
});
