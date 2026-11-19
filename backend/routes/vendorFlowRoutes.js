const express = require('express');
const router = express.Router();
const vendorFlowController = require('../controllers/vendorFlowController');
const { saveServiceAreas } = require("../controllers/vendorFlowController");
const { suggestSlugs } = require("../controllers/slugController");
const VendorFlow = require("../models/VendorFlow");
const {
  requireVendorParamWriteAccess,
  requireVendorBodyWriteAccess,
  requireOwnedDocumentVendorAccess,
} = require("../utils/vendorWriteAuth");

// ==========================================
// HEALTH
// ==========================================
router.get('/_health', (req, res) => res.json({ ok: true }));

// ==========================================
// 🔥 SUBDOMAIN ROUTES (MUST BE BEFORE /vendor/:vendorId)
// ==========================================

// Subdomain utilities
router.get('/vendor/subdomain-check', vendorFlowController.checkSubdomainAvailability);
router.get('/vendor/by-subdomain/:subdomain', vendorFlowController.getVendorBySubdomain);
router.post('/vendor/:id/set-subdomain', requireVendorParamWriteAccess("id"), vendorFlowController.setSubdomain);
router.post('/vendor/suggest-slug', suggestSlugs);

// ==========================================
// SYNC ROUTES (STATIC BUT USE :vendorId)
// ==========================================

// SYNC old vendor data to new VendorFlow structure
router.post('/vendor/:vendorId/sync', requireVendorParamWriteAccess(), vendorFlowController.syncVendorFlows);
// Fallback GET
router.get('/vendor/:vendorId/sync', requireVendorParamWriteAccess(), vendorFlowController.syncVendorFlows);

// ==========================================
// EXISTING VENDOR FLOW ROUTES
// ==========================================

// GET all vendor flows for a specific vendor
router.get('/vendor/:vendorId', vendorFlowController.getVendorFlows);

// GET vendor flows by pricing status
router.get('/vendor/:vendorId/status/:status', vendorFlowController.getVendorFlowsByStatus);

// Update price for a specific service
router.patch('/vendor/:vendorId/services/:serviceId/price', requireVendorParamWriteAccess(), vendorFlowController.updateServicePrice);

// Update status for a specific service
router.patch('/vendor/:vendorId/services/:serviceId/status', requireVendorParamWriteAccess(), vendorFlowController.updateServiceStatus);

// Get logs for a specific service
router.get('/vendor/:vendorId/services/:serviceId/logs', vendorFlowController.getServiceLogs);

// Save service areas
router.post("/vendor/service-areas", requireVendorBodyWriteAccess(), saveServiceAreas);

// ==========================================
// FLOW ROUTES (NON-VENDOR PREFIX)
// ==========================================

// GET a single vendor flow by ID
router.get('/flow/:id', vendorFlowController.getVendorFlowById);

// CREATE a new vendor flow
router.post('/', requireVendorBodyWriteAccess(), vendorFlowController.createVendorFlow);

// UPDATE a vendor flow
router.put('/flow/:id', requireOwnedDocumentVendorAccess(VendorFlow), vendorFlowController.updateVendorFlow);

// DELETE a vendor flow
router.delete('/flow/:id', requireOwnedDocumentVendorAccess(VendorFlow), vendorFlowController.deleteVendorFlow);

// UPDATE pricing status
router.patch('/flow/:id/status', requireOwnedDocumentVendorAccess(VendorFlow), vendorFlowController.updatePricingStatus);

// ADD log entry
router.post('/flow/:id/logs', requireOwnedDocumentVendorAccess(VendorFlow), vendorFlowController.addLogEntry);

module.exports = router;
