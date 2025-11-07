const mongoose = require("mongoose");

const dummyVendorSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
  phone: { type: String, required: true },
  businessName: { type: String, required: true },
  contactName: { type: String, required: true },
  // Link to top-level DummyCategory
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "DummyCategory", required: true },
  status: {
    type: String,
    enum: [
      "Accepted",
      "Pending",
      "Rejected",
      "Waiting for Approval",
      "Inactive",
      "Active",
    ],
    default: "Waiting for Approval",
  },

  location: {
    lat: { type: Number },
    lng: { type: Number },
    address: { type: String },
    nearbyLocations: { type: [String], default: [] },
  },

  businessHours: [
    {
      day: { type: String, required: true },
      hours: { type: String, required: true },
    },
  ],

  profilePictures: { type: [String], default: [] },
  rowImages: { type: Object, default: {} },
  inventorySelections: { type: Object, default: {} },

  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("DummyVendor", dummyVendorSchema);
