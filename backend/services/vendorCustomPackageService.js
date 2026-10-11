const mongoose = require('mongoose');

const DummyCategory = require('../models/dummyCategory');
const DummySubcategory = require('../models/dummySubcategory');
const DummyVendor = require('../models/DummyVendor');
const VendorCustomPackage = require('../models/VendorCustomPackage');
const { applyOfferDateFields } = require('../utils/offerValidity');

function normalizeCustomType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'package';
  if (['package', 'service_item', 'offer'].includes(normalized)) return normalized;
  throw new Error('Unsupported customType');
}

function normalizeVariantMode(value, customType, isLeaf) {
  if (customType === 'offer') return 'single';
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'single' || normalized === 'nested') return normalized;
  return isLeaf ? 'single' : 'nested';
}

function ensureObjectId(value, fieldName) {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new Error(`Invalid ${fieldName}`);
  }
  return new mongoose.Types.ObjectId(value);
}

async function ensureVendorAndRootCategory(vendorId, rootCategoryId) {
  const [vendor, rootCategory] = await Promise.all([
    DummyVendor.findById(vendorId).lean(),
    DummyCategory.findById(rootCategoryId).lean(),
  ]);

  if (!vendor) {
    throw new Error('Vendor not found');
  }
  if (!rootCategory) {
    throw new Error('Root category not found');
  }

  return { vendor, rootCategory };
}

async function getStandardSubcategoryChain(nodeId) {
  const chain = [];
  let current = await DummySubcategory.findById(nodeId).lean();

  if (!current) {
    throw new Error('Standard subcategory parent not found');
  }

  while (current) {
    chain.unshift(current);
    if (!current.parentSubcategory) break;
    current = await DummySubcategory.findById(current.parentSubcategory).lean();
  }

  return chain;
}

async function resolveParentContext({
  vendorId,
  rootCategoryId,
  parentNodeId = null,
  parentNodeType = 'root',
}) {
  const rootCategory = await DummyCategory.findById(rootCategoryId).lean();
  if (!rootCategory) {
    throw new Error('Root category not found');
  }

  if (parentNodeType === 'root') {
    return {
      level: 1,
      ancestorNodeIds: [],
      ancestorNodeTypes: ['root'],
      pathLabels: [rootCategory.name],
      parentRef: null,
    };
  }

  if (!parentNodeId) {
    throw new Error('parentNodeId is required for non-root custom package nodes');
  }

  if (parentNodeType === 'standard_category') {
    const parentCategory = await DummyCategory.findById(parentNodeId).lean();
    if (!parentCategory) {
      throw new Error('Standard category parent not found');
    }

    return {
      level: 2,
      ancestorNodeIds: [parentCategory._id],
      ancestorNodeTypes: ['root', 'standard_category'],
      pathLabels: [rootCategory.name, parentCategory.name],
      parentRef: parentCategory,
    };
  }

  if (parentNodeType === 'standard_subcategory') {
    const chain = await getStandardSubcategoryChain(parentNodeId);
    const lastNode = chain[chain.length - 1];

    if (String(lastNode.category) !== String(rootCategoryId)) {
      throw new Error('Standard subcategory parent does not belong to the selected root category');
    }

    return {
      level: chain.length + 1,
      ancestorNodeIds: chain.map((node) => node._id),
      ancestorNodeTypes: ['root', ...chain.map(() => 'standard_subcategory')],
      pathLabels: [rootCategory.name, ...chain.map((node) => node.name)],
      parentRef: lastNode,
    };
  }

  if (parentNodeType === 'custom_package') {
    const parentCustomNode = await VendorCustomPackage.findOne({
      _id: parentNodeId,
      vendorId,
      rootCategoryId,
      isDeleted: false,
    }).lean();

    if (!parentCustomNode) {
      throw new Error('Custom package parent not found');
    }

    return {
      level: (parentCustomNode.level || 1) + 1,
      ancestorNodeIds: [...(parentCustomNode.ancestorNodeIds || []), parentCustomNode._id],
      ancestorNodeTypes: [...(parentCustomNode.ancestorNodeTypes || []), 'custom_package'],
      pathLabels: [...(parentCustomNode.pathLabels || [rootCategory.name]), parentCustomNode.name],
      parentRef: parentCustomNode,
    };
  }

  throw new Error('Unsupported parentNodeType');
}

function buildTreeFromFlatNodes(nodes) {
  const byKey = new Map();
  const roots = [];

  nodes.forEach((node) => {
    byKey.set(String(node._id), { ...node, children: [] });
  });

  nodes.forEach((node) => {
    const hydrated = byKey.get(String(node._id));
    const parentType = node.parentNodeType || 'root';
    const parentId = node.parentNodeId ? String(node.parentNodeId) : null;

    if (parentType === 'custom_package' && parentId && byKey.has(parentId)) {
      byKey.get(parentId).children.push(hydrated);
    } else {
      roots.push(hydrated);
    }
  });

  const sortChildren = (items) => {
    items.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
    items.forEach((item) => sortChildren(item.children));
  };

  sortChildren(roots);
  return roots;
}

async function listVendorCustomPackageNodes({ vendorId, rootCategoryId, includeDeleted = false }) {
  await ensureVendorAndRootCategory(vendorId, rootCategoryId);

  const query = {
    vendorId,
    rootCategoryId,
  };

  if (!includeDeleted) {
    query.isDeleted = false;
  }

  return VendorCustomPackage.find(query)
    .sort({ sequence: 1, createdAt: 1 })
    .lean();
}

async function buildVendorCustomPackageTree({ vendorId, rootCategoryId, includeDeleted = false }) {
  const nodes = await listVendorCustomPackageNodes({ vendorId, rootCategoryId, includeDeleted });
  return buildTreeFromFlatNodes(nodes);
}

async function prepareVendorCustomPackageCreatePayload(input) {
  const vendorId = ensureObjectId(input.vendorId, 'vendorId');
  const rootCategoryId = ensureObjectId(input.rootCategoryId, 'rootCategoryId');

  await ensureVendorAndRootCategory(vendorId, rootCategoryId);

  const parentNodeType = input.parentNodeType || 'root';
  const parentNodeId =
    parentNodeType === 'root' || !input.parentNodeId
      ? null
      : ensureObjectId(input.parentNodeId, 'parentNodeId');

  const parentContext = await resolveParentContext({
    vendorId,
    rootCategoryId,
    parentNodeId,
    parentNodeType,
  });

  const isLeaf = input.isLeaf !== false;
  const customType = normalizeCustomType(input.customType);
  const variantMode = normalizeVariantMode(input.variantMode, customType, isLeaf);
  const nodeType = input.nodeType || (isLeaf ? 'package_item' : 'package_group');

  const resolvedName =
    customType === 'offer'
      ? String(input.name || input.offerText || 'Offer').trim()
      : String(input.name || '').trim();

  if (!resolvedName) {
    throw new Error('name is required');
  }

  const payload = {
    vendorId,
    rootCategoryId,
    parentNodeId,
    parentNodeType,
    level: input.level || parentContext.level,
    nodeType,
    isLeaf,
    name: resolvedName,
    imageUrl: input.imageUrl || '',
    iconUrl: input.iconUrl || '',
    description: input.description || '',
    terms: input.terms || '',
    packagesIncludes: input.packagesIncludes || '',
    freeText: input.freeText || '',
    enableFreeText: Boolean(input.enableFreeText),
    offerText: input.offerText || '',
    offerStartDate: null,
    offerEndDate: null,
    inventoryLabelName: input.inventoryLabelName || '',
    parentSelectorLabel: input.parentSelectorLabel || '',
    price: isLeaf && input.price != null ? Number(input.price) : null,
    pricingStatus: input.pricingStatus || 'Inactive',
    visibleToUser: input.visibleToUser !== false,
    visibleToVendor: input.visibleToVendor !== false,
    sequence: Number.isFinite(Number(input.sequence)) ? Number(input.sequence) : 0,
    customType,
    variantMode,
    ancestorNodeIds: parentContext.ancestorNodeIds,
    ancestorNodeTypes: parentContext.ancestorNodeTypes,
    pathLabels: parentContext.pathLabels,
  };

  applyOfferDateFields(payload, input);

  if (customType === 'offer') {
    payload.price = null;
    payload.isLeaf = true;
    payload.nodeType = 'package_item';
    if (!String(payload.offerText || '').trim()) {
      throw new Error('offerText is required for custom offers');
    }
  } else if (isLeaf && (payload.price == null || Number.isNaN(payload.price))) {
    throw new Error('price is required for leaf custom package nodes');
  }

  return payload;
}

async function createVendorCustomPackageNode(input) {
  const payload = await prepareVendorCustomPackageCreatePayload(input);
  const created = await VendorCustomPackage.create(payload);
  return created.toObject();
}

module.exports = {
  buildTreeFromFlatNodes,
  buildVendorCustomPackageTree,
  createVendorCustomPackageNode,
  listVendorCustomPackageNodes,
  normalizeCustomType,
  normalizeVariantMode,
  prepareVendorCustomPackageCreatePayload,
  resolveParentContext,
};
