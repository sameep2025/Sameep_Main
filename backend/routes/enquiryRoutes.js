const express = require('express');
const Enquiry = require('../models/Enquiry');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const {
      vendorId,
      categoryId,
      customerId,
      phone,
      categoryPath,
      categoryIds,
      serviceName,
      source,
      attributes,
      price,
      terms,
      meta,
    } = req.body || {};

    if (!vendorId || !categoryId) {
      return res.status(400).json({ message: 'vendorId and categoryId are required' });
    }

    const doc = await Enquiry.create({
      vendorId: String(vendorId),
      categoryId: String(categoryId),
      customerId: customerId ? String(customerId) : '',
      phone: phone ? String(phone) : '',
      categoryPath: Array.isArray(categoryPath) ? categoryPath.map(String) : [],
      categoryIds: Array.isArray(categoryIds) ? categoryIds.map(String) : [],
      serviceName: serviceName ? String(serviceName) : '',
      source: source ? String(source) : '',
      attributes: attributes && typeof attributes === 'object' ? attributes : {},
      price: typeof price === 'number' ? price : price == null || price === '' ? null : Number(price),
      terms: terms ? String(terms) : '',
      meta: meta && typeof meta === 'object' ? meta : {},
    });

    return res.status(201).json(doc);
  } catch (err) {
    console.error('POST /api/enquiries error:', err.message || err);
    return res.status(500).json({ message: 'Failed to create enquiry' });
  }
});

router.get('/', async (req, res) => {
  try {
    const { vendorId, categoryId } = req.query || {};
    const filter = {};
    if (vendorId) filter.vendorId = String(vendorId);
    if (categoryId) filter.categoryId = String(categoryId);

    const list = await Enquiry.find(filter).sort({ createdAt: -1 }).lean();
    return res.json(list);
  } catch (err) {
    console.error('GET /api/enquiries error:', err.message || err);
    return res.status(500).json({ message: 'Failed to load enquiries' });
  }
});

module.exports = router;
