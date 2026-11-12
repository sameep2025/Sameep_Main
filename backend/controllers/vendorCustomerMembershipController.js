const mongoose = require("mongoose");
const crypto = require("crypto");
const BillingSession = require("../models/BillingSession");
const Customer = require("../models/Customer");
const CustomerMembership = require("../models/CustomerMembership");
const MembershipPlan = require("../models/MembershipPlan");
const PrepaidMembershipWallet = require("../models/PrepaidMembershipWallet");
const PrepaidWalletLedger = require("../models/PrepaidWalletLedger");
const VendorCustomerProfile = require("../models/VendorCustomerProfile");
const {
  resolveCanonicalMembershipMenuItem,
} = require("../services/canonicalMembershipMenuItem");
const {
  assertPrepaidMembershipWalletEnabled,
} = require("../services/prepaidMembershipCapability");
const {
  getMembershipEntitlementFilter,
  refreshLifecycleForCustomer,
} = require("../services/prepaidMembershipLifecycleService");
const {
  getEffectiveEligibleMenuItemIds,
  getEligibleServicesForMembership,
  loadMembershipEligibleServiceMap,
} = require("../utils/membershipEligibleServices");

const PAYMENT_METHODS = CustomerMembership.constants.PAYMENT_METHODS;
const PREPAID_MEMBERSHIP_TYPES = ["PREPAID_VALUE", "PREPAID_SESSIONS"];
const FILTERABLE_MEMBERSHIP_TYPES = ["DISCOUNT", ...PREPAID_MEMBERSHIP_TYPES];
const DURATION_MONTHS = {
  MONTHLY: 1,
  QUARTERLY: 3,
  HALF_YEARLY: 6,
  ANNUAL: 12,
};

function normalizeId(value) {
  return String(value || "").trim();
}

function isCanonicalObjectId(value) {
  const id = normalizeId(value);
  return mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id;
}

function getAuthorizedVendorId(req) {
  return normalizeId(req.vendorWriteAuth?.vendorId || req.params?.vendorId);
}

function normalizeMobileInput(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return "";
}

function splitIndianMobile(fullNumber) {
  const normalized = normalizeMobileInput(fullNumber);
  return {
    countryCode: "+91",
    phone: normalized.startsWith("91") ? normalized.slice(2) : normalized,
    fullNumber: normalized,
  };
}

function normalizeMoney(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.round(number * 100) / 100;
}

function moneyToPaise(value) {
  const amount = normalizeMoney(value, NaN);
  const paise = Math.round(amount * 100);
  return Number.isSafeInteger(paise) && paise >= 0 ? paise : NaN;
}

function normalizeIdempotencyKey(value) {
  return String(value || "").trim().slice(0, 160);
}

function buildEnrollmentFingerprint({ vendorId, membershipPlanId, mobile, payment, renewalOf = "" }) {
  return crypto.createHash("sha256").update(JSON.stringify({
    vendorId: String(vendorId),
    membershipPlanId: String(membershipPlanId),
    mobile,
    paymentMethod: payment.method,
    paymentAmountPaise: moneyToPaise(payment.amount),
    paymentReference: payment.reference,
    renewalOf: String(renewalOf || ""),
  })).digest("hex");
}

function addCalendarMonths(date, months) {
  const source = new Date(date);
  const target = new Date(source.getTime());
  const originalDay = source.getDate();

  target.setDate(1);
  target.setMonth(target.getMonth() + months);
  const lastDayOfTargetMonth = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0
  ).getDate();
  target.setDate(Math.min(originalDay, lastDayOfTargetMonth));
  return target;
}

function calculateExpiry(activatedAt, duration) {
  const months = DURATION_MONTHS[duration];
  if (!months) return null;
  return addCalendarMonths(activatedAt, months);
}

function buildPlanSnapshot(plan) {
  return {
    planId: plan._id,
    name: plan.name,
    description: plan.description || "",
    duration: plan.duration,
    sellingPrice: normalizeMoney(plan.sellingPrice),
    discountPercentage: normalizeMoney(plan.discountPercentage),
    eligibleMenuItemIds: Array.isArray(plan.eligibleMenuItemIds)
      ? plan.eligibleMenuItemIds.map((id) => new mongoose.Types.ObjectId(id))
      : [],
    minimumBillAmount: normalizeMoney(plan.minimumBillAmount),
    applyDiscountOnNonMembershipItems: plan.applyDiscountOnNonMembershipItems === true,
    rewardsOnNonMembershipItems: plan.rewardsOnNonMembershipItems !== false,
    allowAdditionalDiscountOnMembershipItems: plan.allowAdditionalDiscountOnMembershipItems === true,
    allowRewardsOnMembershipItems: plan.allowRewardsOnMembershipItems === true,
    benefitSemanticsVersion: plan.benefitSemanticsVersion || "MEMBERSHIP_ITEM_FLAGS_V1",
    serviceQuotaConfig: plan.serviceQuotaConfig || { benefits: [] },
    prepaidValueConfig: plan.prepaidValueConfig || { prepaidValue: 0, bonusValue: 0 },
    prepaidSessionsConfig: plan.prepaidSessionsConfig || undefined,
  };
}

async function buildPrepaidEnrollmentData({ plan, vendorId, enrolledAt, expiresAt, session }) {
  if (plan.planType === "PREPAID_VALUE") {
    const paidAmountPaise = moneyToPaise(plan.sellingPrice);
    const creditedAmountPaise = moneyToPaise(plan.prepaidValueConfig?.prepaidValue);
    const bonusAmountPaise = creditedAmountPaise - paidAmountPaise;
    if (
      !Number.isSafeInteger(paidAmountPaise) ||
      paidAmountPaise < 1 ||
      !Number.isSafeInteger(creditedAmountPaise) ||
      creditedAmountPaise < paidAmountPaise ||
      moneyToPaise(plan.prepaidValueConfig?.bonusValue) !== bonusAmountPaise
    ) {
      const error = new Error("Prepaid value plan configuration is invalid");
      error.statusCode = 400;
      throw error;
    }
    return {
      snapshotField: "prepaidValueSnapshot",
      snapshot: { paidAmountPaise, creditedAmountPaise, bonusAmountPaise, enrolledAt, expiresAt },
      wallet: {
        walletType: "PREPAID_VALUE",
        creditedAmountPaise,
        consumedAmountPaise: 0,
        remainingAmountPaise: creditedAmountPaise,
      },
      ledger: { walletType: "PREPAID_VALUE", amountPaise: creditedAmountPaise },
    };
  }

  const config = plan.prepaidSessionsConfig || {};
  const item = await resolveCanonicalMembershipMenuItem({
    vendorId,
    itemId: config.eligibleItemId,
    itemSource: config.eligibleItemSource,
    session,
  });
  if (item.itemKind !== config.eligibleItemKind) {
    const error = new Error("Eligible membership item classification has changed");
    error.statusCode = 409;
    throw error;
  }
  const paidQuantity = Number(config.paidQuantity);
  const creditedQuantity = Number(config.creditedQuantity);
  if (
    !Number.isSafeInteger(paidQuantity) ||
    paidQuantity < 1 ||
    !Number.isSafeInteger(creditedQuantity) ||
    creditedQuantity < paidQuantity
  ) {
    const error = new Error("Prepaid session plan quantities are invalid");
    error.statusCode = 400;
    throw error;
  }
  return {
    snapshotField: "prepaidSessionsSnapshot",
    snapshot: {
      eligibleItemId: new mongoose.Types.ObjectId(item.itemId),
      eligibleItemSource: item.itemSource,
      eligibleItemKind: item.itemKind,
      itemName: item.name,
      unitPricePaise: item.pricePaise,
      categoryPath: item.categoryPath,
      packageIncludes: item.packageIncludes,
      terms: item.terms,
      paidQuantity,
      creditedQuantity,
      enrolledAt,
      expiresAt,
    },
    wallet: {
      walletType: "PREPAID_SESSIONS",
      creditedQuantity,
      consumedQuantity: 0,
      remainingQuantity: creditedQuantity,
    },
    ledger: { walletType: "PREPAID_SESSIONS", quantity: creditedQuantity },
  };
}

function serializeWallet(wallet) {
  if (!wallet) return null;
  return {
    id: String(wallet._id),
    customerMembershipId: String(wallet.customerMembershipId),
    walletType: wallet.walletType,
    creditedAmountPaise: wallet.creditedAmountPaise,
    consumedAmountPaise: wallet.consumedAmountPaise,
    remainingAmountPaise: wallet.remainingAmountPaise,
    creditedQuantity: wallet.creditedQuantity,
    consumedQuantity: wallet.consumedQuantity,
    remainingQuantity: wallet.remainingQuantity,
    activatesAt: wallet.activatesAt,
    expiresAt: wallet.expiresAt,
    status: wallet.status,
  };
}

function serializeWalletLedger(row) {
  if (!row) return null;
  return {
    id: String(row._id),
    walletId: String(row.walletId),
    eventType: row.eventType,
    walletType: row.walletType,
    amountPaise: row.amountPaise,
    quantity: row.quantity,
    occurredAt: row.occurredAt,
  };
}

function validatePaymentInput(body, expectedAmount) {
  const method = String(body?.paymentMethod || "").trim().toUpperCase();
  const amount = normalizeMoney(body?.paymentAmount, NaN);
  const reference = String(body?.paymentReference || "").trim().slice(0, 160);
  const errors = [];

  if (!PAYMENT_METHODS.includes(method)) {
    errors.push("Valid payment method is required");
  }
  if (!Number.isFinite(amount) || amount < 0) {
    errors.push("Valid payment amount is required");
  }
  if (Number.isFinite(amount) && amount !== normalizeMoney(expectedAmount)) {
    errors.push("Payment amount must match the membership selling price");
  }
  if (method !== "CASH" && !reference) {
    errors.push("Payment reference is required for non-cash membership payments");
  }

  return {
    ok: errors.length === 0,
    message: errors[0] || "",
    payment: { method, amount, reference },
    errors,
  };
}

function getEffectiveMembershipStatus(membership, now = new Date()) {
  if (!membership) return "";
  if (membership.status === "CANCELLED") return "CANCELLED";

  const startTime = membership.activatedAt ? new Date(membership.activatedAt).getTime() : 0;
  const expiryTime = membership.expiresAt ? new Date(membership.expiresAt).getTime() : 0;
  const nowTime = now.getTime();

  if (expiryTime && expiryTime <= nowTime) return "EXPIRED";
  if (membership.status === "DEPLETED") return "DEPLETED";
  if (startTime && startTime > nowTime) return "SCHEDULED";
  return "ACTIVE";
}

function getPrepaidWalletRemainingBalance(wallet, membershipType) {
  if (!wallet) return null;
  const value = membershipType === "PREPAID_VALUE"
    ? wallet.remainingAmountPaise
    : wallet.remainingQuantity;
  const balance = Number(value);
  return Number.isSafeInteger(balance) && balance >= 0 ? balance : null;
}

function getPrepaidRenewalAvailability({
  effectiveStatus,
  wallet,
  membershipType,
  competingMembership = null,
}) {
  if (competingMembership) {
    return {
      allowed: false,
      code: "prepaid_renewal_successor_exists",
      reason: "Renewal is unavailable because a newer active or scheduled prepaid membership already exists.",
    };
  }
  const remainingBalance = getPrepaidWalletRemainingBalance(wallet, membershipType);
  if (!wallet || remainingBalance === null) {
    return {
      allowed: false,
      code: "prepaid_renewal_wallet_inconsistent",
      reason: "Prepaid wallet information is unavailable or inconsistent.",
    };
  }
  if (effectiveStatus === "EXPIRED") {
    return { allowed: true, remainingBalance };
  }
  if (effectiveStatus === "ACTIVE" && remainingBalance > 0) {
    return {
      allowed: false,
      code: "prepaid_renewal_balance_remaining",
      reason: "Renewal is available after the current wallet balance is exhausted or the membership expires.",
      remainingBalance,
    };
  }
  if (["ACTIVE", "DEPLETED"].includes(effectiveStatus) && remainingBalance === 0) {
    return { allowed: true, remainingBalance };
  }
  return {
    allowed: false,
    code: "prepaid_renewal_wallet_inconsistent",
    reason: "Prepaid wallet information is unavailable or inconsistent.",
    remainingBalance,
  };
}

function findCompetingPrepaidMembership(membership, peers = []) {
  return peers.find((peer) => (
    String(peer?._id || peer?.id || "") !== String(membership?._id || membership?.id || "") &&
    String(peer?.customerId || "") === String(membership?.customerId || "") &&
    PREPAID_MEMBERSHIP_TYPES.includes(peer?.membershipType) &&
    ["ACTIVE", "SCHEDULED"].includes(getEffectiveMembershipStatus(peer))
  )) || null;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getMembershipSort(sortValue) {
  const sort = String(sortValue || "newest").trim().toLowerCase();
  if (sort === "activation_date") return { activatedAt: -1, _id: -1 };
  if (sort === "expiry_date") return { expiresAt: 1, _id: -1 };
  return { createdAt: -1, _id: -1 };
}

async function getVendorCustomerNameMap(vendorId, memberships = []) {
  const customerIds = Array.from(
    new Set(memberships.map((membership) => String(membership?.customerId || "")).filter(Boolean))
  );
  if (!customerIds.length) return new Map();
  if (mongoose.connection.readyState === 0) return new Map();
  const profiles = await VendorCustomerProfile.find({
    vendorId,
    customerId: { $in: customerIds },
  })
    .select("customerId displayName")
    .lean();
  return new Map(
    profiles.map((profile) => [String(profile.customerId), String(profile.displayName || "").trim()])
  );
}

function serializeMembership(membership, nameMap = new Map(), serviceMap = null) {
  if (!membership) return null;
  const planSnapshot = membership.planSnapshot || {};
  const effectiveStatus = getEffectiveMembershipStatus(membership);
  const serviceEligibilityOverride = membership.serviceEligibilityOverride || null;
  const benefitRulesOverride = membership.benefitRulesOverride || null;
  const effectiveEligibleMenuItemIds = getEffectiveEligibleMenuItemIds(membership);

  return {
    id: String(membership._id),
    vendorId: String(membership.vendorId),
    customerId: String(membership.customerId),
    customerMobileSnapshot: membership.customerMobileSnapshot || "",
    customerName: nameMap.get(String(membership.customerId || "")) || "",
    membershipPlanId: String(membership.membershipPlanId),
    renewedFromMembershipId: membership.renewedFromMembershipId
      ? String(membership.renewedFromMembershipId)
      : null,
    renewalRecordedAt: membership.renewalRecordedAt || null,
    membershipType: membership.membershipType,
    planSnapshot: {
      ...planSnapshot,
      planId: planSnapshot.planId ? String(planSnapshot.planId) : String(membership.membershipPlanId),
      eligibleMenuItemIds: (planSnapshot.eligibleMenuItemIds || []).map((id) => String(id)),
    },
    ...(membership.membershipType === "PREPAID_VALUE"
      ? { prepaidValueSnapshot: membership.prepaidValueSnapshot || null }
      : {}),
    ...(membership.membershipType === "PREPAID_SESSIONS"
      ? {
          prepaidSessionsSnapshot: membership.prepaidSessionsSnapshot
            ? {
                ...membership.prepaidSessionsSnapshot,
                eligibleItemId: String(membership.prepaidSessionsSnapshot.eligibleItemId || ""),
              }
            : null,
        }
      : {}),
    serviceEligibilityOverride: serviceEligibilityOverride?.eligibleMenuItemIds
      ? {
          eligibleMenuItemIds: (serviceEligibilityOverride.eligibleMenuItemIds || []).map((id) => String(id)),
          revisionId: serviceEligibilityOverride.revisionId
            ? String(serviceEligibilityOverride.revisionId)
            : null,
          appliedAt: serviceEligibilityOverride.appliedAt || null,
          source: serviceEligibilityOverride.source || "",
        }
      : null,
    effectiveEligibleMenuItemIds,
    eligibleServices: serviceMap
      ? getEligibleServicesForMembership(membership, serviceMap)
      : undefined,
    benefitRulesOverride: benefitRulesOverride?.benefitSemanticsVersion
      ? {
          allowAdditionalDiscountOnMembershipItems:
            benefitRulesOverride.allowAdditionalDiscountOnMembershipItems === true,
          allowRewardsOnMembershipItems:
            benefitRulesOverride.allowRewardsOnMembershipItems === true,
          benefitSemanticsVersion:
            benefitRulesOverride.benefitSemanticsVersion || "LEGACY_NON_MEMBERSHIP_FLAGS",
          revisionId: benefitRulesOverride.revisionId
            ? String(benefitRulesOverride.revisionId)
            : null,
          updatedAt: benefitRulesOverride.updatedAt || null,
          source: benefitRulesOverride.source || "",
        }
      : null,
    sellingPriceAtPurchase: Number(membership.sellingPriceAtPurchase || 0),
    activatedAt: membership.activatedAt,
    expiresAt: membership.expiresAt,
    status: effectiveStatus,
    storedStatus: membership.status,
    payment: {
      method: membership.payment?.method || "",
      reference: membership.payment?.reference || "",
      amount: Number(membership.payment?.amount || 0),
    },
    createdAt: membership.createdAt,
    updatedAt: membership.updatedAt,
  };
}

async function findVendorScopedCustomerByMobile(vendorId, fullNumber) {
  const customer = await Customer.findOne({ fullNumber }).lean();
  if (!customer) return null;

  const [hasBill, hasMembership] = await Promise.all([
    BillingSession.exists({ vendorId, customerId: customer._id }),
    CustomerMembership.exists({ vendorId, customerId: customer._id }),
  ]);
  if (!hasBill && !hasMembership) return null;

  return customer;
}

async function findOrCreateCustomer(fullNumber, session) {
  let customer = await Customer.findOne({ fullNumber }).session(session);
  if (customer) return customer;

  const parts = splitIndianMobile(fullNumber);
  customer = await Customer.create(
    [
      {
        countryCode: parts.countryCode,
        phone: parts.phone,
        fullNumber: parts.fullNumber,
      },
    ],
    { session }
  );
  return customer[0];
}

async function lookupCustomer(req, res) {
  try {
    const vendorId = getAuthorizedVendorId(req);
    const fullNumber = normalizeMobileInput(req.query?.mobile);

    if (!isCanonicalObjectId(vendorId)) {
      return res.status(400).json({ success: false, message: "Valid vendorId required" });
    }
    if (!fullNumber) {
      return res.status(400).json({ success: false, message: "Valid customer mobile number required" });
    }

    const customer = await findVendorScopedCustomerByMobile(vendorId, fullNumber);
    return res.json({
      success: true,
      found: Boolean(customer),
      customer: customer
        ? {
            id: String(customer._id),
            fullNumber: customer.fullNumber,
            phone: customer.phone,
            countryCode: customer.countryCode,
          }
        : null,
    });
  } catch (error) {
    console.error("Customer membership lookup error:", error?.message || error);
    return res.status(500).json({ success: false, message: "Failed to lookup customer" });
  }
}

async function activateMembership(req, res) {
  const session = await mongoose.startSession();
  let retryContext = null;

  try {
    const vendorId = getAuthorizedVendorId(req);
    const membershipPlanId = normalizeId(req.body?.membershipPlanId);
    const fullNumber = normalizeMobileInput(req.body?.customerMobile || req.body?.mobile);
    const now = new Date();
    let createdMembership = null;
    let createdWallet = null;
    let replayed = false;

    if (!isCanonicalObjectId(vendorId) || !isCanonicalObjectId(membershipPlanId)) {
      return res.status(400).json({ success: false, message: "Valid vendorId and membershipPlanId required" });
    }
    if (!fullNumber) {
      return res.status(400).json({ success: false, message: "Valid customer mobile number required" });
    }

    await session.withTransaction(async () => {
      const plan = await MembershipPlan.findOne({
        _id: membershipPlanId,
        vendorId,
        status: "ACTIVE",
      })
        .session(session)
        .lean();

      if (!plan) {
        const error = new Error("An active membership plan is required");
        error.statusCode = 400;
        throw error;
      }
      if (!["DISCOUNT", "PREPAID_VALUE", "PREPAID_SESSIONS"].includes(plan.planType)) {
        const error = new Error("This membership type is not available for enrollment");
        error.statusCode = 400;
        throw error;
      }
      if (plan.planType !== "DISCOUNT") assertPrepaidMembershipWalletEnabled();

      const paymentValidation = validatePaymentInput(req.body, plan.sellingPrice);
      if (!paymentValidation.ok) {
        const error = new Error(paymentValidation.message);
        error.statusCode = 400;
        throw error;
      }

      const idempotencyKey = plan.planType === "DISCOUNT"
        ? ""
        : normalizeIdempotencyKey(req.body?.idempotencyKey);
      if (plan.planType !== "DISCOUNT" && !idempotencyKey) {
        const error = new Error("Idempotency key is required for prepaid enrollment");
        error.statusCode = 400;
        throw error;
      }
      const fingerprint = plan.planType === "DISCOUNT"
        ? ""
        : buildEnrollmentFingerprint({
            vendorId,
            membershipPlanId,
            mobile: fullNumber,
            payment: paymentValidation.payment,
          });
      retryContext = { vendorId, idempotencyKey, fingerprint };

      if (idempotencyKey) {
        const existingRetry = await CustomerMembership.findOne({
          vendorId,
          enrollmentIdempotencyKey: idempotencyKey,
        })
          .select("+enrollmentRequestFingerprint")
          .session(session)
          .lean();
        if (existingRetry) {
          if (existingRetry.enrollmentRequestFingerprint !== fingerprint) {
            const error = new Error("Idempotency key was already used for another enrollment");
            error.statusCode = 409;
            throw error;
          }
          createdMembership = existingRetry;
          createdWallet = await PrepaidMembershipWallet.findOne({
            customerMembershipId: existingRetry._id,
            vendorId,
          }).session(session).lean();
          replayed = true;
          return;
        }
      }

      const expiresAt = calculateExpiry(now, plan.duration);
      if (!expiresAt) {
        const error = new Error("Valid membership duration is required");
        error.statusCode = 400;
        throw error;
      }

      const customer = await findOrCreateCustomer(fullNumber, session);

      await refreshLifecycleForCustomer({ vendorId, customerId: customer._id, session, now });

      const existingActive = await CustomerMembership.findOne({
        vendorId,
        customerId: customer._id,
        ...getMembershipEntitlementFilter(plan.planType),
        status: "ACTIVE",
        expiresAt: { $gt: now },
      })
        .session(session)
        .lean();

      if (existingActive) {
        const error = new Error("Customer already has an active membership");
        error.statusCode = 409;
        throw error;
      }


      const prepaidData = plan.planType === "DISCOUNT"
        ? null
        : await buildPrepaidEnrollmentData({
            plan,
            vendorId,
            enrolledAt: now,
            expiresAt,
            session,
          });

      const created = await CustomerMembership.create(
        [
          {
            vendorId,
            customerId: customer._id,
            customerMobileSnapshot: fullNumber,
            membershipPlanId: plan._id,
            membershipType: plan.planType,
            enrollmentIdempotencyKey: idempotencyKey,
            enrollmentRequestFingerprint: fingerprint,
            planSnapshot: buildPlanSnapshot(plan),
            ...(prepaidData ? { [prepaidData.snapshotField]: prepaidData.snapshot } : {}),
            sellingPriceAtPurchase: normalizeMoney(plan.sellingPrice),
            activatedAt: now,
            expiresAt,
            status: "ACTIVE",
            payment: paymentValidation.payment,
            createdBy: {
              authType: req.vendorWriteAuth?.authType || "vendor",
              customerId: req.vendorWriteAuth?.customerId || null,
              adminId: req.vendorWriteAuth?.admin?._id || null,
            },
          },
        ],
        { session }
      );
      createdMembership = created[0];

      if (prepaidData) {
        const wallets = await PrepaidMembershipWallet.create(
          [{
            vendorId,
            customerId: customer._id,
            customerMembershipId: createdMembership._id,
            ...prepaidData.wallet,
            activatesAt: now,
            expiresAt,
            status: "ACTIVE",
          }],
          { session }
        );
        createdWallet = wallets[0];
        await PrepaidWalletLedger.create(
          [{
            vendorId,
            customerId: customer._id,
            customerMembershipId: createdMembership._id,
            walletId: createdWallet._id,
            ...prepaidData.ledger,
            eventType: "CREDIT",
            occurredAt: now,
            idempotencyKey: `enrollment:${idempotencyKey}`,
            audit: { source: "MEMBERSHIP_ENROLLMENT" },
          }],
          { session }
        );
      }
    });

    const membershipObject = typeof createdMembership?.toObject === "function"
      ? createdMembership.toObject()
      : createdMembership;
    const walletObject = typeof createdWallet?.toObject === "function"
      ? createdWallet.toObject()
      : createdWallet;
    if (membershipObject.membershipType === "DISCOUNT") {
      return res.status(201).json({
        success: true,
        data: serializeMembership(membershipObject),
      });
    }
    return res.status(replayed ? 200 : 201).json({
      success: true,
      replayed,
      data: serializeMembership(membershipObject),
      wallet: serializeWallet(walletObject),
    });
  } catch (error) {
    if (error?.code === 11000 && retryContext?.idempotencyKey) {
      const existingRetry = await CustomerMembership.findOne({
        vendorId: retryContext.vendorId,
        enrollmentIdempotencyKey: retryContext.idempotencyKey,
      }).select("+enrollmentRequestFingerprint").lean();
      if (
        existingRetry &&
        existingRetry.enrollmentRequestFingerprint === retryContext.fingerprint
      ) {
        const wallet = await PrepaidMembershipWallet.findOne({
          customerMembershipId: existingRetry._id,
          vendorId: retryContext.vendorId,
        }).lean();
        return res.status(200).json({
          success: true,
          replayed: true,
          data: serializeMembership(existingRetry),
          wallet: serializeWallet(wallet),
        });
      }
    }
    const duplicateActive = error?.code === 11000;
    const status = duplicateActive ? 409 : error?.statusCode || 500;
    const message = duplicateActive
      ? "Customer already has an active membership"
      : error?.statusCode
        ? error.message
        : "Failed to activate membership";
    if (!error?.statusCode && !duplicateActive) {
      console.error("Customer membership activation error:", error?.message || error);
    }
    return res.status(status).json({ success: false, message, code: error?.code || undefined });
  } finally {
    await session.endSession();
  }
}

async function listMemberships(req, res) {
  try {
    const vendorId = getAuthorizedVendorId(req);
    const limit = Math.min(Math.max(Number(req.query?.limit) || 25, 1), 50);
    const page = Math.max(Number(req.query?.page) || 1, 1);
    const status = String(req.query?.status || "").trim().toUpperCase();
    const membershipType = String(req.query?.membershipType || "").trim().toUpperCase();
    const search = String(req.query?.search || "").trim();
    const query = { vendorId };
    const now = new Date();

    if (!isCanonicalObjectId(vendorId)) {
      return res.status(400).json({ success: false, message: "Valid vendorId required" });
    }
    if (FILTERABLE_MEMBERSHIP_TYPES.includes(membershipType)) {
      query.membershipType = membershipType;
    }
    if (status === "ACTIVE") {
      query.status = "ACTIVE";
      query.expiresAt = { $gt: now };
    } else if (status === "EXPIRED") {
      query.$or = [
        { status: "EXPIRED" },
        { status: "ACTIVE", expiresAt: { $lte: now } },
        { status: "DEPLETED", expiresAt: { $lte: now } },
      ];
    } else if (status === "CANCELLED") {
      query.status = status;
    } else if (status === "DEPLETED") {
      query.status = "DEPLETED";
    } else if (status === "SCHEDULED") {
      query.status = "SCHEDULED";
      query.activatedAt = { $gt: now };
    }
    if (isCanonicalObjectId(req.query?.customerId)) {
      query.customerId = req.query.customerId;
    }
    if (search) {
      const escapedSearch = escapeRegExp(search);
      const normalizedSearchMobile = normalizeMobileInput(search);
      const searchClauses = [
        { "planSnapshot.name": { $regex: escapedSearch, $options: "i" } },
      ];
      if (normalizedSearchMobile) {
        searchClauses.push({ customerMobileSnapshot: normalizedSearchMobile });
      } else if (/\d/.test(search)) {
        searchClauses.push({ customerMobileSnapshot: { $regex: escapeRegExp(search.replace(/\D/g, "")) } });
      }
      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: searchClauses }];
        delete query.$or;
      } else {
        query.$or = searchClauses;
      }
    }

    const skip = (page - 1) * limit;
    const [memberships, total] = await Promise.all([
      CustomerMembership.find(query)
      .sort(getMembershipSort(req.query?.sort))
      .skip(skip)
      .limit(limit)
      .lean(),
      CustomerMembership.countDocuments(query),
    ]);
    const prepaidMembershipIds = memberships
      .filter((membership) => PREPAID_MEMBERSHIP_TYPES.includes(membership.membershipType))
      .map((membership) => membership._id);
    const prepaidCustomerIds = Array.from(new Set(
      memberships
        .filter((membership) => PREPAID_MEMBERSHIP_TYPES.includes(membership.membershipType))
        .map((membership) => String(membership.customerId))
    ));
    const [nameMap, wallets, prepaidPeers] = await Promise.all([
      getVendorCustomerNameMap(vendorId, memberships),
      prepaidMembershipIds.length
        ? PrepaidMembershipWallet.find({
            vendorId,
            customerMembershipId: { $in: prepaidMembershipIds },
          }).lean()
        : [],
      prepaidCustomerIds.length
        ? CustomerMembership.find({
            vendorId,
            customerId: { $in: prepaidCustomerIds },
            membershipType: { $in: PREPAID_MEMBERSHIP_TYPES },
            status: { $in: ["ACTIVE", "SCHEDULED"] },
            expiresAt: { $gt: now },
          })
            .select("_id customerId membershipType status activatedAt expiresAt")
            .lean()
        : [],
    ]);
    const walletMap = new Map(wallets.map((wallet) => [String(wallet.customerMembershipId), wallet]));

    return res.json({
      success: true,
      data: memberships.map((membership) => {
        const wallet = walletMap.get(String(membership._id)) || null;
        const isPrepaid = PREPAID_MEMBERSHIP_TYPES.includes(membership.membershipType);
        const competingMembership = isPrepaid
          ? findCompetingPrepaidMembership(membership, prepaidPeers)
          : null;
        return {
          ...serializeMembership(membership, nameMap),
          ...(isPrepaid
            ? {
                wallet: serializeWallet(wallet),
                renewal: getPrepaidRenewalAvailability({
                  effectiveStatus: getEffectiveMembershipStatus(membership, now),
                  wallet,
                  membershipType: membership.membershipType,
                  competingMembership,
                }),
              }
            : {}),
        };
      }),
      pagination: {
        limit,
        page,
        returned: memberships.length,
        total,
        hasMore: skip + memberships.length < total,
      },
    });
  } catch (error) {
    console.error("Customer membership list error:", error?.message || error);
    return res.status(500).json({ success: false, message: "Failed to load customer memberships" });
  }
}

async function getMembership(req, res) {
  try {
    const vendorId = getAuthorizedVendorId(req);
    const membershipId = normalizeId(req.params?.membershipId);

    if (!isCanonicalObjectId(vendorId) || !isCanonicalObjectId(membershipId)) {
      return res.status(400).json({ success: false, message: "Valid vendorId and membershipId required" });
    }

    const membership = await CustomerMembership.findOne({ _id: membershipId, vendorId }).lean();
    if (!membership) {
      return res.status(404).json({ success: false, message: "Customer membership not found" });
    }

    const history = await CustomerMembership.find({
      vendorId,
      customerId: membership.customerId,
      membershipPlanId: membership.membershipPlanId,
    })
      .sort({ activatedAt: 1, createdAt: 1, _id: 1 })
      .lean();

    const isPrepaid = PREPAID_MEMBERSHIP_TYPES.includes(membership.membershipType);
    if (isPrepaid) assertPrepaidMembershipWalletEnabled();
    const [nameMap, serviceMap, wallet, prepaidPeers] = await Promise.all([
      getVendorCustomerNameMap(vendorId, [membership, ...history]),
      loadMembershipEligibleServiceMap([membership, ...history]),
      isPrepaid
        ? PrepaidMembershipWallet.findOne({ vendorId, customerMembershipId: membership._id }).lean()
        : null,
      isPrepaid
        ? CustomerMembership.find({
            vendorId,
            customerId: membership.customerId,
            membershipType: { $in: PREPAID_MEMBERSHIP_TYPES },
            status: { $in: ["ACTIVE", "SCHEDULED"] },
            expiresAt: { $gt: new Date() },
          })
            .select("_id customerId membershipType status activatedAt expiresAt")
            .lean()
        : [],
    ]);
    const walletLedger = wallet
      ? await PrepaidWalletLedger.find({ vendorId, walletId: wallet._id })
          .sort({ occurredAt: -1, _id: -1 })
          .lean()
      : [];

    return res.json({
      success: true,
      data: {
        ...serializeMembership(membership, nameMap, serviceMap),
        ...(isPrepaid
          ? {
              renewal: getPrepaidRenewalAvailability({
                effectiveStatus: getEffectiveMembershipStatus(membership),
                wallet,
                membershipType: membership.membershipType,
                competingMembership: findCompetingPrepaidMembership(membership, prepaidPeers),
              }),
            }
          : {}),
      },
      history: history.map((row) => serializeMembership(row, nameMap, serviceMap)),
      wallet: serializeWallet(wallet),
      walletLedger: walletLedger.map(serializeWalletLedger),
    });
  } catch (error) {
    if (error?.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
        code: error.code || undefined,
      });
    }
    console.error("Customer membership detail error:", error?.message || error);
    return res.status(500).json({ success: false, message: "Failed to load customer membership" });
  }
}

async function renewMembership(req, res) {
  const session = await mongoose.startSession();
  let retryContext = null;

  try {
    const vendorId = getAuthorizedVendorId(req);
    const membershipId = normalizeId(req.params?.membershipId);
    const now = new Date();
    let renewalMembership = null;
    let renewalWallet = null;
    let replayed = false;

    if (!isCanonicalObjectId(vendorId) || !isCanonicalObjectId(membershipId)) {
      return res.status(400).json({ success: false, message: "Valid vendorId and membershipId required" });
    }

    await session.withTransaction(async () => {
      const existing = await CustomerMembership.findOne({ _id: membershipId, vendorId })
        .session(session)
        .lean();

      if (!existing) {
        const error = new Error("Customer membership not found");
        error.statusCode = 404;
        throw error;
      }
      if (!["DISCOUNT", "PREPAID_VALUE", "PREPAID_SESSIONS"].includes(existing.membershipType)) {
        const error = new Error("This membership type cannot be renewed");
        error.statusCode = 400;
        throw error;
      }
      if (existing.membershipType !== "DISCOUNT") assertPrepaidMembershipWalletEnabled();
      if (getEffectiveMembershipStatus(existing, now) === "CANCELLED") {
        const error = new Error("Cancelled memberships cannot be renewed");
        error.statusCode = 400;
        throw error;
      }

      await refreshLifecycleForCustomer({
        vendorId,
        customerId: existing.customerId,
        session,
        now,
      });

      let refreshedExisting = await CustomerMembership.findOne({ _id: membershipId, vendorId })
        .session(session)
        .lean();
      let effectiveStatus = getEffectiveMembershipStatus(refreshedExisting, now);
      if (!["ACTIVE", "DEPLETED", "EXPIRED"].includes(effectiveStatus)) {
        const error = new Error("Only active or expired memberships can be renewed");
        error.statusCode = 400;
        throw error;
      }

      const plan = await MembershipPlan.findOne({
        _id: refreshedExisting.membershipPlanId,
        vendorId,
        planType: refreshedExisting.membershipType,
        status: "ACTIVE",
      })
        .session(session)
        .lean();
      if (!plan) {
        const error = new Error("The current membership plan is inactive or unavailable");
        error.statusCode = 400;
        throw error;
      }

      const paymentValidation = validatePaymentInput(req.body, plan.sellingPrice);
      if (!paymentValidation.ok) {
        const error = new Error(paymentValidation.message);
        error.statusCode = 400;
        throw error;
      }

      const idempotencyKey = plan.planType === "DISCOUNT"
        ? ""
        : normalizeIdempotencyKey(req.body?.idempotencyKey);
      if (plan.planType !== "DISCOUNT" && !idempotencyKey) {
        const error = new Error("Idempotency key is required for prepaid renewal");
        error.statusCode = 400;
        throw error;
      }
      const fingerprint = plan.planType === "DISCOUNT"
        ? ""
        : buildEnrollmentFingerprint({
            vendorId,
            membershipPlanId: plan._id,
            mobile: refreshedExisting.customerMobileSnapshot,
            payment: paymentValidation.payment,
            renewalOf: refreshedExisting._id,
          });
      retryContext = { vendorId, idempotencyKey, fingerprint };
      if (idempotencyKey) {
        const existingRetry = await CustomerMembership.findOne({
          vendorId,
          enrollmentIdempotencyKey: idempotencyKey,
        })
          .select("+enrollmentRequestFingerprint")
          .session(session)
          .lean();
        if (existingRetry) {
          if (existingRetry.enrollmentRequestFingerprint !== fingerprint) {
            const error = new Error("Idempotency key was already used for another enrollment");
            error.statusCode = 409;
            throw error;
          }
          renewalMembership = existingRetry;
          renewalWallet = await PrepaidMembershipWallet.findOne({
            customerMembershipId: existingRetry._id,
            vendorId,
          }).session(session).lean();
          replayed = true;
          return;
        }
      }

      const isPrepaidRenewal = PREPAID_MEMBERSHIP_TYPES.includes(
        refreshedExisting.membershipType
      );
      const pendingRenewal = await CustomerMembership.findOne({
        vendorId,
        customerId: refreshedExisting.customerId,
        ...(plan.planType === "DISCOUNT"
          ? { membershipPlanId: refreshedExisting.membershipPlanId }
          : getMembershipEntitlementFilter(plan.planType)),
        status: "SCHEDULED",
        expiresAt: { $gt: now },
      })
        .session(session)
        .lean();
      if (pendingRenewal) {
        const error = new Error("A scheduled renewal already exists for this membership");
        error.statusCode = 409;
        throw error;
      }

      const competingActivePrepaid = isPrepaidRenewal
        ? await CustomerMembership.findOne({
            _id: { $ne: refreshedExisting._id },
            vendorId,
            customerId: refreshedExisting.customerId,
            membershipType: { $in: PREPAID_MEMBERSHIP_TYPES },
            status: "ACTIVE",
            expiresAt: { $gt: now },
          })
            .session(session)
            .lean()
        : null;
      if (competingActivePrepaid) {
        const error = new Error(
          "Renewal is unavailable because a newer active or scheduled prepaid membership already exists."
        );
        error.statusCode = 409;
        error.code = "prepaid_renewal_successor_exists";
        throw error;
      }

      let sourceWallet = null;
      if (isPrepaidRenewal) {
        sourceWallet = await PrepaidMembershipWallet.findOne({
          vendorId,
          customerId: refreshedExisting.customerId,
          customerMembershipId: refreshedExisting._id,
          walletType: refreshedExisting.membershipType,
        }).session(session).lean();
        const renewalAvailability = getPrepaidRenewalAvailability({
          effectiveStatus,
          wallet: sourceWallet,
          membershipType: refreshedExisting.membershipType,
        });
        if (renewalAvailability.code === "prepaid_renewal_wallet_inconsistent") {
          const error = new Error("Prepaid wallet record is missing or inconsistent");
          error.statusCode = 409;
          error.code = "prepaid_renewal_wallet_inconsistent";
          throw error;
        }
        if (renewalAvailability.code === "prepaid_renewal_balance_remaining") {
          const error = new Error(
            "Renewal is available after the current wallet balance is exhausted or the membership expires."
          );
          error.statusCode = 409;
          error.code = "prepaid_renewal_balance_remaining";
          throw error;
        }
        const remainingBalance = renewalAvailability.remainingBalance;
        if (remainingBalance === 0 && effectiveStatus !== "EXPIRED") {
          const walletUpdate = sourceWallet.status === "DEPLETED"
            ? { modifiedCount: 1 }
            : await PrepaidMembershipWallet.updateOne(
                {
                  _id: sourceWallet._id,
                  vendorId,
                  status: "ACTIVE",
                  ...(refreshedExisting.membershipType === "PREPAID_VALUE"
                    ? { remainingAmountPaise: 0 }
                    : { remainingQuantity: 0 }),
                },
                { $set: { status: "DEPLETED" } },
                { session }
              );
          const membershipUpdate = refreshedExisting.status === "DEPLETED"
            ? { modifiedCount: 1 }
            : await CustomerMembership.updateOne(
                {
                  _id: refreshedExisting._id,
                  vendorId,
                  status: "ACTIVE",
                  expiresAt: { $gt: now },
                },
                { $set: { status: "DEPLETED" } },
                { session }
              );
          if (walletUpdate.modifiedCount !== 1 || membershipUpdate.modifiedCount !== 1) {
            const error = new Error("Prepaid wallet status changed during renewal");
            error.statusCode = 409;
            error.code = "prepaid_renewal_state_conflict";
            throw error;
          }
          refreshedExisting = { ...refreshedExisting, status: "DEPLETED" };
          effectiveStatus = "DEPLETED";
        }
      }

      const renewalStartsAt =
        !isPrepaidRenewal && effectiveStatus === "ACTIVE" && refreshedExisting.expiresAt
          ? new Date(refreshedExisting.expiresAt)
          : now;
      const expiresAt = calculateExpiry(renewalStartsAt, plan.duration);
      const renewalStatus = renewalStartsAt.getTime() > now.getTime() ? "SCHEDULED" : "ACTIVE";

      if (renewalStatus === "ACTIVE") {
        const overlappingActive = await CustomerMembership.findOne({
          vendorId,
          customerId: refreshedExisting.customerId,
          ...getMembershipEntitlementFilter(refreshedExisting.membershipType),
          status: "ACTIVE",
          expiresAt: { $gt: now },
        })
          .session(session)
          .lean();
        if (overlappingActive && String(overlappingActive._id) !== String(refreshedExisting._id)) {
          const error = new Error("Customer already has an active membership");
          error.statusCode = 409;
          throw error;
        }
      }

      const prepaidData = plan.planType === "DISCOUNT"
        ? null
        : await buildPrepaidEnrollmentData({
            plan,
            vendorId,
            enrolledAt: now,
            expiresAt,
            session,
          });

      const created = await CustomerMembership.create(
        [
          {
            vendorId,
            customerId: refreshedExisting.customerId,
            customerMobileSnapshot: refreshedExisting.customerMobileSnapshot,
            membershipPlanId: plan._id,
            renewedFromMembershipId: refreshedExisting._id,
            renewalRecordedAt: now,
            membershipType: plan.planType,
            enrollmentIdempotencyKey: idempotencyKey,
            enrollmentRequestFingerprint: fingerprint,
            planSnapshot: buildPlanSnapshot(plan),
            ...(prepaidData ? { [prepaidData.snapshotField]: prepaidData.snapshot } : {}),
            sellingPriceAtPurchase: normalizeMoney(plan.sellingPrice),
            activatedAt: renewalStartsAt,
            expiresAt,
            status: renewalStatus,
            payment: paymentValidation.payment,
            createdBy: {
              authType: req.vendorWriteAuth?.authType || "vendor",
              customerId: req.vendorWriteAuth?.customerId || null,
              adminId: req.vendorWriteAuth?.admin?._id || null,
            },
          },
        ],
        { session }
      );
      renewalMembership = created[0];

      if (prepaidData) {
        const wallets = await PrepaidMembershipWallet.create(
          [{
            vendorId,
            customerId: refreshedExisting.customerId,
            customerMembershipId: renewalMembership._id,
            ...prepaidData.wallet,
            activatesAt: renewalStartsAt,
            expiresAt,
            status: renewalStatus,
          }],
          { session }
        );
        renewalWallet = wallets[0];
        await PrepaidWalletLedger.create(
          [{
            vendorId,
            customerId: refreshedExisting.customerId,
            customerMembershipId: renewalMembership._id,
            walletId: renewalWallet._id,
            ...prepaidData.ledger,
            eventType: "CREDIT",
            occurredAt: now,
            idempotencyKey: `renewal:${idempotencyKey}`,
            audit: { source: "MEMBERSHIP_RENEWAL", renewedFromMembershipId: refreshedExisting._id },
          }],
          { session }
        );
      }
    });

    const membershipObject = typeof renewalMembership?.toObject === "function"
      ? renewalMembership.toObject()
      : renewalMembership;
    const walletObject = typeof renewalWallet?.toObject === "function"
      ? renewalWallet.toObject()
      : renewalWallet;
    if (membershipObject.membershipType === "DISCOUNT") {
      return res.status(201).json({
        success: true,
        data: serializeMembership(membershipObject),
      });
    }
    return res.status(replayed ? 200 : 201).json({
      success: true,
      replayed,
      data: serializeMembership(membershipObject),
      wallet: serializeWallet(walletObject),
    });
  } catch (error) {
    if (error?.code === 11000 && retryContext?.idempotencyKey) {
      const existingRetry = await CustomerMembership.findOne({
        vendorId: retryContext.vendorId,
        enrollmentIdempotencyKey: retryContext.idempotencyKey,
      }).select("+enrollmentRequestFingerprint").lean();
      if (
        existingRetry &&
        existingRetry.enrollmentRequestFingerprint === retryContext.fingerprint
      ) {
        const wallet = await PrepaidMembershipWallet.findOne({
          customerMembershipId: existingRetry._id,
          vendorId: retryContext.vendorId,
        }).lean();
        return res.status(200).json({
          success: true,
          replayed: true,
          data: serializeMembership(existingRetry),
          wallet: serializeWallet(wallet),
        });
      }
    }
    const duplicateRenewal = error?.code === 11000;
    const status = duplicateRenewal ? 409 : error?.statusCode || 500;
    const message = duplicateRenewal
      ? "A scheduled renewal already exists for this membership"
      : error?.statusCode
        ? error.message
        : "Failed to renew membership";
    if (!error?.statusCode && !duplicateRenewal) {
      console.error("Customer membership renewal error:", error?.message || error);
    }
    return res.status(status).json({ success: false, message, code: error?.code || undefined });
  } finally {
    await session.endSession();
  }
}

module.exports = {
  lookupCustomer,
  activateMembership,
  renewMembership,
  listMemberships,
  getMembership,
  _private: {
    normalizeMobileInput,
    addCalendarMonths,
    calculateExpiry,
    buildPlanSnapshot,
    validatePaymentInput,
    moneyToPaise,
    normalizeIdempotencyKey,
    buildEnrollmentFingerprint,
    buildPrepaidEnrollmentData,
    getEffectiveMembershipStatus,
    getPrepaidWalletRemainingBalance,
    getPrepaidRenewalAvailability,
    findCompetingPrepaidMembership,
    serializeWallet,
    serializeWalletLedger,
    serializeMembership,
    refreshLifecycleForCustomer,
    getMembershipSort,
    DURATION_MONTHS,
    PAYMENT_METHODS,
  },
};
