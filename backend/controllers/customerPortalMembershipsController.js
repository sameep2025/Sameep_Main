const mongoose = require("mongoose");
const CustomerMembership = require("../models/CustomerMembership");
const Vendor = require("../models/DummyVendor");
const VendorMenuNode = require("../models/VendorMenuNode");
const VendorPriceNode = require("../models/VendorPriceNode");
const {
  _private: { getEffectiveMembershipStatus },
} = require("./vendorCustomerMembershipController");

function toSafeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function hasOwnArray(object, field) {
  return Object.prototype.hasOwnProperty.call(object || {}, field) &&
    Array.isArray(object[field]);
}

function hasOwnBoolean(object, field) {
  return Object.prototype.hasOwnProperty.call(object || {}, field) &&
    typeof object[field] === "boolean";
}

function normalizeIdList(ids = []) {
  return [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || "")).filter(Boolean))];
}

function getEffectiveEligibleMenuItemIds(membership = {}) {
  if (hasOwnArray(membership.serviceEligibilityOverride, "eligibleMenuItemIds")) {
    return normalizeIdList(membership.serviceEligibilityOverride.eligibleMenuItemIds);
  }
  return normalizeIdList(membership.planSnapshot?.eligibleMenuItemIds);
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

function buildServiceFallback(itemId) {
  const id = String(itemId || "");
  return {
    id,
    name: id ? `Service ${id.slice(-6)}` : "Service",
    price: 0,
    path: [],
    unavailable: true,
  };
}

async function getServiceMap(vendorIds = [], itemIds = []) {
  const validVendorIds = normalizeIdList(vendorIds).filter((id) => mongoose.isValidObjectId(id));
  const validItemIds = normalizeIdList(itemIds).filter((id) => mongoose.isValidObjectId(id));
  if (!validVendorIds.length || !validItemIds.length) return new Map();

  const query = {
    _id: { $in: validItemIds.map((id) => new mongoose.Types.ObjectId(id)) },
    vendorId: { $in: validVendorIds.map((id) => new mongoose.Types.ObjectId(id)) },
  };
  const [menuNodes, priceNodes] = await Promise.all([
    VendorMenuNode.find(query)
      .select("_id name price pathNames pricingStatus")
      .lean(),
    VendorPriceNode.find(query)
      .select("_id name price pricingStatus")
      .lean(),
  ]);

  const map = new Map();
  menuNodes.forEach((node) => {
    map.set(String(node._id), {
      id: String(node._id),
      name: node.name || "Service",
      price: toSafeNumber(node.price),
      path: Array.isArray(node.pathNames) ? node.pathNames : [],
      unavailable: false,
    });
  });
  priceNodes.forEach((node) => {
    if (map.has(String(node._id))) return;
    map.set(String(node._id), {
      id: String(node._id),
      name: node.name || "Service",
      price: toSafeNumber(node.price),
      path: [],
      unavailable: false,
    });
  });
  return map;
}

function serializeMembership(membership, { vendor = null, serviceMap = new Map() } = {}) {
  const planSnapshot = membership.planSnapshot || {};
  const effectiveEligibleMenuItemIds = getEffectiveEligibleMenuItemIds(membership);
  const effectiveStatus = getEffectiveMembershipStatus(membership);
  const eligibleServices = effectiveEligibleMenuItemIds.map((itemId) =>
    serviceMap.get(String(itemId)) || buildServiceFallback(itemId)
  );

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
    const itemIds = normalizeIdList(
      memberships.flatMap((membership) => getEffectiveEligibleMenuItemIds(membership))
    );
    const [vendors, serviceMap] = await Promise.all([
      vendorIds.length
        ? Vendor.find({ _id: { $in: vendorIds } })
          .select("businessName subdomain logoUrl")
          .lean()
        : [],
      getServiceMap(vendorIds, itemIds),
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
