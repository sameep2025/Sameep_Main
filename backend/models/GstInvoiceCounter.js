const mongoose = require("mongoose");

const GstInvoiceCounterSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DummyVendor",
      required: true,
    },
    financialYear: {
      type: String,
      required: true,
      match: /^\d{2}-\d{2}$/,
    },
    sequence: {
      type: Number,
      required: true,
      min: 0,
      max: 999999,
      default: 0,
      validate: {
        validator: Number.isInteger,
        message: "sequence must be an integer",
      },
    },
  },
  { timestamps: true }
);

GstInvoiceCounterSchema.index(
  { vendorId: 1, financialYear: 1 },
  { unique: true, name: "gst_invoice_counter_vendor_financial_year_unique" }
);

module.exports = mongoose.model("GstInvoiceCounter", GstInvoiceCounterSchema);

