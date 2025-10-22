// routes/vendorPricing.js
const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const VendorCategoryPrice = require("../models/VendorCategoryPrice");
const Vendor = require("../models/Vendor");
const Category = require("../models/Category");

// Middleware to log request + timing
router.use((req, res, next) => {
  const start = Date.now();
  console.log(`[API CALL] ${req.method} ${req.originalUrl}`);

  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(
      `[API DONE] ${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms)`
    );
  });
  next();
});


// ------------------------------------------------------
// Helper: build category path names from root → node
// Returns array of names [level1, level2, ...]
async function buildCategoryPathNames(categoryId) {
  const path = [];
  let cat = await Category.findById(categoryId).lean();
  if (!cat) return path;
  // Walk up to root
  while (cat) {
    path.unshift(cat.name);
    if (!cat.parent) break;
    cat = await Category.findById(cat.parent).lean();
  }
  return path;
}


// ======================================================
// GET all pricing for a vendor (creates default if not exists)
// ======================================================
router.get("/:vendorId", async (req, res) => {
  const { vendorId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(vendorId))
    return res.status(400).json({ message: "Invalid vendorId" });

  try {
    const vendor = await Vendor.findById(vendorId).lean();
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });

    let record = await VendorCategoryPrice.findOne({ vendorId }).lean();

    // If not found, create a new vendor pricing record with defaults
    if (!record) {
      console.log("No pricing found, creating default structure...");
      const categories = await Category.find().lean();

      // Compute structured pricing with path levels
      const pricing = [];
      for (const cat of categories) {
        const names = await buildCategoryPathNames(cat._id);
        const entry = {
          categoryId: cat._id,
          price: typeof cat.price === "number" ? cat.price : 0,
        };
        names.forEach((n, i) => (entry[`level${i + 1}`] = n));
        pricing.push(entry);
      }

      record = await VendorCategoryPrice.create({
        vendorId,
        vendorName: vendor.contactName,
        businessName: vendor.businessName,
        phone: vendor.phone,
        pricing,
      });

      console.log("Default pricing created for vendor:", vendorId);
    }

    res.json(record);
  } catch (err) {
    console.error("Error fetching vendor pricing:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// ======================================================
// PUT update a specific category price for a vendor
// ======================================================
// ======================================================
// PUT update a specific category price for a vendor (FIXED VERSION)
// ======================================================
router.put("/:vendorId/:categoryId", async (req, res) => {
  const { vendorId, categoryId } = req.params;
  const { price } = req.body;

  if (
    !mongoose.Types.ObjectId.isValid(vendorId) ||
    !mongoose.Types.ObjectId.isValid(categoryId)
  ) {
    return res.status(400).json({ message: "Invalid vendorId or categoryId" });
  }

  try {
    // ✅ Ensure vendor pricing record exists
    let vendorPricing = await VendorCategoryPrice.findOne({ vendorId });

    if (!vendorPricing) {
      // if not found, create empty base with vendor meta
      const v = await Vendor.findById(vendorId).lean();
      vendorPricing = new VendorCategoryPrice({
        vendorId,
        vendorName: v?.contactName || "",
        businessName: v?.businessName || "",
        phone: v?.phone || "",
        pricing: [],
      });
    }

    // ✅ Find existing category in array
    const itemIndex = vendorPricing.pricing.findIndex(
      (p) => p.categoryId.toString() === categoryId
    );

    if (itemIndex > -1) {
      // Update existing price
      vendorPricing.pricing[itemIndex].price = price;
    } else {
      // Add new with level names
      const names = await buildCategoryPathNames(categoryId);
      const entry = { categoryId, price };
      names.forEach((n, i) => (entry[`level${i + 1}`] = n));
      vendorPricing.pricing.push(entry);
    }

    vendorPricing.updatedAt = new Date();
    await vendorPricing.save();

    // 🔄 Sync VendorPrice collection so VendorStatusListPage stays updated
    const VendorPrice = require("../models/VendorPricing");
    await VendorPrice.findOneAndUpdate(
      { vendorId, categoryId },
      { vendorId, categoryId, price },
      { upsert: true, new: true }
    );

    res.json({
      message: "Price updated successfully",
      data: vendorPricing,
    });
  } catch (err) {
    console.error("Error updating vendor pricing:", err);
    res.status(500).json({ message: "Server error" });
  }
});



// ======================================================
// GET pricing for a vendor & specific category
// ======================================================
router.get("/:vendorId/category/:categoryId", async (req, res) => {
  const { vendorId, categoryId } = req.params;

  if (
    !mongoose.Types.ObjectId.isValid(vendorId) ||
    !mongoose.Types.ObjectId.isValid(categoryId)
  ) {
    console.warn("Invalid vendorId/categoryId:", { vendorId, categoryId });
    return res.status(400).json({ message: "Invalid vendorId or categoryId" });
  }

  try {
    const vendorPricing = await VendorCategoryPrice.findOne({ vendorId }).lean();
    if (!vendorPricing) {
      return res
        .status(404)
        .json({ message: "Vendor pricing record not found" });
    }

    const categoryPricing = vendorPricing.pricing.find(
      (item) => item.categoryId.toString() === categoryId
    );

    if (!categoryPricing)
      return res
        .status(404)
        .json({ message: "Category not found in vendor pricing" });

    res.json(categoryPricing);
  } catch (err) {
    console.error("Error fetching category pricing:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// ======================================================
// EXPORT ROUTER
// ======================================================
module.exports = router;
