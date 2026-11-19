const express = require("express");
const router = express.Router();
const {
  getVendorCustomer,
  getVendorCustomerProfile,
  resolveVendorCustomer,
  updateVendorCustomerName,
} = require("../controllers/vendorCustomerController");
const { requireVendorAccessFromExistingAuth } = require("../utils/vendorWriteAuth");

function resolveVendorQueryId(req) {
  return req.query?.vendorId || "";
}

function resolveVendorBodyOrQueryId(req) {
  return req.body?.vendorId || req.query?.vendorId || "";
}

router.get("/customer", requireVendorAccessFromExistingAuth(resolveVendorQueryId), getVendorCustomer);
router.post(
  "/customer/resolve",
  requireVendorAccessFromExistingAuth(resolveVendorBodyOrQueryId),
  resolveVendorCustomer
);
router.get(
  "/customer/profile",
  requireVendorAccessFromExistingAuth(resolveVendorQueryId),
  getVendorCustomerProfile
);
router.patch(
  "/customer/profile",
  requireVendorAccessFromExistingAuth(resolveVendorBodyOrQueryId),
  updateVendorCustomerName
);

module.exports = router;
