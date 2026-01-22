const express = require('express');
const router = express.Router();
const multer = require('multer');
const { uploadBufferToS3 } = require('../utils/s3Upload');
const subcategoryController = require('../controllers/subcategoryController');

const upload = multer({ storage: multer.memoryStorage() });

async function uploadImageToS3IfPresent(req, res, next) {
  try {
    if (req.file && req.file.buffer && req.file.mimetype) {
      // Build hierarchy from :categoryId param when present
      const catId = req.params?.categoryId || req.body?.categoryId;
      let segments = [];
      if (catId) {
        try {
          const Category = require('../models/Category');
          let cur = await Category.findById(catId, 'name parent').lean();
          const stack = [];
          while (cur) {
            stack.unshift(cur.name);
            if (!cur.parent) break;
            cur = await Category.findById(cur.parent, 'name parent').lean();
          }
          segments = stack;
        } catch {}
      }
      const uploaded = await uploadBufferToS3(req.file.buffer, req.file.mimetype, 'category', segments.length ? { segments } : undefined);
      req.body = req.body || {};
      req.body.imageUrl = uploaded.url;
    }
    return next();
  } catch (e) {
    return res.status(500).json({ message: 'Image upload failed', error: e.message });
  }
}

// GET a single subcategory by ID
router.get('/:id', subcategoryController.getSubcategory);

// GET all subcategories for a category
router.get('/category/:categoryId', subcategoryController.getSubcategories);

// POST a new subcategory
router.post('/category/:categoryId', upload.single('image'), uploadImageToS3IfPresent, subcategoryController.createSubcategory);

// PUT to update a subcategory
router.put('/:id', upload.single('image'), uploadImageToS3IfPresent, subcategoryController.updateSubcategory);

// DELETE a subcategory
router.delete('/:id', subcategoryController.deleteSubcategory);

module.exports = router;
