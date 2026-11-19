const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = process.env.JWT_SECRET || "admin-vendor-list-test-secret";

const DummyVendor = require("../models/DummyVendor");
const dummyVendorRoutes = require("../routes/dummyVendorRoutes");

const CATEGORY_ID = "691abce2531f54c7d983a30e";

function routeHandlers(path) {
  const layer = dummyVendorRoutes.stack.find((entry) => entry.route?.path === path);
  assert.ok(layer, `Expected route ${path}`);
  return layer.route.stack.map((entry) => entry.handle);
}

function runMiddleware(handler, req) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { resolve({ next: false, status: this.statusCode, payload }); },
    };
    try {
      handler(req, res, () => resolve({ next: true, status: res.statusCode, req, res }));
    } catch (error) {
      reject(error);
    }
  });
}

function runController(handler, req) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { resolve({ status: this.statusCode, payload }); },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

test("admin vendor status list requires authentication and preserves status filtering", async (t) => {
  const originalFind = DummyVendor.find;
  let receivedMatch;
  let receivedProjection;
  t.after(() => {
    DummyVendor.find = originalFind;
  });

  DummyVendor.find = (match) => {
    receivedMatch = match;
    return {
      select(projection) { receivedProjection = projection; return this; },
      populate() { return this; },
      async lean() {
        return [{
          _id: "691abce2531f54c7d983a30f",
          businessName: "Published Salon",
          status: "Published",
          vendorLogin: { passcodeHash: "never-return", passcodeUpdatedAt: new Date() },
        }];
      },
    };
  };

  const [requireAdmin, listVendors] = routeHandlers("/byCategory/:categoryId");
  const anonymousRequest = {
    headers: {},
    params: { categoryId: CATEGORY_ID },
    query: { status: "Published" },
  };

  const anonymous = await runMiddleware(requireAdmin, anonymousRequest);
  assert.equal(anonymous.status, 401);
  assert.equal(receivedMatch, undefined);

  const token = jwt.sign({ adminId: "admin-1", email: "admin@example.test" }, process.env.JWT_SECRET);
  const authenticatedRequest = {
    headers: { authorization: `Bearer ${token}` },
    params: { categoryId: CATEGORY_ID },
    query: { status: "Published" },
  };
  const authorized = await runMiddleware(requireAdmin, authenticatedRequest);
  assert.equal(authorized.next, true);
  const authenticated = await runController(listVendors, authenticatedRequest);

  assert.equal(authenticated.status, 200);
  assert.equal(authenticated.payload.length, 1);
  assert.equal(authenticated.payload[0].status, "Published");
  assert.equal(authenticated.payload[0].vendorLogin, undefined);
  assert.equal(String(receivedMatch.categoryId), CATEGORY_ID);
  assert.equal(receivedMatch.status.test("Published"), true);
  assert.equal(receivedMatch.status.test("Pending"), false);

  const projectionQuery = originalFind.call(DummyVendor, {}).select(receivedProjection);
  projectionQuery._applyPaths();
  assert.equal(projectionQuery._fields.vendorLogin, undefined);
  assert.equal(projectionQuery._fields["vendorLogin.passcodeHash"], 0);
});

test("public and authenticated vendor detail reads omit all vendor login configuration", async (t) => {
  const originalFindById = DummyVendor.findById;
  let receivedProjection;
  t.after(() => {
    DummyVendor.findById = originalFindById;
  });

  DummyVendor.findById = () => ({
    select(projection) { receivedProjection = projection; return this; },
    async lean() {
      return {
        _id: "691abce2531f54c7d983a30f",
        businessName: "Public Salon",
        vendorLogin: { passcodeHash: "never-return", passcodeUpdatedAt: new Date() },
      };
    },
  });

  const [getVendor] = routeHandlers("/:vendorId");
  for (const headers of [{}, { authorization: "Bearer admin-token" }]) {
    const result = await runController(getVendor, {
      headers,
      params: { vendorId: "691abce2531f54c7d983a30f" },
      query: {},
    });
    assert.equal(result.status, 200);
    assert.equal(result.payload.businessName, "Public Salon");
    assert.equal(result.payload.vendorLogin, undefined);
  }

  assert.equal(receivedProjection.includes("-whatsappBusiness"), true);
  assert.equal(receivedProjection.includes("-gstSettings"), true);
  assert.equal(receivedProjection.includes("-billingPreferences"), true);
  assert.equal(receivedProjection.includes("-vendorLogin"), false);
});
