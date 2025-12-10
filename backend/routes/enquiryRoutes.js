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
      status,
    } = req.body || {};

    if (!vendorId || !categoryId) {
      return res.status(400).json({ message: 'vendorId and categoryId are required' });
    }

    const payload = {
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
    };

    // optional initial status (name is fully configurable per category)
    if (status) {
      const s = String(status);
      payload.status = s;
      payload.statusHistory = [{ status: s, changedAt: new Date() }];
    }

    const doc = await Enquiry.create(payload);

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

// Update status for a given enquiry and append timestamped history row
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};

    if (!status) {
      return res.status(400).json({ message: 'status is required' });
    }

    const doc = await Enquiry.findById(id);
    if (!doc) {
      return res.status(404).json({ message: 'Enquiry not found' });
    }

    const s = String(status);
    doc.status = s;
    if (!Array.isArray(doc.statusHistory)) {
      doc.statusHistory = [];
    }
    doc.statusHistory.push({ status: s, changedAt: new Date() });

    await doc.save();

    return res.json(doc);
  } catch (err) {
    console.error('PUT /api/enquiries/:id/status error:', err.message || err);
    return res.status(500).json({ message: 'Failed to update status' });
  }
});

module.exports = router;
