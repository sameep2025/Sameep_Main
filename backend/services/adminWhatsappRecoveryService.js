const bcrypt = require("bcrypt");
const crypto = require("crypto");
const AdminUser = require("../models/AdminUser");
const AdminWhatsappRecoveryAudit = require("../models/AdminWhatsappRecoveryAudit");
const AdminWhatsappRecoveryChallenge = require("../models/AdminWhatsappRecoveryChallenge");
const AdminWhatsappRecoveryLock = require("../models/AdminWhatsappRecoveryLock");
const {
  findExactVendorById,
  readLiveMetaStatus,
  validateStoredPin,
} = require("./adminWhatsappIntegrationService");
const { decryptMetaRegistrationPin } = require("./metaTokenStorage");
const {
  setTwoStepVerificationPinWithSystemUserToken,
} = require("./metaWhatsAppService");

const RECOVERY_PERMISSION = "whatsapp_registration_recovery";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const LOCK_TTL_MS = 60 * 1000;

function isRecoveryFeatureEnabled(env = process.env) {
  return String(env.META_WHATSAPP_REGISTRATION_RECOVERY_ENABLED || "").trim() === "true";
}

function hashSecret(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function maskPhone(value) {
  const raw = String(value || "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 4) return "Not available";
  return `${raw.startsWith("+") ? "+" : ""}${"*".repeat(Math.max(4, digits.length - 4))}${digits.slice(-4)}`;
}

function isOperationalMetaReadiness(liveMeta) {
  return Boolean(
    liveMeta?.accessible === true &&
      liveMeta?.assetIdentityVerified === true &&
      liveMeta?.phoneStatus === "CONNECTED" &&
      liveMeta?.platformType === "CLOUD_API" &&
      liveMeta?.codeVerificationStatus === "VERIFIED" &&
      liveMeta?.accountMode === "LIVE"
  );
}

function sanitizeFinalReadiness(liveMeta) {
  return {
    verified: isOperationalMetaReadiness(liveMeta) && liveMeta?.isPinEnabled === true,
    phoneStatus: String(liveMeta?.phoneStatus || ""),
    platformType: String(liveMeta?.platformType || ""),
    codeVerificationStatus: String(liveMeta?.codeVerificationStatus || ""),
    accountMode: String(liveMeta?.accountMode || ""),
    isPinEnabled:
      typeof liveMeta?.isPinEnabled === "boolean" ? liveMeta.isPinEnabled : null,
  };
}

async function getRecoveryAdmin(adminId, { AdminModel = AdminUser } = {}) {
  const admin = await AdminModel.findById(adminId)
    .select("email passwordHash permissions")
    .lean();
  return admin || null;
}

function buildRecoveryCapability(admin, env = process.env) {
  const featureEnabled = isRecoveryFeatureEnabled(env);
  const authorized = Array.isArray(admin?.permissions) &&
    admin.permissions.includes(RECOVERY_PERMISSION);
  return {
    featureEnabled,
    authorized,
    enabled: featureEnabled && authorized,
    blockers: [
      ...(!featureEnabled ? ["recovery_feature_disabled"] : []),
      ...(!authorized ? ["recovery_permission_required"] : []),
    ],
  };
}

async function runRecoveryPreflight(vendor, dependencies = {}) {
  const readMeta = dependencies.readMeta || readLiveMetaStatus;
  const validatePin = dependencies.validatePin || validateStoredPin;
  const config = vendor?.whatsappBusiness || {};
  const blockers = [];
  if (config.provider !== "meta" || config.connectionStatus !== "connected") {
    blockers.push("meta_connection_not_connected");
  }
  if (!String(config.wabaId || "").trim() || !String(config.phoneNumberId || "").trim()) {
    blockers.push("meta_connection_identifiers_missing");
  }

  const pinResult = validatePin(config);
  if (pinResult.code !== "stored_pin_valid") blockers.push(pinResult.code);

  const liveMeta = blockers.some((code) => code.startsWith("meta_connection_"))
    ? { accessible: false, code: "meta_connection_invalid" }
    : await readMeta(config);
  if (!isOperationalMetaReadiness(liveMeta)) blockers.push("meta_operational_readiness_not_verified");
  if (liveMeta?.isPinEnabled === true) blockers.push("meta_pin_already_enabled");
  if (liveMeta?.accessible === true && liveMeta?.isPinEnabled !== false && liveMeta?.isPinEnabled !== true) {
    blockers.push("meta_pin_status_unknown");
  }

  return {
    eligible: blockers.length === 0,
    blockers,
    pinResult,
    liveMeta,
  };
}

async function createRecoveryChallenge({ adminId, vendorId, password }, dependencies = {}) {
  const AdminModel = dependencies.AdminModel || AdminUser;
  const ChallengeModel = dependencies.ChallengeModel || AdminWhatsappRecoveryChallenge;
  const findVendor = dependencies.findVendor || findExactVendorById;
  const comparePassword = dependencies.comparePassword || bcrypt.compare;
  const now = dependencies.now ? dependencies.now() : new Date();
  const admin = await getRecoveryAdmin(adminId, { AdminModel });
  const capability = buildRecoveryCapability(admin, dependencies.env || process.env);
  if (!capability.enabled) return { ok: false, status: 403, code: capability.blockers[0] };
  if (!password || !(await comparePassword(String(password), admin.passwordHash))) {
    return { ok: false, status: 401, code: "fresh_admin_authorization_failed" };
  }

  const result = await findVendor(vendorId);
  if (result.status === "invalid") return { ok: false, status: 400, code: "vendor_id_invalid" };
  if (result.matches.length !== 1) {
    return { ok: false, status: result.matches.length ? 409 : 404, code: result.matches.length ? "vendor_identity_ambiguous" : "vendor_not_found" };
  }
  const vendor = result.matches[0];
  const preflight = await runRecoveryPreflight(vendor, dependencies);
  if (!preflight.eligible) {
    return { ok: false, status: 409, code: "recovery_preflight_blocked", blockers: preflight.blockers };
  }

  const token = crypto.randomBytes(32).toString("base64url");
  const confirmationText = `RECOVER ${String(vendor.businessName || "WHATSAPP").trim()}`;
  const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS);
  await ChallengeModel.create({
    tokenHash: hashSecret(token),
    adminId,
    vendorId: String(vendor._id),
    vendorModel: vendor.vendorModel,
    wabaId: String(vendor.whatsappBusiness.wabaId),
    phoneNumberId: String(vendor.whatsappBusiness.phoneNumberId),
    confirmationText,
    expiresAt,
  });
  return {
    ok: true,
    token,
    expiresAt,
    confirmationText,
    vendorName: String(vendor.businessName || ""),
    maskedPhone: maskPhone(vendor.whatsappBusiness.displayPhoneNumber),
  };
}

async function consumeChallenge({ adminId, vendorId, token }, dependencies = {}) {
  const ChallengeModel = dependencies.ChallengeModel || AdminWhatsappRecoveryChallenge;
  const now = dependencies.now ? dependencies.now() : new Date();
  return ChallengeModel.findOneAndUpdate(
    {
      tokenHash: hashSecret(token),
      adminId,
      vendorId: String(vendorId),
      usedAt: null,
      expiresAt: { $gt: now },
    },
    { $set: { usedAt: now } },
    { new: true }
  ).lean();
}

async function acquireRecoveryLock({ adminId, vendorId, phoneNumberId }, dependencies = {}) {
  const LockModel = dependencies.LockModel || AdminWhatsappRecoveryLock;
  const now = dependencies.now ? dependencies.now() : new Date();
  const lockKey = `${vendorId}:${phoneNumberId}`;
  const lockToken = crypto.randomBytes(32).toString("base64url");
  const document = {
    lockKey,
    lockTokenHash: hashSecret(lockToken),
    adminId,
    vendorId: String(vendorId),
    expiresAt: new Date(now.getTime() + LOCK_TTL_MS),
  };
  try {
    await LockModel.create(document);
    return { acquired: true, lockKey, lockToken };
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const replaced = await LockModel.findOneAndUpdate(
      { lockKey, expiresAt: { $lte: now } },
      { $set: document },
      { new: true }
    ).lean();
    return replaced ? { acquired: true, lockKey, lockToken } : { acquired: false };
  }
}

async function releaseRecoveryLock(lock, dependencies = {}) {
  if (!lock?.acquired) return;
  const LockModel = dependencies.LockModel || AdminWhatsappRecoveryLock;
  await LockModel.deleteOne({
    lockKey: lock.lockKey,
    lockTokenHash: hashSecret(lock.lockToken),
  });
}

async function appendAudit(payload, dependencies = {}) {
  const AuditModel = dependencies.AuditModel || AdminWhatsappRecoveryAudit;
  await AuditModel.create(payload);
}

function sanitizedMetaFailure(error) {
  return {
    httpStatus: error?.metaError?.status || null,
    errorCode: String(error?.metaError?.code || error?.code || "meta_pin_recovery_failed"),
    errorSubcode: String(error?.metaError?.subcode || ""),
  };
}

async function executeRecovery({ adminId, vendorId, challengeToken, confirmation }, dependencies = {}) {
  const findVendor = dependencies.findVendor || findExactVendorById;
  const setPin = dependencies.setPin || setTwoStepVerificationPinWithSystemUserToken;
  const readMeta = dependencies.readMeta || readLiveMetaStatus;
  const decryptPin = dependencies.decryptPin || decryptMetaRegistrationPin;
  const admin = await getRecoveryAdmin(adminId, { AdminModel: dependencies.AdminModel || AdminUser });
  const capability = buildRecoveryCapability(admin, dependencies.env || process.env);
  if (!capability.enabled) return { ok: false, status: 403, code: capability.blockers[0] };

  const challenge = await consumeChallenge(
    { adminId, vendorId, token: challengeToken },
    dependencies
  );
  if (!challenge) return { ok: false, status: 409, code: "recovery_challenge_expired_or_used" };
  if (String(confirmation || "") !== challenge.confirmationText) {
    return { ok: false, status: 400, code: "recovery_confirmation_mismatch" };
  }

  const lock = await acquireRecoveryLock(
    { adminId, vendorId, phoneNumberId: challenge.phoneNumberId },
    dependencies
  );
  if (!lock.acquired) return { ok: false, status: 409, code: "recovery_already_in_progress" };

  const operationId = crypto.randomUUID();
  let auditBase;
  try {
    const vendorResult = await findVendor(vendorId);
    if (vendorResult.matches.length !== 1) {
      return { ok: false, status: 409, code: "vendor_identity_changed" };
    }
    const vendor = vendorResult.matches[0];
    const config = vendor.whatsappBusiness || {};
    if (
      String(vendor.vendorModel) !== String(challenge.vendorModel) ||
      String(config.wabaId || "") !== String(challenge.wabaId) ||
      String(config.phoneNumberId || "") !== String(challenge.phoneNumberId)
    ) {
      return { ok: false, status: 409, code: "recovery_asset_identity_changed" };
    }

    const encryptedPin = String(config.metaRegistration?.pinEncrypted || "");
    let pin;
    try {
      pin = String(decryptPin(encryptedPin));
    } catch {
      return { ok: false, status: 409, code: "stored_pin_decryption_failed" };
    }
    if (!/^\d{6}$/.test(pin)) return { ok: false, status: 409, code: "stored_pin_format_invalid" };

    const freshMeta = await readMeta(config);
    if (!isOperationalMetaReadiness(freshMeta)) {
      return { ok: false, status: 409, code: "meta_operational_readiness_not_verified" };
    }

    auditBase = {
      operationId,
      adminId: String(admin._id),
      adminEmail: String(admin.email || ""),
      vendorId: String(vendor._id),
      vendorModel: vendor.vendorModel,
      wabaId: String(config.wabaId),
      phoneNumberId: String(config.phoneNumberId),
      preflightOutcome: freshMeta.isPinEnabled === true ? "already_recovered" : "passed",
    };
    await appendAudit({ ...auditBase, event: "attempt_started" }, dependencies);

    if (freshMeta.isPinEnabled === true) {
      const finalReadiness = sanitizeFinalReadiness(freshMeta);
      await appendAudit({
        ...auditBase,
        event: "attempt_completed",
        metaRequestOutcome: "not_required",
        finalReadiness,
      }, dependencies);
      return { ok: true, outcome: "already_recovered", finalReadiness };
    }
    if (freshMeta.isPinEnabled !== false) {
      return { ok: false, status: 409, code: "meta_pin_status_unknown" };
    }

    let metaResult;
    try {
      metaResult = await setPin({ phoneNumberId: config.phoneNumberId, pin });
    } catch (error) {
      const failure = sanitizedMetaFailure(error);
      if (!error?.ambiguous) {
        await appendAudit({
          ...auditBase,
          event: "attempt_completed",
          metaRequestOutcome: "explicit_error",
          ...failure,
        }, dependencies);
        return { ok: false, status: 502, code: "meta_pin_recovery_failed", meta: failure };
      }

      const reconciled = await readMeta(config);
      const finalReadiness = sanitizeFinalReadiness(reconciled);
      await appendAudit({
        ...auditBase,
        event: "attempt_completed",
        metaRequestOutcome: finalReadiness.verified ? "timeout_reconciled_success" : "timeout_inconclusive",
        ...failure,
        finalReadiness,
      }, dependencies);
      return finalReadiness.verified
        ? { ok: true, outcome: "timeout_reconciled_success", finalReadiness }
        : { ok: false, status: 504, code: "meta_pin_recovery_inconclusive", finalReadiness };
    }

    const verifiedMeta = await readMeta(config);
    const finalReadiness = sanitizeFinalReadiness(verifiedMeta);
    await appendAudit({
      ...auditBase,
      event: "attempt_completed",
      metaRequestOutcome: finalReadiness.verified ? "success" : "verification_inconclusive",
      httpStatus: metaResult?.httpStatus || null,
      finalReadiness,
    }, dependencies);
    return finalReadiness.verified
      ? { ok: true, outcome: "recovered", finalReadiness }
      : { ok: false, status: 502, code: "meta_pin_recovery_verification_inconclusive", finalReadiness };
  } finally {
    await releaseRecoveryLock(lock, dependencies);
  }
}

async function listRecoveryHistory({ vendorId, page = 1, limit = 20 }, dependencies = {}) {
  const AuditModel = dependencies.AuditModel || AdminWhatsappRecoveryAudit;
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const query = { vendorId: String(vendorId) };
  const [items, total] = await Promise.all([
    AuditModel.find(query)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    AuditModel.countDocuments(query),
  ]);
  return { items, page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) };
}

module.exports = {
  RECOVERY_PERMISSION,
  acquireRecoveryLock,
  buildRecoveryCapability,
  createRecoveryChallenge,
  executeRecovery,
  isOperationalMetaReadiness,
  isRecoveryFeatureEnabled,
  listRecoveryHistory,
  maskPhone,
  releaseRecoveryLock,
  runRecoveryPreflight,
  sanitizeFinalReadiness,
};
