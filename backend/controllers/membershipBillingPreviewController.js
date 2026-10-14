const mongoose = require("mongoose");
const Customer = require("../models/Customer");
const CustomerMembership = require("../models/CustomerMembership");
const {
  calculateMembershipBillingPreview,
} = require("../utils/membershipBillingCalculator");

function normalizeId(value) {
  return String(value || "").trim();
}

function normalizeMobileInput(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return "";
}

function normalizeMoney(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.round(number * 100) / 100;
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

function serializePreviewMembership(membership) {
  const snapshot = membership?.planSnapshot || {};
  const effectiveEligibleMenuItemIds = resolveEffectiveEligibleMenuItemIds(membership);
  const benefits = resolveEffectiveBenefitFlags(membership);
  return {
    id: String(membership._id),
    planName: snapshot.name || "",
    discountPercentage: normalizeMoney(snapshot.discountPercentage),
    minimumBillAmount: normalizeMoney(snapshot.minimumBillAmount),
    expiresAt: membership.expiresAt,
    eligibleMenuItemIds: effectiveEligibleMenuItemIds,
    eligibilitySource: Array.isArray(membership?.serviceEligibilityOverride?.eligibleMenuItemIds)
      ? "SERVICE_ELIGIBILITY_OVERRIDE"
      : "PURCHASED_SNAPSHOT",
    applyDiscountOnNonMembershipItems: snapshot.applyDiscountOnNonMembershipItems === true,
    rewardsOnNonMembershipItems: snapshot.rewardsOnNonMembershipItems !== false,
    allowAdditionalDiscountOnMembershipItems: benefits.allowAdditionalDiscountOnMembershipItems,
    allowRewardsOnMembershipItems: benefits.allowRewardsOnMembershipItems,
    benefitSemanticsVersion: benefits.benefitSemanticsVersion,
    benefitRulesSource: benefits.source,
  };
}

function resolveBenefitFieldsFromVersionedSource(source = {}) {
  if (source.benefitSemanticsVersion === "MEMBERSHIP_ITEM_FLAGS_V1") {
    return {
      allowAdditionalDiscountOnMembershipItems:
        source.allowAdditionalDiscountOnMembershipItems === true,
      allowRewardsOnMembershipItems: source.allowRewardsOnMembershipItems === true,
      benefitSemanticsVersion: "MEMBERSHIP_ITEM_FLAGS_V1",
    };
  }

  return {
    allowAdditionalDiscountOnMembershipItems: false,
    allowRewardsOnMembershipItems: false,
    benefitSemanticsVersion: "LEGACY_NON_MEMBERSHIP_FLAGS",
  };
}

function resolveEffectiveBenefitFlags(membershipOrSnapshot = {}) {
  const override = membershipOrSnapshot?.benefitRulesOverride;
  if (override?.benefitSemanticsVersion === "MEMBERSHIP_ITEM_FLAGS_V1") {
    return {
      ...resolveBenefitFieldsFromVersionedSource(override),
      source: "BENEFIT_RULES_OVERRIDE",
    };
  }

  const snapshot = membershipOrSnapshot?.planSnapshot || membershipOrSnapshot;
  return {
    ...resolveBenefitFieldsFromVersionedSource(snapshot),
    source: "PURCHASED_SNAPSHOT",
  };
}

function resolveEffectiveBenefitFlagsFromSnapshot(snapshot = {}) {
  if (snapshot.benefitSemanticsVersion === "MEMBERSHIP_ITEM_FLAGS_V1") {
    return {
      allowAdditionalDiscountOnMembershipItems:
        snapshot.allowAdditionalDiscountOnMembershipItems === true,
      allowRewardsOnMembershipItems: snapshot.allowRewardsOnMembershipItems === true,
      benefitSemanticsVersion: "MEMBERSHIP_ITEM_FLAGS_V1",
    };
  }

  return {
    allowAdditionalDiscountOnMembershipItems: false,
    allowRewardsOnMembershipItems: false,
    benefitSemanticsVersion: "LEGACY_NON_MEMBERSHIP_FLAGS",
  };
}

function resolveEffectiveEligibleMenuItemIds(membership) {
  const overrideIds = membership?.serviceEligibilityOverride?.eligibleMenuItemIds;
  if (Array.isArray(overrideIds)) {
    return overrideIds.map((id) => String(id));
  }
  return (membership?.planSnapshot?.eligibleMenuItemIds || []).map((id) => String(id));
}

function normalizePreviewItems(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const qty = Math.max(Number(item.qty) || 0, 0);
    const price = normalizeMoney(item.price);
    const itemId = normalizeId(item.itemId || item.id || item.menuItemId);
    return {
      itemId,
      name: String(item.name || ""),
      qty,
      price,
      gross: normalizeMoney(price * qty),
    };
  }).filter((item) => item.qty > 0);
}

function calculateMembershipPreview({ membership, items, manualDiscount, loyalty }) {
  const snapshot = membership.planSnapshot || {};
  const benefits = resolveEffectiveBenefitFlags(membership);
  const calculation = calculateMembershipBillingPreview({
    items,
    membership: {
      discountPercentage: snapshot.discountPercentage,
      minimumBillAmount: snapshot.minimumBillAmount,
      eligibleMenuItemIds: resolveEffectiveEligibleMenuItemIds(membership),
      ...benefits,
    },
    manualDiscount,
    loyalty,
  });

  return {
    ...calculation,
    message: !calculation.qualifiesForMinimum
      ? `Membership discount not applied because subtotal is below ₹${calculation.minimumBillAmount}.`
      : calculation.membershipDiscountAmount > 0
        ? "Membership discount preview calculated. Final bill is unchanged in this phase."
        : "Membership detected, but no membership discount applies to this cart.",
    loyaltyImpact: {
      allowRewardsOnMembershipItems: benefits.allowRewardsOnMembershipItems,
      pointsEstimateAvailable: true,
      note: "Preview estimates reward eligibility only; reward ledger entries are unchanged in this phase.",
    },
    limitations: [
      "Preview uses current cart effective prices supplied by the billing UI and does not update persisted bill totals.",
      "Additional manual discounts and loyalty points follow the purchased membership benefit flags in this preview.",
    ],
  };
}

async function findEffectiveMembership({ vendorId, fullNumber, now = new Date() }) {
  const customer = await Customer.findOne({ fullNumber }).select("_id fullNumber").lean();
  if (!customer) return { customer: null, membership: null };

  const candidates = await CustomerMembership.find({
    vendorId,
    customerId: customer._id,
    activatedAt: { $lte: now },
    expiresAt: { $gt: now },
    status: { $in: ["ACTIVE", "SCHEDULED"] },
    membershipType: "DISCOUNT",
  })
    .sort({ activatedAt: -1, createdAt: -1, _id: -1 })
    .lean();

  const membership = candidates.find((entry) => getEffectiveMembershipStatus(entry, now) === "ACTIVE") || null;
  return { customer, membership };
}

async function previewMembershipDiscount(req, res) {
  try {
    const vendorId = normalizeId(req.vendorWriteAuth?.vendorId || req.body?.vendorId || req.query?.vendorId);
    const fullNumber = normalizeMobileInput(req.body?.customerMobile || req.body?.mobile);

    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({ success: false, message: "Valid vendorId required" });
    }
    if (!fullNumber) {
      return res.status(400).json({ success: false, message: "Valid customer mobile number required" });
    }

    const { customer, membership } = await findEffectiveMembership({ vendorId, fullNumber });
    if (!customer || !membership) {
      return res.json({
        success: true,
        hasEffectiveMembership: false,
        membership: null,
        preview: null,
      });
    }

    const preview = calculateMembershipPreview({
      membership,
      items: req.body?.items || req.body?.cartItems || [],
      manualDiscount: req.body?.manualDiscount || {},
      loyalty: req.body?.loyalty || {},
    });

    return res.json({
      success: true,
      hasEffectiveMembership: true,
      customerId: String(customer._id),
      membership: serializePreviewMembership(membership),
      preview,
    });
  } catch (error) {
    console.error("Membership billing preview error:", error?.message || error);
    return res.status(500).json({ success: false, message: "Failed to preview membership discount" });
  }
}

module.exports = {
  previewMembershipDiscount,
  _private: {
    normalizeMobileInput,
    normalizePreviewItems,
    calculateMembershipPreview,
    findEffectiveMembership,
    getEffectiveMembershipStatus,
    resolveEffectiveEligibleMenuItemIds,
    resolveEffectiveBenefitFlags,
    resolveEffectiveBenefitFlagsFromSnapshot,
  },
};
