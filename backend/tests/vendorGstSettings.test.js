const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const DummyVendor = require("../models/DummyVendor");
const Vendor = require("../models/Vendor");
const VendorServiceTaxOverride = require("../models/VendorServiceTaxOverride");
const controller = require("../controllers/vendorGstSettingsController");
const {
  GstSettingsValidationError,
  isGstDraftConfigured,
  sanitizeGstSettings,
  validateGstSettingsPatch,
} = require("../services/vendorGstSettings");

const VENDOR_ID = "692403a24d4d3a1b6a7f0ae5";

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

test("GST settings are disabled by default on both vendor models", () => {
  const dummy = new DummyVendor();
  const legacy = new Vendor();
  assert.equal(dummy.gstSettings.enabled, false);
  assert.equal(legacy.gstSettings.enabled, false);
  assert.equal(dummy.gstSettings.pricingMode, "inclusive");
  assert.equal(legacy.gstSettings.defaultGstRateBps, 0);
  assert.equal(sanitizeGstSettings({}).enabled, false);
});

test("validates and normalizes a complete inactive GST draft", () => {
  const patch = validateGstSettingsPatch({
    enabled: false,
    gstin: "36abcde1234f1z5",
    legalBusinessName: "  Example Salon Private Limited  ",
    registeredAddress: "  Hyderabad, Telangana  ",
    registeredStateCode: "36",
    defaultGstRateBps: 1800,
    defaultSac: "999723",
    pricingMode: "exclusive",
  });
  assert.deepEqual(patch, {
    enabled: false,
    gstin: "36ABCDE1234F1Z5",
    legalBusinessName: "Example Salon Private Limited",
    registeredAddress: "Hyderabad, Telangana",
    registeredStateCode: "36",
    defaultGstRateBps: 1800,
    defaultSac: "999723",
    pricingMode: "exclusive",
  });
});

test("configured GST draft is based on complete persisted settings, not enabled or defaults", () => {
  const configured = {
    gstSettings: {
      enabled: false,
      gstin: "36ABCDE1234F1Z5",
      legalBusinessName: "Example Salon Private Limited",
      registeredAddress: "Hyderabad, Telangana",
      registeredStateCode: "36",
      defaultGstRateBps: 0,
      defaultSac: "",
      pricingMode: "inclusive",
      updatedAt: new Date(),
    },
  };
  assert.equal(isGstDraftConfigured(configured), true);
  assert.equal(isGstDraftConfigured({ gstSettings: {} }), false);
  assert.equal(isGstDraftConfigured({
    gstSettings: { ...configured.gstSettings, updatedAt: null },
  }), false);
  assert.equal(isGstDraftConfigured({
    gstSettings: { ...configured.gstSettings, legalBusinessName: "" },
  }), false);
  assert.equal(isGstDraftConfigured({
    gstSettings: { ...configured.gstSettings, registeredAddress: "" },
  }), false);
  assert.equal(isGstDraftConfigured({
    gstSettings: { ...configured.gstSettings, registeredStateCode: "29" },
  }), false);
});

test("accepts boolean activation and rejects malformed values, unknown fields and state mismatches", () => {
  assert.deepEqual(validateGstSettingsPatch({ enabled: true }), { enabled: true });
  assert.deepEqual(validateGstSettingsPatch({ enabled: false }), { enabled: false });
  assert.throws(
    () => validateGstSettingsPatch({ enabled: "true" }),
    (error) => error.code === "invalid_gst_enabled"
  );
  assert.throws(() => validateGstSettingsPatch({ gstin: "bad" }), /GSTIN format/);
  assert.throws(() => validateGstSettingsPatch({ defaultGstRateBps: 1800.5 }), /integer/);
  assert.throws(() => validateGstSettingsPatch({ defaultSac: "SAC123" }), /digits/);
  assert.throws(() => validateGstSettingsPatch({ pricingMode: "mixed" }), /inclusive/);
  assert.throws(
    () => validateGstSettingsPatch({ gstin: "36ABCDE1234F1Z5", registeredStateCode: "29" }),
    (error) => error.code === "gstin_state_code_mismatch"
  );
  assert.throws(
    () => validateGstSettingsPatch({ unexpected: true }),
    (error) => error.code === "unsupported_gst_settings_field"
  );
});

test("PATCH stores only GST dot paths and keeps GST inactive", async () => {
  const originalFindById = DummyVendor.findById;
  const originalFindByIdAndUpdate = DummyVendor.findByIdAndUpdate;
  let updateSeen;
  DummyVendor.findById = () => ({
    select: () => ({ lean: async () => ({ gstSettings: { enabled: false } }) }),
  });
  DummyVendor.findByIdAndUpdate = (_id, update) => {
    updateSeen = update;
    return {
      select: () => ({
        lean: async () => ({
          gstSettings: {
            enabled: false,
            defaultGstRateBps: 1800,
            pricingMode: "inclusive",
          },
        }),
      }),
    };
  };

  try {
    const res = mockRes();
    await controller.updateGstSettings(
      {
        params: { vendorId: VENDOR_ID },
        vendorWriteAuth: { vendorId: VENDOR_ID },
        body: { defaultGstRateBps: 1800, defaultSac: "999723" },
      },
      res
    );
    assert.equal(res.statusCode, 200);
    assert.equal(updateSeen.$set["gstSettings.enabled"], false);
    assert.equal(updateSeen.$set["gstSettings.defaultGstRateBps"], 1800);
    assert.equal(updateSeen.$set["gstSettings.defaultSac"], "999723");
    assert.ok(updateSeen.$set["gstSettings.updatedAt"] instanceof Date);
    assert.deepEqual(Object.keys(updateSeen.$set).sort(), [
      "gstSettings.defaultGstRateBps",
      "gstSettings.defaultSac",
      "gstSettings.enabled",
      "gstSettings.updatedAt",
    ]);
  } finally {
    DummyVendor.findById = originalFindById;
    DummyVendor.findByIdAndUpdate = originalFindByIdAndUpdate;
  }
});

test("PATCH rejects activation with incomplete settings before any database update", async () => {
  const originalFindById = DummyVendor.findById;
  const originalFindByIdAndUpdate = DummyVendor.findByIdAndUpdate;
  let updateCalled = false;
  DummyVendor.findById = () => ({
    select: () => ({ lean: async () => ({ gstSettings: { enabled: false } }) }),
  });
  DummyVendor.findByIdAndUpdate = () => {
    updateCalled = true;
  };
  try {
    const res = mockRes();
    await controller.updateGstSettings(
      {
        params: { vendorId: VENDOR_ID },
        vendorWriteAuth: { vendorId: VENDOR_ID },
        body: { enabled: true },
      },
      res
    );
    assert.equal(res.statusCode, 400);
    assert.equal(res.payload.code, "invalid_gst_configuration");
    assert.equal(updateCalled, false);
  } finally {
    DummyVendor.findById = originalFindById;
    DummyVendor.findByIdAndUpdate = originalFindByIdAndUpdate;
  }
});

test("PATCH cannot make an enabled GST configuration incomplete", async () => {
  const originalFindById = DummyVendor.findById;
  const originalFindByIdAndUpdate = DummyVendor.findByIdAndUpdate;
  let updateCalled = false;
  DummyVendor.findById = () => ({
    select: () => ({
      lean: async () => ({
        gstSettings: {
          enabled: true,
          updatedAt: new Date(),
          gstin: "36ABCDE1234F1Z5",
          legalBusinessName: "Example Salon Private Limited",
          registeredAddress: "Hyderabad, Telangana",
          registeredStateCode: "36",
          defaultGstRateBps: 1800,
          defaultSac: "999723",
          pricingMode: "inclusive",
        },
      }),
    }),
  });
  DummyVendor.findByIdAndUpdate = () => {
    updateCalled = true;
  };
  try {
    const res = mockRes();
    await controller.updateGstSettings(
      {
        params: { vendorId: VENDOR_ID },
        vendorWriteAuth: { vendorId: VENDOR_ID },
        body: { legalBusinessName: "" },
      },
      res
    );
    assert.equal(res.statusCode, 400);
    assert.equal(res.payload.code, "invalid_gst_configuration");
    assert.equal(updateCalled, false);
  } finally {
    DummyVendor.findById = originalFindById;
    DummyVendor.findByIdAndUpdate = originalFindByIdAndUpdate;
  }
});

test("GET returns a saved default SAC unchanged", async () => {
  const originalFindById = DummyVendor.findById;
  DummyVendor.findById = () => ({
    select: () => ({
      lean: async () => ({
        gstSettings: {
          enabled: false,
          gstin: "36ABCDE1234F1Z5",
          legalBusinessName: "Example Salon Private Limited",
          registeredAddress: "Hyderabad, Telangana",
          registeredStateCode: "36",
          defaultGstRateBps: 500,
          defaultSac: "999723",
          pricingMode: "inclusive",
          updatedAt: new Date(),
        },
      }),
    }),
  });
  try {
    const res = mockRes();
    await controller.getGstSettings(
      { params: { vendorId: VENDOR_ID }, vendorWriteAuth: { vendorId: VENDOR_ID } },
      res
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.data.gstSettings.defaultGstRateBps, 500);
    assert.equal(res.payload.data.gstSettings.defaultSac, "999723");
    assert.equal(res.payload.data.draftConfigured, true);
  } finally {
    DummyVendor.findById = originalFindById;
  }
});

test("service tax overrides enforce vendor-scoped service identity and value validation", async () => {
  const indexes = VendorServiceTaxOverride.schema.indexes();
  assert.ok(
    indexes.some(
      ([fields, options]) =>
        fields.vendorId === 1 &&
        fields.serviceSource === 1 &&
        fields.serviceId === 1 &&
        options.unique === true
    )
  );

  const valid = new VendorServiceTaxOverride({
    vendorId: VENDOR_ID,
    serviceSource: "vendor_price_node",
    serviceId: "node-1",
    gstRateBps: 1800,
    sac: "999723",
  });
  await valid.validate();
  assert.equal(valid.itemType, "SERVICE");
  assert.equal(valid.hsn, "");

  const product = new VendorServiceTaxOverride({
    vendorId: VENDOR_ID,
    serviceSource: "vendor_menu_node",
    serviceId: "product-node-1",
    itemType: "PRODUCT",
    gstRateBps: 500,
    hsn: "330510",
  });
  await product.validate();

  await assert.rejects(
    new VendorServiceTaxOverride({
      vendorId: VENDOR_ID,
      serviceSource: "vendor_price_node",
      serviceId: "node-1",
      gstRateBps: 1800.5,
    }).validate(),
    /integer/
  );
  await assert.rejects(
    new VendorServiceTaxOverride({
      vendorId: VENDOR_ID,
      serviceSource: "vendor_menu_node",
      serviceId: "product-node-2",
      itemType: "PRODUCT",
      gstRateBps: 1800,
      hsn: "12345",
    }).validate(),
    /4, 6, or 8 digits/
  );
});

test("GST settings routes require vendor auth and are mounted separately", () => {
  const routeSource = fs.readFileSync(
    path.join(__dirname, "../routes/vendorGstSettingsRoutes.js"),
    "utf8"
  );
  const serverSource = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  assert.match(routeSource, /requireVendorAccessFromExistingAuth/);
  assert.match(routeSource, /requireVendorParamWriteAccess/);
  assert.match(serverSource, /app\.use\("\/api\/vendor\/gst-settings"/);
  assert.match(serverSource, /app\.use\("\/api\/vendor\/gst-item-overrides"/);
  assert.match(serverSource, /require\("\.\/models\/VendorServiceTaxOverride"\)/);
});

test("validation errors are typed and sanitized", () => {
  assert.throws(
    () => validateGstSettingsPatch(null),
    (error) =>
      error instanceof GstSettingsValidationError && error.code === "invalid_gst_settings"
  );
});
