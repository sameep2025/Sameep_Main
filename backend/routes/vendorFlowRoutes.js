const express = require('express');
const router = express.Router();
const vendorFlowController = require('../controllers/vendorFlowController');

// Simple health endpoint to verify router is mounted
router.get('/_health', (req, res) => res.json({ ok: true }));

// SYNC old vendor data to new VendorFlow structure (must come before GET /vendor/:vendorId)
router.post('/vendor/:vendorId/sync', vendorFlowController.syncVendorFlows);
// Fallback GET (some environments/tools may accidentally issue GET)
router.get('/vendor/:vendorId/sync', vendorFlowController.syncVendorFlows);

// GET all vendor flows for a specific vendor
router.get('/vendor/:vendorId', vendorFlowController.getVendorFlows);

// GET a single vendor flow by ID
router.get('/flow/:id', vendorFlowController.getVendorFlowById);

// CREATE a new vendor flow
router.post('/', vendorFlowController.createVendorFlow);

// UPDATE a vendor flow
router.put('/flow/:id', vendorFlowController.updateVendorFlow);

// DELETE a vendor flow
router.delete('/flow/:id', vendorFlowController.deleteVendorFlow);

// UPDATE pricing status for a vendor flow
router.patch('/flow/:id/status', vendorFlowController.updatePricingStatus);

// ADD log entry to vendor flow
router.post('/flow/:id/logs', vendorFlowController.addLogEntry);

// GET vendor flows by pricing status
router.get('/vendor/:vendorId/status/:status', vendorFlowController.getVendorFlowsByStatus);

// Update price for a specific service (subdocument) for a vendor
router.patch('/vendor/:vendorId/services/:serviceId/price', vendorFlowController.updateServicePrice);

// Update status for a specific service (subdocument) for a vendor
router.patch('/vendor/:vendorId/services/:serviceId/status', vendorFlowController.updateServiceStatus);

// Get logs for a specific service (subdocument) for a vendor
router.get('/vendor/:vendorId/services/:serviceId/logs', vendorFlowController.getServiceLogs);

module.exports = router;
