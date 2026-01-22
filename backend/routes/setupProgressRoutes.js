const express = require("express");
const jwt = require("jsonwebtoken");
const SetupProgress = require("../models/SetupProgress");

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "dev_jwt_secret_change_me";

function getGoogleTokenFromRequest(req) {
  const auth = String(req.headers["authorization"] || "");
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  const x = req.headers["x-google-auth-token"];
  if (x) return String(x).trim();
  if (req.query && req.query.googleAuthToken) return String(req.query.googleAuthToken).trim();
  if (req.body && req.body.googleAuthToken) return String(req.body.googleAuthToken).trim();
  return null;
}

function requireGoogleAuth(req, res, next) {
  try {
    const token = getGoogleTokenFromRequest(req);
    if (!token) return res.status(401).json({ message: "Missing google auth token" });

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ message: "Invalid google auth token" });
    }

    const googleId = decoded && decoded.googleId ? String(decoded.googleId) : "";
    if (!googleId) return res.status(401).json({ message: "Invalid google token payload" });

    req.googleAuth = { googleId };
    return next();
  } catch (err) {
    console.error("requireGoogleAuth error:", err?.message || err);
    return res.status(500).json({ message: "Failed to validate google auth" });
  }
}

router.get("/", requireGoogleAuth, async (req, res) => {
  try {
    const googleId = req.googleAuth.googleId;
    const categoryId = String(req.query.categoryId || "").trim();
    const placeId = String(req.query.placeId || "").trim();

    if (!categoryId || !placeId) {
      return res.status(400).json({ message: "categoryId and placeId required" });
    }

    const doc = await SetupProgress.findOne({ googleId, categoryId, placeId }).lean();
    if (!doc) return res.json({ exists: false });

    return res.json({
      exists: true,
      progress: {
        googleId: doc.googleId,
        categoryId: doc.categoryId,
        placeId: doc.placeId,
        currentStep: doc.currentStep || "",
        generatedDummyVendorId: doc.generatedDummyVendorId || "",
        payload: doc.payload || {},
        updatedAt: doc.updatedAt || null,
      },
    });
  } catch (err) {
    console.error("GET /api/setup-progress error:", err?.message || err);
    return res.status(500).json({ message: "Failed to load setup progress" });
  }
});

router.put("/", requireGoogleAuth, async (req, res) => {
  try {
    const googleId = req.googleAuth.googleId;
    const categoryId = String(req.body.categoryId || "").trim();
    const placeId = String(req.body.placeId || "").trim();

    if (!categoryId || !placeId) {
      return res.status(400).json({ message: "categoryId and placeId required" });
    }

    const currentStep = typeof req.body.currentStep === "string" ? req.body.currentStep : "";
    const generatedDummyVendorId = typeof req.body.generatedDummyVendorId === "string" ? req.body.generatedDummyVendorId : "";
    const payload = req.body && typeof req.body.payload === "object" && req.body.payload ? req.body.payload : {};

    const setPatch = {
      currentStep,
      payload,
      updatedAt: new Date(),
    };
    if (generatedDummyVendorId && String(generatedDummyVendorId).trim()) {
      setPatch.generatedDummyVendorId = String(generatedDummyVendorId).trim();
    }

    const update = {
      $set: setPatch,
      $setOnInsert: {
        googleId,
        categoryId,
        placeId,
        createdAt: new Date(),
      },
    };

    const doc = await SetupProgress.findOneAndUpdate(
      { googleId, categoryId, placeId },
      update,
      { new: true, upsert: true }
    ).lean();

    return res.json({ ok: true, progress: doc });
  } catch (err) {
    console.error("PUT /api/setup-progress error:", err?.message || err);
    return res.status(500).json({ message: "Failed to save setup progress" });
  }
});

module.exports = router;
