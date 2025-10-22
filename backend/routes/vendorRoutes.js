const express = require("express");
const mongoose = require("mongoose");
const Vendor = require("../models/Vendor");
const VendorPrice = require("../models/VendorPricing");
const Category = require("../models/Category");
const VendorCategoryPrice = require("../models/VendorCategoryPrice");
const Customer = require("../models/Customer"); // ✅ MISSING IMPORT
const getCategoryModel = require("../utils/getCategoryModel");
const VendorLocation = require("../models/VendorLocation");

const router = express.Router();

/**
 * 🔹 Middleware: Log every API call in this router
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

  // ✅ Fetch vendor-specific price from correct collection
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
      location: location || null
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch vendor" });
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
    const allCategories = await Category.find({}, { name: 1, parent: 1, price: 1, imageUrl: 1, terms: 1, sequence: 1 })
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

    // Load vendor-specific prices
    const vendorPricings = await VendorPrice.find({ vendorId }, { categoryId: 1, price: 1 }).lean();
    const vendorPricingMap = {};
    vendorPricings.forEach((p) => {
      vendorPricingMap[p.categoryId.toString()] = p.price;
    });

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