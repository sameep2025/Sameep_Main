const mongoose = require("mongoose");

const LoginHistorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Customer", // adjust if you use a different user model
    },
    loginTime: {
      type: Date,
      required: true,
    },
    expiryTime: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("LoginHistory", LoginHistorySchema);
