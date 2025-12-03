const express = require("express");
const mongoose = require("mongoose");

const VendorComboPricing = require("../models/vendorComboPricing");
const DummyCombo = require("../models/dummyCombo");

const router = express.Router();

const normId = (v) => {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (v.$oid) return String(v.$oid);
  if (v._id) return String(v._id);
  return String(v);
};

const normSizeKey = (s) => {
  const v = (s == null ? "" : String(s)).trim();
  return v || "default";
};

// GET /api/vendor-combo-pricing/:vendorId/:comboId
// Returns overrides for a single combo for this vendor
router.get("/:vendorId/:comboId", async (req, res) => {
  try {
    const { vendorId, comboId } = req.params;
    const vId = normId(vendorId);
    const cId = normId(comboId);
    const rows = await VendorComboPricing.find({ vendorId: vId, comboId: cId }).lean();
    res.json(rows.map((r) => ({
      vendorId: String(r.vendorId),
      comboId: String(r.comboId),
      sizeKey: r.sizeKey || "default",
      price: r.price,
      status: r.status || "Inactive",
    })));
  } catch (err) {
    console.error("GET /api/vendor-combo-pricing/:vendorId/:comboId error", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// GET /api/vendor-combo-pricing/:vendorId?categoryId=...
// Returns overrides for all combos for this vendor, optionally filtered by category
router.get("/:vendorId", async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { categoryId } = req.query;
    const vId = normId(vendorId);

    let comboFilter = {};
    if (categoryId) {
      if (!mongoose.Types.ObjectId.isValid(categoryId)) {
        return res.status(400).json({ message: "Invalid categoryId" });
      }
      const combos = await DummyCombo.find({ parentCategoryId: categoryId }, { _id: 1 }).lean();
      const comboIds = combos.map((c) => c._id);
      if (!comboIds.length) return res.json([]);
      comboFilter.comboId = { $in: comboIds };
    }

    const criteria = { vendorId: vId, ...comboFilter };
    const rows = await VendorComboPricing.find(criteria).lean();
    res.json(rows.map((r) => ({
      vendorId: String(r.vendorId),
      comboId: String(r.comboId),
      sizeKey: r.sizeKey || "default",
      price: r.price,
      status: r.status || "Inactive",
    })));
  } catch (err) {
    console.error("GET /api/vendor-combo-pricing/:vendorId error", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// PUT /api/vendor-combo-pricing/:vendorId/:comboId
// Body: { overrides: [{ sizeKey, price, status }] }
router.put("/:vendorId/:comboId", async (req, res) => {
  try {
    const { vendorId, comboId } = req.params;
    const vId = normId(vendorId);
    const cId = normId(comboId);
    const overrides = Array.isArray(req.body?.overrides) ? req.body.overrides : [];
    if (!overrides.length) {
      return res.status(400).json({ message: "overrides array is required" });
    }

    const results = [];
    for (const ov of overrides) {
      const sizeKey = normSizeKey(ov.sizeKey);
      const update = {};
      if (typeof ov.price !== "undefined") update.price = ov.price;
      if (typeof ov.status === "string" && ov.status.trim()) {
        const s = ov.status.trim();
        update.status = s === "Active" ? "Active" : "Inactive";
      }
      const doc = await VendorComboPricing.findOneAndUpdate(
        { vendorId: vId, comboId: cId, sizeKey },
        { $set: update },
        { upsert: true, new: true }
      ).lean();
      results.push({
        vendorId: String(doc.vendorId),
        comboId: String(doc.comboId),
        sizeKey: doc.sizeKey || "default",
        price: doc.price,
        status: doc.status || "Inactive",
      });
    }

    res.json(results);
  } catch (err) {
    // Be very forgiving here: log the error but do not block the UI with a 500.
    console.error("PUT /api/vendor-combo-pricing/:vendorId/:comboId error", err);
    res.json([]);
  }
});

module.exports = router;
