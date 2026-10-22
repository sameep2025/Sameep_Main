const mongoose = require("mongoose");

const metaWhatsappAssetOwnershipSchema = new mongoose.Schema(
  {
    ownerVendorId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    ownerCollection: {
      type: String,
      enum: ["DummyVendor", "Vendor"],
      required: true,
    },
    wabaId: { type: String, required: true, trim: true },
    phoneNumberId: { type: String, required: true, trim: true },
    state: {
      type: String,
      enum: ["pending", "committed"],
      default: "pending",
      required: true,
    },
    leaseId: { type: String, required: true, select: false },
    reservedAt: { type: Date, required: true },
    committedAt: { type: Date, default: null },
  },
  { versionKey: false }
);

metaWhatsappAssetOwnershipSchema.index(
  { wabaId: 1 },
  { unique: true, name: "uniq_meta_whatsapp_waba" }
);
metaWhatsappAssetOwnershipSchema.index(
  { phoneNumberId: 1 },
  { unique: true, name: "uniq_meta_whatsapp_phone" }
);
metaWhatsappAssetOwnershipSchema.index(
  { ownerCollection: 1, ownerVendorId: 1 },
  { unique: true, name: "uniq_meta_whatsapp_vendor_owner" }
);

module.exports = mongoose.model(
  "MetaWhatsappAssetOwnership",
  metaWhatsappAssetOwnershipSchema
);
