const express = require("express");
const mongoose = require("mongoose");
const DummyVendor = require("../models/DummyVendor");
const DummyCategory = require("../models/dummyCategory");
const DummySubcategory = require("../models/dummySubcategory");
const multer = require("multer");
const path = require("path");

const router = express.Router();

// Multer setup for dummy vendor images
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-dummyvendor-" + Math.round(Math.random() * 1e9) + path.extname(file.originalname)),
});
const upload = multer({ storage });

/** Non-inventory row images per category node (Dummy Vendor) **/
// Append up to 5 images for a category leaf node (row)
router.post("/:vendorId/rows/:nodeId/images", upload.array("images", 5), async (req, res) => {
  try {
    const { vendorId, nodeId } = req.params;
    const vendor = await DummyVendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });
    const urls = (req.files || []).map((f) => `/uploads/${f.filename}`);
    const current = Array.isArray(vendor.rowImages?.[nodeId]) ? vendor.rowImages[nodeId] : [];
    const next = [...current, ...urls].slice(0, 5);
    vendor.rowImages = { ...(vendor.rowImages || {}), [nodeId]: next };
    vendor.markModified('rowImages');
    await vendor.save();
    res.json({ success: true, images: vendor.rowImages[nodeId] });
  } catch (err) {
    console.error("Append dummy row images error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Replace specific image by index for a row
router.put("/:vendorId/rows/:nodeId/images/:index", upload.single("image"), async (req, res) => {
  try {
    const { vendorId, nodeId, index } = req.params;
    const idxNum = Number(index);
    const vendor = await DummyVendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });
    const arr = Array.isArray(vendor.rowImages?.[nodeId]) ? vendor.rowImages[nodeId] : [];
    if (!req.file) return res.status(400).json({ message: "image file required" });
    if (idxNum < 0 || idxNum >= arr.length) return res.status(400).json({ message: "Invalid index" });
    arr[idxNum] = `/uploads/${req.file.filename}`;
    vendor.rowImages = { ...(vendor.rowImages || {}), [nodeId]: arr };
    vendor.markModified('rowImages');
    await vendor.save();
    res.json({ success: true, images: vendor.rowImages[nodeId] });
  } catch (err) {
    console.error("Replace dummy row image error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Delete image by index for a row
router.delete("/:vendorId/rows/:nodeId/images/:index", async (req, res) => {
  try {
    const { vendorId, nodeId, index } = req.params;
    const idxNum = Number(index);
    const vendor = await DummyVendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });
    const arr = Array.isArray(vendor.rowImages?.[nodeId]) ? vendor.rowImages[nodeId] : [];
    if (idxNum < 0 || idxNum >= arr.length) return res.status(400).json({ message: "Invalid index" });
    arr.splice(idxNum, 1);
    vendor.rowImages = { ...(vendor.rowImages || {}), [nodeId]: arr };
    vendor.markModified('rowImages');
    await vendor.save();
    res.json({ success: true, images: vendor.rowImages[nodeId] });
  } catch (err) {
    console.error("Delete dummy row image error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Get all images for a non-inventory row (category node)
router.get("/:vendorId/rows/:nodeId/images", async (req, res) => {
  try {
    const { vendorId, nodeId } = req.params;
    const vendor = await DummyVendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });
    const arr = Array.isArray(vendor.rowImages?.[nodeId]) ? vendor.rowImages[nodeId] : [];
    res.json({ success: true, images: arr });
  } catch (err) {
    console.error("Get dummy row images error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

/** Inventory entry images (per item in dummy vendor inventorySelections[categoryId]) **/
// Append up to 5 images for a given inventory entry (key can be _id or at)
router.post("/:vendorId/inventory/:categoryId/:entryKey/images", upload.array("images", 5), async (req, res) => {
  try {
    const { vendorId, categoryId, entryKey } = req.params;
    const vendor = await DummyVendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });
    const list = Array.isArray(vendor.inventorySelections?.[categoryId]) ? vendor.inventorySelections[categoryId] : [];
    const idx = list.findIndex((it) => String(it._id || it.at) === String(entryKey));
    if (idx < 0) return res.status(404).json({ message: "Inventory entry not found" });
    const urls = (req.files || []).map((f) => `/uploads/${f.filename}`);
    const current = Array.isArray(list[idx].images) ? list[idx].images : [];
    list[idx].images = [...current, ...urls].slice(0, 5);
    vendor.markModified('inventorySelections');
    await vendor.save();
    res.json({ success: true, images: list[idx].images });
  } catch (err) {
    console.error("Append dummy inventory images error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Replace specific image by index for an inventory entry
router.put("/:vendorId/inventory/:categoryId/:entryKey/images/:index", upload.single("image"), async (req, res) => {
  try {
    const { vendorId, categoryId, entryKey, index } = req.params;
    const idxNum = Number(index);
    const vendor = await DummyVendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });
    const list = Array.isArray(vendor.inventorySelections?.[categoryId]) ? vendor.inventorySelections[categoryId] : [];
    const i = list.findIndex((it) => String(it._id || it.at) === String(entryKey));
    if (i < 0) return res.status(404).json({ message: "Inventory entry not found" });
    if (!req.file) return res.status(400).json({ message: "image file required" });
    const arr = Array.isArray(list[i].images) ? list[i].images : [];
    if (idxNum < 0 || idxNum >= arr.length) return res.status(400).json({ message: "Invalid index" });
    arr[idxNum] = `/uploads/${req.file.filename}`;
    list[i].images = arr;
    vendor.markModified('inventorySelections');
    await vendor.save();
    res.json({ success: true, images: list[i].images });
  } catch (err) {
    console.error("Replace dummy inventory image error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Delete image by index for an inventory entry
router.delete("/:vendorId/inventory/:categoryId/:entryKey/images/:index", async (req, res) => {
  try {
    const { vendorId, categoryId, entryKey, index } = req.params;
    const idxNum = Number(index);
    const vendor = await DummyVendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });
    const list = Array.isArray(vendor.inventorySelections?.[categoryId]) ? vendor.inventorySelections[categoryId] : [];
    const i = list.findIndex((it) => String(it._id || it.at) === String(entryKey));
    if (i < 0) return res.status(404).json({ message: "Inventory entry not found" });
    const arr = Array.isArray(list[i].images) ? list[i].images : [];
    if (idxNum < 0 || idxNum >= arr.length) return res.status(400).json({ message: "Invalid index" });
    arr.splice(idxNum, 1);
    list[i].images = arr;
    vendor.markModified('inventorySelections');
    await vendor.save();
    res.json({ success: true, images: list[i].images });
  } catch (err) {
    console.error("Delete dummy inventory image error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Get all images for an inventory entry
router.get("/:vendorId/inventory/:categoryId/:entryKey/images", async (req, res) => {
  try {
    const { vendorId, categoryId, entryKey } = req.params;
    const vendor = await DummyVendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });
    const list = Array.isArray(vendor.inventorySelections?.[categoryId]) ? vendor.inventorySelections[categoryId] : [];
    const idx = list.findIndex((it) => String(it._id || it.at) === String(entryKey));
    if (idx < 0) return res.status(404).json({ message: "Inventory entry not found" });
    const arr = Array.isArray(list[idx].images) ? list[idx].images : [];
    res.json({ success: true, images: arr });
  } catch (err) {
    console.error("Get dummy inventory images error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Create dummy vendor
router.post("/", async (req, res) => {
  try {
    const { customerId, phone, businessName, contactName, categoryId } = req.body;
    if (!customerId || !phone || !businessName || !contactName || !categoryId) {
      return res.status(400).json({ message: "customerId, phone, businessName, contactName, categoryId are required" });
    }

    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return res.status(400).json({ message: "Invalid categoryId" });
    }

    const cat = await DummyCategory.findById(categoryId).lean();
    if (!cat) return res.status(404).json({ message: "Dummy category not found" });

    const vendor = await DummyVendor.create({
      customerId,
      phone,
      businessName,
      contactName,
      categoryId,
    });

    res.status(201).json(vendor);
  } catch (err) {
    console.error("POST /dummy-vendors error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET single dummy vendor
router.get("/:vendorId", async (req, res) => {
  try {
    const { vendorId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({ message: "Invalid vendorId" });
    }
    const v = await DummyVendor.findById(vendorId).lean();
    if (!v) return res.status(404).json({ message: "Vendor not found" });
    return res.json(v);
  } catch (err) {
    console.error("GET /dummy-vendors/:vendorId error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// PUT update dummy vendor (supports inventorySelections merge)
router.put("/:vendorId", async (req, res) => {
  try {
    const { vendorId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({ message: "Invalid vendorId" });
    }

    const update = { ...req.body };

    // Merge inventorySelections if provided as object
    if (update && typeof update.inventorySelections === 'object' && update.inventorySelections !== null) {
      const vdoc = await DummyVendor.findById(vendorId);
      if (!vdoc) return res.status(404).json({ message: "Vendor not found" });
      const existing = (vdoc.inventorySelections && typeof vdoc.inventorySelections === 'object') ? vdoc.inventorySelections : {};
      vdoc.inventorySelections = { ...existing, ...update.inventorySelections };
      // Allow updating a few other simple fields too
      ["businessName","contactName","phone","status","location","businessHours","profilePictures","rowImages"].forEach((k) => {
        if (update[k] !== undefined) vdoc[k] = update[k];
      });
      await vdoc.save();
      return res.json(vdoc.toObject());
    }

    const v = await DummyVendor.findByIdAndUpdate(
      vendorId,
      { $set: update },
      { new: true }
    ).lean();
    if (!v) return res.status(404).json({ message: "Vendor not found" });
    return res.json(v);
  } catch (err) {
    console.error("PUT /dummy-vendors/:vendorId error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET all dummy vendors
router.get("/", async (req, res) => {
  try {
    const vendors = await DummyVendor.find()
      .populate("customerId", "fullNumber phone")
      .populate("categoryId", "name price imageUrl")
      .lean();
    res.json(vendors);
  } catch (err) {
    console.error("GET /dummy-vendors error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Category-level vendor counts (total and by status)
// GET /api/dummy-vendors/categories/counts?categoryId=<id>
router.get("/categories/counts", async (req, res) => {
  try {
    const { categoryId } = req.query;
    const match = {};
    if (categoryId) match.categoryId = new mongoose.Types.ObjectId(categoryId);

    const totalAgg = await DummyVendor.aggregate([
      { $match: match },
      { $group: { _id: "$categoryId", total: { $sum: 1 } } },
    ]);

    const statusAgg = await DummyVendor.aggregate([
      { $match: match },
      { $group: { _id: { categoryId: "$categoryId", status: "$status" }, count: { $sum: 1 } } },
    ]);

    const totals = new Map(totalAgg.map((d) => [String(d._id), d.total]));
    const statusMap = new Map();
    statusAgg.forEach((d) => {
      const catId = String(d._id.categoryId);
      const st = d._id.status || "Waiting for Approval";
      if (!statusMap.has(catId)) statusMap.set(catId, {});
      statusMap.get(catId)[st] = d.count;
    });

    const cats = await DummyCategory.find(categoryId ? { _id: categoryId } : {}).lean();
    const result = cats.map((c) => ({
      categoryId: c._id,
      name: c.name,
      imageUrl: c.imageUrl,
      totalVendors: totals.get(String(c._id)) || 0,
      statusCounts: statusMap.get(String(c._id)) || {},
    }));

    res.json(result);
  } catch (err) {
    console.error("GET /dummy-vendors/categories/counts error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Vendors by category and optional status
// GET /api/dummy-vendors/byCategory/:categoryId?status=Accepted
router.get("/byCategory/:categoryId", async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { status } = req.query;
    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return res.status(400).json({ message: "Invalid categoryId" });
    }

    const match = { categoryId: new mongoose.Types.ObjectId(categoryId) };
    if (status) match.status = new RegExp(`^${status}$`, "i");

    const vendors = await DummyVendor.find(match)
      .populate("customerId", "fullNumber phone")
      .populate("categoryId", "name price")
      .lean();

    res.json(vendors);
  } catch (err) {
    console.error("GET /dummy-vendors/byCategory error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Build dummy category tree for a vendor starting at their top-level DummyCategory
async function buildDummyTreeForVendor(rootCategoryId) {
  // Load all subcategories for this top-level category
  const allSubs = await DummySubcategory.find({ category: rootCategoryId })
    .sort({ sequence: 1, createdAt: -1 })
    .lean();

  const byParent = new Map(); // parentSubcategory (or null) -> array of subs
  allSubs.forEach((s) => {
    const key = s.parentSubcategory ? String(s.parentSubcategory) : "root";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(s);
  });

  const attach = (nodeId) => {
    const children = (byParent.get(String(nodeId)) || []).map((c) => ({
      id: c._id,
      _id: c._id,
      name: c.name,
      price: c.price,
      imageUrl: c.imageUrl || null,
      terms: c.terms || "",
      children: attach(c._id),
    }));
    return children;
  };

  const rootCat = await DummyCategory.findById(rootCategoryId).lean();
  if (!rootCat) return null;

  const topLevelChildren = (byParent.get("root") || []).map((c) => ({
    id: c._id,
    _id: c._id,
    name: c.name,
    price: c.price,
    imageUrl: c.imageUrl || null,
    terms: c.terms || "",
    children: attach(c._id),
  }));

  return {
    id: rootCat._id,
    _id: rootCat._id,
    name: rootCat.name,
    price: rootCat.price,
    imageUrl: rootCat.imageUrl || null,
    terms: rootCat.terms || "",
    children: topLevelChildren,
  };
}

// GET vendor's dummy category tree
// GET /api/dummy-vendors/:vendorId/categories
router.get("/:vendorId/categories", async (req, res) => {
  try {
    const { vendorId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({ message: "Invalid vendorId" });
    }

    const vendor = await DummyVendor.findById(vendorId).lean();
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });

    const tree = await buildDummyTreeForVendor(vendor.categoryId);

    res.json({
      vendor: {
        id: vendor._id,
        contactName: vendor.contactName,
        businessName: vendor.businessName,
        phone: vendor.phone,
        location: vendor.location || null,
      },
      categories: tree,
    });
  } catch (err) {
    console.error("GET /dummy-vendors/:vendorId/categories error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET dummy vendor's location
 * GET /api/dummy-vendors/:vendorId/location
 */
router.get("/:vendorId/location", async (req, res) => {
  try {
    const { vendorId } = req.params;
    const v = await DummyVendor.findById(vendorId).lean();
    if (!v) return res.status(404).json({ success: false, message: "Vendor not found" });
    return res.json({ success: true, location: v.location || {} });
  } catch (err) {
    console.error("GET /dummy-vendors/:vendorId/location error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * PUT dummy vendor's location
 * PUT /api/dummy-vendors/:vendorId/location
 */
router.put("/:vendorId/location", async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { lat, lng, address = "", nearbyLocations } = req.body;
    const update = { location: { lat, lng, address } };
    if (Array.isArray(nearbyLocations)) {
      update.location.nearbyLocations = nearbyLocations;
    }
    const v = await DummyVendor.findByIdAndUpdate(
      vendorId,
      { $set: update },
      { new: true }
    ).lean();
    if (!v) return res.status(404).json({ success: false, message: "Vendor not found" });
    return res.json({ success: true, location: v.location || {} });
  } catch (err) {
    console.error("PUT /dummy-vendors/:vendorId/location error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * GET dummy vendor business hours
 * GET /api/dummy-vendors/:vendorId/business-hours
 */
router.get("/:vendorId/business-hours", async (req, res) => {
  try {
    const { vendorId } = req.params;
    const v = await DummyVendor.findById(vendorId).lean();
    if (!v) return res.status(404).json({ success: false, message: "Vendor not found" });
    return res.json({ success: true, businessHours: Array.isArray(v.businessHours) ? v.businessHours : [] });
  } catch (err) {
    console.error("GET /dummy-vendors/:vendorId/business-hours error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * PUT dummy vendor business hours
 * PUT /api/dummy-vendors/:vendorId/business-hours
 * Body: { businessHours: [{ day, hours }, ...] }
 */
router.put("/:vendorId/business-hours", async (req, res) => {
  try {
    const { vendorId } = req.params;
    const list = Array.isArray(req.body?.businessHours) ? req.body.businessHours : [];
    const cleaned = list
      .filter((x) => x && x.day && x.hours)
      .map((x) => ({ day: String(x.day), hours: String(x.hours) }));
    const v = await DummyVendor.findByIdAndUpdate(
      vendorId,
      { $set: { businessHours: cleaned } },
      { new: true }
    ).lean();
    if (!v) return res.status(404).json({ success: false, message: "Vendor not found" });
    return res.json({ success: true, businessHours: v.businessHours || [] });
  } catch (err) {
    console.error("PUT /dummy-vendors/:vendorId/business-hours error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * Profile pictures (JSON-based management)
 */
router.get("/:vendorId/profile-pictures", async (req, res) => {
  try {
    const v = await DummyVendor.findById(req.params.vendorId).lean();
    if (!v) return res.status(404).json({ success: false, message: "Vendor not found" });
    return res.json({ success: true, profilePictures: Array.isArray(v.profilePictures) ? v.profilePictures : [] });
  } catch (err) {
    console.error("GET /dummy-vendors/:vendorId/profile-pictures error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.put("/:vendorId/profile-pictures", async (req, res) => {
  try {
    const list = Array.isArray(req.body?.profilePictures) ? req.body.profilePictures : [];
    const pics = list.map((x) => String(x || "")).filter((s) => s.trim() !== "");
    const v = await DummyVendor.findByIdAndUpdate(
      req.params.vendorId,
      { $set: { profilePictures: pics } },
      { new: true }
    ).lean();
    if (!v) return res.status(404).json({ success: false, message: "Vendor not found" });
    return res.json({ success: true, profilePictures: v.profilePictures || [] });
  } catch (err) {
    console.error("PUT /dummy-vendors/:vendorId/profile-pictures error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.put("/:vendorId/profile-pictures/:index", async (req, res) => {
  try {
    const idx = Number(req.params.index);
    if (!Number.isInteger(idx) || idx < 0) return res.status(400).json({ success: false, message: "Invalid index" });
    const url = String(req.body?.url || "").trim();
    if (!url) return res.status(400).json({ success: false, message: "url required" });
    const vdoc = await DummyVendor.findById(req.params.vendorId);
    if (!vdoc) return res.status(404).json({ success: false, message: "Vendor not found" });
    const arr = Array.isArray(vdoc.profilePictures) ? vdoc.profilePictures : [];
    while (arr.length <= idx) arr.push("");
    arr[idx] = url;
    vdoc.profilePictures = arr.filter((s) => String(s || "").trim() !== "");
    await vdoc.save();
    return res.json({ success: true, profilePictures: vdoc.profilePictures });
  } catch (err) {
    console.error("PUT /dummy-vendors/:vendorId/profile-pictures/:index error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.delete("/:vendorId/profile-pictures/:index", async (req, res) => {
  try {
    const idx = Number(req.params.index);
    if (!Number.isInteger(idx) || idx < 0) return res.status(400).json({ success: false, message: "Invalid index" });
    const vdoc = await DummyVendor.findById(req.params.vendorId);
    if (!vdoc) return res.status(404).json({ success: false, message: "Vendor not found" });
    const arr = Array.isArray(vdoc.profilePictures) ? vdoc.profilePictures : [];
    if (idx >= arr.length) return res.json({ success: true, profilePictures: arr });
    arr.splice(idx, 1);
    vdoc.profilePictures = arr;
    await vdoc.save();
    return res.json({ success: true, profilePictures: vdoc.profilePictures });
  } catch (err) {
    console.error("DELETE /dummy-vendors/:vendorId/profile-pictures/:index error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
