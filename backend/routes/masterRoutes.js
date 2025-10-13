const express = require("express");
const router = express.Router();
const Master = require("../models/Master");
const multer = require("multer");
const path = require("path");

// --- Multer setup for file uploads ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

// --- GET all items or by type ---
router.get("/", async (req, res) => {
  try {
    const { type } = req.query;
    let filter = {};
    if (type) filter.type = type; // filter by type
    const masters = await Master.find(filter);
    res.json(masters);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// --- CREATE item ---
router.post("/", upload.single("image"), async (req, res) => {
  try {
    const { name, type, sequence, fieldType, options, autoCalc } = req.body;

    const item = new Master({
      name,
      type,
      sequence,
      fieldType,
      options: options ? options.split(",") : [],
      autoCalc: autoCalc === "true",
      imageUrl: req.file ? `/uploads/${req.file.filename}` : null
    });

    await item.save();
    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// --- UPDATE item ---
router.put("/:id", upload.single("image"), async (req, res) => {
  try {
    const { name, sequence, fieldType, options, autoCalc } = req.body;

    const updateData = {
      name,
      sequence,
      fieldType,
      options: options ? options.split(",") : [],
      autoCalc: autoCalc === "true",
    };

    if (req.file) updateData.imageUrl = `/uploads/${req.file.filename}`;

    const item = await Master.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!item) return res.status(404).json({ message: "Not found" });

    res.json(item);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// --- DELETE item ---
router.delete("/:id", async (req, res) => {
  try {
    const item = await Master.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
