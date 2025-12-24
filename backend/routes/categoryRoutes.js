const express = require("express");
const multer = require("multer");
const Category = require("../models/Category");
const Vendor = require("../models/Vendor");
const { uploadBufferToS3, uploadBufferToS3WithLabel, deleteS3ObjectByUrl } = require("../utils/s3Upload");
const { v4: uuidv4 } = require("uuid");
const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });
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

async function getCategoryPathSegments(categoryId) {
  if (!categoryId) return [];
  try {
    let cur = await Category.findById(categoryId, "name parent").lean();
    const stack = [];
    while (cur) {
      stack.unshift(cur.name);
      if (!cur.parent) break;
      cur = await Category.findById(cur.parent, "name parent").lean();
    }
    return stack;
  } catch {
    return [];
  }
}

async function getTopCategoryNameById(categoryId) {
  try {
    const cat = await Category.findById(categoryId, "name").lean();
    return cat?.name || null;
  } catch {
    return null;
  }
}

function getVendorDisplayName(vendor) {
  return vendor?.name || vendor?.contactName || vendor?.businessName || "Vendor";
}

async function buildVendorPrefixedSegments(vendor, categoryIdOrSegments, kind) {
  const vendorName = getVendorDisplayName(vendor);
  let topCategoryName = null;
  if (vendor?.categoryId) {
    topCategoryName = await getTopCategoryNameById(vendor.categoryId);
  }
  if (!topCategoryName && typeof categoryIdOrSegments === "string") {
    topCategoryName = await getTopCategoryNameById(categoryIdOrSegments);
  }
  const prefix = topCategoryName ? `${vendorName} - ${topCategoryName}` : vendorName;
  let segs = Array.isArray(categoryIdOrSegments) ? categoryIdOrSegments : [];
  if (!Array.isArray(categoryIdOrSegments) && typeof categoryIdOrSegments !== "string") {
    segs = [];
  }
  if (kind === "profile pictures") {
    return [prefix, "profile pictures"];
  }
  return [prefix, "images", ...segs];
}

/* ---------------- CREATE CATEGORY ---------------- */
router.post("/", upload.single("image"), async (req, res) => {
  logApi(req, res, "create-category");
  try {
    const {
      name,
      parentId,
      price,
      terms,
      visibleToUser,
      visibleToVendor,
      freeText,
      seoKeywords,
      categoryType,
      addToCart,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Name is required" });
    }

    // Handle parent correctly (supports parentId or parent)
    const parentRaw = (typeof parentId !== 'undefined' ? parentId : req.body.parent);
    const parent = parentRaw && parentRaw !== "" && parentRaw !== "null" ? parentRaw : null;

    // Handle duplicate under same parent
    const exists = await Category.findOne({ name, parent });
    if (exists) {
      return res.status(400).json({ message: "Category already exists under this parent" });
    }

    const categoryData = {
      name,
      parent,
      sequence: Number(req.body.sequence) || 0,
      terms: terms || "",
      price: parent ? (price ? Number(price) : null) : undefined,
      visibleToUser: visibleToUser === "true" || visibleToUser === true,
      visibleToVendor: visibleToVendor === "true" || visibleToVendor === true,
      categoryType: categoryType || "Products",
      availableForCart: req.body.availableForCart === "true" || req.body.availableForCart === "on" || req.body.availableForCart === true,
      enableFreeText: req.body.enableFreeText === "true" || req.body.enableFreeText === true,
      freeText: parent ? freeText || "" : undefined,
      seoKeywords: parent ? undefined : seoKeywords || "",
      linkAttributesPricing: req.body.linkAttributesPricing === "true",
      loyaltyPoints: req.body.loyaltyPoints === "true",
      postRequestsDeals: req.body.postRequestsDeals === "true",
      inventoryLabelName: req.body.inventoryLabelName || "",
    };

    // Upload image to S3 if provided
    if (req.file && req.file.buffer && req.file.mimetype) {
      try {
        // Build path segments: full chain including new category name
        const segments = [];
        if (parent) {
          // walk up the parent chain to root
          let cur = await Category.findById(parent, "name parent").lean();
          const stack = [];
          while (cur) {
            stack.unshift(cur.name);
            if (!cur.parent) break;
            cur = await Category.findById(cur.parent, "name parent").lean();
          }
          segments.push(...stack);
        }
        segments.push(String(name));
        const { url } = await uploadBufferToS3WithLabel(
          req.file.buffer,
          req.file.mimetype,
          "category",
          uuidv4(),
          { segments }
        );
        categoryData.imageUrl = url;
      } catch (e) {
        return res.status(500).json({ message: "Failed to upload image to S3", error: e.message });
      }
    }

    // Persist 10 Free Text inputs for parent categories on create
    if (parent === null) {
      const freeTexts = [];
      for (let i = 1; i <= 10; i++) {
        const key = `freeText${i}`;
        if (req.body[key] !== undefined) freeTexts.push(req.body[key]);
        else freeTexts.push("");
      }
      categoryData.freeTexts = freeTexts;
    }

    // Normalize displayType to always be an array
    if (req.body.displayType) {
      try {
        const parsed = JSON.parse(req.body.displayType);
        categoryData.displayType = Array.isArray(parsed)
          ? parsed
          : [String(parsed)];
      } catch {
        categoryData.displayType = [String(req.body.displayType)];
      }
    } else {
      categoryData.displayType = [];
    }

    // Parse optional dropdown fields (same logic)
    ["categoryVisibility", "categoryModel", "categoryPricing", "socialHandle"].forEach((key) => {
      if (req.body[key]) {
        try {
          const parsed = JSON.parse(req.body[key]);
          categoryData[key] = Array.isArray(parsed) ? parsed : [String(parsed)];
        } catch {
          categoryData[key] = [String(req.body[key])];
        }
      }
    });

    // Handle linkedAttributes
    if (req.body.linkedAttributes) {
      try {
        const parsed = JSON.parse(req.body.linkedAttributes);
        if (parsed && typeof parsed === "object") {
          categoryData.linkedAttributes = parsed;
        }
      } catch (e) {
        console.warn("Invalid linkedAttributes JSON:", e.message);
      }
    }

    // Handle color schemes
    if (req.body.colorSchemes) {
      try {
        categoryData.colorSchemes = JSON.parse(req.body.colorSchemes);
      } catch {
        categoryData.colorSchemes = [];
      }
    }

    const category = new Category(categoryData);
    const saved = await category.save();

    // If parent enabled free text, sync with children
    if (parent === null && categoryData.enableFreeText) {
      await updateFreeTextRecursive(saved._id, true);
    }

    res.json(saved);
  } catch (err) {
    console.error("POST /api/categories error:", err.message);
    res.status(500).json({ message: err.message || "Server error" });
  }
});

/* ---------------- GET CATEGORIES ---------------- */
router.get("/", async (req, res) => {
  logApi(req, res, "list-categories");
  try {
    let parentId = (typeof req.query.parentId !== 'undefined' ? req.query.parentId : req.query.parent);
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
    // Include fields used by preview UI (displayType, uiRules, images) so child nodes have their own config
    const all = await Category.find(
      {},
      {
        name: 1,
        parent: 1,
        price: 1,
        terms: 1,
        sequence: 1,
        displayType: 1,
        uiRules: 1,
        imageUrl: 1,
        iconUrl: 1,
      }
    )
      .sort({ sequence: 1, createdAt: -1 })
      .lean();
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
router.put("/:id", uploadFields, async (req, res) => {
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
      // Correctly read freeText1..freeText10
      category.freeTexts = Array.from({ length: 10 }, (_, idx) => req.body[`freeText${idx + 1}`] || "");
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

    // Handle image/icon uploads to S3 if provided
    const imageFile = req.files && Array.isArray(req.files.image) ? req.files.image[0] : null;
    const iconFile = req.files && Array.isArray(req.files.icon) ? req.files.icon[0] : null;
    if (imageFile && imageFile.buffer && imageFile.mimetype) {
      try {
        if (category.imageUrl) { try { await deleteS3ObjectByUrl(category.imageUrl); } catch {} }
        // Compute full path segments for this existing category
        const segs = [];
        const stack = [];
        let cur = category ? { name: category.name, parent: category.parent } : null;
        // Load chain to root using DB so names are up-to-date
        let walker = cur;
        while (walker) {
          stack.unshift(walker.name);
          if (!walker.parent) break;
          walker = await Category.findById(walker.parent, "name parent").lean();
        }
        segs.push(...stack);
        const { url } = await uploadBufferToS3WithLabel(imageFile.buffer, imageFile.mimetype, "category", uuidv4(), {
          segments: segs,
        });
        category.imageUrl = url;
      } catch (e) {
        return res.status(500).json({ message: "Failed to upload image to S3", error: e.message });
      }
    }
    if (iconFile && iconFile.buffer && iconFile.mimetype) {
      try {
        if (category.iconUrl) { try { await deleteS3ObjectByUrl(category.iconUrl); } catch {} }
        const segs = [];
        const stack = [];
        let walker = category ? { name: category.name, parent: category.parent } : null;
        while (walker) {
          stack.unshift(walker.name);
          if (!walker.parent) break;
          walker = await Category.findById(walker.parent, "name parent").lean();
        }
        segs.push(...stack);
        const { url } = await uploadBufferToS3WithLabel(iconFile.buffer, iconFile.mimetype, "category", uuidv4(), {
          segments: segs,
        });
        category.iconUrl = url;
      } catch (e) {
        return res.status(500).json({ message: "Failed to upload icon to S3", error: e.message });
      }
    }

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
    console.error("PUT /api/categories/:id error:", err.message);
    res.status(500).json({ message: err.message || "Server error" });
  }
});

/* ---------------- DELETE CATEGORY ---------------- */
router.delete("/:id", async (req, res) => {
  logApi(req, res, "delete-category");
  try {
    const doc = await Category.findById(req.params.id);
    if (doc) {
      if (doc.imageUrl) { try { await deleteS3ObjectByUrl(doc.imageUrl); } catch {} }
      if (doc.iconUrl) { try { await deleteS3ObjectByUrl(doc.iconUrl); } catch {} }
      await Category.findByIdAndDelete(req.params.id);
      return res.json({ message: "Category deleted" });
    }
    res.status(404).json({ message: "Category not found" });
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

/* ---------------- GET all color schemes from parent categories only ---------------- */
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

router.get("/:categoryId/vendors/:vendorId/inventory-selections", async (req, res) => {
  logApi(req, res, "get-inventory-selections");
  try {
    const { vendorId, categoryId } = req.params;
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });
    const list = Array.isArray(vendor.inventorySelections?.[String(categoryId)])
      ? vendor.inventorySelections[String(categoryId)]
      : [];
    res.json({ success: true, items: list });
  } catch (err) {
    console.error("GET /categories/:categoryId/vendors/:vendorId/inventory-selections error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.put("/:categoryId/vendors/:vendorId/inventory-selections", async (req, res) => {
  logApi(req, res, "put-inventory-selections");
  try {
    const { vendorId, categoryId } = req.params;
    const { items } = req.body;
    if (!vendorId || !categoryId || !Array.isArray(items)) {
      return res.status(400).json({ message: "vendorId, categoryId and items[] are required" });
    }
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });

    if (!vendor.inventorySelections || typeof vendor.inventorySelections !== "object") vendor.inventorySelections = {};
    const existingList = Array.isArray(vendor.inventorySelections[String(categoryId)]) ? vendor.inventorySelections[String(categoryId)] : [];
    const findExisting = (candidate) => {
      try {
        const key = String(candidate?._id || candidate?.at || "");
        if (!key) return null;
        return existingList.find((e) => String(e?._id || e?.at) === key) || null;
      } catch {
        return null;
      }
    };
    vendor.inventorySelections[String(categoryId)] = items.map((it, idx) => {
      const baseAt = Number(it.at) || Date.now();
      const safeAt = baseAt + idx;
      const pbrIn = it.pricesByRow && typeof it.pricesByRow === "object" ? it.pricesByRow : null;
      const pricesByRow = pbrIn
        ? Object.fromEntries(
            Object.entries(pbrIn).map(([k, v]) => [String(k), v === null || v === "" || v === undefined ? null : Number(v)])
          )
        : undefined;
      const prev = findExisting(it);
      const preservedImages = Array.isArray(prev?.images) ? prev.images : [];
      const providedImages = Array.isArray(it.images) ? it.images.slice(0, 5) : null;
      return {
        at: safeAt,
        categoryId: String(categoryId),
        selections: it.selections && typeof it.selections === "object" ? it.selections : {},
        scopeFamily: typeof it.scopeFamily === "string" ? it.scopeFamily : it.scopeFamily == null ? null : String(it.scopeFamily),
        scopeLabel: typeof it.scopeLabel === "string" ? it.scopeLabel : it.scopeLabel == null ? null : String(it.scopeLabel),
        price: it.price === null || it.price === undefined || it.price === "" ? null : Number(it.price),
        ...(pricesByRow ? { pricesByRow } : {}),
        ...(providedImages ? { images: providedImages } : preservedImages.length ? { images: preservedImages } : {}),
        pricingStatusByRow:
          it.pricingStatusByRow && typeof it.pricingStatusByRow === "object" ? it.pricingStatusByRow : prev?.pricingStatusByRow,
      };
    });
    vendor.markModified("inventorySelections");
    await vendor.save();
    res.json({ success: true, inventorySelections: vendor.inventorySelections[String(categoryId)] });
  } catch (err) {
    console.error("PUT /categories/:categoryId/vendors/:vendorId/inventory-selections error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.post(
  "/:categoryId/vendors/:vendorId/inventory/:entryKey/images",
  upload.array("images", 5),
  async (req, res) => {
    logApi(req, res, "post-inventory-images");
    try {
      const { vendorId, categoryId, entryKey } = req.params;
      const vendor = await Vendor.findById(vendorId);
      if (!vendor) return res.status(404).json({ message: "Vendor not found" });
      const list = Array.isArray(vendor.inventorySelections?.[categoryId]) ? vendor.inventorySelections[categoryId] : [];
      const idx = list.findIndex((it) => String(it._id || it.at) === String(entryKey));
      if (idx < 0) return res.status(404).json({ message: "Inventory entry not found" });
      const files = Array.isArray(req.files) ? req.files : [];
      const urls = [];
      for (const f of files) {
        if (f && f.buffer && f.mimetype) {
          try {
            const segs = await getCategoryPathSegments(categoryId);
            const extra = [];
            for (let i = 1; i <= 5; i++) {
              if (req.body?.[`level${i}`]) extra.push(String(req.body[`level${i}`]));
            }
            let merged = segs;
            if (extra.length) merged = [...segs, ...extra];
            const finalSegs = await buildVendorPrefixedSegments(vendor, segs, "images");
            const { url } = await uploadBufferToS3WithLabel(f.buffer, f.mimetype, "vendor", uuidv4(), {
              segments: extra.length ? [...finalSegs.slice(0, 2), ...merged] : finalSegs,
            });
            urls.push(url);
          } catch (e) {
            return res.status(500).json({ message: "Failed to upload image to S3", error: e.message });
          }
        }
      }
      const current = Array.isArray(list[idx].images) ? list[idx].images : [];
      list[idx].images = [...current, ...urls].slice(0, 5);
      vendor.markModified("inventorySelections");
      await vendor.save();
      res.json({ success: true, images: list[idx].images });
    } catch (err) {
      console.error("Append inventory images (categories route) error:", err);
      res.status(500).json({ message: "Server error", error: err.message });
    }
  }
);

router.put(
  "/:categoryId/vendors/:vendorId/inventory/:entryKey/images/:index",
  upload.single("image"),
  async (req, res) => {
    logApi(req, res, "put-inventory-image");
    try {
      const { vendorId, categoryId, entryKey, index } = req.params;
      const idxNum = Number(index);
      const vendor = await Vendor.findById(vendorId);
      if (!vendor) return res.status(404).json({ message: "Vendor not found" });
      const list = Array.isArray(vendor.inventorySelections?.[categoryId]) ? vendor.inventorySelections[categoryId] : [];
      const i = list.findIndex((it) => String(it._id || it.at) === String(entryKey));
      if (i < 0) return res.status(404).json({ message: "Inventory entry not found" });
      if (!req.file) return res.status(400).json({ message: "image file required" });
      const arr = Array.isArray(list[i].images) ? list[i].images : [];
      if (idxNum < 0 || idxNum >= arr.length) return res.status(400).json({ message: "Invalid index" });
      try {
        const oldUrl = arr[idxNum];
        const segs = await getCategoryPathSegments(categoryId);
        const extra = [];
        for (let j = 1; j <= 5; j++) {
          if (req.body?.[`level${j}`]) extra.push(String(req.body[`level${j}`]));
        }
        let merged = segs;
        if (extra.length) merged = [...segs, ...extra];
        const finalSegs = await buildVendorPrefixedSegments(vendor, segs, "images");
        const { url } = await uploadBufferToS3WithLabel(req.file.buffer, req.file.mimetype, "vendor", uuidv4(), {
          segments: extra.length ? [...finalSegs.slice(0, 2), ...merged] : finalSegs,
        });
        arr[idxNum] = url;
        if (oldUrl) {
          try {
            await deleteS3ObjectByUrl(oldUrl);
          } catch {}
        }
      } catch (e) {
        return res.status(500).json({ message: "Failed to upload image to S3", error: e.message });
      }
      list[i].images = arr;
      vendor.markModified("inventorySelections");
      await vendor.save();
      res.json({ success: true, images: list[i].images });
    } catch (err) {
      console.error("Replace inventory image (categories route) error:", err);
      res.status(500).json({ message: "Server error", error: err.message });
    }
  }
);

router.delete("/:categoryId/vendors/:vendorId/inventory/:entryKey/images/:index", async (req, res) => {
  logApi(req, res, "delete-inventory-image");
  try {
    const { vendorId, categoryId, entryKey, index } = req.params;
    const idxNum = Number(index);
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });
    const list = Array.isArray(vendor.inventorySelections?.[categoryId]) ? vendor.inventorySelections[categoryId] : [];
    const i = list.findIndex((it) => String(it._id || it.at) === String(entryKey));
    if (i < 0) return res.status(404).json({ message: "Inventory entry not found" });
    const arr = Array.isArray(list[i].images) ? list[i].images : [];
    if (idxNum < 0 || idxNum >= arr.length) return res.status(400).json({ message: "Invalid index" });
    const removed = arr.splice(idxNum, 1)[0];
    if (removed) {
      try {
        await deleteS3ObjectByUrl(removed);
      } catch {}
    }
    list[i].images = arr;
    vendor.markModified("inventorySelections");
    await vendor.save();
    res.json({ success: true, images: list[i].images });
  } catch (err) {
    console.error("Delete inventory image (categories route) error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.get("/:categoryId/vendors/:vendorId/inventory/:entryKey/images", async (req, res) => {
  logApi(req, res, "get-inventory-images");
  try {
    const { vendorId, categoryId, entryKey } = req.params;
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });
    const list = Array.isArray(vendor.inventorySelections?.[categoryId]) ? vendor.inventorySelections[categoryId] : [];
    const idx = list.findIndex((it) => String(it._id || it.at) === String(entryKey));
    if (idx < 0) return res.status(404).json({ message: "Inventory entry not found" });
    const arr = Array.isArray(list[idx].images) ? list[idx].images : [];
    res.json({ success: true, images: arr });
  } catch (err) {
    console.error("Get inventory images (categories route) error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;