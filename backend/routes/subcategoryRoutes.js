const express = require('express');
const router = express.Router();
const multer = require('multer');
const subcategoryController = require('../controllers/subcategoryController');

const upload = multer({ dest: 'uploads/' });

// GET a single subcategory by ID
router.get('/:id', subcategoryController.getSubcategory);

// GET all subcategories for a category
router.get('/category/:categoryId', subcategoryController.getSubcategories);

// POST a new subcategory
router.post('/category/:categoryId', upload.single('image'), subcategoryController.createSubcategory);

// PUT to update a subcategory
router.put('/:id', upload.single('image'), subcategoryController.updateSubcategory);

// DELETE a subcategory
router.delete('/:id', subcategoryController.deleteSubcategory);

module.exports = router;
