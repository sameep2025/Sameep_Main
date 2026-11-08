const PREPAID_MEMBERSHIP_FEATURE_FLAG = "PREPAID_MEMBERSHIP_WALLETS_ENABLED";
const PREPAID_REDEMPTION_FEATURE_FLAG = "PREPAID_WALLET_REDEMPTION_ENABLED";
const PREPAID_MEMBERSHIP_TYPES = new Set(["PREPAID_VALUE", "PREPAID_SESSIONS"]);

function isPrepaidMembershipWalletEnabled(env = process.env) {
  return (
    String(env?.[PREPAID_MEMBERSHIP_FEATURE_FLAG] || "")
      .trim()
      .toLowerCase() === "true"
  );
}

function assertPrepaidMembershipWalletEnabled(env = process.env) {
  if (isPrepaidMembershipWalletEnabled(env)) return;

  const error = new Error("Prepaid membership wallets are not enabled");
  error.code = "prepaid_membership_wallets_disabled";
  error.statusCode = 403;
  throw error;
}

function isPrepaidWalletRedemptionEnabled(env = process.env) {
  return (
    String(env?.[PREPAID_REDEMPTION_FEATURE_FLAG] || "")
      .trim()
      .toLowerCase() === "true"
  );
}

function assertPrepaidWalletRedemptionEnabled(env = process.env) {
  assertPrepaidMembershipWalletEnabled(env);
  if (isPrepaidWalletRedemptionEnabled(env)) return;
  const error = new Error("Prepaid wallet redemption preparation is not enabled");
  error.code = "prepaid_wallet_redemption_disabled";
  error.statusCode = 403;
  throw error;
}

function isMembershipTypeEnabled(membershipType, env = process.env) {
  const normalizedType = String(membershipType || "").trim().toUpperCase();
  if (normalizedType === "DISCOUNT") return true;
  if (!PREPAID_MEMBERSHIP_TYPES.has(normalizedType)) return false;
  return isPrepaidMembershipWalletEnabled(env);
}

module.exports = {
  PREPAID_MEMBERSHIP_FEATURE_FLAG,
  PREPAID_REDEMPTION_FEATURE_FLAG,
  assertPrepaidMembershipWalletEnabled,
  assertPrepaidWalletRedemptionEnabled,
  isMembershipTypeEnabled,
  isPrepaidMembershipWalletEnabled,
  isPrepaidWalletRedemptionEnabled,
};
