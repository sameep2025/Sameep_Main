const mongoose = require("mongoose");
const DummyVendor = require("../models/DummyVendor");
const LoyaltyLedger = require("../models/LoyaltyLedger");
const VendorCustomPackage = require("../models/VendorCustomPackage");
const VendorLoyaltyRule = require("../models/VendorLoyaltyRule");
const VendorMenuNode = require("../models/VendorMenuNode");
const VendorPriceNode = require("../models/VendorPriceNode");
const { isOfferCurrentlyValid } = require("../utils/offerValidity");

const HIGHLIGHTS_CACHE_TTL_MS = 60 * 1000;
const MAX_OFFERS = 12;
const highlightsCache = new Map();

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ""));
}

function normalizeText(value) {
  return String(value || "").trim();
}

function isOfferLabel(value) {
  return normalizeText(value).toLowerCase() === "offers";
}

function isOfferNode(node, pathNames = []) {
  const customType = normalizeText(node?.customType).toLowerCase();
  if (customType === "offer") return true;
  if (isOfferLabel(node?.name)) return true;
  return pathNames.some(isOfferLabel);
}

function getOfferDescription(node) {
  return (
    normalizeText(node?.offerText) ||
    normalizeText(node?.description) ||
    normalizeText(node?.freeText) ||
    normalizeText(node?.packagesIncludes) ||
    normalizeText(node?.terms)
  );
}

function buildOfferFromNode(node, pathNames = []) {
  const title = normalizeText(node?.name);
  const description = getOfferDescription(node);
  const imageUrl = normalizeText(node?.imageUrl || node?.iconUrl);
  const price = Number(node?.price || 0) || 0;
  const mrp = Number(node?.mrp || 0) || 0;
  const discountPercent = Number(node?.discountPercent || 0) || 0;

  if (!title && !description && !imageUrl) return null;
  if (isOfferLabel(title) && !description && !imageUrl && price <= 0 && mrp <= 0 && discountPercent <= 0) {
    return null;
  }

  return {
    id: String(node?._id || node?.id || `${title}-${description}`),
    title: title || "Current Offer",
    description,
    imageUrl,
    price,
    mrp,
    discountPercent,
    terms: normalizeText(node?.terms),
    sourceLabel: pathNames.find(isOfferLabel) ? "" : normalizeText(pathNames[pathNames.length - 1]),
  };
}

function dedupeOffers(offers) {
  const seen = new Set();
  const unique = [];

  offers.forEach((offer) => {
    if (!offer) return;
    const key = [
      normalizeText(offer.title).toLowerCase(),
      normalizeText(offer.description).toLowerCase(),
      normalizeText(offer.imageUrl),
    ].join("|");
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(offer);
  });

  return unique.slice(0, MAX_OFFERS);
}

function buildPathMap(nodes) {
  const byId = new Map();
  nodes.forEach((node) => byId.set(String(node._id), node));

  const getPath = (node) => {
    const path = [];
    let current = node;
    const guard = new Set();

    while (current && !guard.has(String(current._id))) {
      guard.add(String(current._id));
      path.unshift(normalizeText(current.name));
      const parentId = current.parentNodeId || current.parentVendorPriceNodeId || null;
      current = parentId ? byId.get(String(parentId)) : null;
    }

    return path.filter(Boolean);
  };

  return getPath;
}

async function loadOffers(vendorObjectId) {
  const [menuNodes, priceNodes, customPackages] = await Promise.all([
    VendorMenuNode.find({
      vendorId: vendorObjectId,
      datasetStatus: { $ne: "archived" },
      pricingStatus: "Active",
      visibleToUser: { $ne: false },
    }).lean(),
    VendorPriceNode.find({
      vendorId: vendorObjectId,
      pricingStatus: "Active",
      visibleToUser: { $ne: false },
    }).lean(),
    VendorCustomPackage.find({
      vendorId: vendorObjectId,
      pricingStatus: "Active",
      visibleToUser: { $ne: false },
      isDeleted: { $ne: true },
    }).lean(),
  ]);

  const menuPathFor = buildPathMap(menuNodes);
  const pricePathFor = buildPathMap(priceNodes);

  const menuOffers = menuNodes
    .map((node) => {
      const pathNames = menuPathFor(node);
      return isOfferNode(node, pathNames) && isOfferCurrentlyValid(node)
        ? buildOfferFromNode(node, pathNames)
        : null;
    })
    .filter(Boolean);

  const priceOffers = priceNodes
    .map((node) => {
      const pathNames = pricePathFor(node);
      return isOfferNode(node, pathNames) && isOfferCurrentlyValid(node)
        ? buildOfferFromNode(node, pathNames)
        : null;
    })
    .filter(Boolean);

  const customOffers = customPackages
    .map((node) => {
      const pathNames = Array.isArray(node.pathLabels) ? node.pathLabels : [];
      return isOfferNode(node, pathNames) && isOfferCurrentlyValid(node)
        ? buildOfferFromNode(node, pathNames)
        : null;
    })
    .filter(Boolean);

  return dedupeOffers([...menuOffers, ...priceOffers, ...customOffers]);
}

async function loadRewardHighlights(vendorObjectId) {
  const [rule, issuedRows] = await Promise.all([
    VendorLoyaltyRule.findOne({ vendorId: vendorObjectId }).lean(),
    LoyaltyLedger.aggregate([
      {
        $match: {
          vendorId: vendorObjectId,
          type: { $in: ["EARN", "EARN_REVERSAL"] },
        },
      },
      {
        $group: {
          _id: null,
          earned: {
            $sum: {
              $cond: [{ $eq: ["$type", "EARN"] }, { $max: ["$points", 0] }, 0],
            },
          },
          reversed: {
            $sum: {
              $cond: [{ $eq: ["$type", "EARN_REVERSAL"] }, { $abs: "$points" }, 0],
            },
          },
        },
      },
    ]),
  ]);

  const percentPer100 = Number(rule?.earn?.percentPer100 || 0) || 0;
  const enabled = Boolean(rule?.isEnabled) && percentPer100 > 0;
  const minBillAmount = Number(rule?.minBillAmount || 0) || 0;
  const issuedRow = issuedRows?.[0] || {};

  return {
    programEnabled: enabled,
    earnPercent: enabled ? percentPer100 : 0,
    minBillAmount: enabled ? minBillAmount : 0,
    eligibilitySummary: enabled && minBillAmount > 0
      ? `Eligible bills of ₹${minBillAmount.toLocaleString("en-IN")} or more`
      : "Eligible bills only",
    totalIssuedPoints: Math.max(0, Math.round(Number(issuedRow.earned || 0) - Number(issuedRow.reversed || 0))),
  };
}

exports.getPublicVendorHighlights = async (req, res) => {
  try {
    const { vendorId } = req.params;
    if (!isValidObjectId(vendorId)) {
      return res.status(400).json({ success: false, message: "Valid vendorId required" });
    }

    const cacheKey = String(vendorId);
    const cached = highlightsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json(cached.payload);
    }

    const vendorObjectId = new mongoose.Types.ObjectId(vendorId);
    const vendor = await DummyVendor.findById(vendorObjectId)
      .select("businessName vendorName name selectedTemplateKey subdomain")
      .lean();

    if (!vendor) {
      return res.status(404).json({ success: false, message: "Vendor not found" });
    }

    const [offers, rewards] = await Promise.all([
      loadOffers(vendorObjectId),
      loadRewardHighlights(vendorObjectId),
    ]);

    const payload = {
      success: true,
      data: {
        vendor: {
          vendorId: String(vendor._id),
          businessName: vendor.businessName || vendor.vendorName || vendor.name || "",
          selectedTemplateKey: vendor.selectedTemplateKey || "",
          subdomain: vendor.subdomain || "",
        },
        offers,
        rewards,
        hasHighlights: offers.length > 0 || rewards.programEnabled,
      },
    };

    highlightsCache.set(cacheKey, {
      expiresAt: Date.now() + HIGHLIGHTS_CACHE_TTL_MS,
      payload,
    });

    return res.json(payload);
  } catch (err) {
    console.error("Public vendor highlights error:", err);
    return res.status(500).json({ success: false, message: "Failed to load vendor highlights" });
  }
};
