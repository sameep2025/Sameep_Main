const express = require("express");
const customerPortalAuthController = require("../controllers/customerPortalAuthController");
const customerPortalBillsController = require("../controllers/customerPortalBillsController");
const customerPortalRewardsController = require("../controllers/customerPortalRewardsController");
const { requireCustomerPortalSession } = require("../utils/customerPortalAuth");

const router = express.Router();

router.post("/auth/request-otp", customerPortalAuthController.requestOtp);
router.post("/auth/verify-otp", customerPortalAuthController.verifyOtp);
router.get("/me", requireCustomerPortalSession, customerPortalAuthController.me);
router.post("/logout", requireCustomerPortalSession, customerPortalAuthController.logout);
router.get("/rewards", requireCustomerPortalSession, customerPortalRewardsController.getRewards);
router.post("/rewards/:rewardId/reveal", requireCustomerPortalSession, customerPortalRewardsController.revealReward);
router.get("/bills", requireCustomerPortalSession, customerPortalBillsController.getBills);
router.get("/bills/:billIdentifier", requireCustomerPortalSession, customerPortalBillsController.getBillDetail);

module.exports = router;
