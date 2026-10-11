const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const { validateVendorWriteRequest } = require("../utils/vendorWriteAuth");
const {
  applyOfferDateFields,
  isOfferCurrentlyValid,
  offerDateToYmd,
  validateOfferDateRange,
} = require("../utils/offerValidity");

const router = express.Router();

// Model (already loaded in server.js)
const VendorPriceNode = mongoose.model("VendorPriceNode");

/* =========================================================
   TEST ROUTE
========================================================= */
router.get("/_test", (req, res) => {
  res.json({ ok: true, message: "vendor-price-nodes router working" });
});

/* =========================================================
   🔥 HELPER: Build dynamic backend base URL (LOCAL + AWS SAFE)
========================================================= */
function getBackendBaseUrl(req) {
  const protocol =
    req.headers["x-forwarded-proto"] || req.protocol || "http";

  const host = req.headers["x-forwarded-host"] || req.get("host");

  return `${protocol}://${host}`;
}

/* =========================================================
   HELPER: Flatten optimized tree
========================================================= */
function flattenTree(nodes, parentCategoryId = null, level = 1, result = []) {
  for (const node of nodes) {
    const children = node.children || [];

    const computedIsLeaf =
      typeof node.isLeaf === "boolean"
        ? node.isLeaf
        : children.length === 0;

    const computedLevel =
      typeof node.level === "number"
        ? node.level
        : level;

    result.push({
      categoryId: node.id,
      parentCategoryId,
      name: node.name,
      level: computedLevel,
      isLeaf: computedIsLeaf,
      price: node.price ?? null,
      terms: node.terms || "",
      offerText: node.offerText || "",
      enableFreeText: node.enableFreeText || false,
      freeText: node.freeText || "",
      visibleToUser: node.visibleToUser ?? true,
      visibleToVendor: node.visibleToVendor ?? true,
    });

    if (children.length) {
      flattenTree(children, node.id, computedLevel + 1, result);
    }
  }
  return result;
}

/* =========================================================
   HELPER 3: Pricing status logic
========================================================= */
function getPricingStatus(node, activeLeafCategoryIds = []) {
  if (!node.isLeaf) return "Inactive";

  return activeLeafCategoryIds.includes(
    String(node.categoryId)
  )
    ? "Active"
    : "Inactive";
}

function isOffersLabel(value) {
  return String(value || "").trim().toLowerCase() === "offers";
}

function isOfferNode(node, nodesById = {}) {
  if (isOffersLabel(node?.name)) return true;
  if (String(node?.offerText || "").trim() && isOffersLabel(node?.name)) return true;

  let current = node;
  const seen = new Set();
  while (current?.parentVendorPriceNodeId && !seen.has(String(current._id))) {
    seen.add(String(current._id));
    current = nodesById[String(current.parentVendorPriceNodeId)];
    if (isOffersLabel(current?.name)) return true;
  }

  return false;
}

function filterPublicOfferNodes(nodes = []) {
  const nodesById = {};
  nodes.forEach((node) => {
    nodesById[String(node._id)] = node;
  });
  return nodes.filter((node) => !isOfferNode(node, nodesById) || isOfferCurrentlyValid(node));
}

/* =========================================================
   STEP 4: SYNC + AUTO LINK HIERARCHY
========================================================= */
router.post("/sync", async (req, res) => {
  try {
    const { vendorId, rootCategoryId, activeLeafCategoryIds = [] } = req.body;

    if (!vendorId || !rootCategoryId) {
      return res.status(400).json({
        message: "vendorId and rootCategoryId are required",
      });
    }

    const baseUrl = getBackendBaseUrl(req);

    console.time("vendor-sync-total");

    console.time("tree-fetch");
    const { data } = await axios.get(
      `${baseUrl}/api/categories/tree?rootCategoryId=${rootCategoryId}`
    );
    console.timeEnd("tree-fetch");

    // Normalize different API response shapes
    let treePayload;

    if (Array.isArray(data?.tree)) {
      // Format: { tree: [...] }
      treePayload = data.tree;
    } else if (Array.isArray(data)) {
      // Format: [...]
      treePayload = data;
    } else if (data?.children) {
      // Format: root object
      treePayload = [data];
    } else {
      console.error("Unexpected tree API response:", data);
      treePayload = [];
    }

    const flatNodes = flattenTree(treePayload);

    // Safety guard to avoid silent failures
    if (!flatNodes.length) {
      console.error("SYNC ABORTED: No nodes flattened from tree API");
      return res.status(500).json({
        message: "Tree parsing failed — no nodes found",
      });
    }

    console.log("Flattened nodes:", flatNodes.length);

    console.time("existing-load");
    const existingNodes = await VendorPriceNode.find({
      vendorId,
      rootCategoryId,
    }).lean();
    console.timeEnd("existing-load");

    const existingMap = {};
    existingNodes.forEach((n) => {
      existingMap[n.categoryId] = n;
    });

    console.time("bulk-build");
    const ops = [];

    for (const node of flatNodes) {
      // 🚨 Skip root category (prevents duplicate Level 2)
      if (String(node.categoryId) === String(rootCategoryId)) {
        continue;
      }

      const baseDoc = {
        vendorId,
        rootCategoryId,
        categoryId: node.categoryId,
        parentCategoryId: node.parentCategoryId,
        name: node.name,
        level: node.level,
        isLeaf: node.isLeaf,
        price: node.isLeaf ? node.price : null,
        terms: node.terms,
        offerText: node.offerText,
        enableFreeText: node.enableFreeText,
        freeText: node.freeText,
        visibleToUser: node.visibleToUser,
        visibleToVendor: node.visibleToVendor,
        pricingStatus:
          node.isLeaf && activeLeafCategoryIds.includes(node.categoryId)
            ? "Active"
            : "Inactive",
        source: "MASTER_SYNC",
      };

      const existing = existingMap[node.categoryId];

      if (!existing) {
        ops.push({ insertOne: { document: baseDoc } });
      } else {
        ops.push({
          updateOne: {
            filter: { _id: existing._id },
            update: { $set: baseDoc },
          },
        });
      }
    }
    console.timeEnd("bulk-build");

    console.time("bulk-write");
    if (ops.length) {
      await VendorPriceNode.bulkWrite(ops);
    }
    console.timeEnd("bulk-write");

    // 🔥 Rebuild hierarchy links (FAST VERSION)
    console.time("hierarchy-link");

    // Fetch all nodes once
    const allNodes = await VendorPriceNode.find({
      vendorId,
      rootCategoryId,
    }).select("_id categoryId parentCategoryId").lean();

    // Build lookup maps
    const idMap = {};
    allNodes.forEach((n) => {
      idMap[n.categoryId] = n;
    });

    // Prepare bulk updates
    const linkOps = [];

    for (const node of allNodes) {
      // Skip root nodes (no parent OR parent is self/root)
      if (!node.parentCategoryId) continue;

      // 🚨 Prevent root duplication
      if (String(node.categoryId) === String(rootCategoryId)) {
        continue;
      }

      const parent = idMap[node.parentCategoryId];
      if (!parent) continue;

      if (String(parent._id) === String(node._id)) {
        continue;
      }

      linkOps.push({
        updateOne: {
          filter: { _id: node._id },
          update: {
            $set: { parentVendorPriceNodeId: parent._id },
          },
        },
      });
    }

    // Execute in bulk
    if (linkOps.length) {
      await VendorPriceNode.bulkWrite(linkOps);
    }

    console.timeEnd("hierarchy-link");

    console.timeEnd("vendor-sync-total");

    return res.json({
      message: "Vendor pricing synced successfully",
      totalNodes: flatNodes.length,
      existingNodes: existingNodes.length,
      operations: ops.length,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      message: "Internal Server Error",
      error: err.message,
    });
  }
});

/* =========================================================
   ADD MISSING LEAF NODES
========================================================= */
router.post("/add-missing-leaves", async (req, res) => {
  try {
    const { vendorId, rootCategoryId, leafCategoryIds } = req.body;

    if (!vendorId) {
      return res.status(400).json({ message: "vendorId is required" });
    }
    if (!rootCategoryId) {
      return res.status(400).json({ message: "rootCategoryId is required" });
    }
    if (!Array.isArray(leafCategoryIds)) {
      return res.status(400).json({ message: "leafCategoryIds must be an array" });
    }

    const authResult = await validateVendorWriteRequest(req, vendorId);
    if (!authResult.ok) {
      return res.status(authResult.status || 403).json({
        message: authResult.message || "Vendor write access denied",
        code: authResult.code || "forbidden",
      });
    }

    const baseUrl = getBackendBaseUrl(req);

    const { data } = await axios.get(
      `${baseUrl}/api/categories/tree?rootCategoryId=${rootCategoryId}`
    );

    let treePayload;

    if (Array.isArray(data?.tree)) {
      treePayload = data.tree;
    } else if (Array.isArray(data)) {
      treePayload = data;
    } else if (data?.children) {
      treePayload = [data];
    } else {
      console.error("Unexpected tree API response:", data);
      treePayload = [];
    }

    const flatNodes = flattenTree(treePayload);

    if (!flatNodes.length) {
      return res.status(500).json({
        message: "Tree parsing failed — no nodes found",
      });
    }

    const masterMap = {};
    flatNodes.forEach((n) => {
      masterMap[String(n.categoryId)] = n;
    });

    const existingNodes = await VendorPriceNode.find({
      vendorId,
      rootCategoryId,
    }).select("categoryId").lean();

    const existingSet = new Set(
      existingNodes.map((n) => String(n.categoryId))
    );

    const leafSet = new Set(leafCategoryIds.map((id) => String(id)));

    const requiredNodeIds = new Set();

    for (const leafId of leafSet) {
      let current = masterMap[String(leafId)];

      while (current) {
        requiredNodeIds.add(String(current.categoryId));

        if (!current.parentCategoryId) break;

        if (String(current.parentCategoryId) === String(rootCategoryId)) {
          break;
        }

        current = masterMap[String(current.parentCategoryId)];
      }
    }

    const nodesToInsert = [...requiredNodeIds].filter(
      (id) => !existingSet.has(id)
    );

    const ops = [];
    const insertedCategoryIds = [];

    for (const categoryId of nodesToInsert) {
      const node = masterMap[String(categoryId)];
      if (!node) continue;

      if (String(node.categoryId) === String(rootCategoryId)) continue;

      ops.push({
        insertOne: {
          document: {
            vendorId,
            rootCategoryId,
            categoryId: node.categoryId,
            parentCategoryId: node.parentCategoryId,
            name: node.name,
            level: node.level,
            isLeaf: node.isLeaf,
            price: node.isLeaf ? node.price : null,
            terms: node.terms,
            offerText: node.offerText,
            enableFreeText: node.enableFreeText,
            freeText: node.freeText,
            visibleToUser: node.visibleToUser,
            visibleToVendor: node.visibleToVendor,
            pricingStatus: "Inactive",
            source: "MASTER_SYNC",
          },
        },
      });

      insertedCategoryIds.push(String(node.categoryId));
    }

    if (ops.length) {
      await VendorPriceNode.bulkWrite(ops);
    }

    if (insertedCategoryIds.length) {
      const allNodes = await VendorPriceNode.find({
        vendorId,
        rootCategoryId,
      }).select("_id categoryId parentCategoryId").lean();

      const idMap = {};
      allNodes.forEach((n) => {
        idMap[String(n.categoryId)] = n;
      });

      const linkOps = [];

      for (const categoryId of insertedCategoryIds) {
        const node = idMap[String(categoryId)];
        if (!node || !node.parentCategoryId) continue;

        const parent = idMap[String(node.parentCategoryId)];
        if (!parent) continue;

        if (String(parent._id) === String(node._id)) {
          continue;
        }

        linkOps.push({
          updateOne: {
            filter: { _id: node._id },
            update: {
              $set: { parentVendorPriceNodeId: parent._id },
            },
          },
        });
      }

      if (linkOps.length) {
        await VendorPriceNode.bulkWrite(linkOps);
      }
    }

    return res.json({
      message: "Missing leaves added successfully",
      insertedCount: ops.length,
    });
  } catch (err) {
    console.error("ADD MISSING LEAVES ERROR:", err);
    return res.status(500).json({
      message: "Internal Server Error",
      error: err.message,
    });
  }
});

/* =========================================================
   STEP 9: READ HIERARCHY (TREE VIEW)
========================================================= */
router.get("/tree", async (req, res) => {
  try {
    const { vendorId, rootCategoryId } = req.query;

    if (!vendorId || !rootCategoryId) {
      return res.status(400).json({
        message: "vendorId and rootCategoryId are required",
      });
    }

    const nodes = await VendorPriceNode.find({
      vendorId,
      rootCategoryId,
    }).lean();
    const publicMode = req.query.mode === "user" || req.query.public === "true";
    const visibleNodes = publicMode ? filterPublicOfferNodes(nodes) : nodes;

    const map = {};
    visibleNodes.forEach((n) => {
      map[n._id] = {
        ...n,
        offerStartDate: offerDateToYmd(n.offerStartDate),
        offerEndDate: offerDateToYmd(n.offerEndDate),
        children: [],
      };
    });

    const tree = [];

    visibleNodes.forEach((n) => {
      if (n.parentVendorPriceNodeId) {
        map[n.parentVendorPriceNodeId]?.children.push(
          map[n._id]
        );
      } else {
        tree.push(map[n._id]);
      }
    });

    return res.json({
      message: "Vendor pricing hierarchy",
      vendorId,
      rootCategoryId,
      tree,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      message: "Internal Server Error",
      error: err.message,
    });
  }
});

/* =========================================================
   STEP 9.4: TABLE VIEW
========================================================= */
router.get("/table-view", async (req, res) => {
  try {
    const { vendorId, rootCategoryId } = req.query;

    if (!vendorId || !rootCategoryId) {
      return res.status(400).json({
        message: "vendorId and rootCategoryId are required",
      });
    }

    const nodes = await VendorPriceNode.find({
      vendorId,
      rootCategoryId,
    }).lean();

    if (!nodes.length) {
      return res.json({ message: "No data found", rows: [] });
    }

    const nodeMap = {};
    nodes.forEach((n) => {
      nodeMap[n._id.toString()] = n;
    });

    function buildPath(node) {
      const path = [];
      let current = node;

      while (current) {
        path.unshift(current.name);

        if (!current.parentVendorPriceNodeId) break;

        current =
          nodeMap[
            current.parentVendorPriceNodeId.toString()
          ];
      }

      return path;
    }

    const rows = nodes
      .filter((n) => n.isLeaf)
      .map((leaf) => {
        const path = buildPath(leaf);

        return {
          category: path[0] || "",
          level2: path[1] || "",
          level3: path[2] || "",
          level4: path[3] || "",
          price: leaf.price,
          terms: leaf.terms,
          pricingStatus: leaf.pricingStatus,
          vendorPriceNodeId: leaf._id,
        };
      });

    return res.json({
      message: "Vendor pricing table view",
      vendorId,
      rootCategoryId,
      totalRows: rows.length,
      rows,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      message: "Internal Server Error",
      error: err.message,
    });
  }
});

/* =========================================================
   STEP 10: UPDATE SINGLE LEAF
========================================================= */
router.put("/update", async (req, res) => {
  try {
    const {
      vendorPriceNodeId,
      price,
      terms,
      offerText,
      offerStartDate,
      offerEndDate,
      imageUrl,
      pricingStatus,
      visibleToUser,
      visibleToVendor,
    } = req.body;

    if (!vendorPriceNodeId) {
      return res
        .status(400)
        .json({ message: "vendorPriceNodeId is required" });
    }

    const record =
      await VendorPriceNode.findById(vendorPriceNodeId);

    if (!record) {
      return res
        .status(404)
        .json({ message: "VendorPriceNode not found" });
    }

    if (!record.isLeaf) {
      return res
        .status(400)
        .json({ message: "Only leaf nodes can be updated" });
    }

    const authResult = await validateVendorWriteRequest(req, record.vendorId);
    if (!authResult.ok) {
      return res.status(authResult.status || 403).json({
        message: authResult.message || "Vendor write access denied",
        code: authResult.code || "forbidden",
      });
    }

    if (price !== undefined) record.price = price;
    if (terms !== undefined) record.terms = terms;
    if (offerText !== undefined) record.offerText = offerText;
    applyOfferDateFields(record, { offerStartDate, offerEndDate });
    validateOfferDateRange(record.offerStartDate, record.offerEndDate);
    if (imageUrl !== undefined) record.imageUrl = typeof imageUrl === "string" ? imageUrl.trim() : imageUrl;
    if (pricingStatus !== undefined)
      record.pricingStatus = pricingStatus;
    if (visibleToUser !== undefined)
      record.visibleToUser = visibleToUser;
    if (visibleToVendor !== undefined)
      record.visibleToVendor = visibleToVendor;

    await record.save();

    return res.json({
      message: "Vendor price node updated successfully",
      vendorPriceNodeId: record._id,
    });
  } catch (err) {
    console.error("UPDATE vendor price node error:", err);
    return res.status(500).json({
      message: "Internal Server Error",
      error: err.message,
    });
  }
});

module.exports = router;
