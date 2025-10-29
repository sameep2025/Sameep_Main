const express = require("express");
const multer = require("multer");
const router = express.Router();
const upload = multer({ dest: "uploads/" });
const uploadFields = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "icon", maxCount: 1 },
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

module.exports = router;