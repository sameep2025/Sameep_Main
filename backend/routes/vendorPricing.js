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

      const pricing = categories.map((cat) => ({
        categoryId: cat._id,
        level1: cat.level1 || cat.name || null,
        level2: cat.level2 || null,
        level3: cat.level3 || null,
        level4: cat.level4 || null,
        level5: cat.level5 || null,
        price: cat.price || 0,
      }));

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
      // if not found, create empty base
      vendorPricing = new VendorCategoryPrice({ vendorId, pricing: [] });
    }

    // ✅ Find existing category in array
    const itemIndex = vendorPricing.pricing.findIndex(
      (p) => p.categoryId.toString() === categoryId
    );

    if (itemIndex > -1) {
      // Update existing
      vendorPricing.pricing[itemIndex].price = price;
    } else {
      // Add new
      vendorPricing.pricing.push({ categoryId, price });
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
