const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const Combo = require("../models/Combo");
const Category = require("../models/Category");

const router = express.Router();

// Upload middleware for icon and image
const upload = multer({ dest: "uploads/" });
// use .any() so we can accept dynamic variant_<i>_<j> fields
const uploadAny = upload.any();

// Validate that all category-kind items are either leaves OR last-level parents
// Last-level parent = has children, but ALL of those children are leaves
async function validateAllowedCategoryItems(items) {
  const categoryIds = (items || [])
    .filter((it) => it.kind === "category" && it.categoryId)
    .map((it) => it.categoryId);
  if (categoryIds.length === 0) return true;

  const objIds = categoryIds.map((id) => new mongoose.Types.ObjectId(id));
  // Fetch direct children for each selected category
  const children = await Category.find({ parent: { $in: objIds } }, { _id: 1, parent: 1 }).lean();
  const byParent = new Map();
  const childIds = [];
  for (const ch of children) {
    const pid = String(ch.parent);
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid).push(String(ch._id));
    childIds.push(ch._id);
  }
  // Find which children themselves have children (i.e., grandchildren exist)
  let grandchildren = [];
  if (childIds.length > 0) {
    const agg = await Category.aggregate([
      { $match: { parent: { $in: childIds } } },
      { $group: { _id: "$parent", count: { $sum: 1 } } },
    ]);
    grandchildren = agg.map((g) => String(g._id));
  }
  const hasGrandchildren = new Set(grandchildren);

  // Validate per selected category
  for (const id of categoryIds) {
    const pid = String(id);
    const childrenOf = byParent.get(pid) || [];
    if (childrenOf.length === 0) {
      // This is a leaf -> allowed
      continue;
    }
    // If any child has its own children => not a last-level parent -> reject
    const invalid = childrenOf.some((cid) => hasGrandchildren.has(String(cid)));
    if (invalid) return false;
  }
  return true;
}

// Create combo
router.post("/", uploadAny, async (req, res) => {
  try {
    let { name, iconUrl = "", imageUrl = "", parentCategoryId, type, items = [], basePrice = null, terms = "", sizes = [] } = req.body;

    if (typeof items === "string") {
      try { items = JSON.parse(items); } catch { items = []; }
    }
    if (typeof sizes === "string") {
      try { sizes = JSON.parse(sizes); } catch { sizes = []; }
    }

    // collect normal files
    const files = Array.isArray(req.files) ? req.files : [];
    const findFile = (field) => files.find((f) => f.fieldname === field);
    const iconFile = findFile('icon');
    const imageFile = findFile('image');
    if (iconFile) iconUrl = `/uploads/${iconFile.filename}`;
    if (imageFile) imageUrl = `/uploads/${imageFile.filename}`;

    if (!name || !parentCategoryId || !type) {
      return res.status(400).json({ message: "name, parentCategoryId, and type are required" });
    }
    if (!mongoose.Types.ObjectId.isValid(parentCategoryId)) {
      return res.status(400).json({ message: "Invalid parentCategoryId" });
    }
    if (!Array.isArray(items)) {
      return res.status(400).json({ message: "items must be an array" });
    }

    const parent = await Category.findById(parentCategoryId).lean();
    if (!parent) return res.status(404).json({ message: "Parent subcategory not found" });

    for (const it of items) {
      if (it.kind === "category" && it.categoryId) {
        const cat = await Category.findById(it.categoryId).lean();
        if (cat) it.name = cat.name;
      }
    }


    // attach variant images by convention: fieldname = variant_<itemIndex>_<sizeIndex>
    if (Array.isArray(items)) {
      files.forEach((f) => {
        if (!f.fieldname?.startsWith('variant_')) return;
        const parts = f.fieldname.split('_');
        const i = Number(parts[1]);
        const j = Number(parts[2]);
        if (Number.isInteger(i) && Number.isInteger(j) && items[i]) {
          if (!Array.isArray(items[i].variants)) items[i].variants = [];
          if (!items[i].variants[j]) items[i].variants[j] = { size: (items[i].sizeOptions||[])[j] || '', price: null, terms: '', imageUrl: '' };
          items[i].variants[j].imageUrl = `/uploads/${f.filename}`;
        }
      });
    }

    const ok = await validateAllowedCategoryItems(items);
    if (!ok) return res.status(400).json({ message: "Only leaf-level categories may be included in combos" });

    // denormalize for fast UI rendering
    const summaryForCreate = await buildComboSummary({ name, items, sizes, basePrice });
    const combo = await Combo.create({
      name,
      iconUrl,
      imageUrl,
      parentCategoryId,
      type,
      items,
      basePrice,
      terms,
      sizes,
      includesNames: Array.isArray(summaryForCreate?.includes) ? summaryForCreate.includes : [],
      perSize: Array.isArray(summaryForCreate?.perSize) ? summaryForCreate.perSize : [],
    });
    res.status(201).json(combo);
  } catch (err) {
    console.error("POST /api/combos error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// List combos (optionally filter by parentCategoryId via query)
router.get("/", async (req, res) => {
  try {
    const { parentCategoryId } = req.query;
    const criteria = {};
    if (parentCategoryId) {
      if (!mongoose.Types.ObjectId.isValid(parentCategoryId)) {
        return res.status(400).json({ message: "Invalid parentCategoryId" });
      }
      criteria.parentCategoryId = parentCategoryId;
    }
    const combos = await Combo.find(criteria).sort({ createdAt: -1 }).lean();
    res.json(combos);
  } catch (err) {
    console.error("GET /api/combos error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// List combos for a specific immediate subcategory
router.get("/byParent/:subcategoryId", async (req, res) => {
  try {
    const { subcategoryId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(subcategoryId)) {
      return res.status(400).json({ message: "Invalid subcategoryId" });
    }
    const combos = await Combo.find({ parentCategoryId: subcategoryId }).sort({ createdAt: -1 }).lean();
    res.json(combos);
  } catch (err) {
    console.error("GET /api/combos/byParent error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Get single combo by id (must appear AFTER /byParent)
router.get("/:comboId", async (req, res) => {
  try {
    const { comboId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(comboId)) {
      return res.status(400).json({ message: "Invalid comboId" });
    }
    const combo = await Combo.findById(comboId).lean();
    if (!combo) return res.status(404).json({ message: "Combo not found" });
    res.json(combo);
  } catch (err) {
    console.error("GET /api/combos/:comboId error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Update combo
router.put("/:comboId", uploadAny, async (req, res) => {
  try {
    const { comboId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(comboId)) {
      return res.status(400).json({ message: "Invalid comboId" });
    }

    let { name, iconUrl, imageUrl, type, items, basePrice, terms, sizes } = req.body;

    if (typeof items === "string") {
      try { items = JSON.parse(items); } catch { /* ignore */ }
    }
    if (typeof sizes === "string") {
      try { sizes = JSON.parse(sizes); } catch { /* ignore */ }
    }

    // collect files via uploadAny
    const files = Array.isArray(req.files) ? req.files : [];
    const findFile = (field) => files.find((f) => f.fieldname === field);
    const iconFile = findFile('icon');
    const imageFile = findFile('image');
    if (iconFile) iconUrl = `/uploads/${iconFile.filename}`;
    if (imageFile) imageUrl = `/uploads/${imageFile.filename}`;

    if (items) {
      const ok = await validateAllowedCategoryItems(items);
      if (!ok) return res.status(400).json({ message: "Only leaf-level categories may be included in combos" });
      
      for (const it of items) {
  if (it.kind === "category" && it.categoryId) {
    const cat = await Category.findById(it.categoryId).lean();
    if (cat) it.name = cat.name;  // <- store actual service name
  }
}

    }

    // attach variant images by convention: fieldname = variant_<itemIndex>_<sizeIndex>
    if (Array.isArray(items)) {
      files.forEach((f) => {
        if (!f.fieldname?.startsWith('variant_')) return;
        const parts = f.fieldname.split('_');
        const i = Number(parts[1]);
        const j = Number(parts[2]);
        if (Number.isInteger(i) && Number.isInteger(j) && items[i]) {
          if (!Array.isArray(items[i].variants)) items[i].variants = [];
          if (!items[i].variants[j]) items[i].variants[j] = { size: (items[i].sizeOptions||[])[j] || '', price: null, terms: '', imageUrl: '' };
          items[i].variants[j].imageUrl = `/uploads/${f.filename}`;
        }
      });
    }

    const setPayload = { name, type, items, basePrice, terms, sizes };
    // compute denormalized fields based on latest values
    try {
      // Build a temp combo-like object with latest values for summary
      const current = await Combo.findById(comboId).lean();
      const temp = {
        ...(current || {}),
        name: typeof name !== 'undefined' ? name : current?.name,
        items: Array.isArray(items) ? items : (current?.items || []),
        sizes: Array.isArray(sizes) ? sizes : (current?.sizes || []),
        basePrice: typeof basePrice !== 'undefined' ? basePrice : current?.basePrice,
      };
      const summaryForUpdate = await buildComboSummary(temp);
      setPayload.includesNames = Array.isArray(summaryForUpdate?.includes) ? summaryForUpdate.includes : [];
      setPayload.perSize = Array.isArray(summaryForUpdate?.perSize) ? summaryForUpdate.perSize : [];
    } catch (e) {
      console.warn('Failed to compute denormalized fields for combo update:', e?.message || e);
    }
    if (typeof iconUrl !== "undefined") setPayload.iconUrl = iconUrl;
    if (typeof imageUrl !== "undefined") setPayload.imageUrl = imageUrl;

    const updated = await Combo.findByIdAndUpdate(comboId, { $set: setPayload }, { new: true });
    if (!updated) return res.status(404).json({ message: "Combo not found" });
    res.json(updated);
  } catch (err) {
    console.error("PUT /api/combos/:comboId error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Update a specific item's base price/terms within a combo
router.put("/:comboId/item/:itemIndex", async (req, res) => {
  try {
    const { comboId, itemIndex } = req.params;
    const idx = Number(itemIndex);
    if (!mongoose.Types.ObjectId.isValid(comboId)) {
      return res.status(400).json({ message: "Invalid comboId" });
    }
    if (!Number.isInteger(idx) || idx < 0) {
      return res.status(400).json({ message: "Invalid itemIndex" });
    }
    const { price, terms } = req.body || {};

    const combo = await Combo.findById(comboId);
    if (!combo) return res.status(404).json({ message: "Combo not found" });
    if (!Array.isArray(combo.items) || !combo.items[idx]) {
      return res.status(404).json({ message: "Item not found" });
    }
    if (typeof price !== "undefined") combo.items[idx].price = price;
    if (typeof terms !== "undefined") combo.items[idx].terms = terms;
    await combo.save();
    res.json(combo);
  } catch (err) {
    console.error("PUT /api/combos/:comboId/item/:itemIndex error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Update a specific variant's price/terms within a combo item
router.put("/:comboId/item/:itemIndex/variant/:variantIndex", async (req, res) => {
  try {
    const { comboId, itemIndex, variantIndex } = req.params;
    const i = Number(itemIndex);
    const j = Number(variantIndex);
    if (!mongoose.Types.ObjectId.isValid(comboId)) {
      return res.status(400).json({ message: "Invalid comboId" });
    }
    if (!Number.isInteger(i) || i < 0 || !Number.isInteger(j) || j < 0) {
      return res.status(400).json({ message: "Invalid itemIndex or variantIndex" });
    }
    const { price, terms } = req.body || {};

    const combo = await Combo.findById(comboId);
    if (!combo) return res.status(404).json({ message: "Combo not found" });
    if (!Array.isArray(combo.items) || !combo.items[i]) {
      return res.status(404).json({ message: "Item not found" });
    }
    if (!Array.isArray(combo.items[i].variants) || !combo.items[i].variants[j]) {
      return res.status(404).json({ message: "Variant not found" });
    }
    if (typeof price !== "undefined") combo.items[i].variants[j].price = price;
    if (typeof terms !== "undefined") combo.items[i].variants[j].terms = terms;
    await combo.save();
    res.json(combo);
  } catch (err) {
    console.error("PUT /api/combos/:comboId/item/:itemIndex/variant/:variantIndex error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Delete combo
router.delete("/:comboId", async (req, res) => {
  try {
    const { comboId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(comboId)) {
      return res.status(400).json({ message: "Invalid comboId" });
    }
    const deleted = await Combo.findByIdAndDelete(comboId);
    if (!deleted) return res.status(404).json({ message: "Combo not found" });
    res.json({ message: "Combo deleted" });
  } catch (err) {
    console.error("DELETE /api/combos/:comboId error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});


// Build a concise summary for a combo: name, included service names, and per-size prices
async function buildComboSummary(combo) {
  // 1) Combo name
  const name = combo.name || "";

  // 2) Included services (expand last-level parents into leaf child names)
  // Selected category items are guaranteed to be last-level parents or leaves.
  const categoryIds = (Array.isArray(combo.items) ? combo.items : [])
    .filter(it => it.kind === 'category' && it.categoryId)
    .map(it => String(it.categoryId));

  let categoryNames = [];
  if (categoryIds.length) {
    // Fetch selected categories (for leaf names) and their direct children (leaf services under last-level parents)
    const cats = await Category.find({ _id: { $in: categoryIds } }, { name: 1, parent: 1 }).lean();
    const children = await Category.find({ parent: { $in: categoryIds.map(id => new mongoose.Types.ObjectId(id)) } }, { name: 1, parent: 1 }).lean();
    const selectedById = new Map(cats.map(c => [String(c._id), c.name]));
    const byParent = new Map();
    for (const ch of children) {
      const pid = String(ch.parent);
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid).push(ch.name);
    }
    // For each selected id: if it has children -> include child names; else include itself (it's a leaf)
    for (const id of categoryIds) {
      const childNames = byParent.get(id);
      if (childNames && childNames.length) categoryNames.push(...childNames.filter(Boolean));
      else {
        const nm = selectedById.get(id);
        if (nm) categoryNames.push(nm);
      }
    }
  }

  const customNames = (Array.isArray(combo.items) ? combo.items : [])
    .filter(it => it.kind === 'custom' && (it.name || '').trim())
    .map(it => it.name.trim());

  const includes = [...categoryNames, ...customNames];

  // 3) Per-size prices
  // If all items share the same variant sizes schema, derive per-size list from the first such item.
  const items = Array.isArray(combo.items) ? combo.items : [];
  const variantSets = items
    .map(it => Array.isArray(it.variants) ? it.variants.map(v => ({ size: v.size || null, price: v.price ?? null, terms: v.terms || '', imageUrl: v.imageUrl || '' })) : []);

  let perSize = [];
  let sizes = [];

  if (variantSets.length > 0 && variantSets.every(vs => vs.length > 0)) {
    const len = variantSets[0].length;
    const sameLength = variantSets.every(vs => vs.length === len);
    const sizes0 = sameLength ? variantSets[0].map(v => (v.size || null)) : [];
    const sameSizes = sameLength && variantSets.every(vs => vs.map(v => (v.size || null)).every((sz, i) => sz === sizes0[i]));

    if (sameSizes) {
      // Take per-size from the first item’s variants
      const first = variantSets[0];
      sizes = sizes0.filter(s => s !== null);
      perSize = first.map(v => ({
        size: v.size || null,
        price: v.price,     // number or null
        terms: v.terms || '',
        imageUrl: v.imageUrl || ''
      }));
    }
  }

  // Fallback: if no uniform variants, but combo.sizes exists, return them without price
  if (perSize.length === 0 && Array.isArray(combo.sizes) && combo.sizes.length) {
    sizes = combo.sizes;
    perSize = combo.sizes.map(sz => ({ size: sz, price: null, terms: '', imageUrl: '' }));
  }

  return {
    id: String(combo._id || combo.id),
    name,
    includes,     // array of strings (service names + custom names)
    sizes,        // array of size labels (without null)
    perSize,      // array of { size, price, terms, imageUrl }
    basePrice: combo.basePrice ?? null
  };
}

// GET /api/combos/summary?parentCategoryId=<id>
router.get("/summary", async (req, res) => {
  try {
    const { parentCategoryId } = req.query;
    const criteria = {};
    if (parentCategoryId) {
      if (!mongoose.Types.ObjectId.isValid(parentCategoryId)) {
        return res.status(400).json({ message: "Invalid parentCategoryId" });
      }
      criteria.parentCategoryId = parentCategoryId;
    }
    const combos = await Combo.find(criteria).sort({ createdAt: -1 }).lean();
    const summaries = [];
    for (const c of combos) {
      summaries.push(await buildComboSummary(c));
    }
    res.json(summaries);
  } catch (err) {
    console.error("GET /api/combos/summary error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// GET /api/combos/:comboId/summary
router.get("/:comboId/summary", async (req, res) => {
  try {
    const { comboId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(comboId)) {
      return res.status(400).json({ message: "Invalid comboId" });
    }
    const combo = await Combo.findById(comboId).lean();
    if (!combo) return res.status(404).json({ message: "Combo not found" });
    const summary = await buildComboSummary(combo);
    res.json(summary);
  } catch (err) {
    console.error("GET /api/combos/:comboId/summary error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// POST /api/combos/backfill-denorm
// Recompute and persist includesNames and perSize for all combos
router.post("/backfill-denorm", async (req, res) => {
  try {
    const combos = await Combo.find({}).lean();
    let updated = 0;
    for (const c of combos) {
      const s = await buildComboSummary(c);
      await Combo.updateOne(
        { _id: c._id },
        {
          $set: {
            includesNames: Array.isArray(s?.includes) ? s.includes : [],
            perSize: Array.isArray(s?.perSize) ? s.perSize : [],
          },
        }
      );
      updated++;
    }
    res.json({ message: "Backfill complete", updated });
  } catch (err) {
    console.error("POST /api/combos/backfill-denorm error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;