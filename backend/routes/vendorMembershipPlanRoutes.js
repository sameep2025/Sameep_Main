const express = require("express");
const {
  createPlan,
  getEligibleItems,
  getPlan,
  listPlans,
  updatePlan,
  updatePlanStatus,
} = require("../controllers/vendorMembershipPlanController");
const { requireVendorAccessFromExistingAuth } = require("../utils/vendorWriteAuth");

const router = express.Router();
const resolveVendorParam = (req) => req.params.vendorId;

router.use("/:vendorId", requireVendorAccessFromExistingAuth(resolveVendorParam));

router.get("/:vendorId", listPlans);
router.post("/:vendorId", createPlan);
router.get("/:vendorId/eligible-items", getEligibleItems);
router.get("/:vendorId/:planId", getPlan);
router.patch("/:vendorId/:planId", updatePlan);
router.patch("/:vendorId/:planId/status", updatePlanStatus);

module.exports = router;
