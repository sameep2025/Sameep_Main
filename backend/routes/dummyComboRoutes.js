const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const DummyCombo = require("../models/dummyCombo");
const DummyCategory = require("../models/dummyCategory");

const router = express.Router();

const upload = multer({ dest: "uploads/" });
const uploadAny = upload.any();

async function validateAllowedCategoryItems(items) {
  const categoryIds = (items || [])
    .filter((it) => it.kind === "category" && it.categoryId)
    .map((it) => it.categoryId);
  if (categoryIds.length === 0) return true;

  const objIds = categoryIds.map((id) => new mongoose.Types.ObjectId(id));
  const children = await DummyCategory.find({ parent: { $in: objIds } }, { _id: 1, parent: 1 }).lean();
  const byParent = new Map();
  const childIds = [];
  for (const ch of children) {
    const pid = String(ch.parent);
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid).push(String(ch._id));
    childIds.push(ch._id);
  }
  let grandchildren = [];
  if (childIds.length > 0) {
    const agg = await DummyCategory.aggregate([
      { $match: { parent: { $in: childIds } } },
      { $group: { _id: "$parent", count: { $sum: 1 } } },
    ]);
    grandchildren = agg.map((g) => String(g._id));
  }
  const hasGrandchildren = new Set(grandchildren);

  for (const id of categoryIds) {
    const pid = String(id);
    const childrenOf = byParent.get(pid) || [];
    if (childrenOf.length === 0) continue; // leaf ok
    const invalid = childrenOf.some((cid) => hasGrandchildren.has(String(cid)));
    if (invalid) return false;
  }
  return true;
}

router.post("/", uploadAny, async (req, res) => {
  try {
    let { name, iconUrl = "", imageUrl = "", parentCategoryId, type, items = [], basePrice = null, terms = "", sizes = [] } = req.body;

    if (typeof items === "string") {
      try { items = JSON.parse(items); } catch { items = []; }
    }
    if (typeof sizes === "string") {
      try { sizes = JSON.parse(sizes); } catch { sizes = []; }
    }

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

    const parent = await DummyCategory.findById(parentCategoryId).lean();
    if (!parent) return res.status(404).json({ message: "Parent subcategory not found" });

    for (const it of items) {
      if (it.kind === "category" && it.categoryId) {
        const cat = await DummyCategory.findById(it.categoryId).lean();
        if (cat) it.name = cat.name;
      }
    }

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

    const summaryForCreate = await buildDummyComboSummary({ name, items, sizes, basePrice });
    const combo = await DummyCombo.create({
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
    console.error("POST /api/dummy-combos error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

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
    const combos = await DummyCombo.find(criteria).sort({ createdAt: -1 }).lean();
    res.json(combos);
  } catch (err) {
    console.error("GET /api/dummy-combos error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.get("/byParent/:subcategoryId", async (req, res) => {
  try {
    const { subcategoryId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(subcategoryId)) {
      return res.status(400).json({ message: "Invalid subcategoryId" });
    }
    const combos = await DummyCombo.find({ parentCategoryId: subcategoryId }).sort({ createdAt: -1 }).lean();
    res.json(combos);
  } catch (err) {
    console.error("GET /api/dummy-combos/byParent error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.get("/:comboId", async (req, res) => {
  try {
    const { comboId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(comboId)) {
      return res.status(400).json({ message: "Invalid comboId" });
    }
    const combo = await DummyCombo.findById(comboId).lean();
    if (!combo) return res.status(404).json({ message: "Combo not found" });
    res.json(combo);
  } catch (err) {
    console.error("GET /api/dummy-combos/:comboId error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

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
          const cat = await DummyCategory.findById(it.categoryId).lean();
          if (cat) it.name = cat.name;
        }
      }
    }

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
    try {
      const current = await DummyCombo.findById(comboId).lean();
      const temp = {
        ...(current || {}),
        name: typeof name !== 'undefined' ? name : current?.name,
        items: Array.isArray(items) ? items : (current?.items || []),
        sizes: Array.isArray(sizes) ? sizes : (current?.sizes || []),
        basePrice: typeof basePrice !== 'undefined' ? basePrice : current?.basePrice,
      };
      const summaryForUpdate = await buildDummyComboSummary(temp);
      setPayload.includesNames = Array.isArray(summaryForUpdate?.includes) ? summaryForUpdate.includes : [];
      setPayload.perSize = Array.isArray(summaryForUpdate?.perSize) ? summaryForUpdate.perSize : [];
    } catch (e) {
      console.warn('Failed to compute denormalized fields for dummy combo update:', e?.message || e);
    }
    if (typeof iconUrl !== "undefined") setPayload.iconUrl = iconUrl;
    if (typeof imageUrl !== "undefined") setPayload.imageUrl = imageUrl;

    const updated = await DummyCombo.findByIdAndUpdate(comboId, { $set: setPayload }, { new: true });
    if (!updated) return res.status(404).json({ message: "Combo not found" });
    res.json(updated);
  } catch (err) {
    console.error("PUT /api/dummy-combos/:comboId error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

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

    const combo = await DummyCombo.findById(comboId);
    if (!combo) return res.status(404).json({ message: "Combo not found" });
    if (!Array.isArray(combo.items) || !combo.items[idx]) {
      return res.status(404).json({ message: "Item not found" });
    }
    if (typeof price !== "undefined") combo.items[idx].price = price;
    if (typeof terms !== "undefined") combo.items[idx].terms = terms;
    await combo.save();
    res.json(combo);
  } catch (err) {
    console.error("PUT /api/dummy-combos/:comboId/item/:itemIndex error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

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

    const combo = await DummyCombo.findById(comboId);
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
    console.error("PUT /api/dummy-combos/:comboId/item/:itemIndex/variant/:variantIndex error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.delete("/:comboId", async (req, res) => {
  try {
    const { comboId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(comboId)) {
      return res.status(400).json({ message: "Invalid comboId" });
    }
    const deleted = await DummyCombo.findByIdAndDelete(comboId);
    if (!deleted) return res.status(404).json({ message: "Combo not found" });
    res.json({ message: "Combo deleted" });
  } catch (err) {
    console.error("DELETE /api/dummy-combos/:comboId error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

async function buildDummyComboSummary(combo) {
  const name = combo.name || "";

  const categoryIds = (Array.isArray(combo.items) ? combo.items : [])
    .filter(it => it.kind === 'category' && it.categoryId)
    .map(it => String(it.categoryId));

  let categoryNames = [];
  if (categoryIds.length) {
    const cats = await DummyCategory.find({ _id: { $in: categoryIds } }, { name: 1, parent: 1 }).lean();
    const children = await DummyCategory.find({ parent: { $in: categoryIds.map(id => new mongoose.Types.ObjectId(id)) } }, { name: 1, parent: 1 }).lean();
    const selectedById = new Map(cats.map(c => [String(c._id), c.name]));
    const byParent = new Map();
    for (const ch of children) {
      const pid = String(ch.parent);
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid).push(ch.name);
    }
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
      const first = variantSets[0];
      sizes = sizes0.filter(s => s !== null);
      perSize = first.map(v => ({
        size: v.size || null,
        price: v.price,
        terms: v.terms || '',
        imageUrl: v.imageUrl || ''
      }));
    }
  }

  if (perSize.length === 0 && Array.isArray(combo.sizes) && combo.sizes.length) {
    sizes = combo.sizes;
    perSize = combo.sizes.map(sz => ({ size: sz, price: null, terms: '', imageUrl: '' }));
  }

  return {
    id: String(combo._id || combo.id),
    name,
    includes,
    sizes,
    perSize,
    basePrice: combo.basePrice ?? null
  };
}

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
    const combos = await DummyCombo.find(criteria).sort({ createdAt: -1 }).lean();
    const summaries = [];
    for (const c of combos) {
      summaries.push(await buildDummyComboSummary(c));
    }
    res.json(summaries);
  } catch (err) {
    console.error("GET /api/dummy-combos/summary error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.get("/:comboId/summary", async (req, res) => {
  try {
    const { comboId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(comboId)) {
      return res.status(400).json({ message: "Invalid comboId" });
    }
    const combo = await DummyCombo.findById(comboId).lean();
    if (!combo) return res.status(404).json({ message: "Combo not found" });
    const summary = await buildDummyComboSummary(combo);
    res.json(summary);
  } catch (err) {
    console.error("GET /api/dummy-combos/:comboId/summary error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.post("/backfill-denorm", async (req, res) => {
  try {
    const combos = await DummyCombo.find({}).lean();
    let updated = 0;
    for (const c of combos) {
      const s = await buildDummyComboSummary(c);
      await DummyCombo.updateOne(
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
    console.error("POST /api/dummy-combos/backfill-denorm error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;
