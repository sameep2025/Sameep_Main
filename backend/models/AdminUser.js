const mongoose = require("mongoose");

const AdminUserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  passwordHash: { type: String, required: true },
  permissions: [{ type: String, trim: true }],
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("AdminUser", AdminUserSchema);
