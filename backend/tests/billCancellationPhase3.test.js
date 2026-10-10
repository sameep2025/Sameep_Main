const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const BillingSession = require("../models/BillingSession");
const CustomerRewardReveal = require("../models/CustomerRewardReveal");
const LoyaltyLedger = require("../models/LoyaltyLedger");
const Transaction = require("../models/Transaction");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("Phase 3 cancellation schema stores audit and immutable reward reversal fields", () => {
  assert.ok(BillingSession.schema.path("cancellationNote"));
  assert.ok(BillingSession.schema.path("cancellationOtpPhoneSnapshot"));
  assert.ok(BillingSession.schema.path("cancellationOtpVerifiedAt"));
  assert.ok(BillingSession.schema.path("cancellationAuthorizationMethod"));
  assert.ok(BillingSession.schema.path("cancellationIdempotencyKey"));

  assert.ok(Transaction.schema.path("cancelledBy"));
  assert.ok(Transaction.schema.path("cancellationReason"));
  assert.ok(Transaction.schema.path("cancellationNote"));
  assert.ok(Transaction.schema.path("cancellationAuthorizationMethod"));

  const ledgerTypes = LoyaltyLedger.schema.path("type").enumValues;
  assert.ok(ledgerTypes.includes("EARN_REVERSAL"));
  assert.ok(ledgerTypes.includes("REDEEM_REVERSAL"));
  assert.ok(LoyaltyLedger.schema.path("billingSessionId"));
  assert.ok(LoyaltyLedger.schema.path("sourceLedgerId"));
  assert.ok(LoyaltyLedger.schema.path("redemptionAllocations"));

  assert.ok(CustomerRewardReveal.schema.path("invalidatedAt"));
  assert.ok(CustomerRewardReveal.schema.path("invalidatedReason"));
  assert.ok(CustomerRewardReveal.schema.path("invalidatedByBillingSessionId"));
});

test("Phase 3 cancel endpoints are vendor-authenticated and purpose-scoped", () => {
  const routes = read("routes/billingRoutes.js");
  const controller = read("controllers/billingController.js");

  assert.match(routes, /\/:billingSessionId\/cancel\/request-otp/);
  assert.match(routes, /\/:billingSessionId\/cancel\/verify-otp/);
  assert.match(routes, /\/:billingSessionId\/cancel\/vendor-confirm/);
  assert.match(routes, /\/walk-in\/recent/);
  assert.match(routes, /requireVendorAccessFromExistingAuth\(resolveBillVendorId\)/);

  assert.match(controller, /CANCEL_BILL_OTP_SCOPE\s*=\s*"CANCEL_BILL"/);
  assert.match(controller, /buildCancelOtpAttemptToken/);
  assert.match(controller, /verifyCancelOtpAttemptToken/);
  assert.match(controller, /customerPhoneSnapshot/);
  assert.match(controller, /CANCEL_BILL_WINDOW_MS/);
});

test("Phase 3 phone-less walk-in vendor-confirm cancellation is conservative and non-OTP", () => {
  const controller = read("controllers/billingController.js");
  const routes = read("routes/billingRoutes.js");

  const resolverStart = controller.indexOf("async function resolvePhoneLessWalkInCancellationContext");
  const createTransactionStart = controller.indexOf("async function createTransaction", resolverStart);
  const resolverSource = controller.slice(resolverStart, createTransactionStart);

  const endpointStart = controller.indexOf("exports.cancelPhoneLessWalkInBillByVendor");
  const verifyCancelStart = controller.indexOf("exports.verifyCancelBillOtp", endpointStart);
  const endpointSource = controller.slice(endpointStart, verifyCancelStart);

  assert.match(routes, /\/:billingSessionId\/cancel\/vendor-confirm/);
  assert.match(endpointSource, /resolvePhoneLessWalkInCancellationContext/);
  assert.match(endpointSource, /authorizationMethod:\s*"VENDOR_CONFIRM"/);
  assert.doesNotMatch(endpointSource, /axios\.post/);
  assert.doesNotMatch(endpointSource, /deductOTP/);

  assert.match(resolverSource, /bill\.billingMode !== "WALK_IN"/);
  assert.match(resolverSource, /bill\.customerId/);
  assert.match(resolverSource, /customerPhoneSnapshot/);
  assert.match(resolverSource, /transaction\.customerId/);
  assert.match(resolverSource, /pointsRedeemed/);
  assert.match(resolverSource, /pointsEarned/);
  assert.match(resolverSource, /hasCustomerLinkedBillLoyaltyActivity/);
  assert.match(resolverSource, /isBillWithinCancellationWindow/);
});

test("Phase 3 atomic cancellation records OTP versus vendor-confirm audit methods distinctly", () => {
  const controller = read("controllers/billingController.js");
  const atomicCancelStart = controller.indexOf("async function cancelCompletedBillAtomically");
  const responseStart = controller.indexOf("async function buildPublicBillResponse", atomicCancelStart);
  const atomicCancelSource = controller.slice(atomicCancelStart, responseStart);

  assert.match(atomicCancelSource, /authorizationMethod = "OTP"/);
  assert.match(atomicCancelSource, /const isOtpCancellation = authorizationMethod === "OTP"/);
  assert.match(atomicCancelSource, /cancellationOtpPhoneSnapshot:\s*isOtpCancellation \? mobile : ""/);
  assert.match(atomicCancelSource, /cancellationOtpVerifiedAt:\s*isOtpCancellation \? otpVerifiedAt : null/);
  assert.match(atomicCancelSource, /cancellationAuthorizationMethod:\s*authorizationMethod/);
});

test("Phase 3 records FIFO redemption allocations for new redemptions", () => {
  const controller = read("controllers/billingController.js");

  assert.match(controller, /const redemptionAllocations = \[\]/);
  assert.match(controller, /redemptionAllocations\.push/);
  assert.match(controller, /earnLedgerId: rewardCredit\._id/);
  assert.match(controller, /redemptionAllocations,/);
});

test("Phase 3 cancellation stays non-sending and cancelled bills remain historical", () => {
  const controller = read("controllers/billingController.js");
  const verifyCancelStart = controller.indexOf("exports.verifyCancelBillOtp");
  const nextOtpStart = controller.indexOf("exports.requestRedeemOTP", verifyCancelStart);
  const verifyCancelSource = controller.slice(verifyCancelStart, nextOtpStart);
  const portalBills = read("controllers/customerPortalBillsController.js");
  const vendorCustomer = read("controllers/vendorCustomerController.js");

  assert.doesNotMatch(verifyCancelSource, /sendCompletedBillWhatsApp/);
  assert.match(portalBills, /status:\s*\{\s*\$in:\s*\["COMPLETED", "CANCELLED"\]\s*\}/);
  assert.match(vendorCustomer, /status:\s*\{\s*\$in:\s*\["COMPLETED", "CANCELLED"\]\s*\}/);
});

test("Phase 3 cancellation accepts historical transactions with missing or null status only", () => {
  const controller = read("controllers/billingController.js");
  const helperStart = controller.indexOf("function isCancellableTransactionStatus");
  const matchStart = controller.indexOf("function buildCancellableTransactionStatusMatch");
  const otpContextStart = controller.indexOf("async function resolveCancellationBillContext");
  const atomicCancelStart = controller.indexOf("async function cancelCompletedBillAtomically");
  const requestOtpStart = controller.indexOf("exports.requestCancelBillOtp");

  const helperSource = controller.slice(helperStart, matchStart);
  const matchSource = controller.slice(matchStart, controller.indexOf("function buildCancelOtpAttemptToken"));
  const otpContextSource = controller.slice(otpContextStart, atomicCancelStart);
  const atomicCancelSource = controller.slice(atomicCancelStart, requestOtpStart);

  assert.match(helperSource, /transaction\?\.status === "COMPLETED"/);
  assert.match(helperSource, /transaction\?\.status == null/);
  assert.doesNotMatch(helperSource, /CANCELLED/);
  assert.doesNotMatch(helperSource, /SUPERSEDED/);

  assert.match(otpContextSource, /!isCancellableTransactionStatus\(transaction\)/);
  assert.doesNotMatch(otpContextSource, /transaction\.status !== "COMPLETED"/);

  assert.match(atomicCancelSource, /bill\.status !== "COMPLETED" \|\| !isCancellableTransactionStatus\(transaction\)/);
  assert.doesNotMatch(atomicCancelSource, /transaction\.status !== "COMPLETED"/);

  assert.match(matchSource, /\$or:\s*\[/);
  assert.match(matchSource, /status:\s*"COMPLETED"/);
  assert.match(matchSource, /status:\s*null/);
  assert.match(atomicCancelSource, /\.\.\.buildCancellableTransactionStatusMatch\(\)/);
  assert.match(atomicCancelSource, /status:\s*"CANCELLED"/);
});

test("cancel bill OTP requires explicit MSG91 success before cancellation side effects", () => {
  const controller = read("controllers/billingController.js");
  const verifyCancelStart = controller.indexOf("exports.verifyCancelBillOtp");
  const nextOtpStart = controller.indexOf("exports.requestRedeemOTP", verifyCancelStart);
  const verifyCancelSource = controller.slice(verifyCancelStart, nextOtpStart);

  const verifyResponseIndex = verifyCancelSource.indexOf("const verifyResp = await axios.post");
  const successCheckIndex = verifyCancelSource.indexOf("!isMsg91OtpVerifySuccess(verifyResp)");
  const walletDeductIndex = verifyCancelSource.indexOf("await deductOTP");
  const cancelIndex = verifyCancelSource.indexOf("cancelCompletedBillAtomically");
  const otpVerifiedAtIndex = verifyCancelSource.indexOf("otpVerifiedAt: new Date()");

  assert.ok(verifyResponseIndex >= 0, "verify response must be captured");
  assert.ok(successCheckIndex > verifyResponseIndex, "provider success body must be checked");
  assert.ok(walletDeductIndex > successCheckIndex, "wallet deduction must happen after OTP success");
  assert.ok(cancelIndex > successCheckIndex, "bill cancellation must happen after OTP success");
  assert.ok(otpVerifiedAtIndex > successCheckIndex, "verified audit timestamp must happen after OTP success");
  assert.match(verifyCancelSource, /message:\s*"Invalid OTP"/);
});

test("redeem OTP requires explicit MSG91 success before redemption side effects", () => {
  const controller = read("controllers/billingController.js");
  const verifyRedeemStart = controller.indexOf("exports.verifyRedeemOTP");
  const completeStart = controller.indexOf("exports.completeBilling", verifyRedeemStart);
  const verifyRedeemSource = controller.slice(verifyRedeemStart, completeStart);

  const verifyResponseIndex = verifyRedeemSource.indexOf("const verifyResp = await axios.post");
  const successCheckIndex = verifyRedeemSource.indexOf("!isMsg91OtpVerifySuccess(verifyResp)");
  const walletDeductIndex = verifyRedeemSource.indexOf("await deductOTP");
  const markVerifiedIndex = verifyRedeemSource.indexOf("billing.otpVerified = true");
  const saveIndex = verifyRedeemSource.indexOf("await billing.save()");

  assert.ok(verifyResponseIndex >= 0, "verify response must be captured");
  assert.ok(successCheckIndex > verifyResponseIndex, "provider success body must be checked");
  assert.ok(walletDeductIndex > successCheckIndex, "wallet deduction must happen after OTP success");
  assert.ok(markVerifiedIndex > successCheckIndex, "billing must be marked verified after OTP success");
  assert.ok(saveIndex > successCheckIndex, "billing save must happen after OTP success");
  assert.match(verifyRedeemSource, /message:\s*"Invalid OTP"/);
});
