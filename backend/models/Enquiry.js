const mongoose = require('mongoose');

const AppointmentServiceSchema = new mongoose.Schema({
  itemId: { type: String, required: true },
  name: { type: String, required: true },
  quantity: { type: Number, min: 1, default: 1 },
  categoryPath: { type: [String], default: [] },
}, { _id: false });

const AppointmentHistorySchema = new mongoose.Schema({
  action: {
    type: String,
    enum: ['CREATED', 'CONFIRMED', 'RESCHEDULED', 'CANCELLED', 'COMPLETED', 'NO_SHOW', 'STAFF_UPDATED'],
    required: true,
  },
  fromStatus: { type: String, default: '' },
  toStatus: { type: String, default: '' },
  previousStartAt: { type: Date, default: null },
  nextStartAt: { type: Date, default: null },
  reason: { type: String, default: '' },
  actorType: { type: String, enum: ['PUBLIC', 'VENDOR', 'ADMIN', 'SYSTEM'], default: 'SYSTEM' },
  actorId: { type: String, default: '' },
  changedAt: { type: Date, default: Date.now },
}, { _id: false });

const AppointmentSchema = new mongoose.Schema({
  source: { type: String, enum: ['ONLINE', 'MANUAL'], required: true },
  submissionKey: { type: String, default: '' },
  startAt: { type: Date, required: true },
  timezone: { type: String, enum: ['Asia/Kolkata'], default: 'Asia/Kolkata' },
  status: {
    type: String,
    enum: ['REQUESTED', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'],
    required: true,
  },
  customerName: { type: String, default: '' },
  staffResourceId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorResource', default: null },
  staffNameSnapshot: { type: String, default: '' },
  services: { type: [AppointmentServiceSchema], default: [] },
  notes: { type: String, default: '' },
  version: { type: Number, min: 0, default: 0 },
  confirmedAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  cancellationReason: { type: String, default: '' },
  completedAt: { type: Date, default: null },
  noShowAt: { type: Date, default: null },
  history: { type: [AppointmentHistorySchema], default: [] },
}, { _id: false });

const EnquirySchema = new mongoose.Schema({
  vendorId: { type: String, required: true },
  categoryId: { type: String, required: true },
  customerId: { type: String, default: '' },
  phone: { type: String, default: '' },
  categoryPath: { type: [String], default: [] },
  categoryIds: { type: [String], default: [] },
  serviceName: { type: String, default: '' },
  source: { type: String, default: '' },
  attributes: { type: Object, default: {} },
  price: { type: Number, default: null },
  terms: { type: String, default: '' },
  meta: { type: Object, default: {} },
  payment: {
    type: {
      provider: { type: String, default: "" },
      status: { type: String, default: "" },
      amount: { type: Number, default: null },
      currency: { type: String, default: "INR" },
      ynotOrderId: { type: String, default: "" },
      razorpayOrderId: { type: String, default: "" },
      razorpayPaymentId: { type: String, default: "" },
      razorpaySignature: { type: String, default: "" },
      paidAt: { type: Date, default: null },
      lastError: { type: String, default: "" },
      notes: { type: Object, default: {} },
    },
    default: {},
  },
  // current workflow status for this enquiry (label is per-category configurable)
  status: { type: String, default: '' },
  // full history of status changes for analytics
  statusHistory: {
    type: [
      {
        status: { type: String, required: true },
        changedAt: { type: Date, default: Date.now },
      },
    ],
    default: [],
  },
  // Present only for appointments created after Calendar is enabled.
  appointment: { type: AppointmentSchema, default: undefined },
  createdAt: { type: Date, default: Date.now },
});

EnquirySchema.index(
  { vendorId: 1, 'appointment.startAt': 1, 'appointment.status': 1 },
  { name: 'vendor_appointment_day_idx', partialFilterExpression: { appointment: { $exists: true } } }
);
EnquirySchema.index(
  { vendorId: 1, 'appointment.submissionKey': 1 },
  {
    name: 'vendor_appointment_submission_key_unique',
    unique: true,
    partialFilterExpression: { 'appointment.submissionKey': { $type: 'string', $gt: '' } },
  }
);

module.exports = mongoose.model('Enquiry', EnquirySchema);
