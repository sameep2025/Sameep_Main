const mongoose = require("mongoose");
const DummyVendor = require("../models/DummyVendor");
const CustomerMembership = require("../models/CustomerMembership");
const MembershipPlan = require("../models/MembershipPlan");
const VendorMenuNode = require("../models/VendorMenuNode");
const VendorPriceNode = require("../models/VendorPriceNode");
const VendorCustomPackage = require("../models/VendorCustomPackage");
const {
  resolveCanonicalMembershipMenuItem,
} = require("../services/canonicalMembershipMenuItem");
const {
  assertPrepaidMembershipWalletEnabled,
  isPrepaidMembershipWalletEnabled,
} = require("../services/prepaidMembershipCapability");

const { PLAN_TYPES, DURATIONS, STATUSES } = MembershipPlan.constants;

function normalizeId(value) {
  return String(value || "").trim();
}

function isCanonicalObjectId(value) {
  const id = normalizeId(value);
  return mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id;
}

function getAuthorizedVendorId(req) {
  return normalizeId(req.vendorWriteAuth?.vendorId || req.params?.vendorId);
}

function normalizeString(value, maxLength = 1000) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeBoolean(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeEligibleMenuItemIds(value) {
  const raw = Array.isArray(value) ? value : [];
  return [...new Set(raw.map(normalizeId).filter(Boolean))];
}

function normalizeIdList(value) {
  return normalizeEligibleMenuItemIds(value).sort();
}

function sameIdSet(left = [], right = []) {
  const normalizedLeft = normalizeIdList(left);
  const normalizedRight = normalizeIdList(right);
  if (normalizedLeft.length !== normalizedRight.length) return false;
  return normalizedLeft.every((id, index) => id === normalizedRight[index]);
}

function normalizeServiceEligibilityScope(value) {
  const scope = normalizeString(value, 60).toUpperCase();
  if (scope === "FUTURE_ONLY") return "FUTURE_ONLY";
  if (scope === "ALL_ACTIVE_AND_SCHEDULED") return "ALL_ACTIVE_AND_SCHEDULED";
  return "";
}

function normalizeBenefitRulesScope(value) {
  return normalizeServiceEligibilityScope(value);
}

function resolveEffectiveBenefitFlagsFromPlan(plan = {}) {
  if (plan.benefitSemanticsVersion === "MEMBERSHIP_ITEM_FLAGS_V1") {
    return {
      allowAdditionalDiscountOnMembershipItems:
        plan.allowAdditionalDiscountOnMembershipItems === true,
      allowRewardsOnMembershipItems: plan.allowRewardsOnMembershipItems === true,
      benefitSemanticsVersion: "MEMBERSHIP_ITEM_FLAGS_V1",
    };
  }

  return {
    allowAdditionalDiscountOnMembershipItems: false,
    allowRewardsOnMembershipItems: false,
    benefitSemanticsVersion: "LEGACY_NON_MEMBERSHIP_FLAGS",
  };
}

function serializePlan(plan) {
  if (!plan) return null;

  return {
    id: String(plan._id),
    vendorId: String(plan.vendorId),
    planType: plan.planType,
    name: plan.name || "",
    description: plan.description || "",
    duration: plan.duration,
    sellingPrice: Number(plan.sellingPrice || 0),
    discountPercentage: Number(plan.discountPercentage || 0),
    eligibleMenuItemIds: (plan.eligibleMenuItemIds || []).map((id) => String(id)),
    minimumBillAmount: Number(plan.minimumBillAmount || 0),
    applyDiscountOnNonMembershipItems: plan.applyDiscountOnNonMembershipItems === true,
    rewardsOnNonMembershipItems: plan.rewardsOnNonMembershipItems !== false,
    allowAdditionalDiscountOnMembershipItems: plan.allowAdditionalDiscountOnMembershipItems === true,
    allowRewardsOnMembershipItems: plan.allowRewardsOnMembershipItems === true,
    benefitSemanticsVersion: plan.benefitSemanticsVersion || "LEGACY_NON_MEMBERSHIP_FLAGS",
    status: plan.status,
    serviceQuotaConfig: plan.serviceQuotaConfig || { benefits: [] },
    prepaidValueConfig: plan.prepaidValueConfig || { prepaidValue: 0, bonusValue: 0 },
    ...(plan.planType === "PREPAID_SESSIONS"
      ? {
          prepaidSessionsConfig: plan.prepaidSessionsConfig
            ? {
                eligibleItemId: String(plan.prepaidSessionsConfig.eligibleItemId || ""),
                eligibleItemSource: plan.prepaidSessionsConfig.eligibleItemSource || "",
                eligibleItemKind: plan.prepaidSessionsConfig.eligibleItemKind || "",
                paidQuantity: Number(plan.prepaidSessionsConfig.paidQuantity || 0),
                creditedQuantity: Number(plan.prepaidSessionsConfig.creditedQuantity || 0),
              }
            : null,
        }
      : {}),
    serviceEligibilityRevisions: (plan.serviceEligibilityRevisions || []).map((revision) => ({
      revisionId: revision.revisionId ? String(revision.revisionId) : "",
      previousEligibleMenuItemIds: (revision.previousEligibleMenuItemIds || []).map((id) => String(id)),
      newEligibleMenuItemIds: (revision.newEligibleMenuItemIds || []).map((id) => String(id)),
      scope: revision.scope || "",
      affectedStatuses: revision.affectedStatuses || [],
      affectedMembershipCount: Number(revision.affectedMembershipCount || 0),
      appliedAt: revision.appliedAt || null,
      appliedBy: revision.appliedBy ? String(revision.appliedBy) : null,
    })),
    benefitRulesRevisions: (plan.benefitRulesRevisions || []).map((revision) => ({
      revisionId: revision.revisionId ? String(revision.revisionId) : "",
      previousAllowAdditionalDiscountOnMembershipItems:
        revision.previousAllowAdditionalDiscountOnMembershipItems === true,
      previousAllowRewardsOnMembershipItems: revision.previousAllowRewardsOnMembershipItems === true,
      newAllowAdditionalDiscountOnMembershipItems:
        revision.newAllowAdditionalDiscountOnMembershipItems === true,
      newAllowRewardsOnMembershipItems: revision.newAllowRewardsOnMembershipItems === true,
      previousBenefitSemanticsVersion:
        revision.previousBenefitSemanticsVersion || "LEGACY_NON_MEMBERSHIP_FLAGS",
      newBenefitSemanticsVersion:
        revision.newBenefitSemanticsVersion || "MEMBERSHIP_ITEM_FLAGS_V1",
      scope: revision.scope || "",
      affectedStatuses: revision.affectedStatuses || [],
      affectedMembershipCount: Number(revision.affectedMembershipCount || 0),
      appliedAt: revision.appliedAt || null,
      appliedBy: revision.appliedBy ? String(revision.appliedBy) : null,
    })),
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

function validateDiscountPayload(body, { partial = false } = {}) {
  const errors = [];
  const payload = {};
  const planType = body?.planType ? normalizeString(body.planType, 40).toUpperCase() : "DISCOUNT";

  if (planType !== "DISCOUNT") {
    errors.push("Only DISCOUNT membership plans can be configured in Phase 1");
  }
  payload.planType = "DISCOUNT";

  if (!partial || Object.prototype.hasOwnProperty.call(body, "name")) {
    const name = normalizeString(body?.name, 120);
    if (!name) errors.push("Plan name is required");
    payload.name = name;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, "description")) {
    payload.description = normalizeString(body?.description, 1000);
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, "duration")) {
    const duration = normalizeString(body?.duration, 40).toUpperCase();
    if (!DURATIONS.includes(duration)) errors.push("Valid duration is required");
    payload.duration = duration;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, "sellingPrice")) {
    const sellingPrice = normalizeNumber(body?.sellingPrice);
    if (sellingPrice < 0) errors.push("Selling price must be greater than or equal to 0");
    payload.sellingPrice = Math.max(0, sellingPrice);
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, "discountPercentage")) {
    const discountPercentage = normalizeNumber(body?.discountPercentage);
    if (discountPercentage < 0 || discountPercentage > 100) {
      errors.push("Discount percentage must be between 0 and 100");
    }
    payload.discountPercentage = Math.min(Math.max(discountPercentage, 0), 100);
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, "minimumBillAmount")) {
    const minimumBillAmount = normalizeNumber(body?.minimumBillAmount);
    if (minimumBillAmount < 0) errors.push("Minimum bill amount must be greater than or equal to 0");
    payload.minimumBillAmount = Math.max(0, minimumBillAmount);
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, "eligibleMenuItemIds")) {
    payload.eligibleMenuItemIds = normalizeEligibleMenuItemIds(body?.eligibleMenuItemIds);
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, "applyDiscountOnNonMembershipItems")) {
    payload.applyDiscountOnNonMembershipItems = normalizeBoolean(
      body?.applyDiscountOnNonMembershipItems,
      false
    );
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, "rewardsOnNonMembershipItems")) {
    payload.rewardsOnNonMembershipItems = normalizeBoolean(body?.rewardsOnNonMembershipItems, true);
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, "allowAdditionalDiscountOnMembershipItems")) {
    payload.allowAdditionalDiscountOnMembershipItems = normalizeBoolean(
      body?.allowAdditionalDiscountOnMembershipItems,
      false
    );
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, "allowRewardsOnMembershipItems")) {
    payload.allowRewardsOnMembershipItems = normalizeBoolean(
      body?.allowRewardsOnMembershipItems,
      false
    );
  }

  payload.benefitSemanticsVersion = "MEMBERSHIP_ITEM_FLAGS_V1";

  return { payload, errors };
}

function normalizePositiveMoney(value) {
  const amount = normalizeNumber(value, NaN);
  if (!Number.isFinite(amount)) return NaN;
  return Math.round(amount * 100) / 100;
}

function validatePrepaidPayload(
  body,
  { partial = false, planType: expectedType = "", currentSellingPrice = NaN } = {}
) {
  const errors = [];
  const payload = {};
  const planType = normalizeString(body?.planType || expectedType, 40).toUpperCase();
  if (!["PREPAID_VALUE", "PREPAID_SESSIONS"].includes(planType)) {
    errors.push("Valid prepaid membership type is required");
  }
  payload.planType = planType;

  if (!partial || Object.prototype.hasOwnProperty.call(body, "name")) {
    payload.name = normalizeString(body?.name, 120);
    if (!payload.name) errors.push("Plan name is required");
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, "description")) {
    payload.description = normalizeString(body?.description, 1000);
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, "duration")) {
    payload.duration = normalizeString(body?.duration, 40).toUpperCase();
    if (!DURATIONS.includes(payload.duration)) errors.push("Valid duration is required");
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, "sellingPrice")) {
    payload.sellingPrice = normalizePositiveMoney(body?.sellingPrice);
    if (!Number.isFinite(payload.sellingPrice) || payload.sellingPrice <= 0) {
      errors.push("Selling price must be greater than 0");
    }
  }

  if (planType === "PREPAID_VALUE") {
    if (!partial || Object.prototype.hasOwnProperty.call(body, "prepaidValueConfig")) {
      const config = body?.prepaidValueConfig || {};
      const creditedValue = normalizePositiveMoney(config.prepaidValue ?? config.creditedValue);
      const submittedBonus = config.bonusValue == null
        ? null
        : normalizePositiveMoney(config.bonusValue);
      const paidValue = payload.sellingPrice ?? normalizePositiveMoney(currentSellingPrice);
      const calculatedBonus = Math.round((creditedValue - paidValue) * 100) / 100;
      if (!Number.isFinite(creditedValue) || creditedValue < paidValue || paidValue <= 0) {
        errors.push("Credited wallet value must be at least the customer payment amount");
      }
      if (submittedBonus != null && submittedBonus !== calculatedBonus) {
        errors.push("Bonus value must equal credited wallet value minus customer payment amount");
      }
      payload.prepaidValueConfig = {
        prepaidValue: creditedValue,
        bonusValue: calculatedBonus,
      };
    }
  }

  if (planType === "PREPAID_SESSIONS") {
    if (!partial || Object.prototype.hasOwnProperty.call(body, "prepaidSessionsConfig")) {
      const config = body?.prepaidSessionsConfig || {};
      const paidQuantity = Number(config.paidQuantity);
      const creditedQuantity = Number(config.creditedQuantity);
      const eligibleItemId = normalizeId(config.eligibleItemId);
      const eligibleItemSource = normalizeString(config.eligibleItemSource, 40).toLowerCase();
      if (!isCanonicalObjectId(eligibleItemId)) errors.push("Valid eligible item is required");
      if (!Number.isSafeInteger(paidQuantity) || paidQuantity < 1) {
        errors.push("Paid quantity must be a positive integer");
      }
      if (!Number.isSafeInteger(creditedQuantity) || creditedQuantity < paidQuantity) {
        errors.push("Credited quantity must be an integer not less than paid quantity");
      }
      payload.prepaidSessionsConfig = {
        eligibleItemId,
        eligibleItemSource,
        paidQuantity,
        creditedQuantity,
      };
    }
  }

  return { payload, errors };
}

async function resolvePrepaidSessionConfig(vendorId, config) {
  const item = await resolveCanonicalMembershipMenuItem({
    vendorId,
    itemId: config.eligibleItemId,
    itemSource: config.eligibleItemSource,
  });
  return {
    eligibleItemId: new mongoose.Types.ObjectId(item.itemId),
    eligibleItemSource: item.itemSource,
    eligibleItemKind: item.itemKind,
    paidQuantity: config.paidQuantity,
    creditedQuantity: config.creditedQuantity,
  };
}

async function loadEligibleMenuItems(vendorId) {
  const options = await loadEligibleMenuOptions(vendorId);
  return options.items;
}

async function loadPrepaidEligibleMenuItems(vendorId, existingItems = []) {
  const customItems = await VendorCustomPackage.find({
    vendorId,
    isLeaf: true,
    isDeleted: { $ne: true },
    visibleToVendor: { $ne: false },
    pricingStatus: "Active",
  })
    .select("_id")
    .lean();
  const candidates = [
    ...existingItems.map((item) => ({
      itemId: item.id,
      itemSource: item.sourceType === "vendor_menu" ? "vendor_menu_node" : item.sourceType,
    })),
    ...customItems.map((item) => ({ itemId: String(item._id), itemSource: "custom_package" })),
  ];
  const uniqueCandidates = Array.from(
    new Map(candidates.map((item) => [`${item.itemSource}:${item.itemId}`, item])).values()
  );
  const resolved = await Promise.all(uniqueCandidates.map(async (candidate) => {
    try {
      return await resolveCanonicalMembershipMenuItem({ vendorId, ...candidate });
    } catch (error) {
      return null;
    }
  }));
  return {
    items: resolved.filter(Boolean),
    rejectedCount: resolved.filter((item) => !item).length,
  };
}

async function getActivePricingSource(vendorId) {
  const vendor = await DummyVendor.findById(vendorId)
    .select("pricingSource menuSourceType")
    .lean();

  const pricingSource = String(vendor?.pricingSource || "standard").trim().toLowerCase();
  return {
    pricingSource: pricingSource === "self_managed" ? "self_managed" : "standard",
    menuSourceType: vendor?.menuSourceType || "admin_tree",
    vendorFound: Boolean(vendor),
  };
}

function sortTreeNodes(nodes = []) {
  nodes.sort((a, b) => {
    const sequenceDiff = Number(a.sequence || 0) - Number(b.sequence || 0);
    if (sequenceDiff !== 0) return sequenceDiff;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
  nodes.forEach((node) => sortTreeNodes(node.children || []));
  return nodes;
}

function pruneEmptyBranches(nodes = []) {
  return nodes
    .map((node) => {
      const children = pruneEmptyBranches(node.children || []);
      const eligibleDescendantCount =
        (node.isBillable ? 1 : 0) +
        children.reduce((total, child) => total + Number(child.eligibleDescendantCount || 0), 0);

      if (!node.isBillable && eligibleDescendantCount === 0) return null;

      return {
        ...node,
        children,
        eligibleDescendantCount,
      };
    })
    .filter(Boolean);
}

function buildTreeFromParentIds(nodes = [], config = {}) {
  const {
    sourceType,
    parentField,
    pathField,
    isBillable = (node) => Boolean(node.isLeaf),
  } = config;
  const byId = new Map();
  const roots = [];

  nodes.forEach((node) => {
    const nodeId = String(node._id);
    byId.set(nodeId, {
      id: nodeId,
      sourceType,
      name: node.name || "",
      price: Number(node.price || 0),
      status: node.pricingStatus || "",
      path: Array.isArray(node[pathField]) ? node[pathField] : [],
      isLeaf: Boolean(node.isLeaf),
      isBillable: Boolean(isBillable(node)),
      sequence: Number(node.sequence || 0),
      children: [],
    });
  });

  nodes.forEach((node) => {
    const current = byId.get(String(node._id));
    const parentId = node[parentField] ? String(node[parentField]) : "";
    const parent = parentId ? byId.get(parentId) : null;
    if (parent) {
      parent.children.push(current);
    } else {
      roots.push(current);
    }
  });

  const prunedRoots = pruneEmptyBranches(sortTreeNodes(roots));
  return prunedRoots;
}

function flattenBillableItems(nodes = []) {
  const rows = [];

  function walk(node, ancestors = []) {
    const path = Array.isArray(node.path) && node.path.length > 0
      ? node.path
      : [...ancestors, node.name].filter(Boolean);

    if (node.isBillable) {
      rows.push({
        id: String(node.id),
        sourceType: node.sourceType,
        name: node.name || "",
        price: Number(node.price || 0),
        status: node.status || "",
        path,
      });
    }

    (node.children || []).forEach((child) => walk(child, path));
  }

  nodes.forEach((node) => walk(node));
  return rows.sort((a, b) => {
    const left = [...(a.path || []), a.name].join(" / ");
    const right = [...(b.path || []), b.name].join(" / ");
    return left.localeCompare(right);
  });
}

async function loadEligibleMenuOptions(vendorId) {
  const vendorObjectId = new mongoose.Types.ObjectId(vendorId);
  const activeSource = await getActivePricingSource(vendorId);
  let tree = [];

  if (activeSource.pricingSource === "self_managed") {
    const menuNodes = await VendorMenuNode.find({
      vendorId: vendorObjectId,
      datasetStatus: { $ne: "archived" },
      visibleToVendor: { $ne: false },
      pricingStatus: { $ne: "Archive" },
    })
      .select("_id parentNodeId name price pathNames pricingStatus isLeaf sequence")
      .lean();

    tree = buildTreeFromParentIds(menuNodes, {
      sourceType: "vendor_menu",
      parentField: "parentNodeId",
      pathField: "pathNames",
      isBillable: (node) => Boolean(node.isLeaf) && node.pricingStatus === "Active",
    });
  } else {
    const priceNodes = await VendorPriceNode.find({
      vendorId: vendorObjectId,
      visibleToVendor: { $ne: false },
      pricingStatus: { $ne: "Archive" },
    })
      .select("_id parentVendorPriceNodeId name price pricingStatus isLeaf sequence")
      .lean();

    tree = buildTreeFromParentIds(priceNodes, {
      sourceType: "vendor_price_node",
      parentField: "parentVendorPriceNodeId",
      pathField: "pathNames",
      isBillable: (node) => Boolean(node.isLeaf) && node.pricingStatus === "Active",
    });
  }

  return {
    items: flattenBillableItems(tree),
    tree,
    activeSource,
  };
}

async function validateEligibleMenuItemIds(vendorId, ids) {
  const normalizedIds = normalizeEligibleMenuItemIds(ids);
  const invalidFormatIds = normalizedIds.filter((id) => !isCanonicalObjectId(id));
  if (invalidFormatIds.length > 0) {
    return { ok: false, message: "Eligible item IDs must be valid IDs" };
  }

  if (normalizedIds.length === 0) {
    return { ok: true, ids: [] };
  }

    const eligibleItems = await loadEligibleMenuItems(vendorId);
  const allowed = new Set(eligibleItems.map((item) => item.id));
  const unauthorizedIds = normalizedIds.filter((id) => !allowed.has(id));
  if (unauthorizedIds.length > 0) {
    return {
      ok: false,
      message: "Eligible items must belong to this vendor",
    };
  }

  return {
    ok: true,
    ids: normalizedIds.map((id) => new mongoose.Types.ObjectId(id)),
  };
}

async function listPlans(req, res) {
  try {
    const vendorId = getAuthorizedVendorId(req);
    if (!isCanonicalObjectId(vendorId)) {
      return res.status(400).json({ success: false, message: "Valid vendorId required" });
    }

    const query = isPrepaidMembershipWalletEnabled()
      ? { vendorId }
      : { vendorId, planType: { $nin: ["PREPAID_VALUE", "PREPAID_SESSIONS"] } };
    const plans = await MembershipPlan.find(query)
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      data: plans.map(serializePlan),
      capabilities: {
        prepaidMembershipWallets: isPrepaidMembershipWalletEnabled(),
      },
    });
  } catch (error) {
    console.error("Membership list error:", error?.message || error);
    return res.status(500).json({ success: false, message: "Failed to load membership plans" });
  }
}

async function getEligibleItems(req, res) {
  try {
    const vendorId = getAuthorizedVendorId(req);
    if (!isCanonicalObjectId(vendorId)) {
      return res.status(400).json({ success: false, message: "Valid vendorId required" });
    }

    const options = await loadEligibleMenuOptions(vendorId);
    const prepaidMembershipWallets = isPrepaidMembershipWalletEnabled();
    const prepaidEligibility = prepaidMembershipWallets
      ? await loadPrepaidEligibleMenuItems(vendorId, options.items)
      : { items: [], rejectedCount: 0 };
    return res.json({
      success: true,
      data: options.items,
      tree: options.tree,
      prepaidEligibleItems: prepaidEligibility.items,
      prepaidEligibilityRejectedCount: prepaidEligibility.rejectedCount,
      capabilities: { prepaidMembershipWallets },
      activeMenu: {
        pricingSource: options.activeSource.pricingSource,
        menuSourceType: options.activeSource.menuSourceType,
        label: options.activeSource.pricingSource === "self_managed" ? "My Menu" : "Standard Menu",
      },
    });
  } catch (error) {
    console.error("Membership eligible items error:", error?.message || error);
    return res.status(500).json({ success: false, message: "Failed to load eligible services" });
  }
}

async function createPlan(req, res) {
  try {
    const vendorId = getAuthorizedVendorId(req);
    if (!isCanonicalObjectId(vendorId)) {
      return res.status(400).json({ success: false, message: "Valid vendorId required" });
    }

    const requestedType = normalizeString(req.body?.planType || "DISCOUNT", 40).toUpperCase();
    const isPrepaid = ["PREPAID_VALUE", "PREPAID_SESSIONS"].includes(requestedType);
    if (isPrepaid) assertPrepaidMembershipWalletEnabled();
    const { payload, errors } = isPrepaid
      ? validatePrepaidPayload(req.body, { planType: requestedType })
      : validateDiscountPayload(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors[0], errors });
    }

    if (requestedType === "DISCOUNT") {
      const itemValidation = await validateEligibleMenuItemIds(vendorId, payload.eligibleMenuItemIds);
      if (!itemValidation.ok) {
        return res.status(400).json({ success: false, message: itemValidation.message });
      }
      payload.eligibleMenuItemIds = itemValidation.ids;
    } else if (requestedType === "PREPAID_SESSIONS") {
      payload.prepaidSessionsConfig = await resolvePrepaidSessionConfig(
        vendorId,
        payload.prepaidSessionsConfig
      );
    }

    const plan = await MembershipPlan.create({
      ...payload,
      vendorId,
      status: "INACTIVE",
      audit: {
        createdBy: req.vendorWriteAuth?.customerId || null,
        updatedBy: req.vendorWriteAuth?.customerId || null,
      },
    });

    return res.status(201).json({ success: true, data: serializePlan(plan.toObject()) });
  } catch (error) {
    if (error?.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
        code: error.code || undefined,
      });
    }
    console.error("Membership create error:", error?.message || error);
    return res.status(500).json({ success: false, message: "Failed to create membership plan" });
  }
}

async function getPlan(req, res) {
  try {
    const vendorId = getAuthorizedVendorId(req);
    const { planId } = req.params;
    if (!isCanonicalObjectId(vendorId) || !isCanonicalObjectId(planId)) {
      return res.status(400).json({ success: false, message: "Valid vendorId and planId required" });
    }

    const plan = await MembershipPlan.findOne({ _id: planId, vendorId }).lean();
    if (!plan) {
      return res.status(404).json({ success: false, message: "Membership plan not found" });
    }
    if (["PREPAID_VALUE", "PREPAID_SESSIONS"].includes(plan.planType)) {
      assertPrepaidMembershipWalletEnabled();
    }

    return res.json({ success: true, data: serializePlan(plan) });
  } catch (error) {
    if (error?.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
        code: error.code || undefined,
      });
    }
    console.error("Membership detail error:", error?.message || error);
    return res.status(500).json({ success: false, message: "Failed to load membership plan" });
  }
}

async function updatePlan(req, res) {
  const session = await mongoose.startSession();
  try {
    const vendorId = getAuthorizedVendorId(req);
    const { planId } = req.params;
    if (!isCanonicalObjectId(vendorId) || !isCanonicalObjectId(planId)) {
      return res.status(400).json({ success: false, message: "Valid vendorId and planId required" });
    }

    const existing = await MembershipPlan.findOne({ _id: planId, vendorId }).lean();
    if (!existing) {
      return res.status(404).json({ success: false, message: "Membership plan not found" });
    }

    const submittedType = req.body?.planType
      ? normalizeString(req.body.planType, 40).toUpperCase()
      : existing.planType;
    if (submittedType !== existing.planType) {
      return res.status(400).json({
        success: false,
        message: "Membership plan type cannot be changed after creation",
      });
    }

    if (!["DISCOUNT", "PREPAID_VALUE", "PREPAID_SESSIONS"].includes(existing.planType)) {
      return res.status(400).json({
        success: false,
        message: "Only DISCOUNT and prepaid membership plans can be edited",
      });
    }

    if (existing.planType !== "DISCOUNT") {
      assertPrepaidMembershipWalletEnabled();
      const { payload, errors } = validatePrepaidPayload(req.body, {
        partial: true,
        planType: existing.planType,
        currentSellingPrice: existing.sellingPrice,
      });
      delete payload.planType;
      if (errors.length > 0) {
        return res.status(400).json({ success: false, message: errors[0], errors });
      }
      if (existing.planType === "PREPAID_VALUE" && payload.prepaidValueConfig) {
        const sellingPrice = payload.sellingPrice ?? Number(existing.sellingPrice);
        const creditedValue = payload.prepaidValueConfig.prepaidValue;
        const submittedBonus = req.body?.prepaidValueConfig?.bonusValue;
        const calculatedBonus = Math.round((creditedValue - sellingPrice) * 100) / 100;
        if (creditedValue < sellingPrice || (
          submittedBonus != null && normalizePositiveMoney(submittedBonus) !== calculatedBonus
        )) {
          return res.status(400).json({
            success: false,
            message: "Bonus value must equal credited wallet value minus customer payment amount",
          });
        }
        payload.prepaidValueConfig.bonusValue = calculatedBonus;
      }
      if (
        existing.planType === "PREPAID_VALUE" &&
        Object.prototype.hasOwnProperty.call(payload, "sellingPrice") &&
        !payload.prepaidValueConfig
      ) {
        const creditedValue = Number(existing.prepaidValueConfig?.prepaidValue || 0);
        if (creditedValue < payload.sellingPrice) {
          return res.status(400).json({
            success: false,
            message: "Credited wallet value must be at least the customer payment amount",
          });
        }
        payload.prepaidValueConfig = {
          prepaidValue: creditedValue,
          bonusValue: Math.round((creditedValue - payload.sellingPrice) * 100) / 100,
        };
      }
      if (existing.planType === "PREPAID_SESSIONS" && payload.prepaidSessionsConfig) {
        payload.prepaidSessionsConfig = await resolvePrepaidSessionConfig(
          vendorId,
          payload.prepaidSessionsConfig
        );
      }
      payload["audit.updatedBy"] = req.vendorWriteAuth?.customerId || null;
      const updated = await MembershipPlan.findOneAndUpdate(
        { _id: planId, vendorId, planType: existing.planType },
        { $set: payload },
        { new: true, runValidators: true }
      ).lean();
      return res.json({ success: true, data: serializePlan(updated) });
    }

    const { payload, errors } = validateDiscountPayload(req.body, { partial: true });
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors[0], errors });
    }

    let serviceEligibilityChanged = false;
    let serviceEligibilityRevision = null;
    let affectedMembershipCount = 0;
    let benefitRulesChanged = false;
    let benefitRulesRevision = null;
    let benefitRulesAffectedMembershipCount = 0;
    const now = new Date();

    if (Object.prototype.hasOwnProperty.call(payload, "eligibleMenuItemIds")) {
      const itemValidation = await validateEligibleMenuItemIds(vendorId, payload.eligibleMenuItemIds);
      if (!itemValidation.ok) {
        return res.status(400).json({ success: false, message: itemValidation.message });
      }
      payload.eligibleMenuItemIds = itemValidation.ids;
      serviceEligibilityChanged = !sameIdSet(existing.eligibleMenuItemIds || [], payload.eligibleMenuItemIds || []);

      if (serviceEligibilityChanged) {
        const scope = normalizeServiceEligibilityScope(req.body?.serviceEligibilityScope);
        if (!scope) {
          return res.status(400).json({
            success: false,
            message: "Choose how service changes apply to existing members",
          });
        }

        serviceEligibilityRevision = {
          revisionId: new mongoose.Types.ObjectId(),
          previousEligibleMenuItemIds: (existing.eligibleMenuItemIds || []).map((id) => new mongoose.Types.ObjectId(id)),
          newEligibleMenuItemIds: payload.eligibleMenuItemIds,
          scope,
          affectedStatuses: scope === "ALL_ACTIVE_AND_SCHEDULED" ? ["ACTIVE", "SCHEDULED"] : [],
          affectedMembershipCount: 0,
          appliedAt: new Date(),
          appliedBy: req.vendorWriteAuth?.customerId || null,
        };
      }
    }

    const benefitFieldsSubmitted =
      Object.prototype.hasOwnProperty.call(payload, "allowAdditionalDiscountOnMembershipItems") ||
      Object.prototype.hasOwnProperty.call(payload, "allowRewardsOnMembershipItems");
    if (benefitFieldsSubmitted) {
      const previousBenefits = resolveEffectiveBenefitFlagsFromPlan(existing);
      const nextBenefits = {
        allowAdditionalDiscountOnMembershipItems:
          payload.allowAdditionalDiscountOnMembershipItems ??
          previousBenefits.allowAdditionalDiscountOnMembershipItems,
        allowRewardsOnMembershipItems:
          payload.allowRewardsOnMembershipItems ??
          previousBenefits.allowRewardsOnMembershipItems,
        benefitSemanticsVersion: "MEMBERSHIP_ITEM_FLAGS_V1",
      };
      benefitRulesChanged =
        previousBenefits.allowAdditionalDiscountOnMembershipItems !==
          nextBenefits.allowAdditionalDiscountOnMembershipItems ||
        previousBenefits.allowRewardsOnMembershipItems !==
          nextBenefits.allowRewardsOnMembershipItems;

      if (benefitRulesChanged) {
        const scope = normalizeBenefitRulesScope(req.body?.benefitRulesScope);
        if (!scope) {
          return res.status(400).json({
            success: false,
            message: "Choose how benefit changes apply to existing members",
          });
        }

        benefitRulesRevision = {
          revisionId: new mongoose.Types.ObjectId(),
          previousAllowAdditionalDiscountOnMembershipItems:
            previousBenefits.allowAdditionalDiscountOnMembershipItems,
          previousAllowRewardsOnMembershipItems: previousBenefits.allowRewardsOnMembershipItems,
          newAllowAdditionalDiscountOnMembershipItems:
            nextBenefits.allowAdditionalDiscountOnMembershipItems,
          newAllowRewardsOnMembershipItems: nextBenefits.allowRewardsOnMembershipItems,
          previousBenefitSemanticsVersion: previousBenefits.benefitSemanticsVersion,
          newBenefitSemanticsVersion: nextBenefits.benefitSemanticsVersion,
          scope,
          affectedStatuses: scope === "ALL_ACTIVE_AND_SCHEDULED" ? ["ACTIVE", "SCHEDULED"] : [],
          affectedMembershipCount: 0,
          appliedAt: new Date(),
          appliedBy: req.vendorWriteAuth?.customerId || null,
        };
      }
    }

    payload["audit.updatedBy"] = req.vendorWriteAuth?.customerId || null;

    let plan = null;
    await session.withTransaction(async () => {
      const update = { $set: payload };
      if (serviceEligibilityRevision) {
        update.$push = { serviceEligibilityRevisions: serviceEligibilityRevision };
      }
      if (benefitRulesRevision) {
        update.$push = {
          ...(update.$push || {}),
          benefitRulesRevisions: benefitRulesRevision,
        };
      }

      if (serviceEligibilityRevision?.scope === "ALL_ACTIVE_AND_SCHEDULED") {
        const membershipUpdate = await CustomerMembership.updateMany(
          {
            vendorId,
            membershipPlanId: planId,
            membershipType: "DISCOUNT",
            status: { $in: ["ACTIVE", "SCHEDULED"] },
            expiresAt: { $gt: now },
          },
          {
            $set: {
              serviceEligibilityOverride: {
                eligibleMenuItemIds: payload.eligibleMenuItemIds,
                revisionId: serviceEligibilityRevision.revisionId,
                appliedAt: serviceEligibilityRevision.appliedAt,
                appliedBy: serviceEligibilityRevision.appliedBy,
                source: "PLAN_SERVICE_ELIGIBILITY_UPDATE",
              },
            },
          },
          { session }
        );
        affectedMembershipCount = membershipUpdate.modifiedCount || 0;
        serviceEligibilityRevision.affectedMembershipCount = affectedMembershipCount;
      }

      if (benefitRulesRevision?.scope === "ALL_ACTIVE_AND_SCHEDULED") {
        const membershipUpdate = await CustomerMembership.updateMany(
          {
            vendorId,
            membershipPlanId: planId,
            membershipType: "DISCOUNT",
            status: { $in: ["ACTIVE", "SCHEDULED"] },
            expiresAt: { $gt: now },
          },
          {
            $set: {
              benefitRulesOverride: {
                allowAdditionalDiscountOnMembershipItems:
                  benefitRulesRevision.newAllowAdditionalDiscountOnMembershipItems,
                allowRewardsOnMembershipItems:
                  benefitRulesRevision.newAllowRewardsOnMembershipItems,
                benefitSemanticsVersion: benefitRulesRevision.newBenefitSemanticsVersion,
                revisionId: benefitRulesRevision.revisionId,
                updatedAt: benefitRulesRevision.appliedAt,
                updatedBy: benefitRulesRevision.appliedBy,
                source: "PLAN_BENEFIT_RULES_UPDATE",
              },
            },
          },
          { session }
        );
        benefitRulesAffectedMembershipCount = membershipUpdate.modifiedCount || 0;
        benefitRulesRevision.affectedMembershipCount = benefitRulesAffectedMembershipCount;
      }

      plan = await MembershipPlan.findOneAndUpdate(
        { _id: planId, vendorId },
        update,
        { new: true, runValidators: true, session }
      ).lean();
    });

    return res.json({
      success: true,
      data: serializePlan(plan),
      serviceEligibilityUpdate: serviceEligibilityRevision
        ? {
            scope: serviceEligibilityRevision.scope,
            affectedMembershipCount,
            revisionId: String(serviceEligibilityRevision.revisionId),
          }
        : null,
      benefitRulesUpdate: benefitRulesRevision
        ? {
            scope: benefitRulesRevision.scope,
            affectedMembershipCount: benefitRulesAffectedMembershipCount,
            revisionId: String(benefitRulesRevision.revisionId),
          }
        : null,
    });
  } catch (error) {
    if (error?.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
        code: error.code || undefined,
      });
    }
    console.error("Membership update error:", error?.message || error);
    return res.status(500).json({ success: false, message: "Failed to update membership plan" });
  } finally {
    await session.endSession();
  }
}

async function updatePlanStatus(req, res) {
  try {
    const vendorId = getAuthorizedVendorId(req);
    const { planId } = req.params;
    const status = normalizeString(req.body?.status, 20).toUpperCase();

    if (!isCanonicalObjectId(vendorId) || !isCanonicalObjectId(planId)) {
      return res.status(400).json({ success: false, message: "Valid vendorId and planId required" });
    }
    if (!STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: "Valid status is required" });
    }

    const existing = await MembershipPlan.findOne({ _id: planId, vendorId }).lean();
    if (!existing) {
      return res.status(404).json({ success: false, message: "Membership plan not found" });
    }
    if (!["DISCOUNT", "PREPAID_VALUE", "PREPAID_SESSIONS"].includes(existing.planType)) {
      return res.status(400).json({
        success: false,
        message: "This membership plan type is not available",
      });
    }
    if (existing.planType !== "DISCOUNT") {
      assertPrepaidMembershipWalletEnabled();
      if (status === "ACTIVE" && existing.planType === "PREPAID_SESSIONS") {
        await resolvePrepaidSessionConfig(vendorId, existing.prepaidSessionsConfig || {});
      }
    }

    const plan = await MembershipPlan.findOneAndUpdate(
      { _id: planId, vendorId },
      {
        $set: {
          status,
          "audit.updatedBy": req.vendorWriteAuth?.customerId || null,
        },
      },
      { new: true, runValidators: true }
    ).lean();

    return res.json({ success: true, data: serializePlan(plan) });
  } catch (error) {
    if (error?.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
        code: error.code || undefined,
      });
    }
    console.error("Membership status error:", error?.message || error);
    return res.status(500).json({ success: false, message: "Failed to update membership status" });
  }
}

module.exports = {
  listPlans,
  getEligibleItems,
  createPlan,
  getPlan,
  updatePlan,
  updatePlanStatus,
  _private: {
    validateDiscountPayload,
    validatePrepaidPayload,
    resolvePrepaidSessionConfig,
    serializePlan,
    normalizeEligibleMenuItemIds,
    validateEligibleMenuItemIds,
    loadEligibleMenuOptions,
    loadPrepaidEligibleMenuItems,
    buildTreeFromParentIds,
    flattenBillableItems,
    getActivePricingSource,
    normalizeBenefitRulesScope,
    resolveEffectiveBenefitFlagsFromPlan,
    PLAN_TYPES,
    DURATIONS,
    STATUSES,
  },
};
