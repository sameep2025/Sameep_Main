const express = require("express");
const router = express.Router();
const AppConfig = require("../models/AppConfig");

// Helper to get a config value by key, or null if not set
async function getConfigValue(key) {
  const doc = await AppConfig.findOne({ key }).lean();
  return doc ? doc.value : null;
}

// GET current session validity config
// Returns: { availableHours: number[], selectedHour: number | null }
router.get("/session-validity", async (req, res) => {
  try {
    const config = (await getConfigValue("sessionValidity")) || {};
    const availableHours = Array.isArray(config.availableHours)
      ? config.availableHours
      : [];
    const selectedHour = typeof config.selectedHour === "number"
      ? config.selectedHour
      : null;

    res.json({ availableHours, selectedHour });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET current admin passcode
// Returns: { adminPasscode: string }
router.get("/admin-passcode", async (req, res) => {
  try {
    const value = await getConfigValue("adminPasscode");
    let adminPasscode = "1234";
    if (typeof value === "string" && /^\d{4}$/.test(value)) {
      adminPasscode = value;
    }
    res.json({ adminPasscode });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST to update admin passcode
// Body: { adminPasscode: string } (must be 4-digit string)
router.post("/admin-passcode", async (req, res) => {
  try {
    const { adminPasscode } = req.body || {};
    const code = typeof adminPasscode === "string" ? adminPasscode.trim() : "";

    if (!/^\d{4}$/.test(code)) {
      return res
        .status(400)
        .json({ message: "adminPasscode must be a 4-digit numeric code" });
    }

    const updated = await AppConfig.findOneAndUpdate(
      { key: "adminPasscode" },
      { key: "adminPasscode", value: code },
      { new: true, upsert: true }
    ).lean();

    res.json({ adminPasscode: updated.value });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// POST to update session validity config
// Body: { availableHours: number[], selectedHour: number | null }
router.post("/session-validity", async (req, res) => {
  try {
    let { availableHours, selectedHour } = req.body;

    if (!Array.isArray(availableHours)) {
      availableHours = [];
    }
    // normalize to numbers and unique sorted list
    const normalized = Array.from(
      new Set(
        availableHours
          .map((v) => Number(v))
          .filter((v) => Number.isFinite(v) && v > 0)
      )
    ).sort((a, b) => a - b);

    let finalSelected = null;
    if (selectedHour != null) {
      const num = Number(selectedHour);
      if (normalized.includes(num)) {
        finalSelected = num;
      }
    }

    const value = {
      availableHours: normalized,
      selectedHour: finalSelected,
    };

    const updated = await AppConfig.findOneAndUpdate(
      { key: "sessionValidity" },
      { key: "sessionValidity", value },
      { new: true, upsert: true }
    ).lean();

    res.json(updated.value);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
