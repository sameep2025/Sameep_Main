const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = process.env.JWT_SECRET || "round4-security-test-secret";

const backendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(backendRoot, "..");
const readBackend = (file) => fs.readFileSync(path.join(backendRoot, file), "utf8");
const readRepo = (file) => fs.readFileSync(path.join(repoRoot, file), "utf8");

const VENDOR_ID = "507f1f77bcf86cd799439011";
const OTHER_VENDOR_ID = "507f1f77bcf86cd799439012";
const CUSTOMER_ID = "507f1f77bcf86cd799439013";
const OTHER_CUSTOMER_ID = "507f1f77bcf86cd799439014";
const BILL_ID = "507f1f77bcf86cd799439015";
const SESSION_ID = "507f1f77bcf86cd799439016";

function makeQuery(value) {
  return {
    select() { return this; },
    sort() { return this; },
    lean: async () => value,
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  };
}

function invokeMiddleware(middleware, req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { resolve({ next: false, status: this.statusCode, payload, req }); },
    };
    middleware(req, res, () => resolve({ next: true, status: 200, req }));
  });
}

test("Round 4 billing full reads are protected while public bill-link routes remain separate", () => {
  const source = readBackend("routes/billingRoutes.js");
  assert.match(source, /public\/code\/:code", billingController\.getPublicBillDetailsByCode/);
  assert.match(source, /public\/:id", billingController\.getPublicBillDetails/);
  assert.match(
    source,
    /router\.get\(\s*"\/:id",\s*requireVendorAccessFromExistingAuth\(resolveBillVendorId\)/
  );

  const vendorRoutes = readBackend("routes/vendorRoutes.js");
  assert.match(vendorRoutes, /"\/dashboard\/bills"[\s\S]*requireVendorAccessFromExistingAuth/);
  assert.match(vendorRoutes, /"\/dashboard\/bills\/:billId"[\s\S]*BillingSession\.findById/);
});

test("Round 4 billing read rejects missing and cross-vendor auth and accepts owner/admin", async (t) => {
  const Session = require("../models/Session");
  const DummyVendor = require("../models/DummyVendor");
  const Vendor = require("../models/Vendor");
  const { requireVendorAccessFromExistingAuth } = require("../utils/vendorWriteAuth");
  const originals = {
    sessionFind: Session.findOne,
    dummyExists: DummyVendor.exists,
    vendorExists: Vendor.exists,
  };
  t.after(() => {
    Session.findOne = originals.sessionFind;
    DummyVendor.exists = originals.dummyExists;
    Vendor.exists = originals.vendorExists;
  });

  Session.findOne = () => makeQuery({
    _id: SESSION_ID,
    userId: CUSTOMER_ID,
    vendorId: OTHER_VENDOR_ID,
    isActive: true,
    expiryTime: new Date(Date.now() + 60_000),
  });
  DummyVendor.exists = async ({ _id, customerId }) =>
    String(_id) === OTHER_VENDOR_ID && String(customerId) === CUSTOMER_ID;
  Vendor.exists = async () => false;

  const middleware = requireVendorAccessFromExistingAuth(() => VENDOR_ID);
  const run = (token) => invokeMiddleware(middleware, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    params: { id: BILL_ID },
    body: {},
    query: {},
  });

  assert.equal((await run("")).status, 401);

  const crossVendorToken = jwt.sign(
    { customerId: CUSTOMER_ID, vendorId: OTHER_VENDOR_ID, sessionId: SESSION_ID },
    process.env.JWT_SECRET
  );
  assert.equal((await run(crossVendorToken)).status, 403);

  Session.findOne = () => makeQuery({
    _id: SESSION_ID,
    userId: CUSTOMER_ID,
    vendorId: VENDOR_ID,
    isActive: true,
    expiryTime: new Date(Date.now() + 60_000),
  });
  DummyVendor.exists = async ({ _id, customerId }) =>
    String(_id) === VENDOR_ID && String(customerId) === CUSTOMER_ID;
  const ownerToken = jwt.sign(
    { customerId: CUSTOMER_ID, vendorId: VENDOR_ID, sessionId: SESSION_ID },
    process.env.JWT_SECRET
  );
  assert.equal((await run(ownerToken)).next, true);

  const adminToken = jwt.sign({ adminId: "admin-1" }, process.env.JWT_SECRET);
  assert.equal((await run(adminToken)).next, true);
});

test("Round 4 loyalty mutations and wallets require auth while public rule reads are sanitized", () => {
  const routes = readBackend("routes/loyaltyRoutes.js");
  assert.equal((routes.match(/requireVendorAccessFromExistingAuth/g) || []).length, 3);
  assert.match(routes, /req\.body\?\.vendorId/);
  assert.match(routes, /req\.query\?\.vendorId/);
  assert.match(routes, /router\.get\([\s\S]*"\/vendor-rule\/:vendorId",[\s\S]*loyaltyController\.getVendorRule/);

  const controller = readBackend("controllers/loyaltyController.js");
  assert.match(controller, /const vendorId = req\.vendorWriteAuth\?\.vendorId/);
  assert.match(controller, /select\("isEnabled minBillAmount rounding earn expiry redeem"\)/);
  assert.doesNotMatch(controller, /vendorId: payload\.vendorId/);
});

test("Round 4 loyalty controllers derive wallet and rule scope from authorized vendor", async (t) => {
  const LoyaltyLedger = require("../models/LoyaltyLedger");
  const VendorLoyaltyRule = require("../models/VendorLoyaltyRule");
  const controller = require("../controllers/loyaltyController");
  const originalLedgerFind = LoyaltyLedger.find;
  const originalRuleUpdate = VendorLoyaltyRule.findOneAndUpdate;
  t.after(() => {
    LoyaltyLedger.find = originalLedgerFind;
    VendorLoyaltyRule.findOneAndUpdate = originalRuleUpdate;
  });

  let walletQuery = null;
  LoyaltyLedger.find = async (query) => {
    walletQuery = query;
    return [];
  };
  const walletRes = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
  await controller.getWallet({
    query: { vendorId: OTHER_VENDOR_ID, customerId: CUSTOMER_ID },
    vendorWriteAuth: { vendorId: VENDOR_ID },
  }, walletRes);
  assert.equal(String(walletQuery.vendorId), VENDOR_ID);
  assert.equal(String(walletQuery.customerId), CUSTOMER_ID);

  let ruleFilter = null;
  let ruleUpdate = null;
  VendorLoyaltyRule.findOneAndUpdate = async (filter, update) => {
    ruleFilter = filter;
    ruleUpdate = update;
    return { vendorId: filter.vendorId };
  };
  const ruleRes = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
  await controller.upsertVendorRule({
    body: { vendorId: OTHER_VENDOR_ID, isEnabled: true },
    vendorWriteAuth: { vendorId: VENDOR_ID },
  }, ruleRes);
  assert.equal(String(ruleFilter.vendorId), VENDOR_ID);
  assert.equal(String(ruleUpdate.vendorId), VENDOR_ID);
});

test("Round 4 customer list, analytics and login history have explicit authorization", () => {
  const customers = readBackend("routes/customerRoutes.js");
  assert.match(customers, /router\.get\("\/", requireAdminAuth/);
  assert.match(customers, /"\/:id\/session-status", requireCustomerSelfOrAdmin\(\)/);
  assert.match(customers, /"\/:id\/login-history", requireCustomerSelfOrAdmin\(\)/);

  const analytics = readBackend("routes/customerAnalyticsRoutes.js");
  assert.match(
    analytics,
    /"\/customers",\s*requireVendorAccessFromExistingAuth\(resolveVendorQueryId\)/
  );
});

test("Round 4 customer record auth permits admin/self and rejects another customer", async (t) => {
  const Session = require("../models/Session");
  const originalFind = Session.findOne;
  t.after(() => { Session.findOne = originalFind; });
  Session.findOne = () => makeQuery({
    _id: SESSION_ID,
    userId: CUSTOMER_ID,
    isActive: true,
    expiryTime: new Date(Date.now() + 60_000),
  });

  const { requireCustomerSelfOrAdmin } = require("../utils/customerRecordAuth");
  const middleware = requireCustomerSelfOrAdmin();
  const run = (token, customerId) => invokeMiddleware(middleware, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    params: { id: customerId },
    body: {},
  });

  assert.equal((await run("", CUSTOMER_ID)).status, 401);
  const customerToken = jwt.sign(
    { customerId: CUSTOMER_ID, sessionId: SESSION_ID },
    process.env.JWT_SECRET
  );
  assert.equal((await run(customerToken, OTHER_CUSTOMER_ID)).status, 403);
  assert.equal((await run(customerToken, CUSTOMER_ID)).next, true);

  const adminToken = jwt.sign({ adminId: "admin-1" }, process.env.JWT_SECRET);
  assert.equal((await run(adminToken, OTHER_CUSTOMER_ID)).next, true);
});

test("Round 4 active frontend consumers send established authentication", () => {
  for (const file of [
    "vendorpreview/app/Billing/components/BillingScreen.jsx",
    "vendorpreview/app/_Explore/Explore.jsx",
    "vendorpreview/app/components/dashboard/LoyaltySettings.jsx",
  ]) {
    const source = readRepo(file);
    assert.match(source, /api\/loyalty/);
    assert.match(source, /getVendorAuthHeaders\(vendorId\)/);
  }

  const dashboard = readRepo("vendorpreview/app/dashboard/page.jsx");
  assert.match(dashboard, /api\/vendor\/dashboard\/customers[\s\S]*getVendorAuthHeaders\(vendorId\)/);

  const adminApi = readRepo("frontend/src/api.js");
  assert.match(adminApi, /axios\.interceptors\?\.request\?\.use\(attachAdminToken\)/);
});
