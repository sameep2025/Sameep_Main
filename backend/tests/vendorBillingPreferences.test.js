const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const DummyVendor = require("../models/DummyVendor");
const controller = require("../controllers/vendorBillingPreferencesController");
const {
  isSendWhatsAppBillEnabled,
  sanitizeBillingPreferences,
} = require("../services/vendorBillingPreferences");

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

test("billing preference defaults to enabled unless explicitly false", () => {
  assert.equal(isSendWhatsAppBillEnabled({}), true);
  assert.equal(isSendWhatsAppBillEnabled({ billingPreferences: {} }), true);
  assert.equal(isSendWhatsAppBillEnabled({ billingPreferences: { sendWhatsAppBill: true } }), true);
  assert.equal(isSendWhatsAppBillEnabled({ billingPreferences: { sendWhatsAppBill: false } }), false);
  assert.deepEqual(sanitizeBillingPreferences({}), { sendWhatsAppBill: true });
});

test("GET billing preferences resolves legacy missing field to ON", async () => {
  const originalFindById = DummyVendor.findById;
  DummyVendor.findById = () => ({
    select: () => ({
      lean: async () => ({}),
    }),
  });

  try {
    const res = mockRes();
    await controller.getBillingPreferences(
      { params: { vendorId: VENDOR_ID }, vendorWriteAuth: { vendorId: VENDOR_ID } },
      res
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.success, true);
    assert.equal(res.payload.data.billingPreferences.sendWhatsAppBill, true);
  } finally {
    DummyVendor.findById = originalFindById;
  }
});

test("PATCH billing preferences rejects non-boolean sendWhatsAppBill", async () => {
  const res = mockRes();
  await controller.updateBillingPreferences(
    {
      params: { vendorId: VENDOR_ID },
      vendorWriteAuth: { vendorId: VENDOR_ID },
      body: { sendWhatsAppBill: "false" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.success, false);
  assert.equal(res.payload.code, "invalid_send_whatsapp_bill");
});

test("PATCH billing preferences stores only the explicit boolean preference", async () => {
  const originalFindByIdAndUpdate = DummyVendor.findByIdAndUpdate;
  let updateSeen = null;
  DummyVendor.findByIdAndUpdate = (_vendorId, update) => {
    updateSeen = update;
    return {
      select: () => ({
        lean: async () => ({
          billingPreferences: { sendWhatsAppBill: false },
        }),
      }),
    };
  };

  try {
    const res = mockRes();
    await controller.updateBillingPreferences(
      {
        params: { vendorId: VENDOR_ID },
        vendorWriteAuth: { vendorId: VENDOR_ID },
        body: { sendWhatsAppBill: false },
      },
      res
    );

    assert.deepEqual(updateSeen, {
      $set: {
        "billingPreferences.sendWhatsAppBill": false,
      },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.data.billingPreferences.sendWhatsAppBill, false);
  } finally {
    DummyVendor.findByIdAndUpdate = originalFindByIdAndUpdate;
  }
});

test("billing preferences route uses vendor-owned auth and server mounts route", () => {
  const routeSource = fs.readFileSync(
    path.join(__dirname, "../routes/vendorBillingPreferencesRoutes.js"),
    "utf8"
  );
  const serverSource = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");

  assert.match(routeSource, /requireVendorAccessFromExistingAuth/);
  assert.match(routeSource, /requireVendorParamWriteAccess/);
  assert.match(serverSource, /app\.use\("\/api\/vendor-billing-preferences"/);
});
