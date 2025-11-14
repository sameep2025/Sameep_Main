const express = require("express");

const mongoose = require("mongoose");
const Vendor = require("../models/Vendor");
const VendorPrice = require("../models/VendorPricing");
const Category = require("../models/Category");
const VendorCategoryPrice = require("../models/VendorCategoryPrice");
const Customer = require("../models/Customer"); // 
const getCategoryModel = require("../utils/getCategoryModel");
const VendorLocation = require("../models/VendorLocation");

const router = express.Router();
const multer = require("multer");
const path = require("path");
const { uploadBufferToS3, uploadBufferToS3WithLabel, deleteS3ObjectByUrl } = require("../utils/s3Upload");
const { v4: uuidv4 } = require("uuid");

// Multer setup for vendor images (memory -> S3)
const upload = multer({ storage: multer.memoryStorage() });

// Helpers to build hierarchical S3 paths
function extractHierarchyOptions(req) {
  const b = req.body || {};
  const q = req.query || {};
  const out = {};
  if (b.hierarchy != null || q.hierarchy != null) out.hierarchy = b.hierarchy ?? q.hierarchy;
  if (b.path) out.path = b.path;
  if (b.folderPath) out.folderPath = b.folderPath;
  if (b.segments) {
    try { out.segments = Array.isArray(b.segments) ? b.segments : JSON.parse(b.segments); } catch { /* ignore */ }
  }
  if (!out.segments && q.segments) {
    try { out.segments = Array.isArray(q.segments) ? q.segments : JSON.parse(q.segments); } catch { /* ignore */ }
  }
  if (b.labelName) out.labelName = b.labelName;
  const levels = [];
  for (let i = 1; i <= 5; i++) {
    const v = b[`level${i}`] ?? q[`level${i}`];
    if (v) levels.push(String(v));
  }
  if (levels.length) out.levels = levels;
  return out;
}

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
  } catch { return []; }
}

async function getTopCategoryNameById(categoryId) {
  try {
    const cat = await Category.findById(categoryId, "name").lean();
    return cat?.name || null;
  } catch { return null; }
}

function getVendorDisplayName(vendor) {
  return (
    vendor?.name || vendor?.contactName || vendor?.businessName || "Vendor"
  );
}

async function buildVendorPrefixedSegments(vendor, categoryIdOrSegments, kind) {
  // kind: 'images' | 'profile pictures'
  const vendorName = getVendorDisplayName(vendor);
  let topCategoryName = null;
  if (vendor?.categoryId) {
    topCategoryName = await getTopCategoryNameById(vendor.categoryId);
  }
  if (!topCategoryName && typeof categoryIdOrSegments === 'string') {
    topCategoryName = await getTopCategoryNameById(categoryIdOrSegments);
  }
  const prefix = topCategoryName ? `${vendorName} - ${topCategoryName}` : vendorName;
  let segs = Array.isArray(categoryIdOrSegments) ? categoryIdOrSegments : [];
  if (!Array.isArray(categoryIdOrSegments) && typeof categoryIdOrSegments !== 'string') {
    segs = [];
  }
  if (kind === 'profile pictures') {
    return [prefix, 'profile pictures'];
  }
  return [prefix, 'images', ...segs];
}

/** Inventory entry images (per item in vendor.inventorySelections[categoryId]) **/
// Append up to 5 images for a given inventory entry (key can be _id or at)
router.post(
  "/:vendorId/inventory/:categoryId/:entryKey/images",
  upload.array("images", 5),
  async (req, res) => {
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
          // optional extra levels from request for inventory label hierarchy
          const extra = [];
          for (let i=1;i<=5;i++){ if (req.body?.[`level${i}`]) extra.push(String(req.body[`level${i}`])); }
          let merged = segs;
          if (extra.length) merged = [...segs, ...extra];
          const finalSegs = await buildVendorPrefixedSegments(vendor, segs, 'images');
          const { url } = await uploadBufferToS3WithLabel(f.buffer, f.mimetype, "vendor", uuidv4(), { segments: extra.length ? [...finalSegs.slice(0,2), ...merged] : finalSegs });
          urls.push(url);
        } catch (e) {
          return res.status(500).json({ message: "Failed to upload image to S3", error: e.message });
        }
      }
    }
    const current = Array.isArray(list[idx].images) ? list[idx].images : [];
    list[idx].images = [...current, ...urls].slice(0, 5);
    vendor.markModified('inventorySelections');
    await vendor.save();
    res.json({ success: true, images: list[idx].images });
  } catch (err) {
    console.error("Append inventory images error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Replace specific image by index for an inventory entry
router.put(
  "/:vendorId/inventory/:categoryId/:entryKey/images/:index",
  upload.single("image"),
  async (req, res) => {
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
      for (let i=1;i<=5;i++){ if (req.body?.[`level${i}`]) extra.push(String(req.body[`level${i}`])); }
      let merged = segs;
      if (extra.length) merged = [...segs, ...extra];
      const finalSegs = await buildVendorPrefixedSegments(vendor, segs, 'images');
      const { url } = await uploadBufferToS3WithLabel(req.file.buffer, req.file.mimetype, "vendor", uuidv4(), { segments: extra.length ? [...finalSegs.slice(0,2), ...merged] : finalSegs });
      arr[idxNum] = url;
      if (oldUrl) { try { await deleteS3ObjectByUrl(oldUrl); } catch {} }
    } catch (e) {
      return res.status(500).json({ message: "Failed to upload image to S3", error: e.message });
    }
    list[i].images = arr;
    vendor.markModified('inventorySelections');
    await vendor.save();
    res.json({ success: true, images: list[i].images });
  } catch (err) {
    console.error("Replace inventory image error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Delete image by index for an inventory entry
router.delete("/:vendorId/inventory/:categoryId/:entryKey/images/:index", async (req, res) => {
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
    if (removed) { try { await deleteS3ObjectByUrl(removed); } catch {} }
    list[i].images = arr;
    vendor.markModified('inventorySelections');
    await vendor.save();
    res.json({ success: true, images: list[i].images });
  } catch (err) {
    console.error("Delete inventory image error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Get all images for an inventory entry
router.get("/:vendorId/inventory/:categoryId/:entryKey/images", async (req, res) => {
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
    console.error("Get inventory images error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

/** Non-inventory row images per category node **/
// Append up to 5 images for a category leaf node (row)
router.post(
  "/:vendorId/rows/:nodeId/images",
  upload.array("images", 5),
  async (req, res) => {
  try {
    const { vendorId, nodeId } = req.params;
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });
    const files = Array.isArray(req.files) ? req.files : [];
    const urls = [];
    for (const f of files) {
      if (f && f.buffer && f.mimetype) {
        try {
          const segs = await getCategoryPathSegments(nodeId);
          const extra = [];
          for (let i=1;i<=5;i++){ if (req.body?.[`level${i}`]) extra.push(String(req.body[`level${i}`])); }
          let merged = segs;
          if (extra.length) merged = [...segs, ...extra];
          const finalSegs = await buildVendorPrefixedSegments(vendor, segs, 'images');
          const { url } = await uploadBufferToS3(f.buffer, f.mimetype, "vendor", { segments: extra.length ? [...finalSegs.slice(0,2), ...merged] : finalSegs });
          urls.push(url);
        } catch (e) {
          return res.status(500).json({ message: "Failed to upload image to S3", error: e.message });
        }
      }
    }
    const current = Array.isArray(vendor.rowImages?.[nodeId]) ? vendor.rowImages[nodeId] : [];
    const next = [...current, ...urls].slice(0, 5);
    vendor.rowImages = { ...(vendor.rowImages || {}), [nodeId]: next };
    vendor.markModified('rowImages');
    await vendor.save();
    res.json({ success: true, images: vendor.rowImages[nodeId] });
  } catch (err) {
    console.error("Append row images error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Replace specific image by index for a row
router.put(
  "/:vendorId/rows/:nodeId/images/:index",
  upload.single("image"),
  async (req, res) => {
  try {
    const { vendorId, nodeId, index } = req.params;
    const idxNum = Number(index);
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });
    const arr = Array.isArray(vendor.rowImages?.[nodeId]) ? vendor.rowImages[nodeId] : [];
    if (!req.file) return res.status(400).json({ message: "image file required" });
    if (idxNum < 0 || idxNum >= arr.length) return res.status(400).json({ message: "Invalid index" });
    try {
      const oldUrl = arr[idxNum];
      const segs = await getCategoryPathSegments(nodeId);
      const extra = [];
      for (let i=1;i<=5;i++){ if (req.body?.[`level${i}`]) extra.push(String(req.body[`level${i}`])); }
      let merged = segs;
      if (extra.length) merged = [...segs, ...extra];
      const finalSegs = await buildVendorPrefixedSegments(vendor, segs, 'images');
      const { url } = await uploadBufferToS3(req.file.buffer, req.file.mimetype, "vendor", { segments: extra.length ? [...finalSegs.slice(0,2), ...merged] : finalSegs });
      arr[idxNum] = url;
      if (oldUrl) { try { await deleteS3ObjectByUrl(oldUrl); } catch {} }
    } catch (e) {
      return res.status(500).json({ message: "Failed to upload image to S3", error: e.message });
    }
    vendor.rowImages = { ...(vendor.rowImages || {}), [nodeId]: arr };
    vendor.markModified('rowImages');
    await vendor.save();
    res.json({ success: true, images: vendor.rowImages[nodeId] });
  } catch (err) {
    console.error("Replace row image error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
})
;

// Delete image by index for a row
router.delete("/:vendorId/rows/:nodeId/images/:index", async (req, res) => {
  try {
    const { vendorId, nodeId, index } = req.params;
    const idxNum = Number(index);
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });
    const arr = Array.isArray(vendor.rowImages?.[nodeId]) ? vendor.rowImages[nodeId] : [];
    if (idxNum < 0 || idxNum >= arr.length) return res.status(400).json({ message: "Invalid index" });
    const removed = arr.splice(idxNum, 1)[0];
    if (removed) { try { await deleteS3ObjectByUrl(removed); } catch {} }
    vendor.rowImages = { ...(vendor.rowImages || {}), [nodeId]: arr };
    vendor.markModified('rowImages');
    await vendor.save();
    res.json({ success: true, images: vendor.rowImages[nodeId] });
  } catch (err) {
    console.error("Delete row image error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Get all images for a non-inventory row (category node)
router.get("/:vendorId/rows/:nodeId/images", async (req, res) => {
  try {
    const { vendorId, nodeId } = req.params;
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });
    const arr = Array.isArray(vendor.rowImages?.[nodeId]) ? vendor.rowImages[nodeId] : [];
    res.json({ success: true, images: arr });
  } catch (err) {
    console.error("Get row images error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

/**
 * PUT /api/vendors/:vendorId/profile-pictures/:index
 * Replace a specific image at index
 */
router.put(
  "/:vendorId/profile-pictures/:index",
  upload.single("image"),
  async (req, res) => {
  try {
    const { vendorId, index } = req.params;
    const idx = Number(index);
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });
    if (!req.file) return res.status(400).json({ message: "image file required" });
    const arr = Array.isArray(vendor.profilePictures) ? vendor.profilePictures : [];
    if (idx < 0 || idx >= arr.length) return res.status(400).json({ message: "Invalid index" });
    try {
      const oldUrl = arr[idx];
      const finalSegs = await buildVendorPrefixedSegments(vendor, null, 'profile pictures');
      const { url } = await uploadBufferToS3WithLabel(req.file.buffer, req.file.mimetype, "vendor", uuidv4(), { segments: finalSegs });
      arr[idx] = url;
      if (oldUrl) { try { await deleteS3ObjectByUrl(oldUrl); } catch {} }
    } catch (e) {
      return res.status(500).json({ message: "Failed to upload image to S3", error: e.message });
    }
    vendor.profilePictures = arr;
    await vendor.save();
    res.json({ success: true, profilePictures: vendor.profilePictures });
  } catch (err) {
    console.error("Replace profile picture error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

/**
 * DELETE /api/vendors/:vendorId/profile-pictures/:index
 * Remove image at index
 */
router.delete("/:vendorId/profile-pictures/:index", async (req, res) => {
  try {
    const { vendorId, index } = req.params;
    const idx = Number(index);
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });
    const arr = Array.isArray(vendor.profilePictures) ? vendor.profilePictures : [];
    if (idx < 0 || idx >= arr.length) return res.status(400).json({ message: "Invalid index" });
    const removed = arr.splice(idx, 1)[0];
    if (removed) { try { await deleteS3ObjectByUrl(removed); } catch {} }
    vendor.profilePictures = arr;
    await vendor.save();
    res.json({ success: true, profilePictures: vendor.profilePictures });
  } catch (err) {
    console.error("Delete profile picture error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// PUT /api/vendors/:vendorId/inventory-selections
router.put("/:vendorId/inventory-selections", async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { categoryId, items } = req.body;
    if (!vendorId || !categoryId || !Array.isArray(items)) {
      return res.status(400).json({ message: "vendorId, categoryId and items[] are required" });
    }
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });

    // Ensure inventorySelections is an object
    if (!vendor.inventorySelections || typeof vendor.inventorySelections !== 'object') vendor.inventorySelections = {};
    const existingList = Array.isArray(vendor.inventorySelections[String(categoryId)]) ? vendor.inventorySelections[String(categoryId)] : [];
    const findExisting = (candidate) => {
      try {
        const key = String(candidate?._id || candidate?.at || "");
        if (!key) return null;
        return existingList.find((e) => String(e?._id || e?.at) === key) || null;
      } catch { return null; }
    };
    vendor.inventorySelections[String(categoryId)] = items.map((it, idx) => {
      const baseAt = Number(it.at) || Date.now();
      const safeAt = baseAt + idx; // ensure uniqueness within batch
      // Normalize pricesByRow map: keep only primitive number or null
      const pbrIn = it.pricesByRow && typeof it.pricesByRow === 'object' ? it.pricesByRow : null;
      const pricesByRow = pbrIn ? Object.fromEntries(Object.entries(pbrIn).map(([k, v]) => [String(k), (v === null || v === '' || v === undefined) ? null : Number(v)])) : undefined;
      const prev = findExisting(it);
      const preservedImages = Array.isArray(prev?.images) ? prev.images : [];
      const providedImages = Array.isArray(it.images) ? it.images.slice(0, 5) : null;
      return {
        at: safeAt,
        categoryId: String(categoryId),
        selections: it.selections && typeof it.selections === 'object' ? it.selections : {},
        // Preserve optional scope metadata so client can filter per inventory label
        scopeFamily: typeof it.scopeFamily === 'string' ? it.scopeFamily : (it.scopeFamily == null ? null : String(it.scopeFamily)),
        scopeLabel: typeof it.scopeLabel === 'string' ? it.scopeLabel : (it.scopeLabel == null ? null : String(it.scopeLabel)),
        // Optional per-selection price override (global fallback)
        price: (it.price === null || it.price === undefined || it.price === '') ? null : Number(it.price),
        // Optional per-row price overrides
        ...(pricesByRow ? { pricesByRow } : {}),
        // Preserve images if not explicitly provided
        ...(providedImages ? { images: providedImages } : (preservedImages.length ? { images: preservedImages } : {})),
      };
    });

    vendor.markModified('inventorySelections');
    await vendor.save();
    res.json({ success: true, inventorySelections: vendor.inventorySelections[String(categoryId)] });
  } catch (err) {
    console.error("PUT /inventory-selections error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

/**
 * Middleware: Log every API call in this router
 */
router.use((req, res, next) => {
  const start = Date.now();
  console.log(`[API START] ${req.method} ${req.originalUrl}`);

  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(
      `[API END] ${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms)`
    );
  });

  next();
});

/**
 * Build category tree safely (recursive)
 */
async function buildVendorPreviewTree(categoryId, vendorId) {
  const category = await Category.findById(categoryId).lean();
  if (!category) return null;

  // Fetch vendor-specific price from correct collection
  const priceDoc = await VendorPrice.findOne({ vendorId, categoryId }).lean();
  const price = priceDoc?.price ?? category.price;


  // Find children recursively
  const childrenCats = await Category.find({ parent: categoryId })
    .sort({ sequence: 1, createdAt: -1 })
    .lean();

  const children = [];
  for (const child of childrenCats) {
    const childTree = await buildVendorPreviewTree(child._id, vendorId);
    if (childTree) children.push(childTree);
  }

  return {
    id: category._id,
    name: category.name,
    price,
    imageUrl: category.imageUrl,
    children,
  };
}



 
/**
 * GET all vendors
 */
router.get("/", async (req, res) => {
  try {
    const vendors = await Vendor.find().lean();

    const safeVendors = await Promise.all(
      vendors.map(async (v) => {
        let customer = null;
        let category = null;

        try {
          if (v.customerId) {
            customer = await Customer.findById(v.customerId, "fullNumber phone").lean();
          }
        } catch {}
        try {
          if (v.categoryId) {
            category = await Category.findById(v.categoryId, "name price").lean();
          }
        } catch {}

        return {
          ...v,
          customerId: customer || null,
          categoryId: category || null,
        };
      })
    );

    res.json(safeVendors);
  } catch (err) {
    console.error("Error fetching vendors:", err);
    res.status(500).json({ message: "Failed to fetch vendors" });
  }
});

/**
 * Category-level vendor counts (total and by status)
 * GET /api/vendors/categories/counts
 * Optional: ?categoryId=<id>
 */
router.get("/categories/counts", async (req, res) => {
  try {
    const { categoryId } = req.query;
    const match = {};
    if (categoryId) match.categoryId = new mongoose.Types.ObjectId(categoryId);

    const totalAgg = await Vendor.aggregate([
      { $match: match },
      { $group: { _id: "$categoryId", total: { $sum: 1 } } },
    ]);

    const statusAgg = await Vendor.aggregate([
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

    const cats = await Category.find(categoryId ? { _id: categoryId } : { parent: null }).lean();
    const result = cats.map((c) => ({
      categoryId: c._id,
      name: c.name,
      imageUrl: c.imageUrl,
      totalVendors: totals.get(String(c._id)) || 0,
      statusCounts: statusMap.get(String(c._id)) || {},
    }));

    res.json(result);
  } catch (err) {
    console.error("GET /vendors/categories/counts error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * Vendors by category and status
 * GET /api/vendors/byCategory/:categoryId?status=Accepted
 */


// GET vendors by category and status
router.get("/byCategory/:categoryId", async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { status } = req.query;

    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return res.status(400).json({ message: "Invalid categoryId" });
    }

    // Match vendors for this categoryId
    const match = { categoryId: new mongoose.Types.ObjectId(categoryId) };

    // Optional: filter by status
    if (status) {
      match.status = new RegExp(`^${status}$`, "i");
    }

    const vendors = await Vendor.find(match)
      .populate("customerId", "fullNumber phone")
      .populate("categoryId", "name price")
      .lean();

    res.json(vendors);
  } catch (err) {
    console.error("GET /vendors/byCategory error:", err);
    res.status(500).json({ message: "Server error" });
  }
});






/**
 * GET single vendor
 */
router.get("/:id", async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id)
      .populate("customerId", "fullNumber phone")
      .populate("categoryId", "name price");

    if (!vendor) return res.status(404).json({ message: "Vendor not found" });

    // Fetch location from VendorLocation collection
    const location = await VendorLocation.findOne({ vendorId: req.params.id }).lean();

    // Include location in response
    res.json({
      ...vendor.toObject(),
      location: location || null,
      profilePictures: vendor.profilePictures || [],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch vendor" });
  }
});

/**
 * GET /api/vendors/:vendorId/custom-fields
 * Returns { freeText1, freeText2 }
 */
router.get("/:vendorId/custom-fields", async (req, res) => {
  try {
    const v = await Vendor.findById(req.params.vendorId).lean();
    if (!v) return res.status(404).json({ message: "Vendor not found" });
    const cf = (v.customFields && typeof v.customFields === 'object') ? v.customFields : {};
    return res.json({
      freeText1: typeof cf.freeText1 === 'string' ? cf.freeText1 : "",
      freeText2: typeof cf.freeText2 === 'string' ? cf.freeText2 : "",
    });
  } catch (err) {
    console.error("GET /vendors/:vendorId/custom-fields error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * PUT /api/vendors/:vendorId/custom-fields
 * Body: { freeText1, freeText2 }
 */
router.put("/:vendorId/custom-fields", async (req, res) => {
  try {
    const { vendorId } = req.params;
    const freeText1 = typeof req.body?.freeText1 === 'string' ? req.body.freeText1 : '';
    const freeText2 = typeof req.body?.freeText2 === 'string' ? req.body.freeText2 : '';
    const v = await Vendor.findById(vendorId);
    if (!v) return res.status(404).json({ message: "Vendor not found" });
    v.customFields = { ...(v.customFields || {}), freeText1, freeText2 };
    await v.save();
    return res.json({ success: true, customFields: v.customFields });
  } catch (err) {
    console.error("PUT /vendors/:vendorId/custom-fields error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/vendors/:vendorId/profile-pictures
 * Upload up to 5 images for vendor profile pictures
 * Field name: images
 */
router.post(
  "/:vendorId/profile-pictures",
  upload.array("images", 5),
  async (req, res) => {
  try {
    const { vendorId } = req.params;
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });

    const files = Array.isArray(req.files) ? req.files : [];
    const urls = [];
    for (const f of files) {
      if (f && f.buffer && f.mimetype) {
        try {
          const finalSegs = await buildVendorPrefixedSegments(vendor, null, 'profile pictures');
          const { url } = await uploadBufferToS3WithLabel(f.buffer, f.mimetype, "vendor", uuidv4(), { segments: finalSegs });
          urls.push(url);
        } catch (e) {
          return res.status(500).json({ message: "Failed to upload image to S3", error: e.message });
        }
      }
    }

    const existing = Array.isArray(vendor.profilePictures) ? vendor.profilePictures : [];
    const combined = [...existing, ...urls].slice(0, 5);
    vendor.profilePictures = combined;
    await vendor.save();

    res.json({ success: true, profilePictures: vendor.profilePictures });
  } catch (err) {
    console.error("Upload profile pictures error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

/**
 * GET vendor's category tree
 */
/**
 * GET vendor's category tree (all nested subcategories)
 */
// ⚡ FAST VERSION of vendor categories API
router.get("/:vendorId/categories", async (req, res) => {
  try {
    const { vendorId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(vendorId))
      return res.status(400).json({ message: "Invalid vendorId" });

    const vendor = await Vendor.findById(vendorId).lean();
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });

    // 🟣 Load ALL categories once
    const allCategories = await Category.find({}, { name: 1, parent: 1, price: 1, imageUrl: 1, terms: 1, sequence: 1, displayType: 1, uiRules: 1 })
      .sort({ sequence: 1, createdAt: -1 })
      .lean();

    // 🟣 Create a map of id → category
    const catMap = {};
    allCategories.forEach((c) => (catMap[c._id.toString()] = { ...c, children: [] }));

    // 🟣 Link children to their parent
    allCategories.forEach((c) => {
      if (c.parent) {
        const parent = catMap[c.parent.toString()];
        if (parent) parent.children.push(catMap[c._id.toString()]);
      }
    });

    // 🟣 Load vendor-specific prices once
    const vendorPricings = await VendorPrice.find({ vendorId }, { categoryId: 1, price: 1 }).lean();
    const vendorPricingMap = {};
    vendorPricings.forEach((p) => (vendorPricingMap[p.categoryId.toString()] = p.price));

    // 🟣 Find root category (top-most)
    let rootNode;
    if (vendor.categoryId) {
      rootNode = catMap[vendor.categoryId.toString()];
      while (rootNode && rootNode.parent) {
        const parent = catMap[rootNode.parent.toString()];
        if (!parent) break;
        rootNode = parent;
      }
    } else {
      rootNode = allCategories.find((c) => !c.parent);
      rootNode = rootNode ? catMap[rootNode._id.toString()] : null;
    }

    if (!rootNode) return res.status(404).json({ message: "No root category found" });

    // 🟣 Attach vendor price
    function attachPrices(node) {
      const vendorPrice = vendorPricingMap[node._id.toString()] ?? node.price;
      return {
        id: node._id,
        name: node.name,
        price: node.price,
        vendorPrice,
        imageUrl: node.imageUrl || null,
        terms: node.terms || "",
        displayType: Array.isArray(node.displayType) ? node.displayType : (node.displayType ? [node.displayType] : []),
        uiRules: node.uiRules || { includeLeafChildren: true },
        children: (node.children || []).map(attachPrices),
      };
    }

    const tree = attachPrices(rootNode);

    // 🟣 Get vendor location
    const location = await VendorLocation.findOne({ vendorId }).lean();

    res.json({
      vendor: {
        id: vendor._id,
        contactName: vendor.contactName,
        businessName: vendor.businessName,
        phone: vendor.phone,
        location: location || null,
      },
      categories: tree,
    });
  } catch (err) {
    console.error("Error fetching vendor categories:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});



/**
 * GET all vendors by status (ignores category)
 * Example: /api/vendors/byStatus/Waiting%20for%20Approval
 */
router.get("/byStatus/:status", async (req, res) => {
  try {
    const { status } = req.params;

    // Use case-insensitive exact match
    const vendors = await Vendor.find({ status: new RegExp(`^${status}$`, "i") })
      .populate("customerId", "fullNumber phone")
      .populate("categoryId", "name")
      .lean();

    res.json(vendors);
  } catch (err) {
    console.error("GET /vendors/byStatus error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


/**
 * UPDATE vendor-specific price
 */
router.put("/:vendorId/prices", async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { categoryId, price } = req.body;
    if (!categoryId || !price)
      return res.status(400).json({ message: "categoryId and price are required" });

    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice))
      return res.status(400).json({ message: "Valid price is required" });

    const vendor = await Vendor.findById(vendorId).lean();
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });

    const category = await Category.findById(categoryId).lean();
    if (!category) return res.status(404).json({ message: "Category not found" });

    await VendorPrice.findOneAndUpdate(
      { vendorId, categoryId },
      { vendorId, categoryId, price: parsedPrice },
      { upsert: true, new: true }
    );

    // Build category path
    const path = [];
    let tempCat = category;
    while (tempCat) {
      path.unshift(tempCat.name);
      if (!tempCat.parent) break;
      tempCat = await Category.findById(tempCat.parent).lean();
    }

    const CategoryModel = getCategoryModel(category.name);
    const entry = {
      vendorId: vendor._id,
      vendorName: vendor.contactName,
      businessName: vendor.businessName,
      phone: vendor.phone,
      categoryId: category._id,
      price: parsedPrice,
    };
    path.forEach((lvl, idx) => (entry[`level${idx + 1}`] = lvl));

    const saved = await CategoryModel.findOneAndUpdate(
      { vendorId: vendor._id },
      entry,
      { upsert: true, new: true }
    );

    res.json({ message: "Vendor price updated successfully", saved });
  } catch (err) {
    console.error("Error updating vendor price:", err);
    res.status(500).json({ message: "Internal server error", error: err.message });
  }
});

router.get("/:vendorId/preview/:categoryId", async (req, res) => {
  try {
    const { vendorId, categoryId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(vendorId) || !mongoose.Types.ObjectId.isValid(categoryId)) {
      return res.status(400).json({ message: "Invalid IDs" });
    }

    const vendor = await Vendor.findById(vendorId).lean();
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });

    // Load all categories
    const allCategories = await Category.find({}, { name: 1, parent: 1, price: 1, imageUrl: 1, terms: 1, sequence: 1 })
      .sort({ sequence: 1, createdAt: -1 })
      .lean();

    // Map categories by ID
    const catMap = {};
    allCategories.forEach((c) => {
      if (!c?._id) return;
      catMap[c._id.toString()] = { ...c, children: [] };
    });

    // Link children to parents
    allCategories.forEach((c) => {
      if (c?.parent) {
        const parent = catMap[c.parent.toString()];
        if (parent) parent.children.push(catMap[c._id.toString()]);
      }
    });

    // Load vendor-specific prices (base)
    const vendorPricings = await VendorPrice.find({ vendorId }, { categoryId: 1, price: 1 }).lean();
    const vendorPricingMap = {};
    vendorPricings.forEach((p) => {
      vendorPricingMap[p.categoryId.toString()] = p.price;
    });

    // Merge prices from inventorySelections for the requested category
    try {
      const invVendor = await Vendor.findById(vendorId, { inventorySelections: 1 }).lean();
      const invItems = Array.isArray(invVendor?.inventorySelections?.[categoryId])
        ? invVendor.inventorySelections[categoryId]
        : [];
      if (invItems.length) {
        let minPrice = Infinity;
        invItems.forEach((item) => {
          // global price on the selection
          if (item?.price != null && item.price !== "") {
            const n = Number(item.price);
            if (!Number.isNaN(n)) minPrice = Math.min(minPrice, n);
          }
          // per-row price overrides
          if (item && item.pricesByRow && typeof item.pricesByRow === "object") {
            Object.values(item.pricesByRow).forEach((v) => {
              if (v != null && v !== "") {
                const n = Number(v);
                if (!Number.isNaN(n)) minPrice = Math.min(minPrice, n);
              }
            });
          }
        });
        if (minPrice !== Infinity) {
          vendorPricingMap[categoryId.toString()] = minPrice;
        }
      }
    } catch (e) {
      // non-fatal; ignore inventory merge errors
    }

    // Find root node starting from requested category
    let rootNode = catMap[categoryId.toString()];
    while (rootNode?.parent) {
      rootNode = catMap[rootNode.parent.toString()];
    }

    if (!rootNode) return res.status(404).json({ message: "No root category found" });

    // Recursive function to attach vendor prices
    const attachPrices = (node) => {
      const vendorPrice = vendorPricingMap[node._id.toString()] ?? node.price;
      return {
        id: node._id,
        name: node.name,
        price: node.price,
        vendorPrice,
        imageUrl: node.imageUrl || null,
        terms: node.terms || "",
        displayType: Array.isArray(node.displayType) ? node.displayType : (node.displayType ? [node.displayType] : []),
        uiRules: node.uiRules || { includeLeafChildren: true },
        children: (node.children || []).map(attachPrices),
      };
    };

    const tree = attachPrices(rootNode);

    // Get vendor location
    const location = await VendorLocation.findOne({ vendorId }).lean();

    res.json({
      vendor: {
        id: vendor._id,
        contactName: vendor.contactName,
        businessName: vendor.businessName,
        phone: vendor.phone,
        location: location || null,
        businessHours: vendor.businessHours || [],
      },
      categories: tree,
    });
  } catch (err) {
    console.error("Error fetching vendor preview:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});
// In your backend file: routes/vendors.js or api/vendors/[vendorId]/preview/[categoryId].js

router.get("/:vendorId/preview/:categoryId", async (req, res) => {
  try {
    const { vendorId, categoryId } = req.params;

    const vendor = await Vendor.findById(vendorId).lean();
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    // 1️⃣ Get base vendorPrice collection (global category prices)
    const vendorPricings = await VendorPrice.find({ vendorId }, { categoryId: 1, price: 1 }).lean();
    const vendorPricingMap = {};
    vendorPricings.forEach((p) => {
      vendorPricingMap[p.categoryId.toString()] = p.price;
    });

    // 2️⃣ Merge per-row prices from inventorySelections
    if (vendor.inventorySelections && typeof vendor.inventorySelections === "object") {
      Object.entries(vendor.inventorySelections).forEach(([catId, items]) => {
        items.forEach((item) => {
          // prefer per-row prices if present
          if (item.pricesByRow && typeof item.pricesByRow === "object") {
            const validPrice = Object.values(item.pricesByRow).find((v) => v != null);
            if (validPrice != null) vendorPricingMap[catId] = validPrice;
          } else if (item.price != null) {
            vendorPricingMap[catId] = item.price;
          }
        });
      });
    }

    // 3️⃣ Load category tree and inject vendorPrice
    const categoryRoot = await Category.findById(categoryId).lean();
    function attachPrices(node) {
      if (!node) return null;
      const price = vendorPricingMap[node._id?.toString()] ?? node.price ?? null;
      return {
        ...node,
        vendorPrice: price,
        price,
        displayType: Array.isArray(node.displayType) ? node.displayType : (node.displayType ? [node.displayType] : []),
        children: node.children ? node.children.map(attachPrices) : [],
      };
    }

    const categories = attachPrices(categoryRoot);

    res.json({ categories });
  } catch (err) {
    console.error("Preview error:", err);
    res.status(500).json({ error: "Server error" });
  }
});



/**
 * CREATE vendor
 */
router.post("/", async (req, res) => {
  try {
    const { customerId, phone, businessName, contactName, categoryId } = req.body;

    if (!customerId || !phone || !businessName || !contactName || !categoryId) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // make sure customer exists
    const customer = await Customer.findById(customerId).lean();
    if (!customer) return res.status(404).json({ message: "Customer not found" });

    // make sure category exists
    const category = await Category.findById(categoryId).lean();
    if (!category) return res.status(404).json({ message: "Category not found" });

    const vendor = new Vendor({
      customerId,
      phone,
      businessName,
      contactName,
      categoryId,
    });

    await vendor.save();

    res.status(201).json(vendor);
  } catch (err) {
    console.error("Error creating vendor:", err);
    res.status(500).json({ message: "Failed to create vendor" });
  }
});


/**
 * GET vendor preview
 */
// GET vendor preview with all nested subcategories
// GET vendor preview (optimized)


// GET vendor location (with nearbyLocations)
router.get("/location/vendor/:vendorId", async (req, res) => {
  const { vendorId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(vendorId)) return res.status(400).json({ message: "Invalid vendorId" });

  let location = await VendorLocation.findOne({ vendorId });
  if (!location) location = await VendorLocation.create({ vendorId, lat: 0, lng: 0, nearbyLocations: [] });

  res.json(location);
});




/**
 * GET vendor's location
 * GET /api/vendors/:vendorId/location
 */
router.get("/:vendorId/location", async (req, res) => {
  try {
    const location = await VendorLocation.findOne({ vendorId: req.params.vendorId });
    if (!location) return res.status(404).json({ success: false, message: "Location not found" });
    res.json({ success: true, location });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// PUT /api/vendors/:vendorId/location


// inside routes/vendorRoutes.js (replace the existing PUT /:vendorId/location handler)
router.put("/:vendorId/location", async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { lat, lng, address = "", nearbyLocations } = req.body;

    if (lat == null || lng == null) {
      return res.status(400).json({ message: "Latitude and longitude are required" });
    }

    // Fetch current vendor location
    let vendorLocation = await VendorLocation.findOne({ vendorId });
    if (!vendorLocation) {
      vendorLocation = new VendorLocation({ vendorId, nearbyLocations: [] });
    }

    // Preserve existing nearbyLocations if not provided
    const safeNearby =
      Array.isArray(nearbyLocations) && nearbyLocations.length > 0
        ? nearbyLocations.map(String)
        : vendorLocation.nearbyLocations;

    // Reverse geocode
    let area = "", city = "";
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`
      );
      if (response.ok) {
        const data = await response.json();
        area = data.address?.suburb || data.address?.neighbourhood || data.address?.hamlet || "";
        city = data.address?.city || data.address?.town || data.address?.village || data.address?.municipality || "";
      }
    } catch (err) {
      console.error("Reverse geocode failed", err);
    }

    const areaCity = [area || city, city].filter(Boolean).join(", ");

    vendorLocation.lat = lat;
    vendorLocation.lng = lng;
    vendorLocation.address = address;
    vendorLocation.area = area;
    vendorLocation.city = city;
    vendorLocation.areaCity = areaCity;
    vendorLocation.nearbyLocations = safeNearby;

    await vendorLocation.save();

    res.json({ success: true, location: vendorLocation });
  } catch (err) {
    console.error("PUT /location error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});






// POST add nearby location
router.post("/vendor-locations/:vendorId/nearby", async (req, res) => {
  try {
    const { location } = req.body;
    const vendorLocation = await VendorLocation.findOne({ vendorId: req.params.vendorId });
    if (!vendorLocation) return res.status(404).json({ error: "Location not found" });

    if (vendorLocation.nearbyLocations.length >= 5) {
      return res.status(400).json({ error: "Max 5 nearby locations allowed" });
    }

    vendorLocation.nearbyLocations.push(location);
    await vendorLocation.save();
    res.json(vendorLocation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update nearby location
router.put("/vendor-locations/:vendorId/nearby/:index", async (req, res) => {
  try {
    const { vendorId, index } = req.params;
    const { location } = req.body;

    const vendorLocation = await VendorLocation.findOne({ vendorId });
    if (!vendorLocation) return res.status(404).json({ error: "Location not found" });

    vendorLocation.nearbyLocations[index] = location;
    await vendorLocation.save();
    res.json(vendorLocation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE nearby location
router.delete("/vendor-locations/:vendorId/nearby/:index", async (req, res) => {
  try {
    const { vendorId, index } = req.params;

    const vendorLocation = await VendorLocation.findOne({ vendorId });
    if (!vendorLocation) return res.status(404).json({ error: "Location not found" });

    // Instead of removing the item, set it to an empty string to preserve the 5 slots.
    if (vendorLocation.nearbyLocations && vendorLocation.nearbyLocations[index] !== undefined) {
      vendorLocation.nearbyLocations[index] = "";
    }

    await vendorLocation.save();
    res.json(vendorLocation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/vendors/:id/business-hours
// PUT /api/vendors/:id/business-hours
router.put("/:id/business-hours", async (req, res) => {
  try {
    const { businessHours } = req.body;
    const { id } = req.params;

    if (!businessHours) {
      return res.status(400).json({ message: "businessHours is required" });
    }

    // 1️⃣ Fetch the vendor first
    const vendor = await Vendor.findById(id).lean();
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });

    // 2️⃣ Update ONLY businessHours
    await Vendor.findByIdAndUpdate(id, { $set: { businessHours } }, { new: true });

    // 3️⃣ Fetch vendor location separately
    const location = await VendorLocation.findOne({ vendorId: id }).lean();

    // 4️⃣ Return vendor + location
    res.json({ ...vendor, businessHours, location: location || null });
  } catch (err) {
    console.error("PUT /business-hours error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});





module.exports = router;