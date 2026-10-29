const assert = require("node:assert/strict");
const test = require("node:test");

async function loadVisibilityHelper() {
  return import("../app/_Explore/gstPreviewVisibility.mjs");
}

test("configured vendor is visible only when backend confirms GST is enabled", async () => {
  const { hasEnabledGstBilling } = await loadVisibilityHelper();
  assert.equal(hasEnabledGstBilling({
    success: true,
    data: { draftConfigured: true, activation: { enabled: true } },
  }), true);
  assert.equal(hasEnabledGstBilling({
    success: true,
    data: { draftConfigured: true, activation: { enabled: false } },
  }), false);
});

test("unconfigured and partially configured backend results remain hidden", async () => {
  const { hasEnabledGstBilling } = await loadVisibilityHelper();
  assert.equal(hasEnabledGstBilling({ success: true, data: { draftConfigured: false } }), false);
  assert.equal(hasEnabledGstBilling({
    success: true,
    data: {
      gstSettings: { defaultGstRateBps: 0, pricingMode: "inclusive" },
    },
  }), false);
  assert.equal(hasEnabledGstBilling(null), false);
});

test("vendor switching hides stale configured state until the new vendor is verified", async () => {
  const { isGstPreviewAvailable } = await loadVisibilityHelper();
  const base = {
    status: "configured",
    loadedVendorId: "vendor-a",
    currentVendorId: "vendor-a",
    hasActiveVendorSession: true,
    viewMode: "menu",
  };
  assert.equal(isGstPreviewAvailable(base), true);
  assert.equal(isGstPreviewAvailable({ ...base, currentVendorId: "vendor-b" }), false);
  assert.equal(isGstPreviewAvailable({ ...base, status: "loading" }), false);
  assert.equal(isGstPreviewAvailable({ ...base, hasActiveVendorSession: false }), false);
  assert.equal(isGstPreviewAvailable({ ...base, viewMode: "new-dashboard" }), false);
});
