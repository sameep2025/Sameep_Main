const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");

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
   HELPER 1: Fetch category hierarchy from master (dummy)
========================================================= */
async function fetchCategoryTree(categoryId) {
  const response = await axios.get(
    `http://localhost:5000/api/dummy-categories?parentId=${categoryId}`
  );

  const children = response.data || [];
  const result = [];

  for (const child of children) {
    const node = {
      categoryId: child._id,
      name: child.name,
      price: child.price,
      terms: child.terms,
      children: [],
    };

    const subChildren = await fetchCategoryTree(child._id);
    if (subChildren.length > 0) {
      node.children = subChildren;
    }

    result.push(node);
  }

  return result;
}

/* =========================================================
   HELPER 2: Flatten hierarchy
========================================================= */
function flattenCategoryTree(
  nodes,
  parentCategoryId = null,
  level = 0,
  result = []
) {
  for (const node of nodes) {
    const isLeaf = !node.children || node.children.length === 0;

    result.push({
      categoryId: node.categoryId,
      name: node.name,
      parentCategoryId,
      level,
      isLeaf,
      price: node.price || null,
      terms: node.terms || "",
    });

    if (!isLeaf) {
      flattenCategoryTree(
        node.children,
        node.categoryId,
        level + 1,
        result
      );
    }
  }

  return result;
}

/* =========================================================
   HELPER 3: Pricing status logic
========================================================= */
function getPricingStatus(node, activeLeafCategoryIds = []) {
  if (!node.isLeaf) return "Inactive";
  return activeLeafCategoryIds.includes(String(node.categoryId))
    ? "Active"
    : "Inactive";
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

    // 1️⃣ Fetch & flatten master hierarchy
    const tree = await fetchCategoryTree(rootCategoryId);
    const flatNodes = flattenCategoryTree(tree);

    // 2️⃣ Map to store created nodes
    const nodeMap = {};
    let created = 0;

    // 3️⃣ Create or update nodes
    for (const node of flatNodes) {
      let record = await VendorPriceNode.findOne({
        vendorId,
        rootCategoryId,
        categoryId: node.categoryId,
      });

      if (!record) {
        record = await VendorPriceNode.create({
          vendorId,
          rootCategoryId,
          categoryId: node.categoryId,
          parentCategoryId: node.parentCategoryId,
          name: node.name,
          parentVendorPriceNodeId: null, // set later
          level: node.level,
          isLeaf: node.isLeaf,
          price: node.isLeaf ? node.price : null,
          terms: node.terms,
          pricingStatus: getPricingStatus(node, activeLeafCategoryIds),
          source: "MASTER_SYNC",
        });
        created++;
      }

      nodeMap[node.categoryId] = record;
    }

    // 4️⃣ Auto-link parentVendorPriceNodeId
    for (const node of flatNodes) {
      if (!node.parentCategoryId) continue;

      const child = nodeMap[node.categoryId];
      const parent = nodeMap[node.parentCategoryId];

      if (
        child &&
        parent &&
        !child.parentVendorPriceNodeId
      ) {
        child.parentVendorPriceNodeId = parent._id;
        await child.save();
      }
    }

    return res.json({
      message: "Vendor pricing synced with auto-linked hierarchy",
      totalNodes: flatNodes.length,
      created,
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
   STEP 9: READ HIERARCHY (REPORT VIEW)
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

    const map = {};
    nodes.forEach((n) => {
      map[n._id] = { ...n, children: [] };
    });

    const tree = [];
    nodes.forEach((n) => {
      if (n.parentVendorPriceNodeId) {
        map[n.parentVendorPriceNodeId]?.children.push(map[n._id]);
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

// --------------------------------------
// STEP 9.4: TABLE / REPORT VIEW API
// --------------------------------------
router.get("/table-view", async (req, res) => {
  try {
    const { vendorId, rootCategoryId } = req.query;

    if (!vendorId || !rootCategoryId) {
      return res.status(400).json({
        message: "vendorId and rootCategoryId are required",
      });
    }

    // 1️⃣ Fetch all nodes for this vendor + category
    const nodes = await VendorPriceNode.find({
      vendorId,
      rootCategoryId,
    }).lean();

    if (!nodes.length) {
      return res.json({
        message: "No data found",
        rows: [],
      });
    }

    // 2️⃣ Build lookup map (id -> node)
    const nodeMap = {};
    nodes.forEach((n) => {
      nodeMap[n._id.toString()] = n;
    });

    // 3️⃣ Helper to build hierarchy path
    function buildPath(node) {
      const path = [];
      let current = node;

      while (current) {
        path.unshift(current.name);
        if (!current.parentVendorPriceNodeId) break;
        current = nodeMap[current.parentVendorPriceNodeId.toString()];
      }

      return path;
    }

    // 4️⃣ Build table rows (ONLY LEAF NODES)
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


module.exports = router;
