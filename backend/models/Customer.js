// models/Customer.js
const mongoose = require('mongoose');

const CustomerSchema = new mongoose.Schema({
  countryCode: { type: String, required: true },
  phone: { type: String, required: true }, // raw number without + or country code
  fullNumber: { type: String, required: true, unique: true }, // e.g. 919876543210
  displayName: { type: String, trim: true, maxlength: 100, default: "" },
  createdAt: { type: Date, default: Date.now }
});

CustomerSchema.index({ fullNumber: 1 }, { unique: true });

module.exports = mongoose.model('Customer', CustomerSchema);
