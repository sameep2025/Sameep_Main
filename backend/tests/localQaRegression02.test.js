const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = process.env.JWT_SECRET || "local-qa-regression-test-secret";

const backendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(backendRoot, "..");
const readRepo = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

const VendorLoyaltyRule = require("../models/VendorLoyaltyRule");
const VendorResource = require("../models/VendorResource");
const loyaltyController = require("../controllers/loyaltyController");
const vendorResourceController = require("../controllers/vendorResourceController");

const VENDOR_ID = "507f1f77bcf86cd799439011";

function responseRecorder() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

test("public loyalty rule read uses a field allowlist and remains vendor scoped", async (t) => {
  const originalFindOne = VendorLoyaltyRule.findOne;
  let filter;
  let selection;
  t.after(() => { VendorLoyaltyRule.findOne = originalFindOne; });

  VendorLoyaltyRule.findOne = (query) => {
    filter = query;
    return {
      select(value) { selection = value; return this; },
      async lean() { return { isEnabled: true, earn: { percentPer100: 5 } }; },
    };
  };

  const res = responseRecorder();
  await loyaltyController.getVendorRule({ params: { vendorId: VENDOR_ID } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(String(filter.vendorId), VENDOR_ID);
  assert.equal(selection, "isEnabled minBillAmount rounding earn expiry redeem");
  assert.deepEqual(res.payload.data, { isEnabled: true, earn: { percentPer100: 5 } });
});

test("anonymous public resource reads expose active display fields but not staff phones", async (t) => {
  const originalFind = VendorResource.find;
  let filter;
  let selection;
  t.after(() => { VendorResource.find = originalFind; });

  VendorResource.find = (query) => {
    filter = query;
    return {
      sort() { return this; },
      select(value) { selection = value; return this; },
      then(resolve, reject) {
        return Promise.resolve([{
          _id: "507f1f77bcf86cd799439012",
          name: "Stylist",
          role: "Hair Stylist",
          phone: "not-public",
          status: "Active",
        }]).then(resolve, reject);
      },
    };
  };

  const res = responseRecorder();
  await vendorResourceController.getVendorResources({
    headers: {},
    query: { vendorId: VENDOR_ID },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(String(filter.vendorId), VENDOR_ID);
  assert.equal(filter.status, "Active");
  assert.equal(selection, "name role status");
  assert.equal(res.payload[0].name, "Stylist");
  assert.equal(res.payload[0].phone, undefined);
  assert.equal(res.payload[0].vendorId, undefined);
});

test("authenticated admin resource reads retain management fields", async (t) => {
  const originalFind = VendorResource.find;
  let filter;
  let selected = false;
  t.after(() => { VendorResource.find = originalFind; });

  VendorResource.find = (query) => {
    filter = query;
    return {
      sort() { return this; },
      select() { selected = true; return this; },
      then(resolve, reject) {
        return Promise.resolve([{
          _id: "507f1f77bcf86cd799439012",
          vendorId: VENDOR_ID,
          name: "Stylist",
          role: "Hair Stylist",
          phone: "management-only",
          status: "Inactive",
        }]).then(resolve, reject);
      },
    };
  };

  const token = jwt.sign({ adminId: "admin-1" }, process.env.JWT_SECRET);
  const res = responseRecorder();
  await vendorResourceController.getVendorResources({
    headers: { authorization: `Bearer ${token}` },
    query: { vendorId: VENDOR_ID },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(String(filter.vendorId), VENDOR_ID);
  assert.equal(filter.status, undefined);
  assert.equal(selected, false);
  assert.equal(res.payload[0].phone, "management-only");
  assert.equal(res.payload[0].status, "Inactive");
});

test("legacy admin checkbox remains removed and secure handoff flow remains wired", () => {
  const explore = readRepo("vendorpreview/app/_Explore/Explore.jsx");
  const adminPage = readRepo("frontend/src/pages/DummyVendorStatusListPage.jsx");
  const customerRoutes = readRepo("backend/routes/customerRoutes.js");

  assert.doesNotMatch(explore, />\s*Login as Admin\s*</);
  assert.match(explore, /body: JSON\.stringify\(\{ handoffCode: adminHandoffCode \}\)/);
  assert.match(explore, /searchParams\.delete\("adminHandoff"\)/);
  assert.match(adminPage, /API\.post\("\/api\/admin\/impersonation-handoffs"/);
  assert.match(customerRoutes, /consumeAdminImpersonationHandoff\(handoffCode/);
});
