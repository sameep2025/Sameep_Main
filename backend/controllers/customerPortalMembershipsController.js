const CustomerMembership = require("../models/CustomerMembership");
const Vendor = require("../models/DummyVendor");
const {
  getEffectiveEligibleMenuItemIds,
  getEligibleServicesForMembership,
  loadMembershipEligibleServiceMap,
} = require("../utils/membershipEligibleServices");
const {
  _private: { getEffectiveMembershipStatus },
} = require("./vendorCustomerMembershipController");

function toSafeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function hasOwnBoolean(object, field) {
  return Object.prototype.hasOwnProperty.call(object || {}, field) &&
    typeof object[field] === "boolean";
}

function normalizeIdList(ids = []) {
  return [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || "")).filter(Boolean))];
}

function getEffectiveBenefitFlag(membership = {}, field) {
  if (hasOwnBoolean(membership.benefitRulesOverride, field)) {
    return membership.benefitRulesOverride[field] === true;
  }
  return membership.planSnapshot?.[field] === true;
}

function buildSafeVendor(vendor) {
  return {
    id: vendor?._id ? String(vendor._id) : "",
    businessName: vendor?.businessName || "Business",
    subdomain: vendor?.subdomain || "",
    logoUrl: vendor?.logoUrl || "",
  };
}

function serializeMembership(membership, { vendor = null, serviceMap = new Map() } = {}) {
  const planSnapshot = membership.planSnapshot || {};
  const effectiveEligibleMenuItemIds = getEffectiveEligibleMenuItemIds(membership);
  const effectiveStatus = getEffectiveMembershipStatus(membership);
  const eligibleServices = getEligibleServicesForMembership(membership, serviceMap);

  return {
    id: String(membership._id),
    vendor: buildSafeVendor(vendor),
    membershipType: membership.membershipType || "DISCOUNT",
    status: effectiveStatus,
    storedStatus: membership.status || "",
    planName: planSnapshot.name || "Membership",
    description: planSnapshot.description || "",
    discountPercentage: toSafeNumber(planSnapshot.discountPercentage),
    minimumBillAmount: toSafeNumber(planSnapshot.minimumBillAmount),
    sellingPriceAtPurchase: toSafeNumber(membership.sellingPriceAtPurchase),
    activatedAt: membership.activatedAt || null,
    expiresAt: membership.expiresAt || null,
    purchasedAt: membership.createdAt || membership.activatedAt || null,
    renewalRecordedAt: membership.renewalRecordedAt || null,
    renewedFromMembershipId: membership.renewedFromMembershipId
      ? String(membership.renewedFromMembershipId)
      : null,
    benefits: {
      eligibleMenuItemIds: effectiveEligibleMenuItemIds,
      eligibleServices,
      additionalManualDiscountOnMembershipItems:
        getEffectiveBenefitFlag(membership, "allowAdditionalDiscountOnMembershipItems"),
      loyaltyRewardsOnMembershipItems:
        getEffectiveBenefitFlag(membership, "allowRewardsOnMembershipItems"),
    },
  };
}

async function getMemberships(req, res) {
  try {
    const customerId = req.auth?.customerId;
    if (!customerId) {
      return res.status(401).json({
        success: false,
        message: "Customer portal session invalid or expired",
      });
    }

    const memberships = await CustomerMembership.find({
      customerId,
      membershipType: "DISCOUNT",
      status: { $in: ["ACTIVE", "SCHEDULED", "EXPIRED"] },
    })
      .sort({ activatedAt: -1, createdAt: -1, _id: -1 })
      .lean();

    const vendorIds = normalizeIdList(memberships.map((membership) => membership.vendorId));
    const [vendors, serviceMap] = await Promise.all([
      vendorIds.length
        ? Vendor.find({ _id: { $in: vendorIds } })
          .select("businessName subdomain logoUrl")
          .lean()
        : [],
      loadMembershipEligibleServiceMap(memberships),
    ]);
    const vendorMap = new Map(vendors.map((vendor) => [String(vendor._id), vendor]));
    const serialized = memberships.map((membership) =>
      serializeMembership(membership, {
        vendor: vendorMap.get(String(membership.vendorId)) || null,
        serviceMap,
      })
    );
    const vendorGroups = [];
    const groupMap = new Map();

    serialized.forEach((membership) => {
      const vendorId = membership.vendor.id || "unknown";
      if (!groupMap.has(vendorId)) {
        const group = {
          vendor: membership.vendor,
          memberships: [],
        };
        groupMap.set(vendorId, group);
        vendorGroups.push(group);
      }
      groupMap.get(vendorId).memberships.push(membership);
    });

    return res.json({
      success: true,
      data: {
        memberships: serialized,
        vendors: vendorGroups,
      },
    });
  } catch (err) {
    console.error("customer portal memberships error:", err?.message || err);
    return res.status(500).json({
      success: false,
      message: "Unable to load memberships right now.",
    });
  }
}

module.exports = {
  getEffectiveBenefitFlag,
  getEffectiveEligibleMenuItemIds,
  getMemberships,
  serializeMembership,
};
