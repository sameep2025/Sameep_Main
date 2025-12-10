const mongoose = require('mongoose');

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
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Enquiry', EnquirySchema);
