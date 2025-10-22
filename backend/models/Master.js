// Original schema definition
const mongoose = require("mongoose");

const MasterSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: "Master", default: null },
    imageUrl: { type: String, default: null },
    sequence: { type: Number, default: 0 },
    visibleToUser: { type: Boolean, default: true },
    visibleToVendor: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Keep your existing index
MasterSchema.index({ name: 1, parent: 1 }, { unique: true });

// Optional extra index
MasterSchema.index({ type: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("Master", MasterSchema);
