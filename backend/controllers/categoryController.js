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
    const { name, parentId} = req.body;
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

    const category = new Category({
      name,
      imageUrl,
      parent: parentId || null,
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

    const { name, price, terms, visibleToUser, visibleToVendor } = req.body;
    const imageFile = req.file;

    if (name && name !== category.name) {
      const dup = await Category.findOne({ name, parent: category.parent });
      if (dup) return res.status(400).json({ message: "Another category with that name exists here" });
      category.name = name;
    }

    // ✅ Update price: handle "null"
    if (price !== undefined) {
      category.price = price === "null" ? null : Number(price);
    }

    // Update terms
    if (terms !== undefined) {
      category.terms = terms; // empty string clears text
    }

    // Update visibility
    category.visibleToUser = visibleToUser === "true" || visibleToUser === true;
    category.visibleToVendor = visibleToVendor === "true" || visibleToVendor === true;

    // Update image
    if (imageFile) {
      if (category.imageUrl && category.imageUrl.startsWith("/uploads/")) {
        const fs = require("fs");
        const path = category.imageUrl.slice(1);
        if (fs.existsSync(path)) fs.unlinkSync(path);
      }
      category.imageUrl = `/${imageFile.path.replace(/\\/g, "/")}`;
    }

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