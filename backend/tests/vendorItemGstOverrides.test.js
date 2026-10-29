const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const VendorMenuNode = require("../models/VendorMenuNode");
const DummyVendor = require("../models/DummyVendor");
const VendorServiceTaxOverride = require("../models/VendorServiceTaxOverride");
const {
  ItemGstOverrideError,
  createItemGstOverride,
  deleteItemGstOverride,
  getItemGstOverride,
  normalizeClassification,
  requireOwnedBillableItem,
  updateItemGstOverride,
} = require("../services/vendorItemGstOverrides");

const VENDOR_ID = "692403a24d4d3a1b6a7f0ae5";
const ITEM_ID = "692403a24d4d3a1b6a7f0ae6";

test("accepts service SAC and product HSN while keeping classifications distinct", () => {
  assert.equal(normalizeClassification("SERVICE", { classificationCode: "" }), "");
  assert.equal(normalizeClassification("PRODUCT", { classificationCode: "" }), "");
  assert.equal(normalizeClassification("SERVICE", { classificationCode: "999723" }), "999723");
  assert.equal(normalizeClassification("PRODUCT", { classificationCode: "330510" }), "330510");
  assert.throws(
    () => normalizeClassification("PRODUCT", { classificationCode: "12345" }),
    (error) => error.code === "invalid_hsn"
  );
  assert.throws(
    () => normalizeClassification("SERVICE", { classificationCode: "SAC99" }),
    (error) => error.code === "invalid_sac"
  );
});

test("item ownership lookup is vendor scoped and requires an active billable leaf", async () => {
  const original = VendorMenuNode.findOne;
  let filterSeen;
  VendorMenuNode.findOne = (filter) => {
    filterSeen = filter;
    return {
      select: () => ({
        lean: async () => ({ _id: ITEM_ID, name: "Retail Shampoo", price: 250 }),
      }),
    };
  };
  try {
    const result = await requireOwnedBillableItem({
      vendorId: VENDOR_ID,
      itemSource: "vendor_menu_node",
      itemId: ITEM_ID,
    });
    assert.equal(result.source, "vendor_menu_node");
    assert.equal(String(filterSeen.vendorId), VENDOR_ID);
    assert.equal(filterSeen.isLeaf, true);
    assert.deepEqual(filterSeen.price, { $ne: null });
    assert.equal(filterSeen.datasetStatus, "active");
  } finally {
    VendorMenuNode.findOne = original;
  }
});

test("cross-vendor, parent, archived, or missing items fail as not owned", async () => {
  const original = VendorMenuNode.findOne;
  VendorMenuNode.findOne = () => ({
    select: () => ({ lean: async () => null }),
  });
  try {
    await assert.rejects(
      requireOwnedBillableItem({
        vendorId: VENDOR_ID,
        itemSource: "vendor_menu_node",
        itemId: ITEM_ID,
      }),
      (error) => error instanceof ItemGstOverrideError && error.code === "item_not_found"
    );
  } finally {
    VendorMenuNode.findOne = original;
  }
});

test("missing override inherits vendor GST rate and service SAC", async () => {
  const originalItem = VendorMenuNode.findOne;
  const originalVendor = DummyVendor.findById;
  const originalOverride = VendorServiceTaxOverride.findOne;
  VendorMenuNode.findOne = () => ({
    select: () => ({ lean: async () => ({ _id: ITEM_ID, name: "Hair Spa", price: 1000 }) }),
  });
  DummyVendor.findById = () => ({
    select: () => ({
      lean: async () => ({
        gstSettings: { updatedAt: new Date(), defaultGstRateBps: 1800, defaultSac: "999723" },
      }),
    }),
  });
  VendorServiceTaxOverride.findOne = () => ({ lean: async () => null });
  try {
    const result = await getItemGstOverride({
      vendorId: VENDOR_ID,
      itemSource: "vendor_menu_node",
      itemId: ITEM_ID,
      itemType: "SERVICE",
    });
    assert.equal(result.vendorGstConfigured, true);
    assert.equal(result.vendorDefaults.defaultSac, "999723");
    assert.equal(result.vendorDefaults.sac, "999723");
    assert.deepEqual(result.effective, {
      inherited: true,
      itemType: "SERVICE",
      gstRateBps: 1800,
      classificationCode: "999723",
    });
  } finally {
    VendorMenuNode.findOne = originalItem;
    DummyVendor.findById = originalVendor;
    VendorServiceTaxOverride.findOne = originalOverride;
  }
});

test("product inheritance never reuses the vendor service SAC", async () => {
  const originalItem = VendorMenuNode.findOne;
  const originalVendor = DummyVendor.findById;
  const originalOverride = VendorServiceTaxOverride.findOne;
  VendorMenuNode.findOne = () => ({
    select: () => ({ lean: async () => ({ _id: ITEM_ID, name: "Retail Shampoo", price: 250 }) }),
  });
  DummyVendor.findById = () => ({
    select: () => ({
      lean: async () => ({
        gstSettings: { updatedAt: new Date(), defaultGstRateBps: 500, defaultSac: "999723" },
      }),
    }),
  });
  VendorServiceTaxOverride.findOne = () => ({ lean: async () => null });
  try {
    const result = await getItemGstOverride({
      vendorId: VENDOR_ID,
      itemSource: "vendor_menu_node",
      itemId: ITEM_ID,
      itemType: "PRODUCT",
    });
    assert.deepEqual(result.effective, {
      inherited: true,
      itemType: "PRODUCT",
      gstRateBps: 500,
      classificationCode: "",
    });
  } finally {
    VendorMenuNode.findOne = originalItem;
    DummyVendor.findById = originalVendor;
    VendorServiceTaxOverride.findOne = originalOverride;
  }
});

test("create, update and delete keep writes vendor scoped", async () => {
  const originalItem = VendorMenuNode.findOne;
  const originalCreate = VendorServiceTaxOverride.create;
  const originalFind = VendorServiceTaxOverride.findOne;
  const originalUpdate = VendorServiceTaxOverride.findOneAndUpdate;
  const originalDelete = VendorServiceTaxOverride.deleteOne;
  const overrideId = "692403a24d4d3a1b6a7f0ae7";
  const seen = {};
  VendorMenuNode.findOne = () => ({
    select: () => ({ lean: async () => ({ _id: ITEM_ID, name: "Retail Shampoo", price: 250 }) }),
  });
  VendorServiceTaxOverride.create = async (document) => {
    seen.created = document;
    return { _id: overrideId, ...document };
  };
  VendorServiceTaxOverride.findOne = (filter) => {
    seen.findFilter = filter;
    return {
      lean: async () => ({
        _id: overrideId,
        vendorId: VENDOR_ID,
        serviceSource: "vendor_menu_node",
        serviceId: ITEM_ID,
        itemType: "PRODUCT",
        gstRateBps: 500,
        hsn: "330510",
      }),
    };
  };
  VendorServiceTaxOverride.findOneAndUpdate = (filter, update) => {
    seen.updateFilter = filter;
    seen.update = update;
    return {
      lean: async () => ({
        _id: overrideId,
        serviceSource: "vendor_menu_node",
        serviceId: ITEM_ID,
        ...update.$set,
      }),
    };
  };
  VendorServiceTaxOverride.deleteOne = async (filter) => {
    seen.deleteFilter = filter;
    return { deletedCount: 1 };
  };

  try {
    await createItemGstOverride({
      vendorId: VENDOR_ID,
      input: {
        itemSource: "vendor_menu_node",
        itemId: ITEM_ID,
        itemType: "PRODUCT",
        gstRateBps: 500,
        classificationCode: "330510",
      },
    });
    assert.equal(seen.created.vendorId, VENDOR_ID);
    assert.equal(seen.created.hsn, "330510");
    assert.equal(seen.created.sac, "");

    await updateItemGstOverride({
      vendorId: VENDOR_ID,
      overrideId,
      input: { itemType: "SERVICE", gstRateBps: 1800, classificationCode: "999723" },
    });
    assert.deepEqual(seen.updateFilter, { _id: overrideId, vendorId: VENDOR_ID });
    assert.equal(seen.update.$set.sac, "999723");
    assert.equal(seen.update.$set.hsn, "");

    await deleteItemGstOverride({ vendorId: VENDOR_ID, overrideId });
    assert.deepEqual(seen.deleteFilter, { _id: overrideId, vendorId: VENDOR_ID });
  } finally {
    VendorMenuNode.findOne = originalItem;
    VendorServiceTaxOverride.create = originalCreate;
    VendorServiceTaxOverride.findOne = originalFind;
    VendorServiceTaxOverride.findOneAndUpdate = originalUpdate;
    VendorServiceTaxOverride.deleteOne = originalDelete;
  }
});

test("item GST routes expose authenticated CRUD without touching item price APIs", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../routes/vendorItemGstOverrideRoutes.js"),
    "utf8"
  );
  assert.match(source, /requireVendorAccessFromExistingAuth/);
  assert.match(source, /requireVendorParamWriteAccess/);
  assert.match(source, /router\.get/);
  assert.match(source, /router\.post/);
  assert.match(source, /router\.patch/);
  assert.match(source, /router\.delete/);
  assert.doesNotMatch(source, /vendor-price-nodes|vendor-menu/);
});
