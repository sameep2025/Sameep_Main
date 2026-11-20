const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");

const BillingSession = require("../models/BillingSession");
const {
  BillingStylistAllocationError,
  normalizeCartStylistAllocations,
  parseItemAllocations,
} = require("../services/billingStylistAllocationService");

const VENDOR_ID = new mongoose.Types.ObjectId("690000000000000000000001");
const STYLIST_A = new mongoose.Types.ObjectId("690000000000000000000011");
const STYLIST_B = new mongoose.Types.ObjectId("690000000000000000000012");

function resourceModel(resources) {
  return {
    find(query) {
      assert.equal(String(query.vendorId), String(VENDOR_ID));
      assert.equal(query.status, "Active");
      return {
        select() { return this; },
        lean: async () => resources,
      };
    },
  };
}

test("no stylist remains valid and one stylist is normalized to 100 percent", async () => {
  const noStylist = await normalizeCartStylistAllocations({
    cartItems: [{ name: "Cut" }],
    vendorId: VENDOR_ID,
  });
  assert.equal(noStylist[0].resourceId, null);
  assert.equal(noStylist[0].stylistAllocations, undefined);

  const oneStylist = await normalizeCartStylistAllocations({
    cartItems: [{
      name: "Cut",
      stylistAllocations: [{ resourceId: STYLIST_A, allocationBps: 10000 }],
    }],
    vendorId: VENDOR_ID,
    VendorResourceModel: resourceModel([{ _id: STYLIST_A, name: "A" }]),
  });
  assert.equal(String(oneStylist[0].resourceId), String(STYLIST_A));
  assert.deepEqual(oneStylist[0].stylistAllocations, [{
    resourceId: String(STYLIST_A),
    resourceName: "A",
    allocationBps: 10000,
  }]);
});

test("multiple stylist allocations preserve percentages and trusted resource names", async () => {
  const result = await normalizeCartStylistAllocations({
    cartItems: [{
      name: "Colour",
      stylistAllocations: [
        { resourceId: STYLIST_A, resourceName: "Forged", allocationBps: 6000 },
        { resourceId: STYLIST_B, resourceName: "Forged", allocationBps: 4000 },
      ],
    }],
    vendorId: VENDOR_ID,
    VendorResourceModel: resourceModel([
      { _id: STYLIST_A, name: "A" },
      { _id: STYLIST_B, name: "B" },
    ]),
  });
  assert.equal(result[0].resourceId, null);
  assert.equal(result[0].resourceName, "A, B");
  assert.deepEqual(result[0].stylistAllocations.map(({ allocationBps }) => allocationBps), [6000, 4000]);
});

test("invalid totals, duplicates and unavailable cross-vendor stylists fail closed", async () => {
  assert.throws(
    () => parseItemAllocations({
      stylistAllocations: [
        { resourceId: STYLIST_A, allocationBps: 5000 },
        { resourceId: STYLIST_B, allocationBps: 4000 },
      ],
    }),
    (error) => error.code === "stylist_percentage_total_invalid"
  );
  assert.throws(
    () => parseItemAllocations({
      stylistAllocations: [
        { resourceId: STYLIST_A, allocationBps: 5000 },
        { resourceId: STYLIST_A, allocationBps: 5000 },
      ],
    }),
    (error) => error.code === "duplicate_stylist"
  );
  await assert.rejects(
    normalizeCartStylistAllocations({
      cartItems: [{ stylistAllocations: [{ resourceId: STYLIST_A, allocationBps: 10000 }] }],
      vendorId: VENDOR_ID,
      VendorResourceModel: resourceModel([]),
    }),
    (error) => error instanceof BillingStylistAllocationError && error.code === "stylist_ownership_invalid"
  );
});

test("BillingSession accepts new allocation snapshots and historical single stylist fields", () => {
  const current = new BillingSession({
    vendorId: VENDOR_ID,
    cartItems: [{
      name: "Colour",
      stylistAllocations: [
        { resourceId: STYLIST_A, resourceName: "A", allocationBps: 6000 },
        { resourceId: STYLIST_B, resourceName: "B", allocationBps: 4000 },
      ],
    }],
  });
  const historical = new BillingSession({
    vendorId: VENDOR_ID,
    cartItems: [{ name: "Cut", resourceId: STYLIST_A, resourceName: "A" }],
  });
  assert.equal(current.validateSync(), undefined);
  assert.equal(historical.validateSync(), undefined);
});
