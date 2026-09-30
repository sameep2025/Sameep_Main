const assert = require("node:assert");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("node:path");
const test = require("node:test");

const AppConfig = require("../models/AppConfig");
const Customer = require("../models/Customer");
const DummyVendor = require("../models/DummyVendor");
const LoginHistory = require("../models/LoginHistory");
const Session = require("../models/Session");
const customerRoutes = require("../routes/customerRoutes");

const customerRoutesSource = fs.readFileSync(
  path.join(__dirname, "../routes/customerRoutes.js"),
  "utf8"
);
const dummyVendorSource = fs.readFileSync(
  path.join(__dirname, "../models/DummyVendor.js"),
  "utf8"
);

function routeSection(routeName) {
  const start = customerRoutesSource.indexOf(`router.post("${routeName}"`);
  assert.notEqual(start, -1, `${routeName} route should exist`);
  const nextRoute = customerRoutesSource.indexOf("\nrouter.", start + 1);
  const end = nextRoute === -1 ? customerRoutesSource.indexOf("module.exports") : nextRoute;
  return customerRoutesSource.slice(start, end);
}

const JWT_SECRET = process.env.JWT_SECRET || "dev_jwt_secret_change_me";
const CUSTOMER_ID = "64b96b8eada277fb26fa6401";
const CUSTOMER_B_ID = "64b96b8eada277fb26fa6402";
const VENDOR_ID = "69b96b8eada277fb26fa6447";
const VENDOR_B_ID = "69b96b8eada277fb26fa6448";
const CATEGORY_ID = "68b96b8eada277fb26fa6449";
const SESSION_ID = "65b96b8eada277fb26fa6403";
const ACTIVE_EXPIRY = new Date(Date.now() + 60 * 60 * 1000);

function chainLean(value) {
  return {
    lean: async () => value,
  };
}

function chainSortLean(value) {
  return {
    sort() {
      return chainLean(value);
    },
  };
}

function chainSelectLean(value, onSelect) {
  return {
    select(selection) {
      if (onSelect) onSelect(selection);
      return chainLean(value);
    },
    lean: async () => value,
  };
}

function createToken({
  customerId = CUSTOMER_ID,
  vendorId = VENDOR_ID,
  categoryId = CATEGORY_ID,
  sessionId = SESSION_ID,
  sessionType,
  authMethod,
} = {}) {
  return jwt.sign(
    {
      customerId,
      vendorId,
      categoryId,
      sessionId,
      ...(sessionType ? { sessionType } : {}),
      ...(authMethod ? { authMethod } : {}),
    },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

function createAuthSession({
  customerId = CUSTOMER_ID,
  vendorId = VENDOR_ID,
  categoryId = CATEGORY_ID,
  sessionId = SESSION_ID,
  sessionType = "STANDARD",
  authMethod = "OTP",
} = {}) {
  return {
    _id: sessionId,
    userId: customerId,
    vendorId,
    categoryId,
    sessionType,
    authMethod,
    loginTime: new Date(Date.now() - 60 * 1000),
    expiryTime: ACTIVE_EXPIRY,
    isActive: true,
    deviceInfo: "test-device",
  };
}

async function postJson(pathname, body = {}, token = "") {
  const routePath = pathname.replace(/^\/api\/customers/, "");
  const layer = customerRoutes.stack.find((entry) => (
    entry.route?.path === routePath && entry.route?.methods?.post
  ));
  assert.ok(layer, `route not found for ${pathname}`);

  const handlers = layer.route.stack.map((entry) => entry.handle);
  const req = {
    method: "POST",
    originalUrl: pathname,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body,
    ip: "127.0.0.1",
    socket: { remoteAddress: "127.0.0.1" },
  };
  const res = new EventEmitter();
  res.statusCode = 200;
  res.status = function status(code) {
    this.statusCode = code;
    return this;
  };
  res.json = function json(payload) {
    this.payload = payload;
    this.finished = true;
    this.emit("finish");
    return this;
  };

  async function dispatch(index) {
    if (res.finished || index >= handlers.length) return;
    const handler = handlers[index];
    if (handler.length >= 3) {
      await new Promise((resolve, reject) => {
        let settled = false;
        const settle = (fn, value) => {
          if (settled) return;
          settled = true;
          res.off("finish", onFinish);
          fn(value);
        };
        const onFinish = () => settle(resolve);
        res.once("finish", onFinish);
        const maybePromise = handler(req, res, (err) => {
          if (err) settle(reject, err);
          else settle(resolve);
        });
        Promise.resolve(maybePromise).catch((err) => settle(reject, err));
        if (res.finished) settle(resolve);
      });
      await dispatch(index + 1);
      return;
    }

    await handler(req, res);
    await dispatch(index + 1);
  }

  await dispatch(0);
  return { status: res.statusCode, payload: res.payload };
}

async function withMockedPasscodeModels(fn) {
  const originals = {
    appConfigFindOne: AppConfig.findOne,
    customerFindOne: Customer.findOne,
    dummyFindOne: DummyVendor.findOne,
    dummyUpdateOne: DummyVendor.updateOne,
    sessionFindOne: Session.findOne,
    sessionFind: Session.find,
    sessionCreate: Session.create,
    sessionUpdateOne: Session.updateOne,
    loginHistoryFind: LoginHistory.find,
    loginHistoryFindOne: LoginHistory.findOne,
    loginHistoryCreate: LoginHistory.create,
  };

  try {
    await fn();
  } finally {
    AppConfig.findOne = originals.appConfigFindOne;
    Customer.findOne = originals.customerFindOne;
    DummyVendor.findOne = originals.dummyFindOne;
    DummyVendor.updateOne = originals.dummyUpdateOne;
    Session.findOne = originals.sessionFindOne;
    Session.find = originals.sessionFind;
    Session.create = originals.sessionCreate;
    Session.updateOne = originals.sessionUpdateOne;
    LoginHistory.find = originals.loginHistoryFind;
    LoginHistory.findOne = originals.loginHistoryFindOne;
    LoginHistory.create = originals.loginHistoryCreate;
  }
}

function installPasscodeSetMocks({
  authMethod = "OTP",
  vendor = { _id: VENDOR_ID, customerId: CUSTOMER_ID, categoryId: CATEGORY_ID },
  session = createAuthSession({ authMethod }),
} = {}) {
  const state = {
    dummyFindQuery: null,
    dummySelect: null,
    updateQuery: null,
    updateDoc: null,
  };

  Session.findOne = () => chainSortLean(session);
  DummyVendor.findOne = (query) => {
    state.dummyFindQuery = query;
    return chainSelectLean(vendor, (selection) => {
      state.dummySelect = selection;
    });
  };
  DummyVendor.updateOne = async (query, update) => {
    state.updateQuery = query;
    state.updateDoc = update;
    return { modifiedCount: 1 };
  };

  return state;
}

function installPasscodeLoginMocks({
  customer = { _id: CUSTOMER_ID, countryCode: "91", phone: "9999999999", fullNumber: "919999999999" },
  vendor,
  configuredHours = 240,
  activeSessions = [],
} = {}) {
  const state = {
    dummySelect: null,
    sessionCreates: [],
    sessionUpdates: [],
    loginHistoryCreates: [],
  };

  AppConfig.findOne = () => chainLean({ key: "sessionValidity", value: { selectedHour: configuredHours } });
  Customer.findOne = async () => customer;
  DummyVendor.findOne = () => chainSelectLean(vendor, (selection) => {
    state.dummySelect = selection;
  });
  Session.find = async () => activeSessions;
  Session.findOne = () => chainSortLean(null);
  Session.updateOne = async (query, update) => {
    state.sessionUpdates.push({ query, update });
    return { modifiedCount: 1 };
  };
  Session.create = async (doc) => {
    state.sessionCreates.push(doc);
    return { _id: "65b96b8eada277fb26fa6404", ...doc };
  };
  LoginHistory.find = async () => [];
  LoginHistory.findOne = async () => null;
  LoginHistory.create = async (doc) => {
    state.loginHistoryCreates.push(doc);
    return doc;
  };

  return state;
}

test("DummyVendor stores vendor quick-login passcode as hash only", () => {
  assert.match(dummyVendorSource, /vendorLogin:\s*\{/);
  assert.match(dummyVendorSource, /passcodeHash:\s*\{/);
  assert.equal(DummyVendor.schema.path("vendorLogin.passcodeHash").options.select, false);
  assert.match(dummyVendorSource, /passcodeUpdatedAt:\s*\{/);
  assert.doesNotMatch(dummyVendorSource, /passcode:\s*\{/);
  assert.doesNotMatch(dummyVendorSource, /passcodeEncrypted/);
  assert.doesNotMatch(dummyVendorSource, /passcodeHint/);
});

test("vendor passcode set/reset requires existing authenticated customer session", () => {
  const section = routeSection("/vendor-passcode");

  assert.match(section, /requireCustomerSession/);
  assert.match(section, /req\.auth\?\.customerId/);
  assert.match(section, /req\.auth\?\.vendorId/);
  assert.match(section, /req\.auth\?\.authMethod/);
  assert.match(section, /\["OTP", "PASSCODE"\]\.includes\(authMethod\)/);
  assert.doesNotMatch(section, /req\.body\?\.vendorId/);
  assert.match(section, /DummyVendor\.findOne\(vendorQuery\)/);
  assert.match(section, /customerId/);
});

test("vendor passcode set/reset accepts only matching 4-digit values and hashes before storing", () => {
  const section = routeSection("/vendor-passcode");
  const validationIndex = section.indexOf("isValidVendorPasscode(passcode)");
  const matchIndex = section.indexOf("passcode !== confirmPasscode");
  const hashIndex = section.indexOf("bcrypt.hash(passcode, 10)");
  const updateIndex = section.indexOf('"vendorLogin.passcodeHash": passcodeHash');

  assert.notEqual(validationIndex, -1);
  assert.notEqual(matchIndex, -1);
  assert.notEqual(hashIndex, -1);
  assert.notEqual(updateIndex, -1);
  assert.ok(validationIndex < hashIndex);
  assert.ok(matchIndex < hashIndex);
  assert.ok(hashIndex < updateIndex);
  assert.doesNotMatch(section, /passcodeHash.*res\.json/);
});

test("vendor passcode login resolves customer and intended DummyVendor before comparing passcode", () => {
  const section = routeSection("/vendor-passcode-login");
  const customerIndex = section.indexOf("Customer.findOne({ fullNumber: mobile })");
  const vendorIndex = section.indexOf("DummyVendor.findOne");
  const ownerIndex = section.indexOf("String(dummyVendor.customerId) === String(customer._id)");
  const hashExistsIndex = section.indexOf("!ownsVendor || !passcodeHash");
  const compareIndex = section.indexOf("bcrypt.compare(passcode, passcodeHash)");

  assert.notEqual(customerIndex, -1);
  assert.notEqual(vendorIndex, -1);
  assert.notEqual(ownerIndex, -1);
  assert.notEqual(hashExistsIndex, -1);
  assert.notEqual(compareIndex, -1);
  assert.ok(customerIndex < compareIndex);
  assert.ok(vendorIndex < compareIndex);
  assert.ok(ownerIndex < compareIndex);
  assert.ok(hashExistsIndex < compareIndex);
  assert.match(section, /\+vendorLogin\.passcodeHash/);
});

test("vendor passcode login rejects invalid vendor identifiers before database lookup", () => {
  const section = routeSection("/vendor-passcode-login");
  const validityIndex = section.indexOf("mongoose.Types.ObjectId.isValid(vendorId)");
  const vendorLookupIndex = section.indexOf("DummyVendor.findOne");

  assert.notEqual(validityIndex, -1);
  assert.notEqual(vendorLookupIndex, -1);
  assert.ok(validityIndex < vendorLookupIndex);
  assert.match(section, /return res\.status\(401\)\.json\(\{ message: VENDOR_PASSCODE_AUTH_MESSAGE \}\)/);
});

test("failed vendor passcode login uses generic errors and does not terminate sessions", () => {
  const section = routeSection("/vendor-passcode-login");
  const genericFailures = section.match(/VENDOR_PASSCODE_AUTH_MESSAGE/g) || [];
  const firstFailureIndex = section.indexOf("return res.status(401).json({ message: VENDOR_PASSCODE_AUTH_MESSAGE })");
  const sessionIndex = section.indexOf("createVendorSessionForCustomer");

  assert.ok(genericFailures.length >= 3);
  assert.match(customerRoutesSource, /Invalid mobile number or passcode\./);
  assert.notEqual(firstFailureIndex, -1);
  assert.notEqual(sessionIndex, -1);
  assert.ok(firstFailureIndex < sessionIndex);
  assert.doesNotMatch(section.slice(0, firstFailureIndex), /Session\.find|Session\.updateOne|Session\.create/);
});

test("successful vendor passcode login creates normal vendor session and JWT duration from app config", () => {
  const helperStart = customerRoutesSource.indexOf("async function createVendorSessionForCustomer");
  const helperEnd = customerRoutesSource.indexOf("// helper: log duration", helperStart);
  const helper = customerRoutesSource.slice(helperStart, helperEnd);
  const route = routeSection("/vendor-passcode-login");

  assert.match(helper, /getSessionValidityHours\(4\)/);
  assert.match(helper, /Session\.find\(sessionFilter\)/);
  assert.match(helper, /Session\.updateOne\(\{ _id: s\._id \}/);
  assert.match(helper, /Session\.create\(\{/);
  assert.match(helper, /authMethod: "PASSCODE"/);
  assert.match(helper, /jwt\.sign\(payload, JWT_SECRET, \{ expiresIn: `\$\{hours\}h` \}\)/);
  assert.match(helper, /Session\.updateOne\(\{ _id: session\._id \}, \{ \$set: \{ token \} \}\)/);
  assert.match(route, /role: "vendor"/);
  assert.match(route, /displayName: dummyVendor\.businessName/);
});

test("vendor passcode login rate limits repeated failures by normalized mobile and requester", () => {
  const section = routeSection("/vendor-passcode-login");

  assert.match(customerRoutesSource, /const vendorPasscodeAttempts = new Map\(\)/);
  assert.match(customerRoutesSource, /VENDOR_PASSCODE_MAX_FAILED_ATTEMPTS = 5/);
  assert.match(customerRoutesSource, /VENDOR_PASSCODE_COOLDOWN_MS = 15 \* 60 \* 1000/);
  assert.match(customerRoutesSource, /function getVendorPasscodeAttemptKey\(req, mobile\)/);
  assert.match(section, /isVendorPasscodeRateLimited\(attemptKey\)/);
  assert.match(section, /recordVendorPasscodeFailure\(attemptKey\)/);
  assert.match(section, /clearVendorPasscodeFailures\(attemptKey\)/);
});

test("vendor passcode implementation does not modify OTP or central admin passcode routes", () => {
  const requestOtp = routeSection("/request-otp");
  const verifyOtp = routeSection("/verify-otp");
  const adminImpersonate = routeSection("/admin-impersonate");

  assert.match(requestOtp, /https:\/\/control\.msg91\.com\/api\/v5\/otp/);
  assert.match(verifyOtp, /https:\/\/control\.msg91\.com\/api\/v5\/otp\/verify/);
  assert.match(adminImpersonate, /getAdminPasscode\("1234"\)/);
  assert.doesNotMatch(requestOtp, /vendorLogin|passcodeHash|bcrypt/);
  assert.doesNotMatch(verifyOtp, /vendorLogin|passcodeHash|bcrypt/);
  assert.doesNotMatch(adminImpersonate, /vendorLogin|passcodeHash|bcrypt/);
});

test("valid OTP-authenticated vendor session can set passcode as bcrypt hash", async () => {
  await withMockedPasscodeModels(async () => {
    const state = installPasscodeSetMocks({ authMethod: "OTP" });
    const token = createToken({ authMethod: "OTP" });

    const response = await postJson(
      "/api/customers/vendor-passcode",
      { passcode: "1234", confirmPasscode: "1234" },
      token
    );

    assert.equal(response.status, 200);
    assert.equal(response.payload.success, true);
    const storedHash = state.updateDoc.$set["vendorLogin.passcodeHash"];
    assert.notEqual(storedHash, "1234");
    assert.equal(await bcrypt.compare("1234", storedHash), true);
    assert.equal(Boolean(state.updateDoc.$set["vendorLogin.passcodeUpdatedAt"]), true);
    assert.equal(response.payload.passcodeHash, undefined);
  });
});

test("passcode-authenticated vendor session can subsequently reset passcode", async () => {
  await withMockedPasscodeModels(async () => {
    const state = installPasscodeSetMocks({ authMethod: "PASSCODE" });
    const token = createToken({ authMethod: "PASSCODE" });

    const response = await postJson(
      "/api/customers/vendor-passcode",
      { passcode: "9876", confirmPasscode: "9876" },
      token
    );

    assert.equal(response.status, 200);
    assert.equal(await bcrypt.compare("9876", state.updateDoc.$set["vendorLogin.passcodeHash"]), true);
  });
});

test("vendor passcode set rejects invalid formats without storing", async () => {
  for (const invalidPasscode of ["123", "12345", "12a4", "12#4"]) {
    await withMockedPasscodeModels(async () => {
      const state = installPasscodeSetMocks({ authMethod: "OTP" });
      const response = await postJson(
        "/api/customers/vendor-passcode",
        { passcode: invalidPasscode, confirmPasscode: invalidPasscode },
        createToken({ authMethod: "OTP" })
      );

      assert.equal(response.status, 400);
      assert.equal(state.updateDoc, null);
    });
  }
});

test("unauthenticated, customer-portal, admin, and unclassified sessions cannot set passcode", async () => {
  const unauthenticated = await postJson(
    "/api/customers/vendor-passcode",
    { passcode: "1234", confirmPasscode: "1234" }
  );
  assert.equal(unauthenticated.status, 401);

  for (const authMethod of ["ADMIN_IMPERSONATION", "UNKNOWN"]) {
    await withMockedPasscodeModels(async () => {
      const state = installPasscodeSetMocks({ authMethod });
      const response = await postJson(
        "/api/customers/vendor-passcode",
        { passcode: "1234", confirmPasscode: "1234" },
        createToken({ authMethod })
      );

      assert.equal(response.status, 403);
      assert.equal(state.updateDoc, null);
    });
  }

  await withMockedPasscodeModels(async () => {
    const portalSession = createAuthSession({
      vendorId: "",
      categoryId: "",
      sessionType: "CUSTOMER_PORTAL",
      authMethod: "UNKNOWN",
    });
    const state = installPasscodeSetMocks({ session: portalSession });
    const token = createToken({
      vendorId: "",
      categoryId: "",
      sessionType: "CUSTOMER_PORTAL",
      authMethod: "UNKNOWN",
    });

    const response = await postJson(
      "/api/customers/vendor-passcode",
      { passcode: "1234", confirmPasscode: "1234" },
      token
    );

    assert.equal(response.status, 403);
    assert.equal(state.updateDoc, null);
  });
});

test("vendor passcode set derives vendor ownership from session and ignores body overrides", async () => {
  await withMockedPasscodeModels(async () => {
    const state = installPasscodeSetMocks({ authMethod: "OTP" });
    const token = createToken({ authMethod: "OTP", vendorId: VENDOR_ID });

    const response = await postJson(
      "/api/customers/vendor-passcode",
      {
        vendorId: VENDOR_B_ID,
        customerId: CUSTOMER_B_ID,
        passcode: "1234",
        confirmPasscode: "1234",
      },
      token
    );

    assert.equal(response.status, 200);
    assert.equal(state.dummyFindQuery._id, VENDOR_ID);
    assert.equal(state.dummyFindQuery.customerId, CUSTOMER_ID);
    assert.equal(state.updateQuery._id, VENDOR_ID);
  });
});

test("vendor cannot set another vendor's passcode when session-owned vendor lookup fails", async () => {
  await withMockedPasscodeModels(async () => {
    const state = installPasscodeSetMocks({ authMethod: "OTP", vendor: null });
    const response = await postJson(
      "/api/customers/vendor-passcode",
      { passcode: "1234", confirmPasscode: "1234" },
      createToken({ authMethod: "OTP" })
    );

    assert.equal(response.status, 403);
    assert.equal(state.updateDoc, null);
  });
});

test("correct mobile and vendor passcode succeeds, selects hash explicitly, and replaces matching session", async () => {
  await withMockedPasscodeModels(async () => {
    const passcodeHash = await bcrypt.hash("1234", 10);
    const oldSession = createAuthSession({ sessionId: "65b96b8eada277fb26fa6410", authMethod: "OTP" });
    const state = installPasscodeLoginMocks({
      vendor: {
        _id: VENDOR_ID,
        customerId: CUSTOMER_ID,
        categoryId: CATEGORY_ID,
        businessName: "Demo Salon",
        vendorLogin: { passcodeHash },
      },
      activeSessions: [oldSession],
      configuredHours: 240,
    });

    const response = await postJson("/api/customers/vendor-passcode-login", {
      countryCode: "+91",
      phone: "09999 999 999",
      vendorId: VENDOR_ID,
      categoryId: CATEGORY_ID,
      passcode: "1234",
    });

    assert.equal(response.status, 200);
    assert.equal(response.payload.message, "verified");
    assert.equal(response.payload.role, "vendor");
    assert.equal(response.payload.displayName, "Demo Salon");
    assert.match(state.dummySelect, /\+vendorLogin\.passcodeHash/);
    assert.equal(state.sessionUpdates[0].query._id, oldSession._id);
    assert.equal(state.sessionUpdates[0].update.$set.isActive, false);
    assert.equal(state.sessionCreates[0].authMethod, "PASSCODE");
    assert.equal(String(state.sessionCreates[0].vendorId), VENDOR_ID);
    assert.equal(String(state.sessionCreates[0].categoryId), CATEGORY_ID);

    const expiryMs = new Date(state.sessionCreates[0].expiryTime).getTime() - new Date(state.sessionCreates[0].loginTime).getTime();
    assert.ok(Math.abs(expiryMs - 240 * 60 * 60 * 1000) < 1000);

    const decoded = jwt.verify(response.payload.token, JWT_SECRET);
    assert.equal(decoded.authMethod, "PASSCODE");
    assert.equal(decoded.vendorId, VENDOR_ID);
    assert.equal(decoded.categoryId, CATEGORY_ID);
    assert.equal(response.payload.session.token, response.payload.token);
    assert.equal(response.payload.session.vendorLogin, undefined);
  });
});

test("wrong passcode, wrong mobile/vendor relationship, missing passcode, and unknown mobile fail generically", async () => {
  const genericMessage = "Invalid mobile number or passcode.";
  const passcodeHash = await bcrypt.hash("1234", 10);
  const scenarios = [
    {
      name: "wrong passcode",
      customer: { _id: CUSTOMER_ID, fullNumber: "919999999999" },
      vendor: { _id: VENDOR_ID, customerId: CUSTOMER_ID, vendorLogin: { passcodeHash } },
      passcode: "0000",
    },
    {
      name: "mobile A vendor B",
      customer: { _id: CUSTOMER_ID, fullNumber: "919999999999" },
      vendor: { _id: VENDOR_ID, customerId: CUSTOMER_B_ID, vendorLogin: { passcodeHash } },
      passcode: "1234",
    },
    {
      name: "legacy no passcode",
      customer: { _id: CUSTOMER_ID, fullNumber: "919999999999" },
      vendor: { _id: VENDOR_ID, customerId: CUSTOMER_ID, vendorLogin: {} },
      passcode: "1234",
    },
    {
      name: "unknown mobile",
      customer: null,
      vendor: { _id: VENDOR_ID, customerId: CUSTOMER_ID, vendorLogin: { passcodeHash } },
      passcode: "1234",
    },
  ];

  for (const scenario of scenarios) {
    await withMockedPasscodeModels(async () => {
      const state = installPasscodeLoginMocks({
        customer: scenario.customer,
        vendor: scenario.vendor,
        activeSessions: [createAuthSession()],
      });

      const response = await postJson("/api/customers/vendor-passcode-login", {
        countryCode: "91",
        phone: `99999999${Math.floor(Math.random() * 90 + 10)}`,
        vendorId: VENDOR_ID,
        categoryId: CATEGORY_ID,
        passcode: scenario.passcode,
      });

      assert.equal(response.status, 401, scenario.name);
      assert.equal(response.payload.message, genericMessage, scenario.name);
      assert.equal(state.sessionUpdates.length, 0, scenario.name);
      assert.equal(state.sessionCreates.length, 0, scenario.name);
    });
  }
});

test("failed passcode login does not terminate existing active session", async () => {
  await withMockedPasscodeModels(async () => {
    const state = installPasscodeLoginMocks({
      vendor: {
        _id: VENDOR_ID,
        customerId: CUSTOMER_ID,
        vendorLogin: { passcodeHash: await bcrypt.hash("1234", 10) },
      },
      activeSessions: [createAuthSession()],
    });

    const response = await postJson("/api/customers/vendor-passcode-login", {
      countryCode: "91",
      phone: "9999999999",
      vendorId: VENDOR_ID,
      categoryId: CATEGORY_ID,
      passcode: "1111",
    });

    assert.equal(response.status, 401);
    assert.equal(state.sessionUpdates.length, 0);
    assert.equal(state.sessionCreates.length, 0);
  });
});

test("reset passcode invalidates old passcode and allows new passcode", async () => {
  await withMockedPasscodeModels(async () => {
    const oldHash = await bcrypt.hash("1111", 10);
    const resetState = installPasscodeSetMocks({ authMethod: "OTP" });
    const resetResponse = await postJson(
      "/api/customers/vendor-passcode",
      { passcode: "2222", confirmPasscode: "2222" },
      createToken({ authMethod: "OTP" })
    );

    assert.equal(resetResponse.status, 200);
    const newHash = resetState.updateDoc.$set["vendorLogin.passcodeHash"];
    assert.equal(await bcrypt.compare("1111", newHash), false);
    assert.equal(await bcrypt.compare("2222", newHash), true);

    const failState = installPasscodeLoginMocks({
      vendor: { _id: VENDOR_ID, customerId: CUSTOMER_ID, vendorLogin: { passcodeHash: newHash } },
    });
    const oldLogin = await postJson("/api/customers/vendor-passcode-login", {
      countryCode: "91",
      phone: "9999999999",
      vendorId: VENDOR_ID,
      categoryId: CATEGORY_ID,
      passcode: "1111",
    });
    assert.equal(oldLogin.status, 401);
    assert.equal(failState.sessionCreates.length, 0);

    const successState = installPasscodeLoginMocks({
      vendor: { _id: VENDOR_ID, customerId: CUSTOMER_ID, vendorLogin: { passcodeHash: newHash } },
    });
    const newLogin = await postJson("/api/customers/vendor-passcode-login", {
      countryCode: "91",
      phone: "9999999999",
      vendorId: VENDOR_ID,
      categoryId: CATEGORY_ID,
      passcode: "2222",
    });
    assert.equal(newLogin.status, 200);
    assert.equal(successState.sessionCreates[0].authMethod, "PASSCODE");
    assert.notEqual(oldHash, newHash);
  });
});

test("passcode rate limiter blocks after threshold and success clears mobile/requester state", async () => {
  await withMockedPasscodeModels(async () => {
    const passcodeHash = await bcrypt.hash("1234", 10);
    installPasscodeLoginMocks({
      vendor: { _id: VENDOR_ID, customerId: CUSTOMER_ID, vendorLogin: { passcodeHash } },
    });

    const baseBody = {
      countryCode: "91",
      phone: "9888888888",
      vendorId: VENDOR_ID,
      categoryId: CATEGORY_ID,
    };

    for (let i = 0; i < 5; i += 1) {
      const response = await postJson("/api/customers/vendor-passcode-login", {
        ...baseBody,
        passcode: "0000",
      });
      assert.equal(response.status, 401);
      assert.equal(response.payload.message, "Invalid mobile number or passcode.");
    }

    const blocked = await postJson("/api/customers/vendor-passcode-login", {
      ...baseBody,
      passcode: "1234",
    });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.payload.message, "Too many attempts. Please try again later.");
  });

  await withMockedPasscodeModels(async () => {
    const passcodeHash = await bcrypt.hash("1234", 10);
    installPasscodeLoginMocks({
      vendor: { _id: VENDOR_ID, customerId: CUSTOMER_ID, vendorLogin: { passcodeHash } },
    });
    const baseBody = {
      countryCode: "91",
      phone: "9777777777",
      vendorId: VENDOR_ID,
      categoryId: CATEGORY_ID,
    };

    for (let i = 0; i < 4; i += 1) {
      const response = await postJson("/api/customers/vendor-passcode-login", {
        ...baseBody,
        passcode: "0000",
      });
      assert.equal(response.status, 401);
    }

    const success = await postJson("/api/customers/vendor-passcode-login", {
      ...baseBody,
      passcode: "1234",
    });
    assert.equal(success.status, 200);

    const firstAfterClear = await postJson("/api/customers/vendor-passcode-login", {
      ...baseBody,
      passcode: "0000",
    });
    const secondAfterClear = await postJson("/api/customers/vendor-passcode-login", {
      ...baseBody,
      passcode: "0000",
    });
    assert.equal(firstAfterClear.status, 401);
    assert.equal(secondAfterClear.status, 401);
  });
});

test("passcode limiter stores only attempt timestamps and blockedUntil metadata", () => {
  assert.match(customerRoutesSource, /const vendorPasscodeAttempts = new Map\(\)/);
  assert.match(customerRoutesSource, /attempts: \[\]/);
  assert.match(customerRoutesSource, /blockedUntil: 0/);
  assert.doesNotMatch(customerRoutesSource, /vendorPasscodeAttempts\.set\([^)]*passcode/);
  assert.doesNotMatch(customerRoutesSource, /vendorPasscodeAttempts\.set\([^)]*passcodeHash/);
});
