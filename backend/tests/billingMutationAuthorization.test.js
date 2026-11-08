const assert = require("node:assert/strict");
const test = require("node:test");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "billing-mutation-authorization-test-secret";

const BillingSession = require("../models/BillingSession");
const DummyVendor = require("../models/DummyVendor");
const Session = require("../models/Session");
const Vendor = require("../models/Vendor");
const billingRoutes = require("../routes/billingRoutes");

const VENDOR_A = "690000000000000000000001";
const VENDOR_B = "690000000000000000000002";
const CUSTOMER_A = "690000000000000000000011";
const SESSION_A = "690000000000000000000021";
const BILL_A = "690000000000000000000031";
const BILL_B = "690000000000000000000032";

const MUTATION_PATHS = ["/create", "/update", "/request-otp", "/verify-otp", "/complete"];
const BILL_MUTATION_PATHS = MUTATION_PATHS.filter((path) => path !== "/create");

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

function getAuthorizationMiddleware(path) {
  const layer = billingRoutes.stack.find(
    (candidate) => candidate.route?.path === path && candidate.route.methods.post
  );
  assert.ok(layer, `POST ${path} must exist`);
  assert.equal(layer.route.stack.length, 2, `POST ${path} must run auth before its controller`);
  return layer.route.stack[0].handle;
}

async function runAuthorization(path, req) {
  const res = response();
  let nextCalled = false;
  await getAuthorizationMiddleware(path)(req, res, () => { nextCalled = true; });
  return { res, nextCalled };
}

function vendorToken(vendorId = VENDOR_A) {
  return jwt.sign(
    { customerId: CUSTOMER_A, vendorId, sessionId: SESSION_A },
    process.env.JWT_SECRET
  );
}

function adminToken() {
  return jwt.sign(
    { adminId: "690000000000000000000099", email: "admin@example.test" },
    process.env.JWT_SECRET
  );
}

function request({ token = "", body = {} } = {}) {
  return {
    body,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  };
}

async function withAuthModels(callback) {
  const originals = {
    billingFindById: BillingSession.findById,
    dummyExists: DummyVendor.exists,
    sessionFindOne: Session.findOne,
    vendorExists: Vendor.exists,
  };

  BillingSession.findById = (id) => ({
    select: () => ({
      lean: async () => {
        if (String(id) === BILL_A) return { vendorId: VENDOR_A };
        if (String(id) === BILL_B) return { vendorId: VENDOR_B };
        return null;
      },
    }),
  });
  DummyVendor.exists = async ({ _id, customerId }) =>
    String(_id) === VENDOR_A && String(customerId) === CUSTOMER_A;
  Vendor.exists = async () => false;
  Session.findOne = () => ({
    sort: () => ({
      lean: async () => ({
        _id: SESSION_A,
        userId: CUSTOMER_A,
        vendorId: VENDOR_A,
        isActive: true,
        expiryTime: new Date(Date.now() + 60_000),
      }),
    }),
  });

  try {
    await callback();
  } finally {
    BillingSession.findById = originals.billingFindById;
    DummyVendor.exists = originals.dummyExists;
    Session.findOne = originals.sessionFindOne;
    Vendor.exists = originals.vendorExists;
  }
}

test("all billing mutation routes require authentication before their controllers", async () => {
  await withAuthModels(async () => {
    for (const path of MUTATION_PATHS) {
      const body = path === "/create" ? { vendorId: VENDOR_A } : { billingId: BILL_A };
      const missing = await runAuthorization(path, request({ body }));
      assert.equal(missing.nextCalled, false, path);
      assert.equal(missing.res.statusCode, 401, path);

      const invalid = await runAuthorization(path, request({ token: "invalid-token", body }));
      assert.equal(invalid.nextCalled, false, path);
      assert.equal(invalid.res.statusCode, 401, path);
    }
  });
});

test("vendor owners can access all billing mutations and cross-vendor bills are denied", async () => {
  await withAuthModels(async () => {
    const create = await runAuthorization(
      "/create",
      request({ token: vendorToken(), body: { vendorId: VENDOR_A } })
    );
    assert.equal(create.nextCalled, true);
    assert.equal(create.res.statusCode, 200);

    const foreignCreate = await runAuthorization(
      "/create",
      request({ token: vendorToken(), body: { vendorId: VENDOR_B } })
    );
    assert.equal(foreignCreate.nextCalled, false);
    assert.equal(foreignCreate.res.statusCode, 403);

    for (const path of BILL_MUTATION_PATHS) {
      const own = await runAuthorization(
        path,
        request({ token: vendorToken(), body: { billingId: BILL_A } })
      );
      assert.equal(own.nextCalled, true, path);
      assert.equal(own.res.statusCode, 200, path);

      const foreign = await runAuthorization(
        path,
        request({ token: vendorToken(), body: { billingId: BILL_B } })
      );
      assert.equal(foreign.nextCalled, false, path);
      assert.equal(foreign.res.statusCode, 403, path);
      assert.equal(foreign.res.payload.code, "vendor_mismatch", path);
    }
  });
});

test("malformed and nonexistent bill IDs cannot fall back to the authenticated session vendor", async () => {
  await withAuthModels(async () => {
    for (const path of BILL_MUTATION_PATHS) {
      for (const billingId of ["", "not-an-object-id", "690000000000000000000039"]) {
        const result = await runAuthorization(
          path,
          request({ token: vendorToken(), body: { billingId } })
        );
        assert.equal(result.nextCalled, false, `${path} ${billingId}`);
        assert.equal(result.res.statusCode, 403, `${path} ${billingId}`);
        assert.equal(result.res.payload.code, "vendor_mismatch", `${path} ${billingId}`);
      }
    }
  });
});

test("valid Admin Console authentication remains compatible with every billing mutation", async () => {
  await withAuthModels(async () => {
    for (const path of MUTATION_PATHS) {
      const body = path === "/create" ? { vendorId: VENDOR_B } : { billingId: BILL_B };
      const result = await runAuthorization(path, request({ token: adminToken(), body }));
      assert.equal(result.nextCalled, true, path);
      assert.equal(result.res.statusCode, 200, path);
      assert.equal(result.res.payload, null, path);
    }
  });
});
