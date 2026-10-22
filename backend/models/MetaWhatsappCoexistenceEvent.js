const mongoose = require("mongoose");

const metaWhatsappCoexistenceEventSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    vendorCollection: {
      type: String,
      enum: ["DummyVendor", "Vendor"],
      required: true,
    },
    wabaId: { type: String, required: true, trim: true },
    phoneNumberId: { type: String, required: true, trim: true },
    eventType: {
      type: String,
      enum: ["history", "smb_app_state_sync", "smb_message_echoes"],
      required: true,
    },
    deduplicationKey: { type: String, required: true, unique: true },
    processingStatus: {
      type: String,
      enum: ["synchronization_deferred"],
      default: "synchronization_deferred",
    },
    receivedAt: { type: Date, required: true },
    processedAt: { type: Date, required: true },
  },
  { versionKey: false }
);

metaWhatsappCoexistenceEventSchema.index({ vendorId: 1, eventType: 1, receivedAt: -1 });

module.exports = mongoose.model(
  "MetaWhatsappCoexistenceEvent",
  metaWhatsappCoexistenceEventSchema
);
