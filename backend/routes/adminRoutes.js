const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const AdminUser = require("../models/AdminUser");
const DummyVendor = require("../models/DummyVendor");
const DummyCategory = require("../models/dummyCategory");
const DummySubcategory = require("../models/dummySubcategory");
const VendorMenuNode = require("../models/VendorMenuNode");
const { requireAdminAuth } = require("../utils/adminAuthMiddleware");
const { adminLoginLimiter } = require("../utils/securityLimiters");
const {
  createAdminImpersonationHandoff,
} = require("../services/adminImpersonationHandoffService");
const { buildTree } = require("../utils/treeBuilder");
const {
  getPlans,
  createPlan,
  updatePlan,
  deletePlan,
} = require("../controllers/planController");
const {
  assignVendorPlan,
  getVendorSubscription,
  updateVendorSubscription,
} = require("../controllers/vendorSubscriptionController");
const {
  listTrustQuestionnaireConfigs,
  createTrustQuestionnaireConfig,
  updateTrustQuestionnaireConfig,
  deleteTrustQuestionnaireConfig,
} = require("../controllers/trustQuestionnaireConfigController");

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;

function normalizeSystemKey(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "localhost";
  if (["local", "localhost", "current", "same"].includes(normalized)) return "localhost";
  if (["staging", "production", "prod", "development", "dev"].includes(normalized)) {
    return normalized === "prod" ? "production" : normalized;
  }
  return normalized;
}

function ensureLocalSystem(system) {
  const normalized = normalizeSystemKey(system);
  if (normalized !== "localhost") {
    const error = new Error(
      `Source system "${normalized}" is not connected yet. Localhost/current system is supported first.`
    );
    error.statusCode = 501;
    throw error;
  }
  return normalized;
}

function normalizeSourceType(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "category") return "category";
  return "vendor";
}

function escapeRegex(value = "") {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildVendorMenuTree(nodes = []) {
  const map = {};
  const roots = [];

  nodes.forEach((node) => {
    map[String(node._id)] = {
      id: String(node._id),
      parentNodeId: node.parentNodeId ? String(node.parentNodeId) : null,
      name: node.name,
      imageUrl: node.imageUrl || "",
      price: node.price ?? null,
      pricingStatus: node.pricingStatus || "Inactive",
      terms: node.terms || "",
      packagesIncludes: node.packagesIncludes || "",
      offerText: node.offerText || "",
      sequence: node.sequence ?? 0,
      level: node.level,
      isLeaf: Boolean(node.isLeaf),
      pathNames: Array.isArray(node.pathNames) ? node.pathNames : [],
      children: [],
    };
  });

  nodes.forEach((node) => {
    const current = map[String(node._id)];
    if (!node.parentNodeId) {
      roots.push(current);
      return;
    }
    const parent = map[String(node.parentNodeId)];
    if (parent) parent.children.push(current);
    else roots.push(current);
  });

  function sortNodes(list) {
    list.sort((a, b) => {
      const bySequence = (a.sequence ?? 0) - (b.sequence ?? 0);
      if (bySequence !== 0) return bySequence;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
    list.forEach((child) => sortNodes(child.children || []));
  }

  sortNodes(roots);
  return roots;
}

function normalizeCategoryTreeNodes(nodes = [], parentPath = []) {
  return (nodes || []).map((node) => {
    const currentPath = [...parentPath, node.name].filter(Boolean);
    const isLeaf = Boolean(node.isLeaf);
    return {
      id: String(node.id || node._id || ""),
      parentNodeId: null,
      name: node.name,
      imageUrl: node.imageUrl || "",
      iconUrl: node.iconUrl || "",
      price: node.price ?? null,
      pricingStatus: isLeaf ? "Active" : node.pricingStatus || "Inactive",
      visibleToUser: node.visibleToUser ?? true,
      visibleToVendor: node.visibleToVendor ?? true,
      terms: node.terms || "",
      packagesIncludes: node.packagesIncludes || "",
      offerText: node.offerText || "",
      inventoryLabelName: node.inventoryLabelName || "",
      parentSelectorLabel: node.parentSelectorLabel || "",
      sequence: node.sequence ?? 0,
      enableFreeText: node.enableFreeText ?? false,
      freeText: node.freeText || "",
      level: Number(node.level || 1),
      isLeaf,
      pathNames: currentPath,
      children: normalizeCategoryTreeNodes(node.children || [], currentPath),
    };
  });
}

function collectTreeIds(nodes = []) {
  return nodes.flatMap((node) => [
    String(node.id),
    ...collectTreeIds(node.children || []),
  ]);
}

function filterTreeBySelection(nodes = [], selectedIdSet) {
  return nodes.reduce((acc, node) => {
    const filteredChildren = filterTreeBySelection(node.children || [], selectedIdSet);
    const isSelected = selectedIdSet.has(String(node.id));

    if (!isSelected && !filteredChildren.length) {
      return acc;
    }

    acc.push({
      ...node,
      children: filteredChildren,
    });
    return acc;
  }, []);
}

function isNodeFullySelected(node, selectedIdSet) {
  const allIds = collectTreeIds([node]);
  return allIds.length > 0 && allIds.every((id) => selectedIdSet.has(String(id)));
}

function buildInsertionTreeForDestination(nodes = [], selectedIdSet) {
  return nodes.reduce((acc, node) => {
    const isSelected = selectedIdSet.has(String(node.id));
    const selectedChildren = buildInsertionTreeForDestination(node.children || [], selectedIdSet);
    const fullySelected = isNodeFullySelected(node, selectedIdSet);

    if (!isSelected && !selectedChildren.length) {
      return acc;
    }

    if (!fullySelected) {
      if (selectedChildren.length) {
        acc.push(...selectedChildren);
      } else if (isSelected) {
        acc.push({
          ...node,
          children: [],
        });
      }
      return acc;
    }

    acc.push({
      ...node,
      children: selectedChildren,
    });
    return acc;
  }, []);
}

async function createVendorMenuTreeForTarget({
  vendorId,
  nodes,
  parentNodeId = null,
  parentPathNames = [],
  parentLevel = 0,
  uploadBatchId,
  datasetStatus = "active",
  startSequence = 1,
}) {
  let sequence = startSequence;

  for (const node of nodes) {
    const nodeLevel = parentLevel + 1;
    const nodePathNames = [...parentPathNames, node.name].filter(Boolean);
    const created = await VendorMenuNode.create({
      vendorId,
      parentNodeId,
      name: node.name,
      level: nodeLevel,
      isLeaf: Boolean(node.isLeaf),
      price: node.price ?? null,
      pricingStatus: node.pricingStatus || (node.isLeaf ? "Active" : "Inactive"),
      visibleToUser: node.visibleToUser ?? true,
      visibleToVendor: node.visibleToVendor ?? true,
      terms: node.terms || "",
      packagesIncludes: node.packagesIncludes || "",
      offerText: node.offerText || "",
      inventoryLabelName: node.inventoryLabelName || "",
      parentSelectorLabel: node.parentSelectorLabel || "",
      sequence,
      enableFreeText: node.enableFreeText ?? false,
      freeText: node.freeText || "",
      imageUrl: node.imageUrl || "",
      iconUrl: node.iconUrl || "",
      sourceType: "manual_upload",
      uploadBatchId,
      datasetStatus,
      pathNames: nodePathNames,
    });

    if (Array.isArray(node.children) && node.children.length) {
      await createVendorMenuTreeForTarget({
        vendorId,
        nodes: node.children,
        parentNodeId: created._id,
        parentPathNames: nodePathNames,
        parentLevel: nodeLevel,
        uploadBatchId,
        datasetStatus,
        startSequence: 1,
      });
    }

    sequence += 1;
  }
}

router.post("/login", adminLoginLimiter, async (req, res) => {
  try {
    if (!JWT_SECRET) {
      return res.status(500).json({ message: "JWT_SECRET not configured" });
    }

    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const admin = await AdminUser.findOne({ email }).lean();
    if (!admin) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { adminId: admin._id.toString(), email: admin.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      token,
      admin: {
        id: admin._id.toString(),
        email: admin.email,
        createdAt: admin.createdAt,
      },
    });
  } catch (err) {
    console.error("POST /api/admin/login error:", err.message || err);
    return res.status(500).json({ message: "Login failed" });
  }
});

router.get("/me", requireAdminAuth, async (req, res) => {
  try {
    const admin = await AdminUser.findById(req.admin.id).lean();
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    return res.json({
      id: admin._id.toString(),
      email: admin.email,
      createdAt: admin.createdAt,
    });
  } catch (err) {
    console.error("GET /api/admin/me error:", err.message || err);
    return res.status(500).json({ message: "Failed to load admin" });
  }
});

router.post("/impersonation-handoffs", requireAdminAuth, async (req, res) => {
  try {
    const vendorId = String(req.body?.vendorId || "").trim();
    const categoryId = String(req.body?.categoryId || "").trim();
    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({ message: "Valid vendorId is required" });
    }

    const handoff = await createAdminImpersonationHandoff({
      adminId: req.admin.id,
      vendorId,
      categoryId,
    });
    return res.status(201).json({
      success: true,
      handoffCode: handoff.code,
      expiresAt: handoff.expiresAt,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Failed to create impersonation handoff",
      code: error.code || "impersonation_handoff_failed",
    });
  }
});

router.get("/vendor-menu-copy/vendors", requireAdminAuth, async (req, res) => {
  try {
    const system = ensureLocalSystem(req.query.system);
    const query = String(req.query.query || "").trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 25);

    const match = {};
    if (query) {
      const regex = new RegExp(escapeRegex(query), "i");
      const phoneDigits = query.replace(/\D/g, "");
      match.$or = [
        { businessName: regex },
        { contactName: regex },
        { subdomain: regex },
      ];
      if (phoneDigits) {
        match.$or.push({ phone: new RegExp(escapeRegex(phoneDigits), "i") });
      }
    }

    const vendors = await DummyVendor.find(match)
      .select("businessName contactName phone subdomain pricingSource menuSourceType status")
      .sort({ businessName: 1, createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({
      success: true,
      system,
      items: vendors.map((vendor) => ({
        id: String(vendor._id),
        businessName: vendor.businessName || "",
        contactName: vendor.contactName || "",
        phone: vendor.phone || "",
        subdomain: vendor.subdomain || "",
        pricingSource: vendor.pricingSource || "standard",
        menuSourceType: vendor.menuSourceType || "admin_tree",
        status: vendor.status || "",
      })),
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.message || "Failed to search vendors for menu copy",
    });
  }
});

router.get("/vendor-menu-copy/categories", requireAdminAuth, async (req, res) => {
  try {
    const system = ensureLocalSystem(req.query.system);
    const query = String(req.query.query || "").trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 25);

    const match = { parent: null };
    if (query) {
      match.name = new RegExp(escapeRegex(query), "i");
    }

    const categories = await DummyCategory.find(match)
      .select("name imageUrl categoryType pricingStatus sequence")
      .sort({ sequence: 1, name: 1, createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({
      success: true,
      system,
      items: categories.map((category) => ({
        id: String(category._id),
        name: category.name || "",
        imageUrl: category.imageUrl || "",
        categoryType: category.categoryType || "Services",
        pricingStatus: category.pricingStatus || "Inactive",
      })),
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.message || "Failed to search categories for menu copy",
    });
  }
});

router.get("/vendor-menu-copy/preview", requireAdminAuth, async (req, res) => {
  try {
    const system = ensureLocalSystem(req.query.system);
    const sourceType = normalizeSourceType(req.query.sourceType);
    const vendorId = String(req.query.vendorId || "").trim();
    const categoryId = String(req.query.categoryId || "").trim();

    if (sourceType === "vendor" && !vendorId) {
      return res.status(400).json({ message: "vendorId is required" });
    }
    if (sourceType === "category" && !categoryId) {
      return res.status(400).json({ message: "categoryId is required" });
    }

    if (sourceType === "vendor") {
      const vendor = await DummyVendor.findById(vendorId)
        .select("businessName contactName phone subdomain pricingSource menuSourceType status")
        .lean();

      if (!vendor) {
        return res.status(404).json({ message: "Source vendor not found" });
      }

      const nodes = await VendorMenuNode.find({
        vendorId,
        datasetStatus: "active",
      })
        .sort({ level: 1, sequence: 1, createdAt: 1 })
        .lean();

      const tree = buildVendorMenuTree(nodes);
      const topLevelNames = tree.map((node) => node.name).filter(Boolean);
      const leafCount = nodes.filter((node) => node.isLeaf).length;

      return res.json({
        success: true,
        system,
        sourceType,
        vendor: {
          id: String(vendor._id),
          businessName: vendor.businessName || "",
          contactName: vendor.contactName || "",
          phone: vendor.phone || "",
          subdomain: vendor.subdomain || "",
          pricingSource: vendor.pricingSource || "standard",
          menuSourceType: vendor.menuSourceType || "admin_tree",
          status: vendor.status || "",
        },
        summary: {
          totalNodes: nodes.length,
          leafCount,
          topLevelCount: tree.length,
          topLevelNames,
          canCopy: nodes.length > 0,
        },
        tree,
      });
    }

    const category = await DummyCategory.findById(categoryId)
      .select("name imageUrl categoryType pricingStatus")
      .lean();

    if (!category) {
      return res.status(404).json({ message: "Source category not found" });
    }

    const subcategories = await DummySubcategory.find({ category: categoryId })
      .sort({ sequence: 1, createdAt: 1 })
      .lean();
    const { tree: rawTree, flat } = buildTree(subcategories, { filterMode: "admin" });
    const tree = normalizeCategoryTreeNodes(rawTree);
    const topLevelNames = tree.map((node) => node.name).filter(Boolean);
    const leafCount = flat.filter((node) => node.isLeaf).length;

    return res.json({
      success: true,
      system,
      sourceType,
      category: {
        id: String(category._id),
        name: category.name || "",
        imageUrl: category.imageUrl || "",
        categoryType: category.categoryType || "Services",
        pricingStatus: category.pricingStatus || "Inactive",
      },
      summary: {
        totalNodes: flat.length,
        leafCount,
        topLevelCount: tree.length,
        topLevelNames,
        canCopy: tree.length > 0,
      },
      tree,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.message || "Failed to preview vendor menu for copy",
    });
  }
});

router.post("/vendor-menu-copy/execute", requireAdminAuth, async (req, res) => {
  try {
    const sourceSystem = ensureLocalSystem(req.body?.sourceSystem);
    const targetSystem = ensureLocalSystem(req.body?.targetSystem || "localhost");
    const sourceType = normalizeSourceType(req.body?.sourceType);
    const sourceVendorId = String(req.body?.sourceVendorId || "").trim();
    const sourceCategoryId = String(req.body?.sourceCategoryId || "").trim();
    const targetVendorId = String(req.body?.targetVendorId || "").trim();
    const mode = String(req.body?.mode || "replace_archive").trim();
    const destinationNodeId = String(req.body?.destinationNodeId || "").trim();
    const selectedNodeIds = Array.isArray(req.body?.selectedNodeIds)
      ? req.body.selectedNodeIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];

    if (!targetVendorId) {
      return res.status(400).json({ message: "targetVendorId is required" });
    }

    if (sourceType === "vendor" && !sourceVendorId) {
      return res.status(400).json({ message: "sourceVendorId is required" });
    }

    if (sourceType === "category" && !sourceCategoryId) {
      return res.status(400).json({ message: "sourceCategoryId is required" });
    }

    if (sourceType === "vendor" && sourceVendorId === targetVendorId && sourceSystem === targetSystem) {
      return res.status(400).json({ message: "Source and target vendors must be different" });
    }

    if (!selectedNodeIds.length) {
      return res.status(400).json({ message: "Select at least one menu node to copy" });
    }

    if (!["replace_archive", "append_keep"].includes(mode)) {
      return res.status(400).json({ message: "Unsupported copy mode" });
    }

    if (destinationNodeId && mode !== "append_keep") {
      return res.status(400).json({
        message: "Destination node can only be used when adding to the existing target menu",
      });
    }

    let sourceLabel = "";
    let sourceTree = [];
    let effectiveSelectedIds = [];

    const targetVendor = await DummyVendor.findById(targetVendorId);
    if (!targetVendor) {
      return res.status(404).json({ message: "Target vendor not found" });
    }

    let destinationNode = null;
    if (destinationNodeId) {
      if (!mongoose.Types.ObjectId.isValid(destinationNodeId)) {
        return res.status(400).json({ message: "Invalid destinationNodeId" });
      }

      destinationNode = await VendorMenuNode.findOne({
        _id: destinationNodeId,
        vendorId: targetVendorId,
        datasetStatus: "active",
      }).lean();

      if (!destinationNode) {
        return res.status(404).json({ message: "Destination node not found on target vendor" });
      }

      if (destinationNode.isLeaf) {
        return res.status(400).json({
          message: "Destination node must be a group or subcategory, not a service item",
        });
      }
    }

    if (sourceType === "vendor") {
      const sourceVendor = await DummyVendor.findById(sourceVendorId);
      if (!sourceVendor) {
        return res.status(404).json({ message: "Source vendor not found" });
      }

      const sourceNodes = await VendorMenuNode.find({
        vendorId: sourceVendorId,
        datasetStatus: "active",
      })
        .sort({ level: 1, sequence: 1, createdAt: 1 })
        .lean();

      if (!sourceNodes.length) {
        return res.status(400).json({ message: "Source vendor has no active My Menu to copy" });
      }

      sourceTree = buildVendorMenuTree(sourceNodes);
      sourceLabel = sourceVendor.businessName || sourceVendor.contactName || "Source vendor";
    } else {
      const sourceCategory = await DummyCategory.findById(sourceCategoryId).select("name").lean();
      if (!sourceCategory) {
        return res.status(404).json({ message: "Source category not found" });
      }

      const categoryNodes = await DummySubcategory.find({ category: sourceCategoryId })
        .sort({ sequence: 1, createdAt: 1 })
        .lean();
      const { tree: rawTree } = buildTree(categoryNodes, { filterMode: "admin" });
      sourceTree = normalizeCategoryTreeNodes(rawTree);
      sourceLabel = sourceCategory.name || "Source category";

      if (!sourceTree.length) {
        return res.status(400).json({ message: "Source category has no hierarchy to copy" });
      }
    }

    const allSourceIds = new Set(collectTreeIds(sourceTree));
    effectiveSelectedIds = selectedNodeIds.filter((id) => allSourceIds.has(id));

    if (!effectiveSelectedIds.length) {
      return res.status(400).json({ message: "Selected menu nodes are not valid for this source" });
    }

    const selectedIdSet = new Set(effectiveSelectedIds);
    const filteredTree =
      mode === "append_keep" && destinationNode
        ? buildInsertionTreeForDestination(sourceTree, selectedIdSet)
        : filterTreeBySelection(sourceTree, selectedIdSet);
    if (!filteredTree.length) {
      return res.status(400).json({ message: "No selectable menu hierarchy found for copy" });
    }

    if (mode === "replace_archive") {
      await VendorMenuNode.updateMany(
        {
          vendorId: targetVendorId,
          datasetStatus: "active",
        },
        {
          $set: {
            datasetStatus: "archived",
          },
        }
      );
    }

    const uploadBatchId = new mongoose.Types.ObjectId().toString();
    let topLevelStartSequence = 1;

    if (mode === "append_keep") {
      const lastTopLevelNode = await VendorMenuNode.findOne({
        vendorId: targetVendorId,
        datasetStatus: "active",
        parentNodeId: destinationNode ? destinationNode._id : null,
      })
        .sort({ sequence: -1, createdAt: -1 })
        .lean();

      topLevelStartSequence = Number(lastTopLevelNode?.sequence || 0) + 1;
    }

    await createVendorMenuTreeForTarget({
      vendorId: targetVendorId,
      nodes: filteredTree,
      parentNodeId: destinationNode ? destinationNode._id : null,
      parentPathNames: Array.isArray(destinationNode?.pathNames) ? destinationNode.pathNames : [],
      parentLevel: Number(destinationNode?.level || 0),
      uploadBatchId,
      datasetStatus: "active",
      startSequence: topLevelStartSequence,
    });

    targetVendor.pricingSource = "self_managed";
    targetVendor.menuSourceType = "manual_upload";
    targetVendor.pricingSourceUpdatedAt = new Date();
    await targetVendor.save();

    const copiedTopLevelNames = filteredTree.map((node) => node.name).filter(Boolean);

    return res.json({
      success: true,
      sourceType,
      sourceSystem,
      targetSystem,
      uploadBatchId,
      copiedNodeCount: effectiveSelectedIds.length,
      copiedTopLevelNames,
      sourceLabel,
      destinationNode: destinationNode
        ? {
            id: String(destinationNode._id),
            name: destinationNode.name || "",
            pathNames: Array.isArray(destinationNode.pathNames) ? destinationNode.pathNames : [],
          }
        : null,
      targetVendor: {
        id: String(targetVendor._id),
        businessName: targetVendor.businessName || "",
      },
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.message || "Failed to copy vendor My Menu",
    });
  }
});

router.get("/plans", requireAdminAuth, getPlans);
router.post("/plans", requireAdminAuth, createPlan);
router.put("/plans/:id", requireAdminAuth, updatePlan);
router.delete("/plans/:id", requireAdminAuth, deletePlan);

router.post("/vendor-subscriptions", requireAdminAuth, assignVendorPlan);
router.get("/vendor-subscriptions/:vendorId", requireAdminAuth, getVendorSubscription);
router.put("/vendor-subscriptions/:vendorId", requireAdminAuth, updateVendorSubscription);

router.get("/trust-questionnaires", listTrustQuestionnaireConfigs);
router.post("/trust-questionnaires", createTrustQuestionnaireConfig);
router.put("/trust-questionnaires/:id", updateTrustQuestionnaireConfig);
router.delete("/trust-questionnaires/:id", deleteTrustQuestionnaireConfig);

module.exports = router;
