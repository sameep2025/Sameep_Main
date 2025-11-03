const mongoose = require("mongoose");

const vendorSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
  phone: { type: String, required: true },
  businessName: { type: String, required: true },
  contactName: { type: String, required: true },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
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
    address: { type: String }
  },

  businessHours: [
    {
      day: { type: String, required: true },
      hours: { type: String, required: true },
    },
  ],

  // Profile pictures (up to 5 URLs)
  profilePictures: { type: [String], default: [] },

  // Non-inventory images keyed by leaf category node id: { [categoryNodeId]: string[] }
  rowImages: { type: Object, default: {} },

  // Stores inventory selections keyed by categoryId
  // Shape: { [categoryId]: Array<{ at:number, categoryId:string, selections: { [family]: { [field]: string } } }> }
  inventorySelections: { type: Object, default: {} },

  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Vendor", vendorSchema);