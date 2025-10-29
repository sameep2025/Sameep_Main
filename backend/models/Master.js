const mongoose = require("mongoose");

const MasterSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, default: null },         // ✅ add this
    fieldType: { type: String, default: null },    // ✅ add this
    options: { type: [String], default: [] },      // ✅ add this
    autoCalc: { type: Boolean, default: false },   // ✅ add this

    parent: { type: mongoose.Schema.Types.ObjectId, ref: "Master", default: null },
    imageUrl: { type: String, default: null },
    sequence: { type: Number, default: 0 },
    visibleToUser: { type: Boolean, default: true },
    visibleToVendor: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Keep your indexes



module.exports = mongoose.model("Master", MasterSchema);
