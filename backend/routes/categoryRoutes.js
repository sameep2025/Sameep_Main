const express = require("express");
const multer = require("multer");
const Category = require("../models/Category");
const router = express.Router();

const upload = multer({ dest: "uploads/" });
const uploadFields = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "icon", maxCount: 1 },
]);


// Helper: log duration
function logApi(req, res, label) {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(`[API] ${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms ${label || ""}`);
  });
}

// Recursively update enableFreeText for all children
const updateFreeTextRecursive = async (categoryId, enabled) => {
  const children = await Category.find({ parent: categoryId });
  for (const child of children) {
    child.enableFreeText = enabled;
    await child.save();
    await updateFreeTextRecursive(child._id, enabled);
  }
};


/* ---------------- CREATE CATEGORY ---------------- */
router.post("/", upload.single("image"), async (req, res) => {
  logApi(req, res, "create-category");
  try {
    const { name, parentId, price, terms, visibleToUser, visibleToVendor, freeText, seoKeywords, categoryType, addToCart } = req.body;

    if (!name || !name.trim()) return res.status(400).json({ message: "Name is required" });

    const parent = parentId && parentId !== "" ? parentId : null;

    // Check duplicate
    const exists = await Category.findOne({ name, parent });
    if (exists) return res.status(400).json({ message: "Category already exists under this parent" });

    const parsedSequence = Number(req.body.sequence) || 0;
    const parsedPrice = price ? Number(price) : null;

    const categoryData = {
      name,
      parent,
      sequence: parsedSequence,
      price: parent ? parsedPrice : undefined,
      terms: terms || "",

      enableFreeText: req.body.enableFreeText !== undefined ? (req.body.enableFreeText === "true" || req.body.enableFreeText === true) : false,

      visibleToUser: visibleToUser === "true" || visibleToUser === true,
      visibleToVendor: visibleToVendor === "true" || visibleToVendor === true,
      categoryType: categoryType || "Products",
      availableForCart: req.body.availableForCart === "true" || req.body.availableForCart === "on" || req.body.availableForCart === true,


      freeText: parent ? freeText || "" : undefined,
      seoKeywords: parent ? undefined : seoKeywords || "",
      postRequestsDeals: !parent ? req.body.postRequestsDeals === "true" : undefined,
      loyaltyPoints: !parent ? req.body.loyaltyPoints === "true" : undefined,
      linkAttributesPricing: !parent ? req.body.linkAttributesPricing === "true" : undefined,
      freeTexts: !parent ? Array.from({ length: 10 }, (_, i) => req.body[`freeText${i}`] || "") : undefined,
  // inventory label and linked attributes - accept for any category
  inventoryLabelName: req.body.inventoryLabelName !== undefined ? req.body.inventoryLabelName : ( !parent ? (req.body.inventoryLabelName || "") : undefined ),
      imageUrl: req.file ? `/uploads/${req.file.filename}` : undefined,
    };

    // Attach dropdown fields if provided (parse as arrays)
    [
      "categoryVisibility",
      "categoryModel",
      "categoryPricing",
      "socialHandle",
      "displayType",
    ].forEach((key) => {
      if (req.body[key] !== undefined) {
        try {
          const parsed = JSON.parse(req.body[key]);
          categoryData[key] = Array.isArray(parsed)
            ? parsed
            : parsed != null
            ? [String(parsed)]
            : [];
        } catch (e) {
          categoryData[key] = req.body[key]
            ? [String(req.body[key])]
            : [];
        }

    // Handle uiRules JSON (per-node UI flags)
    if (req.body.uiRules !== undefined) {
      try {
        const parsed = JSON.parse(req.body.uiRules);
        if (parsed && typeof parsed === 'object') {
          categoryData.uiRules = parsed;
        }
      } catch (e) {
        // ignore invalid payload
      }
    }
      }
    });

    // Handle linkedAttributes JSON
    if (req.body.linkedAttributes) {
      try {
        const parsed = JSON.parse(req.body.linkedAttributes);
        if (parsed && typeof parsed === 'object') {
          categoryData.linkedAttributes = parsed;
        }
      } catch (e) {
        console.warn("Invalid linkedAttributes JSON:", e.message);
      }
    }


    // Handle color schemes (JSON array)
    if (req.body.colorSchemes) {
      try {
        categoryData.colorSchemes = JSON.parse(req.body.colorSchemes);
      } catch (e) {
        console.warn("Invalid colorSchemes JSON:", e.message);
        categoryData.colorSchemes = [];
      }
    }

    // Handle signupLevels (JSON array)
    if (req.body.signupLevels) {
      try {
        const parsed = JSON.parse(req.body.signupLevels);
        if (Array.isArray(parsed)) {
          categoryData.signupLevels = parsed
            .filter((it) => it && it.levelName)
            .map((it) => ({
              levelName: String(it.levelName),
              sequence: Number(it.sequence ?? 0),
              businessField: Array.isArray(it.businessField)
                ? it.businessField.map(String)
                : (it.businessField ? [String(it.businessField)] : []),
            }));
        }
      } catch (e) {
        console.warn("Invalid signupLevels JSON:", e.message);
      }
    }

    const category = new Category(categoryData);
    const saved = await category.save();
    if (parent === null && categoryData.enableFreeText) {
      await updateFreeTextRecursive(saved._id, true);
    }

    res.json(saved);
  } catch (err) {
    console.error(" POST /api/categories error:", err.message);
    res.status(500).json({ message: err.message || "Server error" });
  }
});

/* ---------------- GET CATEGORIES ---------------- */
router.get("/", async (req, res) => {
  logApi(req, res, "list-categories");
  try {
    let { parentId } = req.query;
    parentId = parentId === "null" ? null : parentId;
    const categories = await Category.find({ parent: parentId }).sort({ sequence: 1, createdAt: -1 });
    res.json(categories);
  } catch (err) {
    res.status(500).json({ message: err.message || "Server error" });
  }
});

/* ---------------- GET CATEGORY SUBTREE ---------------- */
router.get("/:id/tree", async (req, res) => {
  logApi(req, res, "get-category-tree");
  try {
    const { id } = req.params;
    const all = await Category.find({}, { name: 1, parent: 1, price: 1, terms: 1, sequence: 1 }).sort({ sequence: 1, createdAt: -1 }).lean();
    const map = new Map();
    all.forEach((c) => map.set(String(c._id), { ...c, children: [] }));
    all.forEach((c) => {
      if (c.parent) {
        const p = map.get(String(c.parent));
        if (p) p.children.push(map.get(String(c._id)));
      }
    });
    const root = map.get(String(id));
    if (!root) return res.status(404).json({ message: "Category not found" });
    res.json(root);
  } catch (err) {
    console.error("GET /:id/tree error:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
});

/* ---------------- GET LEAF CATEGORIES UNDER NODE ---------------- */
router.get("/:id/leaf", async (req, res) => {
  logApi(req, res, "list-leaf-categories");
  try {
    const { id } = req.params;
    const all = await Category.find({}, { name: 1, parent: 1, price: 1, terms: 1 }).lean();
    const byParent = new Map();
    for (const c of all) {
      const key = c.parent ? String(c.parent) : "root";
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key).push(c);
    }
    const idStr = String(id);
    const leaves = [];
    const stack = (byParent.get(idStr) || []).map((c) => c);
    while (stack.length) {
      const node = stack.pop();
      const children = byParent.get(String(node._id)) || [];
      if (children.length === 0) {
        const parentId = node.parent ? String(node.parent) : null;
        const parent = parentId ? all.find((c) => String(c._id) === parentId) : null;
        leaves.push({
          _id: node._id,
          name: node.name,
          price: node.price ?? null,
          terms: node.terms || "",
          parentId: parent ? parent._id : null,
          parentName: parent ? parent.name : null,
        });
      } else {
        children.forEach((ch) => stack.push(ch));
      }
    }
    res.json(leaves);
  } catch (err) {
    console.error("GET /:id/leaf error:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
});

/* ---------------- UPDATE CATEGORY ---------------- */
router.put("/:id", upload.single("image"), async (req, res) => {
  logApi(req, res, "update-category");
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ message: "Category not found" });

    const { name, price, terms, visibleToUser, visibleToVendor, freeText, seoKeywords, categoryType, addToCart, sequence, enableFreeText } = req.body;

    if (name !== undefined) category.name = name;
    category.terms = terms !== undefined ? terms : category.terms;
    category.visibleToUser = visibleToUser === "true";
    category.visibleToVendor = visibleToVendor === "true";

    if (category.parent) {
      category.price = price !== undefined && price !== "" ? Number(price) : null;
      category.freeText = freeText !== undefined ? freeText : category.freeText;
    } else {
      if (seoKeywords !== undefined) category.seoKeywords = seoKeywords;
      category.postRequestsDeals = req.body.postRequestsDeals === "true";
      category.loyaltyPoints = req.body.loyaltyPoints === "true";
      category.linkAttributesPricing = req.body.linkAttributesPricing === "true";
      category.freeTexts = Array.from({ length: 10 }, (_, i) => req.body[`freeText${i}`] || "");
      if (req.body.inventoryLabelName !== undefined) category.inventoryLabelName = req.body.inventoryLabelName;
    }

    // Handle enableFreeText with recursive update
    if (enableFreeText !== undefined) {
      const enabled = enableFreeText === "true" || enableFreeText === true;
      category.enableFreeText = enabled;

      // Update all subcategories recursively
      const updateFreeTextRecursive = async (categoryId, enabled) => {
        const children = await Category.find({ parent: categoryId });
        for (const child of children) {
          child.enableFreeText = enabled;
          await child.save();
          await updateFreeTextRecursive(child._id, enabled);
        }
      };
      await updateFreeTextRecursive(category._id, enabled);
    }

    if (sequence !== undefined) category.sequence = sequence === "" ? 0 : Number(sequence);
    if (categoryType !== undefined) category.categoryType = categoryType;
    category.availableForCart = req.body.availableForCart === "true" || req.body.availableForCart === "on" || req.body.availableForCart === true;

    // Update dropdown fields if present (parse as arrays)
    [
      "categoryVisibility",
      "categoryModel",
      "categoryPricing",
      "socialHandle",
      "displayType",
    ].forEach((key) => {
      if (req.body[key] !== undefined) {
        try {
          const parsed = JSON.parse(req.body[key]);
          category[key] = Array.isArray(parsed)
            ? parsed
            : parsed != null
            ? [String(parsed)]
            : [];
        } catch (e) {
          category[key] = req.body[key]
            ? [String(req.body[key])]
            : [];
        }
      }
    });

    // Update linkedAttributes if provided
    if (req.body.linkedAttributes !== undefined) {
      try {
        const parsed = JSON.parse(req.body.linkedAttributes);
        if (parsed && typeof parsed === 'object') category.linkedAttributes = parsed;
      } catch (e) {
        console.warn("Invalid linkedAttributes JSON on update:", e.message);
      }
    }


    if (req.file) category.imageUrl = `/uploads/${req.file.filename}`;
    // Update color schemes if provided
    if (req.body.colorSchemes) {
      try {
        category.colorSchemes = JSON.parse(req.body.colorSchemes);
      } catch (e) {
        console.warn("Invalid colorSchemes JSON on update:", e.message);
      }
    }

    // Update signupLevels if provided
    if (req.body.signupLevels) {
      try {
        const parsed = JSON.parse(req.body.signupLevels);
        if (Array.isArray(parsed)) {
          category.signupLevels = parsed
            .filter((it) => it && it.levelName)
            .map((it) => ({
              levelName: String(it.levelName),
              sequence: Number(it.sequence ?? 0),
              businessField: Array.isArray(it.businessField)
                ? it.businessField.map(String)
                : (it.businessField ? [String(it.businessField)] : []),
            }));
        }
      } catch (e) {
        console.warn("Invalid signupLevels JSON on update:", e.message);
      }
    }

    await category.save();
    res.json(category);
  } catch (err) {
    console.error("🔥 PUT /api/categories/:id error:", err.message);
    res.status(500).json({ message: err.message || "Server error" });
  }
});


/* ---------------- DELETE CATEGORY ---------------- */
router.delete("/:id", async (req, res) => {
  logApi(req, res, "delete-category");
  try {
    await Category.findByIdAndDelete(req.params.id);
    res.json({ message: "Category deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message || "Server error" });
  }
});

/* ---------------- GET SINGLE CATEGORY ---------------- */
router.get("/:id", async (req, res) => {
  logApi(req, res, "get-category");
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ message: "Category not found" });
    res.json(category);
  } catch (err) {
    res.status(500).json({ message: err.message || "Server error" });
  }
});



// GET all color schemes from parent categories only
router.get("/colors/parents", async (req, res) => {
  logApi(req, res, "get-parent-colors");
  try {
    // Only fetch parent categories
    const categories = await Category.find(
      { parent: null },      // only parents
      "name colorSchemes"    // only return name & colorSchemes
    );
    res.json(categories);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch color schemes", error: err.message });
  }
});


module.exports = router;