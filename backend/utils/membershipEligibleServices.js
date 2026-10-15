const mongoose = require("mongoose");
const VendorMenuNode = require("../models/VendorMenuNode");
const VendorPriceNode = require("../models/VendorPriceNode");

function hasOwnArray(object, field) {
  return Object.prototype.hasOwnProperty.call(object || {}, field) && Array.isArray(object[field]);
}

function normalizeIdList(ids = []) {
  return [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || "")).filter(Boolean))];
}

function getEffectiveEligibleMenuItemIds(membership = {}) {
  if (hasOwnArray(membership.serviceEligibilityOverride, "eligibleMenuItemIds")) {
    return normalizeIdList(membership.serviceEligibilityOverride.eligibleMenuItemIds);
  }
  return normalizeIdList(membership.planSnapshot?.eligibleMenuItemIds);
}

function serviceKey(vendorId, itemId) {
  return `${String(vendorId || "")}:${String(itemId || "")}`;
}

function normalizeFullPath(path = [], name = "") {
  const parts = (Array.isArray(path) ? path : [])
    .map((part) => String(part || "").trim())
    .filter(Boolean);
  const cleanName = String(name || "Service").trim() || "Service";
  if (parts.at(-1)?.toLocaleLowerCase() !== cleanName.toLocaleLowerCase()) {
    parts.push(cleanName);
  }
  return parts;
}

function buildFallbackService(itemId) {
  const id = String(itemId || "");
  return {
    id,
    name: id ? `Service ${id.slice(-6)}` : "Service",
    price: 0,
    path: [],
    unavailable: true,
  };
}

function buildVendorItemQuery(requests = []) {
  const grouped = new Map();
  requests.forEach(({ vendorId, itemId }) => {
    const vendor = String(vendorId || "");
    const item = String(itemId || "");
    if (!mongoose.isValidObjectId(vendor) || !mongoose.isValidObjectId(item)) return;
    if (!grouped.has(vendor)) grouped.set(vendor, new Set());
    grouped.get(vendor).add(item);
  });

  const pairs = Array.from(grouped.entries()).map(([vendorId, itemIds]) => ({
    vendorId: new mongoose.Types.ObjectId(vendorId),
    _id: { $in: Array.from(itemIds, (id) => new mongoose.Types.ObjectId(id)) },
  }));

  return pairs.length ? { $or: pairs } : null;
}

async function loadPriceNodeAncestors(nodes = []) {
  const allNodes = new Map(nodes.map((node) => [serviceKey(node.vendorId, node._id), node]));
  let frontier = nodes;

  for (let depth = 0; depth < 12; depth += 1) {
    const parentRequests = frontier
      .filter((node) => node.parentVendorPriceNodeId)
      .map((node) => ({ vendorId: node.vendorId, itemId: node.parentVendorPriceNodeId }))
      .filter(({ vendorId, itemId }) => !allNodes.has(serviceKey(vendorId, itemId)));
    const query = buildVendorItemQuery(parentRequests);
    if (!query) break;

    const parents = await VendorPriceNode.find(query)
      .select("_id vendorId parentVendorPriceNodeId name price")
      .lean();
    if (!parents.length) break;
    parents.forEach((node) => allNodes.set(serviceKey(node.vendorId, node._id), node));
    frontier = parents;
  }

  return allNodes;
}

function getPriceNodePath(node, nodeMap) {
  const names = [];
  const seen = new Set();
  let current = node;
  while (current && !seen.has(String(current._id))) {
    seen.add(String(current._id));
    names.unshift(String(current.name || "").trim());
    current = current.parentVendorPriceNodeId
      ? nodeMap.get(serviceKey(current.vendorId, current.parentVendorPriceNodeId))
      : null;
  }
  return names.filter(Boolean);
}

async function loadMembershipEligibleServiceMap(memberships = []) {
  const requests = memberships.flatMap((membership) =>
    getEffectiveEligibleMenuItemIds(membership).map((itemId) => ({
      vendorId: membership.vendorId,
      itemId,
    }))
  );
  const query = buildVendorItemQuery(requests);
  if (!query) return new Map();

  const [menuNodes, priceNodes] = await Promise.all([
    VendorMenuNode.find(query)
      .select("_id vendorId name price pathNames")
      .lean(),
    VendorPriceNode.find(query)
      .select("_id vendorId parentVendorPriceNodeId name price")
      .lean(),
  ]);
  const priceNodeMap = await loadPriceNodeAncestors(priceNodes);
  const serviceMap = new Map();

  menuNodes.forEach((node) => {
    serviceMap.set(serviceKey(node.vendorId, node._id), {
      id: String(node._id),
      name: node.name || "Service",
      price: Number(node.price || 0),
      path: normalizeFullPath(node.pathNames, node.name),
      unavailable: false,
    });
  });
  priceNodes.forEach((node) => {
    serviceMap.set(serviceKey(node.vendorId, node._id), {
      id: String(node._id),
      name: node.name || "Service",
      price: Number(node.price || 0),
      path: getPriceNodePath(node, priceNodeMap),
      unavailable: false,
    });
  });

  return serviceMap;
}

function getEligibleServicesForMembership(membership, serviceMap = new Map()) {
  return getEffectiveEligibleMenuItemIds(membership).map((itemId) =>
    serviceMap.get(serviceKey(membership.vendorId, itemId)) || buildFallbackService(itemId)
  );
}

module.exports = {
  getEffectiveEligibleMenuItemIds,
  getEligibleServicesForMembership,
  loadMembershipEligibleServiceMap,
  _private: {
    buildVendorItemQuery,
    normalizeFullPath,
    serviceKey,
  },
};
