const express = require('express');
const router = express.Router();
const multer = require('multer');
const { uploadBufferToS3 } = require('../utils/s3Upload');
const subcategoryController = require('../controllers/subcategoryController');

const upload = multer({ storage: multer.memoryStorage() });

async function uploadImageToS3IfPresent(req, res, next) {
  try {
    if (req.file && req.file.buffer && req.file.mimetype) {
      const uploaded = await uploadBufferToS3(req.file.buffer, req.file.mimetype, 'category');
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
