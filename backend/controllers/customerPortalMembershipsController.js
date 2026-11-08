const mongoose = require("mongoose");
const CustomerMembership = require("../models/CustomerMembership");
const PrepaidMembershipWallet = require("../models/PrepaidMembershipWallet");
const PrepaidWalletLedger = require("../models/PrepaidWalletLedger");
const Vendor = require("../models/DummyVendor");
const {
  assertPrepaidMembershipWalletEnabled,
  isPrepaidMembershipWalletEnabled,
} = require("../services/prepaidMembershipCapability");
const {
  getEffectiveEligibleMenuItemIds,
  getEligibleServicesForMembership,
  loadMembershipEligibleServiceMap,
} = require("../utils/membershipEligibleServices");
const {
  _private: { getEffectiveMembershipStatus },
} = require("./vendorCustomerMembershipController");

const PREPAID_MEMBERSHIP_TYPES = ["PREPAID_VALUE", "PREPAID_SESSIONS"];
const VISIBLE_MEMBERSHIP_STATUSES = ["ACTIVE", "SCHEDULED", "EXPIRED", "CANCELLED"];
const LEDGER_EVENT_TYPES = ["CREDIT", "REDEMPTION", "CANCELLATION_REVERSAL", "EXPIRY"];
const DEFAULT_ACTIVITY_LIMIT = 20;
const MAX_ACTIVITY_LIMIT = 50;

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

function getWalletBalance(wallet = {}) {
  return wallet.walletType === "PREPAID_VALUE"
    ? Number(wallet.remainingAmountPaise)
    : Number(wallet.remainingQuantity);
}

function isNonnegativeSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isConsistentPrepaidWallet(wallet, membership) {
  if (!wallet || !membership || wallet.walletType !== membership.membershipType) return false;
  if (
    String(wallet.customerMembershipId || "") !== String(membership._id || "") ||
    String(wallet.customerId || "") !== String(membership.customerId || "") ||
    String(wallet.vendorId || "") !== String(membership.vendorId || "")
  ) {
    return false;
  }

  if (wallet.walletType === "PREPAID_VALUE") {
    return (
      isNonnegativeSafeInteger(wallet.creditedAmountPaise) &&
      isNonnegativeSafeInteger(wallet.consumedAmountPaise) &&
      isNonnegativeSafeInteger(wallet.remainingAmountPaise) &&
      wallet.creditedAmountPaise === wallet.consumedAmountPaise + wallet.remainingAmountPaise
    );
  }
  return (
    isNonnegativeSafeInteger(wallet.creditedQuantity) &&
    isNonnegativeSafeInteger(wallet.consumedQuantity) &&
    isNonnegativeSafeInteger(wallet.remainingQuantity) &&
    wallet.creditedQuantity === wallet.consumedQuantity + wallet.remainingQuantity
  );
}

function getEffectiveWalletStatus(wallet, membership, now = new Date()) {
  const walletStatus = String(wallet?.status || "").toUpperCase();
  const membershipStatus = String(membership?.status || "").toUpperCase();
  if (walletStatus === "CANCELLED" || membershipStatus === "CANCELLED") return "CANCELLED";

  const expiresAt = wallet?.expiresAt || membership?.expiresAt;
  const activatesAt = wallet?.activatesAt || membership?.activatedAt;
  const expiryTime = expiresAt ? new Date(expiresAt).getTime() : 0;
  const activationTime = activatesAt ? new Date(activatesAt).getTime() : 0;
  const nowTime = now.getTime();

  if (walletStatus === "EXPIRED" || (expiryTime && expiryTime <= nowTime)) return "EXPIRED";
  if (activationTime && activationTime > nowTime) return "SCHEDULED";
  if (walletStatus === "SCHEDULED" && !activationTime) return "SCHEDULED";
  if (walletStatus === "DEPLETED" || getWalletBalance(wallet) <= 0) return "DEPLETED";
  return "ACTIVE";
}

function serializePrepaidWallet(wallet, membership, now = new Date()) {
  if (
    !PREPAID_MEMBERSHIP_TYPES.includes(membership?.membershipType) ||
    !isConsistentPrepaidWallet(wallet, membership)
  ) {
    return null;
  }

  const base = {
    walletType: wallet.walletType,
    status: getEffectiveWalletStatus(wallet, membership, now),
    activatesAt: wallet.activatesAt || membership.activatedAt || null,
    expiresAt: wallet.expiresAt || membership.expiresAt || null,
  };

  if (wallet.walletType === "PREPAID_VALUE") {
    const snapshot = membership.prepaidValueSnapshot || {};
    return {
      ...base,
      paidAmountPaise: toSafeNumber(snapshot.paidAmountPaise),
      creditedAmountPaise: toSafeNumber(wallet.creditedAmountPaise),
      bonusAmountPaise: toSafeNumber(snapshot.bonusAmountPaise),
      consumedAmountPaise: toSafeNumber(wallet.consumedAmountPaise),
      remainingAmountPaise: toSafeNumber(wallet.remainingAmountPaise),
    };
  }

  const snapshot = membership.prepaidSessionsSnapshot || {};
  return {
    ...base,
    eligibleItem: {
      name: snapshot.itemName || "",
      itemType: snapshot.eligibleItemKind || "",
      categoryPath: Array.isArray(snapshot.categoryPath) ? snapshot.categoryPath : [],
      packageIncludes: snapshot.packageIncludes || "",
    },
    purchasedQuantity: toSafeNumber(snapshot.paidQuantity),
    creditedQuantity: toSafeNumber(wallet.creditedQuantity),
    consumedQuantity: toSafeNumber(wallet.consumedQuantity),
    remainingQuantity: toSafeNumber(wallet.remainingQuantity),
  };
}

function encodeActivityCursor(entry) {
  if (!entry?.occurredAt || !entry?._id) return null;
  return Buffer.from(JSON.stringify({
    occurredAt: new Date(entry.occurredAt).toISOString(),
    id: String(entry._id),
  }), "utf8").toString("base64url");
}

function decodeActivityCursor(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), "base64url").toString("utf8"));
    const occurredAt = new Date(parsed?.occurredAt);
    if (Number.isNaN(occurredAt.getTime()) || !mongoose.Types.ObjectId.isValid(parsed?.id)) {
      return { error: true };
    }
    return { occurredAt, id: new mongoose.Types.ObjectId(parsed.id) };
  } catch (error) {
    return { error: true };
  }
}

function parseActivityLimit(value) {
  if (value == null || value === "") return { value: DEFAULT_ACTIVITY_LIMIT };
  if (!/^\d+$/.test(String(value))) return { error: true };
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_ACTIVITY_LIMIT) {
    return { error: true };
  }
  return { value: parsed };
}

function serializeActivityEntry(entry) {
  return {
    id: String(entry._id),
    eventType: entry.eventType,
    walletType: entry.walletType,
    ...(Number.isSafeInteger(entry.amountPaise) ? { amountPaise: entry.amountPaise } : {}),
    ...(Number.isSafeInteger(entry.quantity) ? { quantity: entry.quantity } : {}),
    occurredAt: entry.occurredAt,
  };
}

function serializeMembership(
  membership,
  { vendor = null, serviceMap = new Map(), wallet = null, now = new Date() } = {}
) {
  const planSnapshot = membership.planSnapshot || {};
  const effectiveEligibleMenuItemIds = getEffectiveEligibleMenuItemIds(membership);
  const effectiveStatus = getEffectiveMembershipStatus(membership);
  const eligibleServices = getEligibleServicesForMembership(membership, serviceMap);

  const prepaidWallet = serializePrepaidWallet(wallet, membership, now);
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
    ...(PREPAID_MEMBERSHIP_TYPES.includes(membership.membershipType)
      ? {
          status: prepaidWallet?.status || effectiveStatus,
          prepaidWallet,
        }
      : {}),
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

    const prepaidEnabled = isPrepaidMembershipWalletEnabled();
    const membershipQuery = prepaidEnabled
      ? {
          customerId,
          $or: [
            {
              membershipType: "DISCOUNT",
              status: { $in: ["ACTIVE", "SCHEDULED", "EXPIRED"] },
            },
            {
              membershipType: { $in: PREPAID_MEMBERSHIP_TYPES },
              status: { $in: VISIBLE_MEMBERSHIP_STATUSES },
            },
          ],
        }
      : {
          customerId,
          membershipType: "DISCOUNT",
          status: { $in: ["ACTIVE", "SCHEDULED", "EXPIRED"] },
        };
    const memberships = await CustomerMembership.find(membershipQuery)
      .sort({ activatedAt: -1, createdAt: -1, _id: -1 })
      .lean();

    const vendorIds = normalizeIdList(memberships.map((membership) => membership.vendorId));
    const prepaidMembershipIds = memberships
      .filter((membership) => PREPAID_MEMBERSHIP_TYPES.includes(membership.membershipType))
      .map((membership) => membership._id);
    const [vendors, serviceMap, wallets] = await Promise.all([
      vendorIds.length
        ? Vendor.find({ _id: { $in: vendorIds } })
          .select("businessName subdomain logoUrl")
          .lean()
        : [],
      loadMembershipEligibleServiceMap(
        memberships.filter((membership) => membership.membershipType === "DISCOUNT")
      ),
      prepaidEnabled && prepaidMembershipIds.length
        ? PrepaidMembershipWallet.find({
            customerId,
            customerMembershipId: { $in: prepaidMembershipIds },
          }).lean()
        : [],
    ]);
    const vendorMap = new Map(vendors.map((vendor) => [String(vendor._id), vendor]));
    const walletMap = new Map(
      wallets.map((wallet) => [String(wallet.customerMembershipId), wallet])
    );
    const now = new Date();
    const serialized = memberships.map((membership) =>
      serializeMembership(membership, {
        vendor: vendorMap.get(String(membership.vendorId)) || null,
        serviceMap,
        wallet: walletMap.get(String(membership._id)) || null,
        now,
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

async function getMembershipActivity(req, res) {
  try {
    assertPrepaidMembershipWalletEnabled();
    const customerId = req.auth?.customerId;
    const membershipId = req.params?.membershipId;
    if (!customerId) {
      return res.status(401).json({
        success: false,
        message: "Customer portal session invalid or expired",
      });
    }
    if (!mongoose.Types.ObjectId.isValid(membershipId)) {
      return res.status(404).json({ success: false, message: "Membership activity not found" });
    }

    const limit = parseActivityLimit(req.query?.limit);
    const cursor = decodeActivityCursor(req.query?.cursor);
    if (limit.error || cursor?.error) {
      return res.status(400).json({ success: false, message: "Invalid activity pagination" });
    }

    const membership = await CustomerMembership.findOne({
      _id: membershipId,
      customerId,
      membershipType: { $in: PREPAID_MEMBERSHIP_TYPES },
    }).lean();
    if (!membership) {
      return res.status(404).json({ success: false, message: "Membership activity not found" });
    }

    const wallet = await PrepaidMembershipWallet.findOne({
      customerMembershipId: membership._id,
      customerId,
      vendorId: membership.vendorId,
      walletType: membership.membershipType,
    }).lean();
    if (!isConsistentPrepaidWallet(wallet, membership)) {
      return res.status(404).json({ success: false, message: "Membership activity not found" });
    }

    const ledgerQuery = {
      customerId,
      vendorId: membership.vendorId,
      customerMembershipId: membership._id,
      walletId: wallet._id,
      eventType: { $in: LEDGER_EVENT_TYPES },
    };
    if (cursor) {
      ledgerQuery.$or = [
        { occurredAt: { $lt: cursor.occurredAt } },
        { occurredAt: cursor.occurredAt, _id: { $lt: cursor.id } },
      ];
    }

    const rows = await PrepaidWalletLedger.find(ledgerQuery)
      .sort({ occurredAt: -1, _id: -1 })
      .limit(limit.value + 1)
      .lean();
    const pageRows = rows.slice(0, limit.value);
    const hasMore = rows.length > limit.value;

    return res.json({
      success: true,
      data: {
        items: pageRows.map(serializeActivityEntry),
        hasMore,
        nextCursor: hasMore ? encodeActivityCursor(pageRows[pageRows.length - 1]) : null,
      },
    });
  } catch (err) {
    if (err?.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
        code: err.code || undefined,
      });
    }
    console.error("customer portal membership activity error:", err?.message || err);
    return res.status(500).json({
      success: false,
      message: "Unable to load membership activity right now.",
    });
  }
}

module.exports = {
  decodeActivityCursor,
  encodeActivityCursor,
  getEffectiveBenefitFlag,
  getEffectiveEligibleMenuItemIds,
  getEffectiveWalletStatus,
  getMembershipActivity,
  getMemberships,
  isConsistentPrepaidWallet,
  parseActivityLimit,
  serializeMembership,
  serializePrepaidWallet,
};
