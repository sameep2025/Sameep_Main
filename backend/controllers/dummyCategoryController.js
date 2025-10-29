const DummyCategory = require("../models/dummyCategory");
const DummySubcategory = require("../models/dummySubcategory");
const fs = require("fs");

function parseNumber(value, defaultNull = true) {
  if (value === undefined || value === null) return defaultNull ? null : 0;
  if (value === "") return defaultNull ? null : 0;
  const n = Number(value);
  return Number.isNaN(n) ? (defaultNull ? null : 0) : n;
}

// GET dummy categories (top-level if no parentId, else subcategories of given category)
exports.getCategories = async (req, res) => {
  try {
    const parentId = req.query.parentId || null;
    if (!parentId || parentId === "null") {
      const cats = await DummyCategory.find({}).sort({ sequence: 1, createdAt: -1 });
      return res.json(cats);
    }
    // If parentId is a category id, return its direct children (no parentSubcategory)
    const parentCat = await DummyCategory.findById(parentId).lean();
    if (parentCat) {
      const subcats = await DummySubcategory.find({ category: parentId, parentSubcategory: null }).sort({ sequence: 1, createdAt: -1 });
      return res.json(subcats);
    }
    // If parentId is a subcategory id, return its children by parentSubcategory
    const parentSub = await DummySubcategory.findById(parentId).lean();
    if (parentSub) {
      const children = await DummySubcategory.find({ parentSubcategory: parentId }).sort({ sequence: 1, createdAt: -1 });
      return res.json(children);
    }
    return res.status(404).json({ message: "Parent not found" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// CREATE dummy category or subcategory depending on presence of parentId
exports.createCategory = async (req, res) => {
  try {
    const { name, parentId, price, terms, visibleToUser, visibleToVendor } = req.body;
    if (!name) return res.status(400).json({ message: "Name required" });

    const parsedPrice = parseNumber(price, true);
    const parsedSequence = parseNumber(req.body.sequence, false);

    // handle files from multer.single or multer.fields
    const imageFile = req.file || (req.files && Array.isArray(req.files.image) && req.files.image[0]);
    const iconFile = req.files && Array.isArray(req.files.icon) && req.files.icon[0];

    const imageUrl = imageFile ? `/uploads/${imageFile.filename}` : undefined;
    const iconUrl = iconFile ? `/uploads/${iconFile.filename}` : undefined;

    if (!parentId) {
      // Create top-level category
      const exists = await DummyCategory.findOne({ name });
      if (exists) return res.status(400).json({ message: "Category already exists" });

      const categoryData = {
        name,
        imageUrl,
        iconUrl,
        price: parsedPrice,
        terms,
        visibleToUser: String(visibleToUser) === "true" || visibleToUser === true,
        visibleToVendor: String(visibleToVendor) === "true" || visibleToVendor === true,
        sequence: parsedSequence,
        inventoryLabelName: req.body.inventoryLabelName || "",
        enableFreeText: req.body.enableFreeText === "true" || req.body.enableFreeText === true,
        categoryType: req.body.categoryType || "Products",
        availableForCart: req.body.availableForCart === "true" || req.body.availableForCart === true || req.body.availableForCart === "on",
        seoKeywords: req.body.seoKeywords || "",
        postRequestsDeals: req.body.postRequestsDeals === "true",
        loyaltyPoints: req.body.loyaltyPoints === "true",
        linkAttributesPricing: req.body.linkAttributesPricing === "true",
      };

      // arrays may arrive as JSON or string
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
            categoryData[key] = Array.isArray(parsed) ? parsed : (parsed != null ? [String(parsed)] : []);
          } catch {
            categoryData[key] = req.body[key] ? [String(req.body[key])] : [];
          }
        }
      });

      if (req.body.freeTexts) {
        try { categoryData.freeTexts = JSON.parse(req.body.freeTexts); } catch {}
      } else {
        categoryData.freeTexts = Array.from({ length: 10 }, (_, i) => req.body[`freeText${i}`] || "");
      }

      if (req.body.linkedAttributes) {
        try {
          const obj = JSON.parse(req.body.linkedAttributes);
          if (obj && typeof obj === 'object') categoryData.linkedAttributes = obj;
        } catch {}
      }

      if (req.body.colorSchemes) {
        try { categoryData.colorSchemes = JSON.parse(req.body.colorSchemes); } catch {}
      }

      if (req.body.signupLevels) {
        try {
          const levels = JSON.parse(req.body.signupLevels);
          if (Array.isArray(levels)) categoryData.signupLevels = levels;
        } catch {}
      }

      const category = new DummyCategory(categoryData);
      await category.save();
      return res.json(category);
    }
    // Create subcategory under given parent (category or subcategory)
    const parentCat = await DummyCategory.findById(parentId);
    if (parentCat) {
      const dup = await DummySubcategory.findOne({ name, category: parentId, parentSubcategory: null });
      if (dup) return res.status(400).json({ message: "Subcategory already exists under this category" });
      const subcategory = new DummySubcategory({
        name,
        imageUrl,
        iconUrl,
        category: parentId,
        parentSubcategory: null,
        price: parsedPrice,
        terms,
        freeText: req.body.freeText || "",
        visibleToUser: String(visibleToUser) === "true" || visibleToUser === true,
        visibleToVendor: String(visibleToVendor) === "true" || visibleToVendor === true,
        sequence: parsedSequence,
        inventoryLabelName: req.body.inventoryLabelName || "",
      });
      await subcategory.save();
      return res.json(subcategory);
    }
    const parentSub = await DummySubcategory.findById(parentId);
    if (parentSub) {
      // Nested child under a subcategory: inherit top-level category id
      const topCategoryId = parentSub.category;
      const dup = await DummySubcategory.findOne({ name, category: topCategoryId, parentSubcategory: parentId });
      if (dup) return res.status(400).json({ message: "Subcategory already exists under this subcategory" });
      const subcategory = new DummySubcategory({
        name,
        imageUrl,
        iconUrl,
        category: topCategoryId,
        parentSubcategory: parentId,
        price: parsedPrice,
        terms,
        freeText: req.body.freeText || "",
        visibleToUser: String(visibleToUser) === "true" || visibleToUser === true,
        visibleToVendor: String(visibleToVendor) === "true" || visibleToVendor === true,
        sequence: parsedSequence,
        inventoryLabelName: req.body.inventoryLabelName || "",
      });
      await subcategory.save();
      return res.json(subcategory);
    }
    return res.status(404).json({ message: "Parent not found" });
  } catch (err) {
    console.error("Create dummy category error:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, terms, visibleToUser, visibleToVendor, inventoryLabelName } = req.body;

    let doc = await DummyCategory.findById(id);
    let modelType = "category";
    if (!doc) {
      doc = await DummySubcategory.findById(id);
      modelType = doc ? "subcategory" : null;
    }
    if (!doc) return res.status(404).json({ message: "Item not found" });

    if (name !== undefined) doc.name = name;
    doc.price = parseNumber(price, true);
    if (terms !== undefined) doc.terms = terms;
    if (req.body.freeText !== undefined) doc.freeText = req.body.freeText;
    if (visibleToUser !== undefined) doc.visibleToUser = String(visibleToUser) === "true" || visibleToUser === true;
    if (visibleToVendor !== undefined) doc.visibleToVendor = String(visibleToVendor) === "true" || visibleToVendor === true;
    if (req.body.sequence !== undefined) doc.sequence = parseNumber(req.body.sequence, false);

    const imageFile = req.file || (req.files && Array.isArray(req.files.image) && req.files.image[0]);
    const iconFile = req.files && Array.isArray(req.files.icon) && req.files.icon[0];
    if (imageFile) doc.imageUrl = `/uploads/${imageFile.filename}`;
    if (iconFile) doc.iconUrl = `/uploads/${iconFile.filename}`;
    if (inventoryLabelName !== undefined) doc.inventoryLabelName = inventoryLabelName;

    // top-level specific updates
    if (!doc.category && !doc.parent) {
      if (req.body.enableFreeText !== undefined) doc.enableFreeText = req.body.enableFreeText === "true" || req.body.enableFreeText === true;
      if (req.body.categoryType !== undefined) doc.categoryType = req.body.categoryType;
      if (req.body.availableForCart !== undefined) doc.availableForCart = req.body.availableForCart === "true" || req.body.availableForCart === true || req.body.availableForCart === "on";
      if (req.body.seoKeywords !== undefined) doc.seoKeywords = req.body.seoKeywords;
      if (req.body.postRequestsDeals !== undefined) doc.postRequestsDeals = req.body.postRequestsDeals === "true";
      if (req.body.loyaltyPoints !== undefined) doc.loyaltyPoints = req.body.loyaltyPoints === "true";
      if (req.body.linkAttributesPricing !== undefined) doc.linkAttributesPricing = req.body.linkAttributesPricing === "true";

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
            doc[key] = Array.isArray(parsed) ? parsed : (parsed != null ? [String(parsed)] : []);
          } catch {
            doc[key] = req.body[key] ? [String(req.body[key])] : [];
          }
        }
      });

      if (req.body.colorSchemes) {
        try { doc.colorSchemes = JSON.parse(req.body.colorSchemes); } catch {}
      }
      if (req.body.signupLevels) {
        try { const v = JSON.parse(req.body.signupLevels); if (Array.isArray(v)) doc.signupLevels = v; } catch {}
      }
      if (req.body.linkedAttributes) {
        try { const v = JSON.parse(req.body.linkedAttributes); if (v && typeof v === 'object') doc.linkedAttributes = v; } catch {}
      }
      if (req.body.freeTexts) {
        try { doc.freeTexts = JSON.parse(req.body.freeTexts); } catch {}
      } else {
        const arr = Array.from({ length: 10 }, (_, i) => req.body[`freeText${i}`] || "");
        if (arr.some((x) => x !== undefined)) doc.freeTexts = arr;
      }
    }

    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error("Update dummy category error:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
};

async function deleteImageIfLocal(imageUrl) {
  if (imageUrl && imageUrl.startsWith("/uploads/")) {
    const localPath = imageUrl.slice(1);
    try {
      if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
    } catch (e) {
      console.error("Error deleting file", localPath, e.message);
    }
  }
}

exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await DummyCategory.findById(id);
    if (category) {
      // Delete all subcategories under it
      const subs = await DummySubcategory.find({ category: id });
      for (const s of subs) {
        await deleteImageIfLocal(s.imageUrl);
      }
      await DummySubcategory.deleteMany({ category: id });
      await deleteImageIfLocal(category.imageUrl);
      await DummyCategory.findByIdAndDelete(id);
      return res.json({ message: "Deleted category and its subcategories" });
    }
    const subcategory = await DummySubcategory.findById(id);
    if (!subcategory) return res.status(404).json({ message: "Item not found" });
    // delete descendants recursively
    const stack = [subcategory._id];
    while (stack.length) {
      const current = stack.pop();
      const children = await DummySubcategory.find({ parentSubcategory: current });
      for (const ch of children) {
        await deleteImageIfLocal(ch.imageUrl);
        stack.push(ch._id);
      }
      await DummySubcategory.deleteMany({ parentSubcategory: current });
    }
    await deleteImageIfLocal(subcategory.imageUrl);
    await DummySubcategory.findByIdAndDelete(id);
    return res.json({ message: "Deleted subcategory" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// GET single by id (search both collections) and normalize parent field
exports.getCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await DummyCategory.findById(id);
    if (category) {
      return res.json({ ...category.toObject(), parent: null });
    }
    const subcategory = await DummySubcategory.findById(id);
    if (!subcategory) return res.status(404).json({ message: "Item not found" });
    return res.json({ ...subcategory.toObject(), parent: subcategory.parentSubcategory || subcategory.category });
  } catch (err) {
    console.error("Get dummy category error:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
};