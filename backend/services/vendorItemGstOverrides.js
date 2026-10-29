const mongoose = require("mongoose");
const DummyVendor = require("../models/DummyVendor");
const VendorPriceNode = require("../models/VendorPriceNode");
const VendorMenuNode = require("../models/VendorMenuNode");
const VendorCustomPackage = require("../models/VendorCustomPackage");
const VendorServiceTaxOverride = require("../models/VendorServiceTaxOverride");
const { sanitizeGstSettings } = require("./vendorGstSettings");

const ITEM_SOURCES = VendorServiceTaxOverride.ITEM_SOURCES;
const ITEM_TYPES = VendorServiceTaxOverride.ITEM_TYPES;
const SAC_PATTERN = /^\d{4,8}$/;
const HSN_PATTERN = /^\d{4}(?:\d{2}){0,2}$/;

class ItemGstOverrideError extends Error {
  constructor(message, code, status = 400) {
    super(message);
    this.name = "ItemGstOverrideError";
    this.code = code;
    this.status = status;
  }
}

function normalizeItemType(value) {
  const itemType = String(value || "SERVICE").trim().toUpperCase();
  if (!ITEM_TYPES.includes(itemType)) {
    throw new ItemGstOverrideError("itemType must be SERVICE or PRODUCT", "invalid_item_type");
  }
  return itemType;
}

function normalizeItemSource(value) {
  const source = String(value || "").trim();
  if (!ITEM_SOURCES.includes(source)) {
    throw new ItemGstOverrideError("Unsupported item source", "invalid_item_source");
  }
  return source;
}

function validateRate(value) {
  if (!Number.isInteger(value) || value < 0 || value > 10000) {
    throw new ItemGstOverrideError(
      "gstRateBps must be an integer from 0 to 10000",
      "invalid_gst_rate_bps"
    );
  }
  return value;
}

function normalizeClassification(itemType, input = {}) {
  const raw = input.classificationCode ?? (itemType === "PRODUCT" ? input.hsn : input.sac) ?? "";
  const code = String(raw).trim();
  if (!code) return "";
  const pattern = itemType === "PRODUCT" ? HSN_PATTERN : SAC_PATTERN;
  if (!pattern.test(code)) {
    throw new ItemGstOverrideError(
      itemType === "PRODUCT"
        ? "HSN must contain 4, 6, or 8 digits"
        : "SAC must contain 4 to 8 digits",
      itemType === "PRODUCT" ? "invalid_hsn" : "invalid_sac"
    );
  }
  return code;
}

function queryForOwnedItem(itemSource, vendorId, itemId) {
  const common = { _id: itemId, vendorId, isLeaf: true, price: { $ne: null } };
  if (itemSource === "vendor_price_node") return VendorPriceNode.findOne(common);
  if (itemSource === "vendor_menu_node") {
    return VendorMenuNode.findOne({ ...common, datasetStatus: "active" });
  }
  return VendorCustomPackage.findOne({ ...common, isDeleted: false });
}

async function requireOwnedBillableItem({ vendorId, itemSource, itemId }) {
  const source = normalizeItemSource(itemSource);
  if (!mongoose.isValidObjectId(vendorId) || !mongoose.isValidObjectId(itemId)) {
    throw new ItemGstOverrideError("Item identity is invalid", "invalid_item_identity");
  }
  const item = await queryForOwnedItem(source, vendorId, itemId)
    .select("_id name price")
    .lean();
  if (!item) {
    throw new ItemGstOverrideError(
      "Billable item was not found for this vendor",
      "item_not_found",
      404
    );
  }
  return { source, item };
}

function sanitizeOverride(override) {
  if (!override) return null;
  const source = override.toObject ? override.toObject() : override;
  const itemType = normalizeItemType(source.itemType);
  return {
    id: String(source._id),
    itemSource: source.serviceSource,
    itemId: source.serviceId,
    itemType,
    gstRateBps: source.gstRateBps,
    classificationCode: itemType === "PRODUCT" ? source.hsn || "" : source.sac || "",
    updatedAt: source.updatedAt || null,
  };
}

function effectiveTaxSettings(gstSettings, itemType, override) {
  const sanitized = sanitizeOverride(override);
  if (sanitized) {
    return {
      inherited: false,
      itemType: sanitized.itemType,
      gstRateBps: sanitized.gstRateBps,
      classificationCode: sanitized.classificationCode,
    };
  }
  return {
    inherited: true,
    itemType,
    gstRateBps: gstSettings.defaultGstRateBps,
    classificationCode: itemType === "SERVICE" ? gstSettings.defaultSac : "",
  };
}

async function getVendorAndItem(vendorId, itemSource, itemId) {
  const [{ source, item }, vendor] = await Promise.all([
    requireOwnedBillableItem({ vendorId, itemSource, itemId }),
    DummyVendor.findById(vendorId).select("gstSettings").lean(),
  ]);
  if (!vendor) {
    throw new ItemGstOverrideError("Vendor not found", "vendor_not_found", 404);
  }
  return { source, item, vendor };
}

async function getItemGstOverride({ vendorId, itemSource, itemId, itemType }) {
  const type = normalizeItemType(itemType);
  const { source, item, vendor } = await getVendorAndItem(vendorId, itemSource, itemId);
  const override = await VendorServiceTaxOverride.findOne({
    vendorId,
    serviceSource: source,
    serviceId: String(itemId),
  }).lean();
  const gstSettings = sanitizeGstSettings(vendor);
  return {
    item: { id: String(item._id), name: item.name },
    vendorGstConfigured: Boolean(gstSettings.updatedAt),
    vendorDefaults: {
      gstRateBps: gstSettings.defaultGstRateBps,
      defaultSac: gstSettings.defaultSac,
      // Retained for clients built against the initial Phase 2B.1 response.
      sac: gstSettings.defaultSac,
    },
    override: sanitizeOverride(override),
    effective: effectiveTaxSettings(gstSettings, type, override),
  };
}

async function listItemGstOverrides(vendorId) {
  const vendor = await DummyVendor.findById(vendorId).select("gstSettings").lean();
  if (!vendor) throw new ItemGstOverrideError("Vendor not found", "vendor_not_found", 404);
  const overrides = await VendorServiceTaxOverride.find({ vendorId }).sort({ updatedAt: -1 }).lean();
  return {
    vendorGstConfigured: Boolean(sanitizeGstSettings(vendor).updatedAt),
    overrides: overrides.map(sanitizeOverride),
  };
}

function buildOverrideFields(input) {
  const itemType = normalizeItemType(input.itemType);
  const classificationCode = normalizeClassification(itemType, input);
  return {
    itemType,
    gstRateBps: validateRate(input.gstRateBps),
    sac: itemType === "SERVICE" ? classificationCode : "",
    hsn: itemType === "PRODUCT" ? classificationCode : "",
  };
}

async function createItemGstOverride({ vendorId, input }) {
  const { source } = await requireOwnedBillableItem({
    vendorId,
    itemSource: input.itemSource,
    itemId: input.itemId,
  });
  const fields = buildOverrideFields(input);
  try {
    const override = await VendorServiceTaxOverride.create({
      vendorId,
      serviceSource: source,
      serviceId: String(input.itemId),
      ...fields,
    });
    return sanitizeOverride(override);
  } catch (error) {
    if (error?.code === 11000) {
      throw new ItemGstOverrideError(
        "A GST override already exists for this item",
        "item_gst_override_exists",
        409
      );
    }
    throw error;
  }
}

async function updateItemGstOverride({ vendorId, overrideId, input }) {
  if (!mongoose.isValidObjectId(overrideId)) {
    throw new ItemGstOverrideError("Override identity is invalid", "invalid_override_identity");
  }
  const existing = await VendorServiceTaxOverride.findOne({ _id: overrideId, vendorId }).lean();
  if (!existing) {
    throw new ItemGstOverrideError("GST override not found", "item_gst_override_not_found", 404);
  }
  await requireOwnedBillableItem({
    vendorId,
    itemSource: existing.serviceSource,
    itemId: existing.serviceId,
  });
  const fields = buildOverrideFields(input);
  const override = await VendorServiceTaxOverride.findOneAndUpdate(
    { _id: overrideId, vendorId },
    { $set: fields },
    { new: true, runValidators: true }
  ).lean();
  return sanitizeOverride(override);
}

async function deleteItemGstOverride({ vendorId, overrideId }) {
  if (!mongoose.isValidObjectId(overrideId)) {
    throw new ItemGstOverrideError("Override identity is invalid", "invalid_override_identity");
  }
  const result = await VendorServiceTaxOverride.deleteOne({ _id: overrideId, vendorId });
  if (result.deletedCount !== 1) {
    throw new ItemGstOverrideError("GST override not found", "item_gst_override_not_found", 404);
  }
}

module.exports = {
  HSN_PATTERN,
  ITEM_SOURCES,
  ITEM_TYPES,
  ItemGstOverrideError,
  createItemGstOverride,
  deleteItemGstOverride,
  getItemGstOverride,
  listItemGstOverrides,
  normalizeClassification,
  requireOwnedBillableItem,
  updateItemGstOverride,
};
