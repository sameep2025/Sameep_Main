const DummyVendor = require('../models/DummyVendor');
const Enquiry = require('../models/Enquiry');
const Vendor = require('../models/Vendor');
const {
  APPOINTMENT_STATUSES,
  AppointmentValidationError,
  actorFromRequest,
  cleanText,
  getIstDayBounds,
  getIstMonthBounds,
  normalizePhone,
  parseIstLocalDateTime,
  resolveCanonicalServices,
  resolveOptionalStaff,
} = require('../services/appointmentService');

function sendError(res, error) {
  if (error instanceof AppointmentValidationError) {
    return res.status(error.status).json({ message: error.message, code: error.code });
  }
  console.error('Appointment operation failed:', error.message || error);
  return res.status(500).json({ message: 'Appointment operation failed', code: 'appointment_operation_failed' });
}

function currentIstDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function parseExpectedVersion(value) {
  const version = Number(value);
  if (!Number.isInteger(version) || version < 0) {
    throw new AppointmentValidationError('A valid appointment version is required', 'appointment_version_required');
  }
  return version;
}

async function findVendor(vendorId) {
  return (
    await DummyVendor.findById(vendorId).select('_id categoryId').lean() ||
    await Vendor.findById(vendorId).select('_id categoryId').lean()
  );
}

async function findIdempotentManualAppointment(vendorId, submissionKey) {
  return Enquiry.findOne({ vendorId: String(vendorId), 'appointment.submissionKey': submissionKey }).lean();
}

exports.listAppointments = async (req, res) => {
  try {
    const vendorId = String(req.vendorWriteAuth?.vendorId || req.query.vendorId || '');
    const date = String(req.query.date || currentIstDate());
    const { start, end } = getIstDayBounds(date);
    const appointments = await Enquiry.find({
      vendorId,
      'appointment.startAt': { $gte: start, $lt: end },
    }).sort({ 'appointment.startAt': 1, createdAt: 1 }).lean();
    return res.json({ date, timezone: 'Asia/Kolkata', appointments });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.listTodayAppointments = async (req, res) => {
  req.query.date = currentIstDate();
  return exports.listAppointments(req, res);
};

exports.getMonthSummary = async (req, res) => {
  try {
    const vendorId = String(req.vendorWriteAuth?.vendorId || req.query.vendorId || '');
    const month = String(req.query.month || currentIstDate().slice(0, 7));
    const { start, end } = getIstMonthBounds(month);
    const days = await Enquiry.aggregate([
      {
        $match: {
          vendorId,
          'appointment.startAt': { $gte: start, $lt: end },
          'appointment.status': { $ne: 'CANCELLED' },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$appointment.startAt',
              timezone: 'Asia/Kolkata',
            },
          },
          total: { $sum: 1 },
          requested: { $sum: { $cond: [{ $eq: ['$appointment.status', 'REQUESTED'] }, 1, 0] } },
          confirmed: { $sum: { $cond: [{ $eq: ['$appointment.status', 'CONFIRMED'] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    return res.json({ month, timezone: 'Asia/Kolkata', days });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.createManualAppointment = async (req, res) => {
  try {
    const vendorId = String(req.vendorWriteAuth?.vendorId || req.body?.vendorId || '');
    const vendor = await findVendor(vendorId);
    if (!vendor) {
      throw new AppointmentValidationError('Vendor not found', 'vendor_not_found', 404);
    }

    const submissionKey = cleanText(req.body?.submissionKey, 120);
    if (!submissionKey) {
      throw new AppointmentValidationError('Appointment submission key is required', 'appointment_submission_key_required');
    }
    const existing = await findIdempotentManualAppointment(vendorId, submissionKey);
    if (existing) return res.status(200).json(existing);

    const startAt = parseIstLocalDateTime(req.body?.startAt);
    const customerName = cleanText(req.body?.customerName, 120);
    const phone = normalizePhone(req.body?.phone);
    if (!customerName || phone.length !== 10) {
      throw new AppointmentValidationError('Customer name and 10-digit phone are required', 'invalid_appointment_customer');
    }
    const services = await resolveCanonicalServices(vendorId, req.body?.services);
    const staff = await resolveOptionalStaff(vendorId, req.body?.staffResourceId);
    const now = new Date();
    const actor = actorFromRequest(req);
    const payload = {
      vendorId,
      categoryId: String(vendor.categoryId),
      phone,
      serviceName: services.map((service) => service.name).join(', '),
      source: 'calendar-manual',
      attributes: {},
      meta: { enquiryType: 'appointment', calendarManaged: true },
      status: 'Confirmed',
      statusHistory: [{ status: 'Confirmed', changedAt: now }],
      appointment: {
        source: 'MANUAL',
        submissionKey,
        startAt,
        timezone: 'Asia/Kolkata',
        status: 'CONFIRMED',
        customerName,
        ...staff,
        services,
        notes: cleanText(req.body?.notes, 1000),
        version: 0,
        confirmedAt: now,
        history: [{
          action: 'CREATED',
          toStatus: 'CONFIRMED',
          nextStartAt: startAt,
          ...actor,
          changedAt: now,
        }],
      },
    };
    try {
      // A vendor-created calendar entry must not trigger the public-enquiry alert.
      const appointment = await Enquiry.create(payload);
      return res.status(201).json(appointment);
    } catch (error) {
      if (error?.code === 11000) {
        const duplicate = await findIdempotentManualAppointment(vendorId, submissionKey);
        if (duplicate) return res.status(200).json(duplicate);
      }
      throw error;
    }
  } catch (error) {
    return sendError(res, error);
  }
};

const ALLOWED_TRANSITIONS = {
  REQUESTED: new Set(['CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW']),
  CONFIRMED: new Set(['CANCELLED', 'COMPLETED', 'NO_SHOW']),
  CANCELLED: new Set(),
  COMPLETED: new Set(),
  NO_SHOW: new Set(),
};

exports.updateAppointmentStatus = async (req, res) => {
  try {
    const expectedVersion = parseExpectedVersion(req.body?.version);
    const nextStatus = String(req.body?.status || '').trim().toUpperCase();
    if (!APPOINTMENT_STATUSES.has(nextStatus) || nextStatus === 'REQUESTED') {
      throw new AppointmentValidationError('Appointment status is invalid', 'invalid_appointment_status');
    }
    const current = await Enquiry.findOne({
      _id: req.params.id,
      vendorId: String(req.vendorWriteAuth?.vendorId || ''),
      appointment: { $exists: true },
    }).select('appointment.status appointment.version').lean();
    if (!current) {
      throw new AppointmentValidationError('Appointment not found', 'appointment_not_found', 404);
    }
    const fromStatus = current.appointment.status;
    if (!ALLOWED_TRANSITIONS[fromStatus]?.has(nextStatus)) {
      throw new AppointmentValidationError('Appointment status transition is not allowed', 'invalid_appointment_transition', 409);
    }
    const now = new Date();
    const reason = cleanText(req.body?.reason, 500);
    if (nextStatus === 'CANCELLED' && !reason) {
      throw new AppointmentValidationError('Cancellation reason is required', 'appointment_cancellation_reason_required');
    }
    const set = {
      'appointment.status': nextStatus,
      status: nextStatus === 'NO_SHOW' ? 'No Show' : `${nextStatus[0]}${nextStatus.slice(1).toLowerCase()}`,
    };
    if (nextStatus === 'CONFIRMED') set['appointment.confirmedAt'] = now;
    if (nextStatus === 'CANCELLED') {
      set['appointment.cancelledAt'] = now;
      set['appointment.cancellationReason'] = reason;
    }
    if (nextStatus === 'COMPLETED') set['appointment.completedAt'] = now;
    if (nextStatus === 'NO_SHOW') set['appointment.noShowAt'] = now;
    const actor = actorFromRequest(req);
    const updated = await Enquiry.findOneAndUpdate(
      {
        _id: req.params.id,
        vendorId: String(req.vendorWriteAuth?.vendorId || ''),
        'appointment.version': expectedVersion,
        'appointment.status': fromStatus,
      },
      {
        $set: set,
        $inc: { 'appointment.version': 1 },
        $push: {
          statusHistory: { status: set.status, changedAt: now },
          'appointment.history': {
            action: nextStatus,
            fromStatus,
            toStatus: nextStatus,
            reason,
            ...actor,
            changedAt: now,
          },
        },
      },
      { new: true }
    ).lean();
    if (!updated) {
      throw new AppointmentValidationError('Appointment changed; refresh and try again', 'appointment_version_conflict', 409);
    }
    return res.json(updated);
  } catch (error) {
    return sendError(res, error);
  }
};

exports.rescheduleAppointment = async (req, res) => {
  try {
    const expectedVersion = parseExpectedVersion(req.body?.version);
    const nextStartAt = parseIstLocalDateTime(req.body?.startAt);
    const vendorId = String(req.vendorWriteAuth?.vendorId || '');
    const current = await Enquiry.findOne({
      _id: req.params.id,
      vendorId,
      'appointment.status': { $in: ['REQUESTED', 'CONFIRMED'] },
    }).select('appointment.startAt appointment.status').lean();
    if (!current) {
      throw new AppointmentValidationError('Appointment cannot be rescheduled', 'appointment_not_reschedulable', 409);
    }
    const actor = actorFromRequest(req);
    const now = new Date();
    const updated = await Enquiry.findOneAndUpdate(
      { _id: req.params.id, vendorId, 'appointment.version': expectedVersion },
      {
        $set: { 'appointment.startAt': nextStartAt },
        $inc: { 'appointment.version': 1 },
        $push: {
          'appointment.history': {
            action: 'RESCHEDULED',
            fromStatus: current.appointment.status,
            toStatus: current.appointment.status,
            previousStartAt: current.appointment.startAt,
            nextStartAt,
            reason: cleanText(req.body?.reason, 500),
            ...actor,
            changedAt: now,
          },
        },
      },
      { new: true }
    ).lean();
    if (!updated) {
      throw new AppointmentValidationError('Appointment changed; refresh and try again', 'appointment_version_conflict', 409);
    }
    return res.json(updated);
  } catch (error) {
    return sendError(res, error);
  }
};

exports.assignAppointmentStaff = async (req, res) => {
  try {
    const expectedVersion = parseExpectedVersion(req.body?.version);
    const vendorId = String(req.vendorWriteAuth?.vendorId || '');
    const staff = await resolveOptionalStaff(vendorId, req.body?.staffResourceId);
    const actor = actorFromRequest(req);
    const updated = await Enquiry.findOneAndUpdate(
      { _id: req.params.id, vendorId, 'appointment.version': expectedVersion },
      {
        $set: {
          'appointment.staffResourceId': staff.staffResourceId,
          'appointment.staffNameSnapshot': staff.staffNameSnapshot,
        },
        $inc: { 'appointment.version': 1 },
        $push: {
          'appointment.history': {
            action: 'STAFF_UPDATED',
            reason: staff.staffNameSnapshot || 'Staff assignment removed',
            ...actor,
            changedAt: new Date(),
          },
        },
      },
      { new: true }
    ).lean();
    if (!updated) {
      throw new AppointmentValidationError('Appointment changed; refresh and try again', 'appointment_version_conflict', 409);
    }
    return res.json(updated);
  } catch (error) {
    return sendError(res, error);
  }
};
