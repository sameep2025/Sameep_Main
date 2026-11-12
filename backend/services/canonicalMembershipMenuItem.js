const mongoose = require("mongoose");

const DummyCategory = require("../models/dummyCategory");
const DummySubcategory = require("../models/dummySubcategory");
const VendorCustomPackage = require("../models/VendorCustomPackage");
const VendorMenuNode = require("../models/VendorMenuNode");
const VendorPriceNode = require("../models/VendorPriceNode");

const ITEM_SOURCES = ["vendor_price_node", "vendor_menu_node", "custom_package"];
const ITEM_KINDS = ["SERVICE", "PACKAGE"];

const SOURCE_MODELS = {
  vendor_price_node: VendorPriceNode,
  vendor_menu_node: VendorMenuNode,
  custom_package: VendorCustomPackage,
};

class CanonicalMembershipMenuItemError extends Error {
  constructor(message, code, statusCode = 400) {
    super(message);
    this.name = "CanonicalMembershipMenuItemError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function normalizeId(value, field) {
  const id = String(value || "").trim();
  if (!mongoose.Types.ObjectId.isValid(id) || String(new mongoose.Types.ObjectId(id)) !== id) {
    throw new CanonicalMembershipMenuItemError(`${field} is invalid`, "invalid_item_identity");
  }
  return id;
}

function withSession(query, session) {
  if (session && typeof query.session === "function") query.session(session);
  return query;
}

async function findOneLean(Model, filter, select, session) {
  let query = Model.findOne(filter);
  if (select && typeof query.select === "function") query = query.select(select);
  query = withSession(query, session);
  return typeof query.lean === "function" ? query.lean() : query;
}

async function findManyLean(Model, filter, select, session) {
  let query = Model.find(filter);
  if (select && typeof query.select === "function") query = query.select(select);
  query = withSession(query, session);
  return typeof query.lean === "function" ? query.lean() : query;
}

function normalizePath(values, itemName) {
  const path = (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (itemName && path[path.length - 1] !== itemName) path.push(itemName);
  return path;
}

function assertBillable(source, item) {
  const hasPrice = Number.isFinite(Number(item?.price)) && Number(item.price) >= 0;
  const active = item?.pricingStatus === "Active";
  const sourceActive =
    (source !== "vendor_menu_node" || item?.datasetStatus !== "archived") &&
    (source !== "custom_package" || item?.isDeleted !== true);

  if (item?.isLeaf !== true || !hasPrice || !active || !sourceActive) {
    throw new CanonicalMembershipMenuItemError(
      "Menu item is not an active billable leaf",
      "item_not_billable"
    );
  }
}

function resolveVendorPriceMetadataFromMaps(item, rootCategories, subcategories) {
  const rootCategory = rootCategories.get(String(item.rootCategoryId || ""));
  const masterItem = subcategories.get(
    `${String(item.rootCategoryId || "")}:${String(item.categoryId || "")}`
  );
  if (!masterItem || !rootCategory) {
    throw new CanonicalMembershipMenuItemError(
      "Authoritative menu classification is unavailable",
      "item_kind_unavailable"
    );
  }

  const masterPath = [];
  const visited = new Set();
  let current = masterItem;
  while (current) {
    const currentId = String(current._id || "");
    if (!currentId || visited.has(currentId)) {
      throw new CanonicalMembershipMenuItemError(
        "Authoritative menu hierarchy is invalid",
        "invalid_item_hierarchy"
      );
    }
    visited.add(currentId);
    masterPath.unshift(String(current.name || "").trim());
    if (!current.parentSubcategory) break;
    current = subcategories.get(
      `${String(item.rootCategoryId || "")}:${String(current.parentSubcategory)}`
    );
    if (!current) {
      throw new CanonicalMembershipMenuItemError(
        "Authoritative menu hierarchy is incomplete",
        "invalid_item_hierarchy"
      );
    }
  }

  const packageIncludes = String(masterItem.packagesIncludes || "").trim();
  const itemKind = packageIncludes
    ? "PACKAGE"
    : String(rootCategory.categoryType || "").trim() === "Services"
      ? "SERVICE"
      : null;
  if (!ITEM_KINDS.includes(itemKind)) {
    throw new CanonicalMembershipMenuItemError(
      "Authoritative Service or Package classification is unavailable",
      "item_kind_unavailable"
    );
  }
  return {
    itemKind,
    packageIncludes,
    terms: String(item.terms || masterItem.terms || "").trim(),
    categoryPath: normalizePath([rootCategory.name, ...masterPath], item.name),
  };
}

function serializeResolvedItem(source, item, metadata) {
  const pricePaise = Math.round(Number(item.price) * 100);
  if (!Number.isSafeInteger(pricePaise)) {
    throw new CanonicalMembershipMenuItemError("Menu item price is invalid", "invalid_item_price");
  }
  return {
    itemId: String(item._id),
    itemSource: source,
    itemKind: metadata.itemKind,
    name: String(item.name || "").trim(),
    price: Number(item.price),
    pricePaise,
    categoryPath: metadata.categoryPath,
    packageIncludes: metadata.packageIncludes,
    terms: metadata.terms,
  };
}

async function resolveVendorPriceMetadata(item, models, session) {
  const masterItem = await findOneLean(
    models.DummySubcategory,
    { _id: item.categoryId, category: item.rootCategoryId },
    "_id name parentSubcategory terms packagesIncludes",
    session
  );
  const rootCategory = await findOneLean(
    models.DummyCategory,
    { _id: item.rootCategoryId },
    "_id name categoryType",
    session
  );

  if (!masterItem || !rootCategory) {
    throw new CanonicalMembershipMenuItemError(
      "Authoritative menu classification is unavailable",
      "item_kind_unavailable"
    );
  }

  const masterPath = [];
  const visited = new Set();
  let current = masterItem;
  while (current) {
    const currentId = String(current._id || "");
    if (!currentId || visited.has(currentId)) {
      throw new CanonicalMembershipMenuItemError(
        "Authoritative menu hierarchy is invalid",
        "invalid_item_hierarchy"
      );
    }
    visited.add(currentId);
    masterPath.unshift(String(current.name || "").trim());
    if (!current.parentSubcategory) break;
    current = await findOneLean(
      models.DummySubcategory,
      { _id: current.parentSubcategory, category: item.rootCategoryId },
      "_id name parentSubcategory",
      session
    );
    if (!current) {
      throw new CanonicalMembershipMenuItemError(
        "Authoritative menu hierarchy is incomplete",
        "invalid_item_hierarchy"
      );
    }
  }

  const packageIncludes = String(masterItem.packagesIncludes || "").trim();
  let itemKind = null;
  if (packageIncludes) {
    itemKind = "PACKAGE";
  } else if (String(rootCategory.categoryType || "").trim() === "Services") {
    itemKind = "SERVICE";
  }

  if (!ITEM_KINDS.includes(itemKind)) {
    throw new CanonicalMembershipMenuItemError(
      "Authoritative Service or Package classification is unavailable",
      "item_kind_unavailable"
    );
  }

  return {
    itemKind,
    packageIncludes,
    terms: String(item.terms || masterItem.terms || "").trim(),
    categoryPath: normalizePath([rootCategory.name, ...masterPath], item.name),
  };
}

function resolveExplicitMetadata(source, item) {
  const storedCustomType = String(item?.customType || "").trim().toLowerCase();
  // Legacy uploaded/self-managed menu leaves predate customType. The Vendor Menu
  // contract already normalizes those leaves to service_item when read or edited.
  const customType = source === "vendor_menu_node" && !storedCustomType
    ? "service_item"
    : storedCustomType;
  const itemKind = customType === "service_item"
    ? "SERVICE"
    : customType === "package"
      ? "PACKAGE"
      : null;

  if (!itemKind) {
    throw new CanonicalMembershipMenuItemError(
      "Authoritative Service or Package classification is unavailable",
      customType === "offer" ? "unsupported_item_kind" : "item_kind_unavailable"
    );
  }

  return {
    itemKind,
    packageIncludes: itemKind === "PACKAGE" ? String(item.packagesIncludes || "").trim() : "",
    terms: String(item.terms || "").trim(),
    categoryPath: normalizePath(
      source === "vendor_menu_node" ? item.pathNames : item.pathLabels,
      item.name
    ),
  };
}

async function resolveCanonicalMembershipMenuItem(input = {}, dependencies = {}) {
  const vendorId = normalizeId(input.vendorId, "vendorId");
  const itemId = normalizeId(input.itemId, "itemId");
  const requestedSource = String(input.itemSource || "").trim();
  if (requestedSource && !ITEM_SOURCES.includes(requestedSource)) {
    throw new CanonicalMembershipMenuItemError("Item source is unsupported", "unsupported_item_source");
  }

  const models = {
    ...SOURCE_MODELS,
    DummyCategory,
    DummySubcategory,
    ...(dependencies.models || {}),
  };
  const sources = requestedSource ? [requestedSource] : ITEM_SOURCES;
  const candidates = (
    await Promise.all(sources.map(async (source) => {
      const item = await findOneLean(
        models[source],
        { _id: itemId },
        "_id vendorId name price isLeaf pricingStatus terms packagesIncludes customType pathNames pathLabels datasetStatus isDeleted categoryId rootCategoryId",
        input.session
      );
      return item ? { source, item } : null;
    }))
  ).filter(Boolean);

  if (candidates.length === 0) {
    throw new CanonicalMembershipMenuItemError("Menu item was not found", "item_not_found", 404);
  }

  const owned = candidates.filter(({ item }) => String(item.vendorId || "") === vendorId);
  if (owned.length === 0) {
    throw new CanonicalMembershipMenuItemError(
      "Menu item does not belong to this vendor",
      "cross_vendor_item",
      403
    );
  }
  if (owned.length !== 1) {
    throw new CanonicalMembershipMenuItemError(
      "Menu item identity is ambiguous",
      "ambiguous_item_identity"
    );
  }

  const [{ source, item }] = owned;
  assertBillable(source, item);
  const metadata = source === "vendor_price_node"
    ? await resolveVendorPriceMetadata(item, models, input.session)
    : resolveExplicitMetadata(source, item);
  return serializeResolvedItem(source, item, metadata);
}

async function resolveCanonicalMembershipMenuItems(input = {}, dependencies = {}) {
  const vendorId = normalizeId(input.vendorId, "vendorId");
  const candidates = Array.isArray(input.candidates) ? input.candidates : [];
  const models = {
    ...SOURCE_MODELS,
    DummyCategory,
    DummySubcategory,
    ...(dependencies.models || {}),
  };
  const normalized = candidates.map((candidate) => ({
    itemId: normalizeId(candidate.itemId, "itemId"),
    itemSource: String(candidate.itemSource || "").trim(),
  }));
  normalized.forEach((candidate) => {
    if (!ITEM_SOURCES.includes(candidate.itemSource)) {
      throw new CanonicalMembershipMenuItemError(
        "Item source is unsupported",
        "unsupported_item_source"
      );
    }
  });

  const documents = new Map();
  await Promise.all(ITEM_SOURCES.map(async (source) => {
    const ids = normalized
      .filter((candidate) => candidate.itemSource === source)
      .map((candidate) => candidate.itemId);
    if (!ids.length) return;
    const rows = await findManyLean(
      models[source],
      { _id: { $in: ids }, vendorId },
      "_id vendorId name price isLeaf pricingStatus terms packagesIncludes customType pathNames pathLabels datasetStatus isDeleted categoryId rootCategoryId",
      input.session
    );
    rows.forEach((row) => documents.set(`${source}:${String(row._id)}`, row));
  }));

  const priceRows = Array.from(documents.entries())
    .filter(([key]) => key.startsWith("vendor_price_node:"))
    .map(([, row]) => row);
  const rootIds = Array.from(new Set(priceRows.map((row) => String(row.rootCategoryId || "")).filter(Boolean)));
  const [rootRows, subcategoryRows] = rootIds.length
    ? await Promise.all([
        findManyLean(models.DummyCategory, { _id: { $in: rootIds } }, "_id name categoryType", input.session),
        findManyLean(
          models.DummySubcategory,
          { category: { $in: rootIds } },
          "_id category name parentSubcategory terms packagesIncludes",
          input.session
        ),
      ])
    : [[], []];
  const rootCategories = new Map(rootRows.map((row) => [String(row._id), row]));
  const subcategories = new Map(
    subcategoryRows.map((row) => [`${String(row.category)}:${String(row._id)}`, row])
  );

  const items = [];
  const errors = [];
  normalized.forEach((candidate) => {
    try {
      const item = documents.get(`${candidate.itemSource}:${candidate.itemId}`);
      if (!item) {
        throw new CanonicalMembershipMenuItemError("Menu item was not found", "item_not_found", 404);
      }
      assertBillable(candidate.itemSource, item);
      const metadata = candidate.itemSource === "vendor_price_node"
        ? resolveVendorPriceMetadataFromMaps(item, rootCategories, subcategories)
        : resolveExplicitMetadata(candidate.itemSource, item);
      items.push(serializeResolvedItem(candidate.itemSource, item, metadata));
    } catch (error) {
      errors.push({ candidate, code: error?.code || "item_resolution_failed" });
    }
  });
  return { items, errors };
}

module.exports = {
  CanonicalMembershipMenuItemError,
  ITEM_KINDS,
  ITEM_SOURCES,
  resolveCanonicalMembershipMenuItem,
  resolveCanonicalMembershipMenuItems,
};
