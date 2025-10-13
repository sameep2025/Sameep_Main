const express = require("express");
const router = express.Router();
const Model = require("../models/Model");

// GET all models or filter by category
router.get("/", async (req, res) => {
  try {
    const filter = {};
    if (req.query.category) {
      filter.category = req.query.category; // e.g. ?category=bike
    }
    const models = await Model.find(filter).sort({ createdAt: -1 });
    res.json(models);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// CREATE model
// CREATE model
router.post("/", async (req, res) => {
  try {
    const { category, brand, bodyType, model, variant, seats, fuelType, transmission } = req.body;

    if (!category || !brand || !model) {
      return res.status(400).json({ message: "Category, Brand, and Model are required" });
    }

    const newModel = new Model({ category, brand, bodyType, model, variant, seats, fuelType, transmission });
    await newModel.save();
    res.status(201).json(newModel);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// UPDATE model
router.put("/:id", async (req, res) => {
  try {
    const updated = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ message: "Model not found" });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});


// DELETE model
router.delete("/:id", async (req, res) => {
  try {
    const deleted = await Model.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Model not found" });
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
