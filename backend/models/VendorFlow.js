const mongoose = require('mongoose');

// New design: one document per vendor, flattened services array
const ServiceItemSchema = new mongoose.Schema({
  // Human-readable names for UI (no recursion)
  categoryPath: { type: [String], default: [] }, // e.g., ["Driving School","Packages","Bike & Car"]
  // Stable IDs for backend reference
  categoryIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  // Pricing
  price: { type: Number, default: 0 },
  // Terms: array of strings
  terms: { type: [String], default: [] },
  // Status: ACTIVE/INACTIVE
  status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'INACTIVE' },
  // Future-proofing: simple attributes bag if needed by UI (optional)
  attributes: { type: Map, of: String, default: {} },
  // Logs
  logs: [{ timestamp: { type: Date, default: Date.now }, action: { type: String, required: true }, details: { type: String }, userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' } }],
}, { _id: true });

const VendorFlowSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true
  },
  // New flattened pricing entries
  services: { type: [ServiceItemSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes for better query performance
VendorFlowSchema.index({ vendorId: 1 });
VendorFlowSchema.index({ vendorId: 1, 'services.categoryIds': 1 });

// Update the updatedAt field on save
VendorFlowSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('VendorFlow', VendorFlowSchema);
