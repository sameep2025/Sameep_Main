const mongoose = require("mongoose");
const VendorResource = require("../models/VendorResource");
const { getTokenFromRequest } = require("../utils/authMiddleware");
const { validateVendorRequestFromExistingAuth } = require("../utils/vendorWriteAuth");

function toPublicResource(resource) {
  const row = typeof resource?.toObject === "function" ? resource.toObject() : resource || {};
  return {
    _id: row._id,
    name: row.name || "",
    role: row.role || "",
    status: row.status || "Active",
  };
}

exports.getVendorResources = async (req, res) => {
  try {
    const vendorId = String(req.query?.vendorId || "").trim();
    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({ message: "Valid vendorId required" });
    }

    const hasAuthToken = Boolean(getTokenFromRequest(req));
    if (hasAuthToken) {
      const access = await validateVendorRequestFromExistingAuth(req, vendorId);
      if (!access.ok) {
        return res.status(access.status || 403).json({ message: access.message || "Vendor access denied" });
      }
    }

    const match = { vendorId };
    if (!hasAuthToken) match.status = "Active";
    const query = VendorResource.find(match).sort({ createdAt: -1 });
    if (!hasAuthToken) query.select("name role status");
    const resources = await query;

    res.json(hasAuthToken ? resources : resources.map(toPublicResource));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createVendorResource = async (req, res) => {
  try {
    const { vendorId, name, role, phone } = req.body;

    const resource = new VendorResource({
      vendorId,
      name,
      role,
      phone,
    });

    await resource.save();

    res.json(resource);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateVendorResource = async (req, res) => {
  try {
    const { id } = req.params;
    const { vendorId, ...safeUpdates } = req.body || {};

    const resource = await VendorResource.findByIdAndUpdate(id, safeUpdates, {
      new: true,
    });

    res.json(resource);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteVendorResource = async (req, res) => {
  try {
    const { id } = req.params;

    await VendorResource.findByIdAndDelete(id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
