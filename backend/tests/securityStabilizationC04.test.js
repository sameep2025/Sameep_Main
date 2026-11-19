const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = process.env.JWT_SECRET || "c04-security-test-secret";

const backendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(backendRoot, "..");
const readBackend = (relativePath) => fs.readFileSync(path.join(backendRoot, relativePath), "utf8");
const readRepo = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

const VENDOR_ID = "507f1f77bcf86cd799439011";
const OTHER_VENDOR_ID = "507f1f77bcf86cd799439012";
const CUSTOMER_ID = "507f1f77bcf86cd799439013";
const DOCUMENT_ID = "507f1f77bcf86cd799439014";

function createResponse(resolve) {
  return {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      resolve({ next: false, status: this.statusCode, payload });
    },
  };
}

test("C-04 legacy vendor and dummy-vendor mutations require owner or admin authorization", () => {
  for (const file of ["routes/vendorRoutes.js", "routes/dummyVendorRoutes.js"]) {
    const source = readBackend(file);
    assert.match(source, /requireLegacyVendorMutation/);
    assert.match(source, /\["POST", "PUT", "PATCH", "DELETE"\]\.includes\(req\.method\)/);
    assert.match(source, /requireVendorCreationAccess/);
  }

  const vendorRoutes = readBackend("routes/vendorRoutes.js");
  assert.match(vendorRoutes, /vendor-locations\/:vendorId\/nearby[\s\S]*requireVendorParamWriteAccess/);
  assert.match(vendorRoutes, /req\.params\.vendorId === "vendor-locations"/);
  assert.match(vendorRoutes, /router\.get\("\/:id"/);

  const dummyRoutes = readBackend("routes/dummyVendorRoutes.js");
  assert.match(dummyRoutes, /router\.get\("\/:vendorId"/);
});

test("C-04 catalog, model, master, combo, and template mutations require admin auth", () => {
  for (const file of [
    "routes/categoryRoutes.js",
    "routes/dummyCategoryRoutes.js",
    "routes/modelRoutes.js",
    "routes/masterRoutes.js",
    "routes/comboRoutes.js",
    "routes/dummyComboRoutes.js",
    "routes/previewTemplateRoutes.js",
  ]) {
    assert.match(readBackend(file), /requireAdminAuth/);
  }

  assert.match(readBackend("routes/modelRoutes.js"), /router\.get\("\/"/);
  assert.match(readBackend("routes/masterRoutes.js"), /router\.get\("\/"/);
  assert.match(readBackend("routes/previewTemplateRoutes.js"), /router\.get\("\/"/);
});

test("C-04 vendor pricing, combo pricing, and price-node mutations validate vendor ownership", () => {
  assert.match(
    readBackend("routes/vendorPricing.js"),
    /router\.put\("\/:vendorId\/:categoryId", requireVendorParamWriteAccess\(\)/
  );
  assert.match(
    readBackend("routes/vendorComboPricingRoutes.js"),
    /router\.put\("\/:vendorId\/:comboId", requireVendorParamWriteAccess\(\)/
  );

  const priceNodes = readBackend("routes/vendorPriceNodeRoutes.js");
  assert.match(priceNodes, /router\.post\("\/sync", requireVendorBodyWriteAccess\(\)/);
  assert.match(priceNodes, /router\.post\("\/add-missing-leaves", requireVendorBodyWriteAccess\(\)/);
  assert.match(priceNodes, /validateVendorWriteRequest\(req, record\.vendorId\)/);
});

test("C-04 alternate vendor-flow mutation paths cannot bypass ownership checks", () => {
  const source = readBackend("routes/vendorFlowRoutes.js");
  assert.match(source, /set-subdomain', requireVendorParamWriteAccess\("id"\)/);
  assert.match(source, /vendor\/:vendorId\/sync', requireVendorParamWriteAccess\(\)/);
  assert.match(source, /services\/:serviceId\/price', requireVendorParamWriteAccess\(\)/);
  assert.match(source, /services\/:serviceId\/status', requireVendorParamWriteAccess\(\)/);
  assert.match(source, /service-areas", requireVendorBodyWriteAccess\(\)/);
  assert.match(source, /router\.post\('\/', requireVendorBodyWriteAccess\(\)/);
  assert.equal((source.match(/requireOwnedDocumentVendorAccess\(VendorFlow\)/g) || []).length, 4);

  const server = readBackend("server.js");
  assert.match(server, /app\.use\("\/api\/vendor-flow", vendorFlowRoutes\)/);
  assert.match(server, /app\.use\("\/api", require\("\.\/routes\/vendorFlowRoutes"\)\)/);
  assert.doesNotMatch(server, /subcategoryRoutes/);
});

test("C-04 public reads do not create vendor pricing or preview-template records", () => {
  const pricing = readBackend("routes/vendorPricing.js");
  const pricingGet = pricing.slice(pricing.indexOf('router.get("/:vendorId"'), pricing.indexOf('router.put("/:vendorId/:categoryId"'));
  assert.doesNotMatch(pricingGet, /\.create\(|\.save\(|findOneAndUpdate|updateOne/);

  const templates = readBackend("routes/previewTemplateRoutes.js");
  const publicReads = templates.slice(templates.indexOf('router.get("/"'), templates.indexOf('router.put("/:templateKey"'));
  assert.doesNotMatch(publicReads, /syncSupportedTemplates/);
  assert.doesNotMatch(publicReads, /\.create\(|\.save\(|updateOne|updateMany/);
});

test("C-04 public vendor detail and listing responses exclude private configuration", () => {
  const vendorRoutes = readBackend("routes/vendorRoutes.js");
  const dummyRoutes = readBackend("routes/dummyVendorRoutes.js");
  assert.match(vendorRoutes, /PUBLIC_VENDOR_EXCLUSIONS = "-whatsappBusiness -gstSettings"/);
  assert.match(dummyRoutes, /-whatsappBusiness -gstSettings -billingPreferences/);
  assert.doesNotMatch(dummyRoutes, /PUBLIC_VENDOR_EXCLUSIONS\s*=\s*[\s\S]{0,100}-vendorLogin/);
  assert.equal((dummyRoutes.match(/withoutVendorLogin/g) || []).length, 3);
  assert.equal((vendorRoutes.match(/\.select\(PUBLIC_VENDOR_EXCLUSIONS\)/g) || []).length, 4);
  assert.equal((dummyRoutes.match(/\.select\(PUBLIC_VENDOR_EXCLUSIONS\)/g) || []).length, 2);
});

test("C-04 vendor write middleware rejects unauthenticated and cross-vendor requests", async (t) => {
  const Session = require("../models/Session");
  const DummyVendor = require("../models/DummyVendor");
  const Vendor = require("../models/Vendor");
  const { requireVendorParamWriteAccess } = require("../utils/vendorWriteAuth");
  const originalSessionFind = Session.findOne;
  const originalDummyExists = DummyVendor.exists;
  const originalVendorExists = Vendor.exists;
  t.after(() => {
    Session.findOne = originalSessionFind;
    DummyVendor.exists = originalDummyExists;
    Vendor.exists = originalVendorExists;
  });

  Session.findOne = () => ({
    sort() { return this; },
    lean: async () => ({
      _id: DOCUMENT_ID,
      userId: CUSTOMER_ID,
      vendorId: VENDOR_ID,
      isActive: true,
      expiryTime: new Date(Date.now() + 60_000),
      authMethod: "OTP",
    }),
  });
  DummyVendor.exists = async (query) =>
    String(query._id) === VENDOR_ID && String(query.customerId) === CUSTOMER_ID;
  Vendor.exists = async () => false;

  const run = (token, vendorId) => new Promise((resolve) => {
    const req = {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      params: { vendorId },
      body: {},
    };
    requireVendorParamWriteAccess()(req, createResponse(resolve), () => {
      resolve({ next: true, status: 200, req });
    });
  });

  assert.equal((await run("", VENDOR_ID)).status, 401);
  const ownerToken = jwt.sign({ customerId: CUSTOMER_ID, vendorId: VENDOR_ID }, process.env.JWT_SECRET);
  assert.equal((await run(ownerToken, OTHER_VENDOR_ID)).status, 403);
  assert.equal((await run(ownerToken, VENDOR_ID)).next, true);

  Session.findOne = () => ({
    sort() { return this; },
    lean: async () => ({
      _id: DOCUMENT_ID,
      userId: CUSTOMER_ID,
      isActive: true,
      expiryTime: new Date(Date.now() + 60_000),
      authMethod: "OTP",
    }),
  });
  assert.equal((await run(ownerToken, VENDOR_ID)).next, true);

  const adminToken = jwt.sign({ adminId: "admin-1" }, process.env.JWT_SECRET);
  assert.equal((await run(adminToken, OTHER_VENDOR_ID)).next, true);
});

test("C-04 record-owned mutations derive vendor identity from the stored resource", async (t) => {
  const Session = require("../models/Session");
  const DummyVendor = require("../models/DummyVendor");
  const Vendor = require("../models/Vendor");
  const { requireOwnedDocumentVendorAccess } = require("../utils/vendorWriteAuth");
  const originalSessionFind = Session.findOne;
  const originalDummyExists = DummyVendor.exists;
  const originalVendorExists = Vendor.exists;
  t.after(() => {
    Session.findOne = originalSessionFind;
    DummyVendor.exists = originalDummyExists;
    Vendor.exists = originalVendorExists;
  });

  Session.findOne = () => ({
    sort() { return this; },
    lean: async () => ({
      _id: DOCUMENT_ID,
      userId: CUSTOMER_ID,
      vendorId: VENDOR_ID,
      isActive: true,
      expiryTime: new Date(Date.now() + 60_000),
      authMethod: "OTP",
    }),
  });
  DummyVendor.exists = async (query) => String(query._id) === VENDOR_ID;
  Vendor.exists = async () => false;
  const Model = {
    findById() {
      return {
        select() { return this; },
        lean: async () => ({ vendorId: OTHER_VENDOR_ID }),
      };
    },
  };

  const token = jwt.sign({ customerId: CUSTOMER_ID, vendorId: VENDOR_ID }, process.env.JWT_SECRET);
  const result = await new Promise((resolve) => {
    const req = {
      headers: { authorization: `Bearer ${token}` },
      params: { id: DOCUMENT_ID },
      body: { vendorId: VENDOR_ID },
    };
    requireOwnedDocumentVendorAccess(Model)(req, createResponse(resolve), () => {
      resolve({ next: true, status: 200 });
    });
  });
  assert.equal(result.status, 403);
});

test("C-04 vendor creation requires a verified matching customer session", async (t) => {
  const Session = require("../models/Session");
  const { requireVendorCreationAccess } = require("../utils/vendorWriteAuth");
  const originalSessionFind = Session.findOne;
  t.after(() => {
    Session.findOne = originalSessionFind;
  });

  Session.findOne = () => ({
    sort() { return this; },
    lean: async () => ({
      _id: DOCUMENT_ID,
      userId: CUSTOMER_ID,
      isActive: true,
      expiryTime: new Date(Date.now() + 60_000),
      authMethod: "OTP",
    }),
  });

  const run = (token, customerId) => new Promise((resolve) => {
    const req = {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: customerId ? { customerId } : {},
    };
    requireVendorCreationAccess(req, createResponse(resolve), () => {
      resolve({ next: true, status: 200, req });
    });
  });

  assert.equal((await run("", CUSTOMER_ID)).status, 401);
  const token = jwt.sign({ customerId: CUSTOMER_ID }, process.env.JWT_SECRET);
  assert.equal((await run(token, OTHER_VENDOR_ID)).status, 403);
  const allowed = await run(token, "");
  assert.equal(allowed.next, true);
  assert.equal(allowed.req.body.customerId, CUSTOMER_ID);
});

test("C-04 onboarding and vendor profile callers send existing authenticated sessions", () => {
  const onboarding = readRepo("ynot/web/src/services/onboardingApi.js");
  assert.match(onboarding, /Authorization: `Bearer \$\{token\}`/);
  assert.match(onboarding, /request\("\/api\/vendor\/service-areas"/);
  assert.match(onboarding, /request\("\/api\/vendor-price-nodes\/sync"/);

  const categoryModal = readRepo("vendorpreview/app/Header/CategoryModal.jsx");
  assert.match(categoryModal, /api\/vendor\/service-areas[\s\S]*getVendorAuthHeaders\(vendorId\)/);
  assert.match(categoryModal, /api\/vendor-price-nodes\/sync[\s\S]*getVendorAuthHeaders\(vendorId\)/);
  assert.match(categoryModal, /set-subdomain[\s\S]*getVendorAuthHeaders\(vendorId\)/);

  for (const file of [
    "vendorpreview/app/Profile/BusinessHoursModal.jsx",
    "vendorpreview/app/Profile/BusinessLocationsModal.jsx",
    "vendorpreview/app/Profile/Profile.jsx",
    "vendorpreview/app/components/dashboard/ProfileSocialHandles.jsx",
  ]) {
    assert.match(readRepo(file), /getVendorToken/);
  }
});

test("C-04 legacy preview vendor-owned mutations send the scoped preview session", () => {
  const preview = readRepo("preview-site/pages/preview/[vendorId]/[categoryId].jsx");
  const prices = readRepo(
    "preview-site/pages/preview/[vendorId]/[categoryId]/my-prices/[lvl1Id]/[lvl2Id].jsx"
  );
  const packages = readRepo(
    "preview-site/pages/preview/[vendorId]/[categoryId]/my-prices-packages/[comboId].jsx"
  );
  assert.match(preview, /const getPreviewAuthHeaders = useCallback/);
  assert.match(preview, /api\/dummy-vendors[\s\S]*Authorization: `Bearer \$\{token\}`/);
  assert.match(preview, /api\/vendors\/\$\{vendorId\}\/location[\s\S]*getPreviewAuthHeaders\(\)/);
  assert.match(preview, /inventory-selections[\s\S]*getPreviewAuthHeaders\(vid, cid\)/);
  assert.match(preview, /dummy-vendors\/\$\{dvId\}[\s\S]*getPreviewAuthHeaders\(dvId, catId\)/);
  assert.match(prices, /const getPreviewAuthHeaders =/);
  assert.match(prices, /inventory-selections[\s\S]*getPreviewAuthHeaders\(vid, cid\)/);
  assert.match(packages, /vendor-combo-pricing[\s\S]*getPreviewAuthHeaders\(vendorId, categoryId\)/);
});

test("C-04 Admin Console attaches its existing admin token to legacy Axios and fetch callers", () => {
  const api = readRepo("frontend/src/api.js");
  const entry = readRepo("frontend/src/index.js");
  assert.match(api, /axios\.interceptors\?\.request\?\.use\(attachAdminToken\)/);
  assert.match(api, /window\.fetch =/);
  assert.match(api, /headers\.set\("Authorization", `Bearer \$\{token\}`\)/);
  assert.match(entry, /import '\.\/api'/);
});
