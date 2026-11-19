const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const jwt = require("jsonwebtoken");

const backendRoot = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(backendRoot, relativePath), "utf8");

process.env.JWT_SECRET = process.env.JWT_SECRET || "security-stabilization-test-secret";

const { requireAdminAuth } = require("../utils/adminAuthMiddleware");
const VendorSubscription = require("../models/VendorSubscription");
const VendorWallet = require("../models/VendorWallet");
const {
  getVendorOwnedSubscription,
  getPublicVendorSubscriptionStatus,
} = require("../controllers/vendorSubscriptionController");

function runMiddleware(token) {
  return new Promise((resolve) => {
    const req = { headers: token ? { authorization: `Bearer ${token}` } : {} };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { resolve({ next: false, status: this.statusCode, payload }); },
    };
    requireAdminAuth(req, res, () => resolve({ next: true, status: 200, req }));
  });
}

function responseRecorder() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

test("admin plan and subscription administration routes all require admin auth", () => {
  const source = read("routes/adminRoutes.js");
  [
    /router\.get\("\/plans", requireAdminAuth, getPlans\)/,
    /router\.post\("\/plans", requireAdminAuth, createPlan\)/,
    /router\.put\("\/plans\/:id", requireAdminAuth, updatePlan\)/,
    /router\.delete\("\/plans\/:id", requireAdminAuth, deletePlan\)/,
    /router\.post\("\/vendor-subscriptions", requireAdminAuth, assignVendorPlan\)/,
    /router\.get\("\/vendor-subscriptions\/:vendorId", requireAdminAuth, getVendorSubscription\)/,
    /router\.put\("\/vendor-subscriptions\/:vendorId", requireAdminAuth, updateVendorSubscription\)/,
  ].forEach((pattern) => assert.match(source, pattern));
});

test("admin middleware rejects missing, invalid, and ordinary vendor tokens", async () => {
  assert.equal((await runMiddleware()).status, 401);
  assert.equal((await runMiddleware("not-a-token")).status, 401);
  const vendorToken = jwt.sign({ customerId: "customer", vendorId: "vendor" }, process.env.JWT_SECRET);
  assert.equal((await runMiddleware(vendorToken)).status, 401);
});

test("admin middleware accepts the existing authenticated admin token", async () => {
  const token = jwt.sign({ adminId: "admin-1", email: "admin@example.test" }, process.env.JWT_SECRET);
  const result = await runMiddleware(token);
  assert.equal(result.next, true);
  assert.equal(result.req.admin.id, "admin-1");
});

test("vendor subscription route is owner-authenticated and mounted separately from admin routes", () => {
  const route = read("routes/vendorSubscriptionRoutes.js");
  const server = read("server.js");
  assert.match(route, /requireVendorAccessFromExistingAuth\(\(req\) => req\.params\.vendorId\)/);
  assert.match(server, /app\.use\("\/api\/vendor\/subscription", vendorSubscriptionRoutes\)/);
});

test("vendor-owned subscription controller derives vendor identity from verified auth", async (t) => {
  const requested = [];
  const originalFindOne = VendorSubscription.findOne;
  const originalWalletFindOne = VendorWallet.findOne;
  t.after(() => {
    VendorSubscription.findOne = originalFindOne;
    VendorWallet.findOne = originalWalletFindOne;
  });

  VendorSubscription.findOne = (query) => {
    requested.push(String(query.vendorId));
    return {
      populate() { return this; },
      async lean() {
        return { vendorId: query.vendorId, planId: { name: "Growth" }, active: true };
      },
    };
  };
  VendorWallet.findOne = () => ({ lean: async () => ({ whatsappBalance: 4, otpBalance: 5 }) });

  const res = responseRecorder();
  await getVendorOwnedSubscription(
    { params: { vendorId: "attacker-vendor" }, vendorWriteAuth: { vendorId: "authorized-vendor" } },
    res
  );
  assert.deepEqual(requested, ["authorized-vendor"]);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.data.wallet.otpBalance, 5);
});

test("public subscription status is sanitized and never reads wallet balances", async (t) => {
  const vendorId = "507f1f77bcf86cd799439011";
  const originalFindOne = VendorSubscription.findOne;
  const originalWalletFindOne = VendorWallet.findOne;
  let walletRead = false;
  t.after(() => {
    VendorSubscription.findOne = originalFindOne;
    VendorWallet.findOne = originalWalletFindOne;
  });

  VendorSubscription.findOne = () => ({
    populate() { return this; },
    async lean() {
      return {
        vendorId,
        planId: { name: "Growth", price: 6000, features: { whatsappMarketing: true } },
        active: true,
        expiryDate: new Date("2030-01-01T00:00:00.000Z"),
      };
    },
  });
  VendorWallet.findOne = () => { walletRead = true; return { lean: async () => ({}) }; };

  const res = responseRecorder();
  await getPublicVendorSubscriptionStatus({ params: { vendorId } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(walletRead, false);
  assert.deepEqual(Object.keys(res.payload.data).sort(), ["active", "exists", "expiryDate"]);
  assert.equal(res.payload.data.plan, undefined);
  assert.equal(res.payload.data.wallet, undefined);
});

test("Admin Console and VendorPreview use their authenticated subscription clients", () => {
  assert.match(read("../frontend/src/services/planService.js"), /import API from "\.\.\/api"/);
  assert.match(read("../frontend/src/services/subscriptionService.js"), /import API from "\.\.\/api"/);
  assert.match(
    read("../vendorpreview/app/components/dashboard/SubscriptionDashboard.jsx"),
    /\/api\/vendor\/subscription\/\$\{vendorId\}/
  );
  const explore = read("../vendorpreview/app/_Explore/Explore.jsx");
  assert.match(explore, /\/api\/public-vendors\/\$\{vendorId\}\/subscription-status/);
  assert.doesNotMatch(explore, /\/api\/admin\/vendor-subscriptions\/\$\{vendorId\}/);
});
