const express = require("express");
const router = express.Router();
const Master = require("../models/Master");
const multer = require("multer");
const path = require("path");
const { uploadBufferToS3, deleteS3ObjectByUrl } = require("../utils/s3Upload");

// --- Multer setup for file uploads (memory -> S3) ---
const upload = multer({ storage: multer.memoryStorage() });

// Helper: normalize a type into a family key
function toFamilyKey(t) {
  if (!t) return null;
  const tl = String(t).toLowerCase();
  if (tl.startsWith("bike")) return "bikes";
  if (tl.startsWith("temobus") || tl.startsWith("tempo")) return "tempoMinibuses";
  // common car attribute types
  const carTypes = new Set(["brand", "fueltype", "transmission", "bodytype", "model", "models"]);
  if (carTypes.has(tl)) return "cars";
  return tl; // leave as-is for other groups like status, etc.
}

// --- GET all items or by type ---
router.get("/", async (req, res) => {
  try {
    const { type, fieldTypes } = req.query;
    let filter = {};
    if (type) {
      if (fieldTypes) {
        // If specific fieldTypes are requested, filter by them
        const requestedTypes = fieldTypes.split(',').map(t => t.trim().toLowerCase());
        filter = {
          type,
          fieldType: { $in: requestedTypes }
        };
      } else {
        // Support both legacy (type) and normalized (fieldType) queries
        filter = { $or: [{ type }, { fieldType: type }] };
      }
    }
    const masters = await Master.find(filter);
    res.json(masters);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// --- CREATE item ---
router.post("/", upload.single("image"), async (req, res) => {


  try {
    const { name, type, sequence, options, autoCalc, parent } = req.body;

    let originalType = type;
    let finalType = type;

    // If parent provided, use parent's name as family
    if (parent) {
      const parentItem = await Master.findById(parent);
      if (parentItem && parentItem.name) {
        finalType = String(parentItem.name).toLowerCase();
      }
    } else {
      // Normalize based on known prefixes or car attribute types
      const fam = toFamilyKey(type);
      if (fam) finalType = fam;
    }

    const item = new Master({
      name,
      type: finalType,
      fieldType: finalType !== (originalType || null) ? originalType : null,
      sequence,
      options: options ? options.split(",") : [],
      autoCalc: autoCalc === "true",
      parent: parent || null,
      imageUrl: null,
    });

    if (req.file && req.file.buffer && req.file.mimetype) {
      try {
        const { url } = await uploadBufferToS3(req.file.buffer, req.file.mimetype, "master");
        item.imageUrl = url;
      } catch (e) {
        return res.status(500).json({ message: "Failed to upload image to S3", error: e.message });
      }
    }

    await item.save();
    res.status(201).json(item);
  } catch (err) {
    if (err.code === 11000) {
      // Extract field from the error message to be more specific
      const field = Object.keys(err.keyValue)[0];
      return res.status(400).json({ message: `An item with this ${field} already exists.` });
    }
    res.status(400).json({ message: err.message });
  }
});


// --- UPDATE item ---
router.put("/:id", upload.single("image"), async (req, res) => {
  try {
    const { name, type, sequence, options, autoCalc, parent } = req.body;

    const updateData = {
      name,
      sequence,
      options: options ? options.split(",") : [],
      autoCalc: autoCalc === "true",
    };

    if ("parent" in req.body) {
      updateData.parent = parent || null;
    }
    if ("type" in req.body) {
      const fam = toFamilyKey(type);
      const finalType = fam || (type || null);
      updateData.type = finalType;
      updateData.fieldType = finalType !== (type || null) ? (type || null) : null;
    }

    let oldUrl = null;
    if (req.file && req.file.buffer && req.file.mimetype) {
      try {
        const existing = await Master.findById(req.params.id);
        oldUrl = existing?.imageUrl || null;
        const { url } = await uploadBufferToS3(req.file.buffer, req.file.mimetype, "master");
        updateData.imageUrl = url;
      } catch (e) {
        return res.status(500).json({ message: "Failed to upload image to S3", error: e.message });
      }
    }

    const item = await Master.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!item) return res.status(404).json({ message: "Not found" });
    if (oldUrl) { try { await deleteS3ObjectByUrl(oldUrl); } catch {} }

    res.json(item);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// --- DELETE item ---
router.delete("/:id", async (req, res) => {
  try {
    const item = await Master.findById(req.params.id);
    if (!item) return res.status(404).json({ message: "Not found" });
    if (item.imageUrl) { try { await deleteS3ObjectByUrl(item.imageUrl); } catch {} }
    await Master.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
