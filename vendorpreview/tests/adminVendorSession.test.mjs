import assert from "node:assert/strict";
import test from "node:test";

import {
  clearAdminHandoffExchangesForTests,
  exchangeAdminHandoff,
  persistAdminVendorSession,
} from "../app/utils/adminVendorSession.mjs";

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    value(key) {
      return values.get(key);
    },
  };
}

test("admin handoff establishes the device-bound vendor session used by operational APIs", () => {
  const storage = createStorage({ deviceId: "device-1" });

  persistAdminVendorSession({
    storage,
    expectedVendorId: "vendor-a",
    response: { vendorId: "vendor-a", token: "selected-vendor-token" },
    now: () => 1234,
  });

  assert.equal(storage.value("sessionDeviceId"), "device-1");
  assert.equal(storage.value("vendorToken:vendor-a"), "selected-vendor-token");
  assert.equal(storage.value("authToken"), "selected-vendor-token");
  assert.equal(storage.value("vendorSessionVendorId"), "vendor-a");
  assert.equal(storage.value("vendorLoginTime"), "1234");
  assert.equal(storage.value("userType"), "vendor");
  assert.equal(storage.value("isAdminLogin"), "true");
});

test("admin handoff creates and binds a device ID when the browser has none", () => {
  const storage = createStorage();

  const result = persistAdminVendorSession({
    storage,
    expectedVendorId: "vendor-a",
    response: { vendorId: "vendor-a", token: "selected-vendor-token" },
    randomUUID: () => "new-device-id",
  });

  assert.equal(result.deviceId, "new-device-id");
  assert.equal(storage.value("deviceId"), "new-device-id");
  assert.equal(storage.value("sessionDeviceId"), "new-device-id");
});

test("admin handoff fails closed when exchanged identity targets another vendor", () => {
  const storage = createStorage({ deviceId: "device-1" });

  assert.throws(
    () => persistAdminVendorSession({
      storage,
      expectedVendorId: "vendor-b",
      response: { vendorId: "vendor-a", token: "vendor-a-token" },
    }),
    /does not match this vendor/
  );
  assert.equal(storage.value("vendorToken:vendor-b"), undefined);
  assert.equal(storage.value("authToken"), undefined);
});

test("admin handoff URL arrival survives effect cleanup without redeeming the code twice", async (t) => {
  clearAdminHandoffExchangesForTests();
  t.after(clearAdminHandoffExchangesForTests);
  let resolveResponse;
  let requestCount = 0;
  const fetchImpl = async () => {
    requestCount += 1;
    await new Promise((resolve) => { resolveResponse = resolve; });
    return {
      ok: true,
      json: async () => ({ vendorId: "vendor-a", token: "admin-session-token" }),
    };
  };

  const firstEffectRequest = exchangeAdminHandoff({
    apiBaseUrl: "http://localhost:5001",
    handoffCode: "single-use-code",
    fetchImpl,
  });
  const secondEffectRequest = exchangeAdminHandoff({
    apiBaseUrl: "http://localhost:5001",
    handoffCode: "single-use-code",
    fetchImpl,
  });

  assert.equal(firstEffectRequest, secondEffectRequest);
  assert.equal(requestCount, 1);
  resolveResponse();
  assert.equal((await secondEffectRequest).token, "admin-session-token");
  assert.equal(requestCount, 1);
});

test("invalid or reused handoffs are rejected and never establish a vendor session", async (t) => {
  clearAdminHandoffExchangesForTests();
  t.after(clearAdminHandoffExchangesForTests);
  const fetchImpl = async () => ({
    ok: false,
    json: async () => ({ message: "Impersonation handoff is invalid or expired" }),
  });

  await assert.rejects(
    exchangeAdminHandoff({
      apiBaseUrl: "http://localhost:5001",
      handoffCode: "reused-code",
      fetchImpl,
    }),
    /invalid or expired/
  );
});
