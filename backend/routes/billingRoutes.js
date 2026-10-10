const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const billingController = require("../controllers/billingController");
const BillingSession = require("../models/BillingSession");
const {
  requireVendorAccessFromExistingAuth,
} = require("../utils/vendorWriteAuth");

async function resolveBillVendorId(req) {
  const id = req.params.billingSessionId;
  if (!id || !mongoose.Types.ObjectId.isValid(id)) return "";
  const bill = await BillingSession.findById(id).select("vendorId").lean();
  return bill?.vendorId || "";
}

function resolveVendorQueryId(req) {
  return req.query?.vendorId || "";
}

router.post("/create", billingController.createBillingSession);
router.post("/update", billingController.updateBillingCart);
router.get("/public/code/:code", billingController.getPublicBillDetailsByCode);
router.get("/public/:id", billingController.getPublicBillDetails);
router.get(
  "/walk-in/recent",
  requireVendorAccessFromExistingAuth(resolveVendorQueryId),
  billingController.getRecentPhoneLessWalkInBills
);
router.get(
  "/:billingSessionId/vendor-detail",
  requireVendorAccessFromExistingAuth(resolveBillVendorId),
  billingController.getVendorHistoricalBillDetails
);
router.post(
  "/:billingSessionId/resend-whatsapp",
  requireVendorAccessFromExistingAuth(resolveBillVendorId),
  billingController.resendHistoricalBillWhatsapp
);
router.post(
  "/:billingSessionId/cancel/request-otp",
  requireVendorAccessFromExistingAuth(resolveBillVendorId),
  billingController.requestCancelBillOtp
);
router.post(
  "/:billingSessionId/cancel/vendor-confirm",
  requireVendorAccessFromExistingAuth(resolveBillVendorId),
  billingController.cancelPhoneLessWalkInBillByVendor
);
router.post(
  "/:billingSessionId/cancel/verify-otp",
  requireVendorAccessFromExistingAuth(resolveBillVendorId),
  billingController.verifyCancelBillOtp
);
router.get("/:id", billingController.getBillingSession);

router.post("/request-otp", billingController.requestRedeemOTP);
router.post("/verify-otp", billingController.verifyRedeemOTP);

router.post("/complete", billingController.completeBillingSession);

module.exports = router;
