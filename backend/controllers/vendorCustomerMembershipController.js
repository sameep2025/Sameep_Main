const mongoose = require("mongoose");
const BillingSession = require("../models/BillingSession");
const Customer = require("../models/Customer");
const CustomerMembership = require("../models/CustomerMembership");
const MembershipPlan = require("../models/MembershipPlan");
const VendorCustomerProfile = require("../models/VendorCustomerProfile");
const {
  getEffectiveEligibleMenuItemIds,
  getEligibleServicesForMembership,
  loadMembershipEligibleServiceMap,
} = require("../utils/membershipEligibleServices");

const PAYMENT_METHODS = CustomerMembership.constants.PAYMENT_METHODS;
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
  if (startTime && startTime > nowTime) return "SCHEDULED";
  return "ACTIVE";
}

async function refreshLifecycleForCustomer({ vendorId, customerId, session, now = new Date() }) {
  await CustomerMembership.updateMany(
    {
      vendorId,
      customerId,
      status: "ACTIVE",
      expiresAt: { $lte: now },
    },
    { $set: { status: "EXPIRED" } },
    { session }
  );

  await CustomerMembership.updateMany(
    {
      vendorId,
      customerId,
      status: "SCHEDULED",
      activatedAt: { $lte: now },
      expiresAt: { $gt: now },
    },
    { $set: { status: "ACTIVE" } },
    { session }
  );
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

  try {
    const vendorId = getAuthorizedVendorId(req);
    const membershipPlanId = normalizeId(req.body?.membershipPlanId);
    const fullNumber = normalizeMobileInput(req.body?.customerMobile || req.body?.mobile);
    const now = new Date();
    let createdMembership = null;

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
        planType: "DISCOUNT",
        status: "ACTIVE",
      })
        .session(session)
        .lean();

      if (!plan) {
        const error = new Error("Only active DISCOUNT membership plans can be activated");
        error.statusCode = 400;
        throw error;
      }

      const paymentValidation = validatePaymentInput(req.body, plan.sellingPrice);
      if (!paymentValidation.ok) {
        const error = new Error(paymentValidation.message);
        error.statusCode = 400;
        throw error;
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

      const created = await CustomerMembership.create(
        [
          {
            vendorId,
            customerId: customer._id,
            customerMobileSnapshot: fullNumber,
            membershipPlanId: plan._id,
            membershipType: "DISCOUNT",
            planSnapshot: buildPlanSnapshot(plan),
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
    });

    return res.status(201).json({
      success: true,
      data: serializeMembership(createdMembership.toObject()),
    });
  } catch (error) {
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
    return res.status(status).json({ success: false, message });
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
    const search = String(req.query?.search || "").trim();
    const query = { vendorId };
    const now = new Date();

    if (!isCanonicalObjectId(vendorId)) {
      return res.status(400).json({ success: false, message: "Valid vendorId required" });
    }
    if (status === "ACTIVE") {
      query.status = "ACTIVE";
      query.expiresAt = { $gt: now };
    } else if (status === "EXPIRED") {
      query.$or = [
        { status: "EXPIRED" },
        { status: "ACTIVE", expiresAt: { $lte: now } },
      ];
    } else if (status === "CANCELLED") {
      query.status = status;
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
    const nameMap = await getVendorCustomerNameMap(vendorId, memberships);

    return res.json({
      success: true,
      data: memberships.map((membership) => serializeMembership(membership, nameMap)),
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

    const [nameMap, serviceMap] = await Promise.all([
      getVendorCustomerNameMap(vendorId, [membership, ...history]),
      loadMembershipEligibleServiceMap([membership, ...history]),
    ]);

    return res.json({
      success: true,
      data: serializeMembership(membership, nameMap, serviceMap),
      history: history.map((row) => serializeMembership(row, nameMap, serviceMap)),
    });
  } catch (error) {
    console.error("Customer membership detail error:", error?.message || error);
    return res.status(500).json({ success: false, message: "Failed to load customer membership" });
  }
}

async function renewMembership(req, res) {
  const session = await mongoose.startSession();

  try {
    const vendorId = getAuthorizedVendorId(req);
    const membershipId = normalizeId(req.params?.membershipId);
    const now = new Date();
    let renewalMembership = null;

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
      if (existing.membershipType !== "DISCOUNT") {
        const error = new Error("Only DISCOUNT memberships can be renewed in this phase");
        error.statusCode = 400;
        throw error;
      }
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

      const refreshedExisting = await CustomerMembership.findOne({ _id: membershipId, vendorId })
        .session(session)
        .lean();
      const effectiveStatus = getEffectiveMembershipStatus(refreshedExisting, now);
      if (!["ACTIVE", "EXPIRED"].includes(effectiveStatus)) {
        const error = new Error("Only active or expired memberships can be renewed");
        error.statusCode = 400;
        throw error;
      }

      const pendingRenewal = await CustomerMembership.findOne({
        vendorId,
        customerId: refreshedExisting.customerId,
        membershipPlanId: refreshedExisting.membershipPlanId,
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

      const plan = await MembershipPlan.findOne({
        _id: refreshedExisting.membershipPlanId,
        vendorId,
        planType: "DISCOUNT",
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

      const renewalStartsAt =
        effectiveStatus === "ACTIVE" && refreshedExisting.expiresAt
          ? new Date(refreshedExisting.expiresAt)
          : now;
      const expiresAt = calculateExpiry(renewalStartsAt, plan.duration);
      const renewalStatus = renewalStartsAt.getTime() > now.getTime() ? "SCHEDULED" : "ACTIVE";

      if (renewalStatus === "ACTIVE") {
        const overlappingActive = await CustomerMembership.findOne({
          vendorId,
          customerId: refreshedExisting.customerId,
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

      const created = await CustomerMembership.create(
        [
          {
            vendorId,
            customerId: refreshedExisting.customerId,
            customerMobileSnapshot: refreshedExisting.customerMobileSnapshot,
            membershipPlanId: plan._id,
            renewedFromMembershipId: refreshedExisting._id,
            renewalRecordedAt: now,
            membershipType: "DISCOUNT",
            planSnapshot: buildPlanSnapshot(plan),
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
    });

    return res.status(201).json({
      success: true,
      data: serializeMembership(renewalMembership.toObject()),
    });
  } catch (error) {
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
    return res.status(status).json({ success: false, message });
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
    serializeMembership,
    getEffectiveMembershipStatus,
    refreshLifecycleForCustomer,
    getMembershipSort,
    DURATION_MONTHS,
    PAYMENT_METHODS,
  },
};
