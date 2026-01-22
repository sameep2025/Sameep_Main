// controllers/categoryController.js
const Category = require("../models/Category");
const fs = require("fs");
const path = require("path");

// Helper: delete file if exists (local uploads)
const deleteLocalFile = (filePath) => {
  if (!filePath) return;
  try {
    const full = path.join(process.cwd(), filePath);
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch (err) {
    console.error("Failed to delete file", filePath, err.message);
  }
};

// GET categories (roots or children of parentId)
exports.getCategories = async (req, res) => {
  try {
    const parentId = req.query.parentId || null;
    const filter = parentId ? { parent: parentId } : { parent: null };
    const categories = await Category.find(filter).sort({ createdAt: -1 });
    res.json(categories);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};




// CREATE category (multipart/form-data; field name: image)
// optional parentId in body
exports.createCategory = async (req, res) => {
  try {
    const { name, parentId, categoryVisibility, categoryModel, categoryPricing, socialHandle, displayType, uiRules } = req.body;
    const imageFile = req.file;

    if (!name) return res.status(400).json({ message: "Name required" });
    if (!imageFile) return res.status(400).json({ message: "Image required" });

    // unique per parent
    const exists = await Category.findOne({ name, parent: parentId || null });
    if (exists)
      return res
        .status(400)
        .json({ message: "Category already exists under this parent" });

    // allow optional image
const imageUrl = imageFile ? `/${imageFile.path.replace(/\\/g, "/")}` : "";
 // store relative path like /uploads/123.png

    // Ensure array-like fields are parsed from JSON when sent as strings
    const parseArrayField = (val) => {
      if (Array.isArray(val)) return val;
      if (typeof val === 'string' && val.trim().startsWith('[')) {
        try { return JSON.parse(val); } catch { return []; }
      }
      if (val == null || val === '') return [];
      return [val];
    };

    const category = new Category({
      name,
      imageUrl,
      parent: parentId || null,
      categoryVisibility: parseArrayField(categoryVisibility),
      categoryModel: parseArrayField(categoryModel),
      categoryPricing: parseArrayField(categoryPricing),
      socialHandle: parseArrayField(socialHandle),
      displayType: parseArrayField(displayType),
      uiRules: (()=>{ try { return typeof uiRules === 'string' ? JSON.parse(uiRules || '{}') : (uiRules || {});} catch { return {}; } })(),
    });

    await category.save();
    res.json(category);
  } catch (err) {
    console.error("Create category error:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
};

// UPDATE category (name optional, image optional)
exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await Category.findById(id);
    if (!category) return res.status(404).json({ message: "Category not found" });

    const {
      name,
      price,
      terms,
      visibleToUser,
      visibleToVendor,
      sequence,
      freeText,
      enableFreeText,
      categoryType,
      availableForCart,
      seoKeywords,
      postRequestsDeals,
      loyaltyPoints,
      linkAttributesPricing,
      inventoryLabelName,
    } = req.body;

    const imageFile = req.files?.image?.[0];
    const iconFile = req.files?.icon?.[0];

    if (name && name !== category.name) {
      const dup = await Category.findOne({ name, parent: category.parent });
      if (dup) return res.status(400).json({ message: "Another category with that name exists here" });
      category.name = name;
    }

    if (price !== undefined) category.price = price === "null" ? null : Number(price);
    if (terms !== undefined) category.terms = terms;
    if (sequence !== undefined) category.sequence = Number(sequence) || 0;
    if (freeText !== undefined) category.freeText = freeText;
    if (seoKeywords !== undefined) category.seoKeywords = seoKeywords;
    if (inventoryLabelName !== undefined) category.inventoryLabelName = inventoryLabelName;

    // Booleans
    if (visibleToUser !== undefined) category.visibleToUser = visibleToUser === 'true' || visibleToUser === true;
    if (visibleToVendor !== undefined) category.visibleToVendor = visibleToVendor === 'true' || visibleToVendor === true;
    if (enableFreeText !== undefined) category.enableFreeText = enableFreeText === 'true' || enableFreeText === true;
    if (availableForCart !== undefined) category.availableForCart = availableForCart === 'true' || availableForCart === true;
    if (postRequestsDeals !== undefined) category.postRequestsDeals = postRequestsDeals === 'true' || postRequestsDeals === true;
    if (loyaltyPoints !== undefined) category.loyaltyPoints = loyaltyPoints === 'true' || loyaltyPoints === true;
    if (linkAttributesPricing !== undefined) category.linkAttributesPricing = linkAttributesPricing === 'true' || linkAttributesPricing === true;

    if (categoryType) category.categoryType = categoryType;

    // Files
    if (imageFile) {
      deleteLocalFile(category.imageUrl);
      category.imageUrl = `/${imageFile.path.replace(/\\/g, "/")}`;
    }
    if (iconFile) {
      deleteLocalFile(category.iconUrl);
      category.iconUrl = `/${iconFile.path.replace(/\\/g, "/")}`;
    }

    // JSON fields
    ['colorSchemes', 'linkedAttributes', 'categoryVisibility', 'categoryModel', 'categoryPricing', 'socialHandle', 'displayType', 'signupLevels', 'uiRules'].forEach(key => {
      if (req.body[key]) {
        try {
          category[key] = JSON.parse(req.body[key]);
        } catch (e) { console.error(`Failed to parse ${key}:`, e); }
      }
    });

    // Free texts
    const freeTexts = [];
    for (let i = 1; i <= 10; i++) {
      const key = `freeText${i}`;
      if (req.body[key] !== undefined) freeTexts.push(req.body[key]);
    }
    if (freeTexts.length > 0) category.freeTexts = freeTexts;

    await category.save();
    res.json(category);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};


// DELETE category + cascade delete subcategories recursively
async function deleteCategoryAndDescendants(categoryId) {
  // find direct children
  const children = await Category.find({ parent: categoryId });
  for (const child of children) {
    await deleteCategoryAndDescendants(child._id);
  }
  // delete current category (and its image file)
  const cat = await Category.findById(categoryId);
  if (!cat) return;
  if (cat.imageUrl && cat.imageUrl.startsWith("/uploads/")) {
    // remove leading slash
    const localPath = cat.imageUrl.slice(1);
    try {
      if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
    } catch (e) {
      console.error("Error deleting file", localPath, e.message);
    }
  }
  await Category.findByIdAndDelete(categoryId);
}

exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const cat = await Category.findById(id);
    if (!cat) return res.status(404).json({ message: "Category not found" });

    await deleteCategoryAndDescendants(id);
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};