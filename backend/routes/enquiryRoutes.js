const express = require('express');
const Enquiry = require('../models/Enquiry');
const { createEnquiryAndNotify } = require('../services/enquiryCreationService');
const appointmentController = require('../controllers/appointmentController');
const { buildPublicEnquiryPayload, AppointmentValidationError } = require('../services/appointmentService');
const { validateAdminTokenFromRequest } = require('../utils/adminAuthMiddleware');
const {
  requireOwnedDocumentVendorAccess,
  requireVendorAccessFromExistingAuth,
} = require('../utils/vendorWriteAuth');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const payload = await buildPublicEnquiryPayload(req.body || {});
    let doc;
    try {
      doc = await createEnquiryAndNotify(payload);
    } catch (error) {
      if (error?.code === 11000 && payload.appointment?.submissionKey) {
        doc = await Enquiry.findOne({
          vendorId: payload.vendorId,
          'appointment.submissionKey': payload.appointment.submissionKey,
        });
        if (doc) return res.status(200).json(doc);
      }
      throw error;
    }

    return res.status(201).json(doc);
  } catch (err) {
    if (err instanceof AppointmentValidationError) {
      return res.status(err.status).json({ message: err.message, code: err.code });
    }
    console.error('POST /api/enquiries error:', err.message || err);
    return res.status(500).json({ message: 'Failed to create enquiry' });
  }
});

function requireEnquiryListAccess(req, res, next) {
  if (req.query?.vendorId) {
    return requireVendorAccessFromExistingAuth((request) => request.query.vendorId)(req, res, next);
  }
  const adminResult = validateAdminTokenFromRequest(req);
  if (!adminResult.ok) {
    return res.status(401).json({ message: 'Admin or vendor authorization required', code: 'enquiry_access_required' });
  }
  req.vendorWriteAuth = { authType: 'admin', admin: adminResult.admin, vendorId: '' };
  return next();
}

router.get('/', requireEnquiryListAccess, async (req, res) => {
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

const requireAppointmentListAccess = requireVendorAccessFromExistingAuth((req) => req.query.vendorId);
router.get('/appointments', requireAppointmentListAccess, appointmentController.listAppointments);
router.get('/appointments/today', requireAppointmentListAccess, appointmentController.listTodayAppointments);
router.get('/appointments/month-summary', requireAppointmentListAccess, appointmentController.getMonthSummary);
router.post(
  '/appointments/manual',
  requireVendorAccessFromExistingAuth((req) => req.body?.vendorId),
  appointmentController.createManualAppointment
);
router.patch(
  '/appointments/:id/status',
  requireOwnedDocumentVendorAccess(Enquiry),
  appointmentController.updateAppointmentStatus
);
router.patch(
  '/appointments/:id/reschedule',
  requireOwnedDocumentVendorAccess(Enquiry),
  appointmentController.rescheduleAppointment
);
router.patch(
  '/appointments/:id/staff',
  requireOwnedDocumentVendorAccess(Enquiry),
  appointmentController.assignAppointmentStaff
);

// Update status for a given enquiry and append timestamped history row
router.put('/:id/status', requireOwnedDocumentVendorAccess(Enquiry), async (req, res) => {
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
    if (doc.appointment) {
      return res.status(409).json({
        message: 'Use Calendar appointment actions for this record',
        code: 'appointment_action_required',
      });
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
