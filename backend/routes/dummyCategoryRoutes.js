const express = require("express");
const multer = require("multer");
const DummyVendor = require("../models/DummyVendor");
const DummyCategory = require("../models/dummyCategory");
const DummySubcategory = require("../models/dummySubcategory");
const { v4: uuidv4 } = require("uuid");
const { uploadBufferToS3, deleteS3ObjectByUrl } = require("../utils/s3Upload");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const uploadFields = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "icon", maxCount: 1 },
  { name: "profilePictures", maxCount: 5 },
  { name: "homeButton1Icon", maxCount: 1 },
  { name: "homeButton2Icon", maxCount: 1 },
  { name: "whyUsCard1Icon", maxCount: 1 },
  { name: "whyUsCard2Icon", maxCount: 1 },
  { name: "whyUsCard3Icon", maxCount: 1 },
  { name: "whyUsCard4Icon", maxCount: 1 },
  { name: "whyUsCard5Icon", maxCount: 1 },
  { name: "whyUsCard6Icon", maxCount: 1 },
  { name: "aboutCardIcon", maxCount: 1 },
]);

const ctrl = require("../controllers/dummyCategoryController");

function logApi(req, res, label) {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(`[API] ${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms ${label || ""}`);
  });
}

// Create
router.post("/", uploadFields, (req, res, next) => {
  logApi(req, res, "create-dummy-category");
  ctrl.createCategory(req, res, next);
});

// List
router.get("/", (req, res, next) => {
  logApi(req, res, "list-dummy-categories");
  ctrl.getCategories(req, res, next);
});

// Update
router.put("/:id", uploadFields, (req, res, next) => {
  logApi(req, res, "update-dummy-category");
  ctrl.updateCategory(req, res, next);
});

// Delete
router.delete("/:id", (req, res, next) => {
  logApi(req, res, "delete-dummy-category");
  ctrl.deleteCategory(req, res, next);
});

// Get single
router.get("/:id", (req, res, next) => {
  logApi(req, res, "get-dummy-category");
  ctrl.getCategory(req, res, next);
});

async function getDummyPathSegments(nodeId) {
  if (!nodeId) return [];
  try {
    let sub = await DummySubcategory.findById(nodeId).lean();
    if (sub) {
      const trail = [];
      let cur = sub;
      while (cur) {
        trail.unshift(cur.name);
        if (!cur.parentSubcategory) break;
        cur = await DummySubcategory.findById(cur.parentSubcategory).lean();
      }
      const top = await DummyCategory.findById(sub.category).lean();
      const segs = [];
      if (top) segs.push(top.name);
      segs.push(...trail);
      return segs;
    }
    const cat = await DummyCategory.findById(nodeId).lean();
    if (cat) return [cat.name];
  } catch {}
  return [];
}

async function getDummyTopCategoryNameById(categoryId) {
  try {
    const cat = await DummyCategory.findById(categoryId, "name").lean();
    return cat?.name || null;
  } catch {
    return null;
  }
}

function getDummyVendorDisplayName(vendor) {
  return vendor?.name || vendor?.contactName || vendor?.businessName || "Vendor";
}

async function buildDummyVendorPrefixedSegments(vendor, kind) {
  const vendorName = getDummyVendorDisplayName(vendor);
  let topCategoryName = null;
  if (vendor?.categoryId) {
    topCategoryName = await getDummyTopCategoryNameById(vendor.categoryId);
  }
  const prefix = topCategoryName ? `${vendorName} - ${topCategoryName}` : vendorName;
  if (kind === "profile pictures") return [prefix, "profile pictures"];
  return [prefix, "images"];
}

router.get("/:categoryId/vendors/:vendorId/inventory-selections", async (req, res) => {
  logApi(req, res, "get-dummy-inventory-selections");
  try {
    const { vendorId, categoryId } = req.params;
    const vendor = await DummyVendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });
    const list = Array.isArray(vendor.inventorySelections?.[String(categoryId)])
      ? vendor.inventorySelections[String(categoryId)]
      : [];
    res.json({ success: true, items: list });
  } catch (err) {
    console.error("GET /dummy-categories/:categoryId/vendors/:vendorId/inventory-selections error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.get("/:categoryId/vendors/:vendorId/inventory", async (req, res) => {
  logApi(req, res, "get-dummy-inventory-combined");
  try {
    const { vendorId, categoryId } = req.params;
    const vendorDoc = await DummyVendor.findById(vendorId);
    if (!vendorDoc) return res.status(404).json({ message: "Vendor not found" });
    const category = await DummyCategory.findById(categoryId).lean();
    if (!category) return res.status(404).json({ message: "Category not found" });

    const items = Array.isArray(vendorDoc.inventorySelections?.[String(categoryId)])
      ? vendorDoc.inventorySelections[String(categoryId)]
      : [];
    const vendor = vendorDoc.toObject ? vendorDoc.toObject() : vendorDoc;
    try {
      if (vendor && typeof vendor === 'object') delete vendor.inventorySelections;
    } catch {}

    res.json({ success: true, vendor, category, items });
  } catch (err) {
    console.error("GET /dummy-categories/:categoryId/vendors/:vendorId/inventory error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.put("/:categoryId/vendors/:vendorId/inventory-selections", async (req, res) => {
  logApi(req, res, "put-dummy-inventory-selections");
  try {
    const { vendorId, categoryId } = req.params;
    const { items } = req.body;
    if (!vendorId || !categoryId || !Array.isArray(items)) {
      return res.status(400).json({ message: "vendorId, categoryId and items[] are required" });
    }
    const vendor = await DummyVendor.findById(vendorId);
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
    console.error("PUT /dummy-categories/:categoryId/vendors/:vendorId/inventory-selections error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.post(
  "/:categoryId/vendors/:vendorId/inventory/:entryKey/images",
  upload.any(),
  async (req, res) => {
    logApi(req, res, "post-dummy-inventory-images");
    try {
      const { vendorId, categoryId, entryKey } = req.params;
      const vendor = await DummyVendor.findById(vendorId);
      if (!vendor) return res.status(404).json({ message: "Vendor not found" });
      const list = Array.isArray(vendor.inventorySelections?.[categoryId]) ? vendor.inventorySelections[categoryId] : [];
      const idx = list.findIndex((it) => String(it._id || it.at) === String(entryKey));
      if (idx < 0) return res.status(404).json({ message: "Inventory entry not found" });

      const anyFiles = Array.isArray(req.files) ? req.files : [];
      const files = anyFiles.filter((f) => ["images", "image", "file", "files"].includes(f.fieldname)).slice(0, 5);
      const urls = [];
      const segs = await getDummyPathSegments(categoryId);
      const base = await buildDummyVendorPrefixedSegments(vendor, "images");
      const extra = [];
      for (let i = 1; i <= 5; i++) {
        if (req.body?.[`level${i}`]) extra.push(String(req.body[`level${i}`]));
      }
      for (const f of files) {
        if (f && f.buffer && f.mimetype) {
          const merged = extra.length ? [...segs, ...extra] : segs;
          const finalSegs = merged.length ? [...base, ...merged] : base;
          const up = await uploadBufferToS3(f.buffer, f.mimetype, "newvendor", { segments: finalSegs });
          urls.push(up.url);
        }
      }
      const current = Array.isArray(list[idx].images) ? list[idx].images : [];
      list[idx].images = [...current, ...urls].slice(0, 5);
      vendor.markModified("inventorySelections");
      await vendor.save();
      res.json({ success: true, images: list[idx].images });
    } catch (err) {
      console.error("Append dummy inventory images (dummy-categories route) error:", err);
      res.status(500).json({ message: "Server error", error: err.message });
    }
  }
);

router.put(
  "/:categoryId/vendors/:vendorId/inventory/:entryKey/images/:index",
  upload.any(),
  async (req, res) => {
    logApi(req, res, "put-dummy-inventory-image");
    try {
      const { vendorId, categoryId, entryKey, index } = req.params;
      const idxNum = Number(index);
      const vendor = await DummyVendor.findById(vendorId);
      if (!vendor) return res.status(404).json({ message: "Vendor not found" });
      const list = Array.isArray(vendor.inventorySelections?.[categoryId]) ? vendor.inventorySelections[categoryId] : [];
      const i = list.findIndex((it) => String(it._id || it.at) === String(entryKey));
      if (i < 0) return res.status(404).json({ message: "Inventory entry not found" });
      const anyFiles = Array.isArray(req.files) ? req.files : [];
      const file = anyFiles.find((f) => ["image", "images", "file", "files"].includes(f.fieldname));
      if (!file) return res.status(400).json({ message: "image file required" });
      const arr = Array.isArray(list[i].images) ? list[i].images : [];
      if (idxNum < 0 || idxNum >= arr.length) return res.status(400).json({ message: "Invalid index" });

      const segs = await getDummyPathSegments(categoryId);
      const base = await buildDummyVendorPrefixedSegments(vendor, "images");
      const extra = [];
      for (let j = 1; j <= 5; j++) {
        if (req.body?.[`level${j}`]) extra.push(String(req.body[`level${j}`]));
      }
      const merged = extra.length ? [...segs, ...extra] : segs;
      const finalSegs = merged.length ? [...base, ...merged] : base;

      const oldUrl = arr[idxNum];
      const up = await uploadBufferToS3(file.buffer, file.mimetype, "newvendor", { segments: finalSegs });
      arr[idxNum] = up.url;
      if (oldUrl) {
        try {
          await deleteS3ObjectByUrl(oldUrl);
        } catch {}
      }
      list[i].images = arr;
      vendor.markModified("inventorySelections");
      await vendor.save();
      res.json({ success: true, images: list[i].images });
    } catch (err) {
      console.error("Replace dummy inventory image (dummy-categories route) error:", err);
      res.status(500).json({ message: "Server error", error: err.message });
    }
  }
);

router.delete("/:categoryId/vendors/:vendorId/inventory/:entryKey/images/:index", async (req, res) => {
  logApi(req, res, "delete-dummy-inventory-image");
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
    console.error("Delete dummy inventory image (dummy-categories route) error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.get("/:categoryId/vendors/:vendorId/inventory/:entryKey/images", async (req, res) => {
  logApi(req, res, "get-dummy-inventory-images");
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
    console.error("Get dummy inventory images (dummy-categories route) error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;