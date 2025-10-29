const mongoose = require("mongoose");

const DummyComboItemSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["category", "custom"], required: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "DummyCategory" },
    name: { type: String },
    sizeOptions: { type: [String], default: [] },
    price: { type: Number, default: null },
    terms: { type: String, default: "" },
    variants: {
      type: [
        new mongoose.Schema(
          {
            size: { type: String },
            price: { type: Number, default: null },
            terms: { type: String, default: "" },
            imageUrl: { type: String, default: "" },
            iconUrl: { type: String, default: "" },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { _id: false }
);

const DummyComboSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    iconUrl: { type: String, default: "" },
    imageUrl: { type: String, default: "" },
    parentCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: "DummyCategory", required: true },
    type: { type: String, enum: ["Standard", "Custom"], required: true },
    items: { type: [DummyComboItemSchema], default: [] },
    services: [{ type: mongoose.Schema.Types.ObjectId, ref: "DummyCategory" }],
    basePrice: { type: Number, default: null },
    terms: { type: String, default: "" },
    sizes: { type: [String], default: [] },
    // Denormalized for fast UI display
    includesNames: { type: [String], default: [] },
    perSize: {
      type: [
        new mongoose.Schema(
          {
            size: { type: String },
            price: { type: Number, default: null },
            terms: { type: String, default: "" },
            imageUrl: { type: String, default: "" },
            iconUrl: { type: String, default: "" },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DummyCombo", DummyComboSchema);
