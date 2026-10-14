const express = require("express");
const {
  activateMembership,
  getMembership,
  listMemberships,
  lookupCustomer,
  renewMembership,
} = require("../controllers/vendorCustomerMembershipController");
const { requireVendorAccessFromExistingAuth } = require("../utils/vendorWriteAuth");

const router = express.Router();
const resolveVendorParam = (req) => req.params.vendorId;

router.use("/:vendorId", requireVendorAccessFromExistingAuth(resolveVendorParam));

router.get("/:vendorId", listMemberships);
router.post("/:vendorId/activate", activateMembership);
router.get("/:vendorId/customer-lookup", lookupCustomer);
router.post("/:vendorId/:membershipId/renew", renewMembership);
router.get("/:vendorId/:membershipId", getMembership);

module.exports = router;
