const mongoose = require("mongoose");
const VendorResource = require("../models/VendorResource");

class BillingStylistAllocationError extends Error {
  constructor(message, code = "invalid_stylist_allocation") {
    super(message);
    this.name = "BillingStylistAllocationError";
    this.code = code;
    this.statusCode = 400;
    this.publicMessage = message;
  }
}

function parseItemAllocations(item = {}) {
  const submitted = Array.isArray(item.stylistAllocations)
    ? item.stylistAllocations
    : item.resourceId
      ? [{ resourceId: item.resourceId, allocationBps: 10000 }]
      : [];
  const seen = new Set();
  const allocations = submitted.map((allocation) => {
    const resourceId = String(allocation?.resourceId || "").trim();
    const allocationBps = Number(allocation?.allocationBps);
    if (!mongoose.Types.ObjectId.isValid(resourceId)) {
      throw new BillingStylistAllocationError("Selected stylist is invalid.", "invalid_stylist_id");
    }
    if (seen.has(resourceId)) {
      throw new BillingStylistAllocationError(
        "A stylist cannot be selected more than once for the same service.",
        "duplicate_stylist"
      );
    }
    if (!Number.isInteger(allocationBps) || allocationBps < 0 || allocationBps > 10000) {
      throw new BillingStylistAllocationError(
        "Stylist percentages must be between 0 and 100 with at most two decimal places.",
        "invalid_stylist_percentage"
      );
    }
    seen.add(resourceId);
    return { resourceId, allocationBps };
  });

  if (
    allocations.length > 0 &&
    allocations.reduce((sum, allocation) => sum + allocation.allocationBps, 0) !== 10000
  ) {
    throw new BillingStylistAllocationError(
      "Stylist allocation percentages must total exactly 100%.",
      "stylist_percentage_total_invalid"
    );
  }
  return allocations;
}

async function normalizeCartStylistAllocations({
  cartItems = [],
  vendorId,
  VendorResourceModel = VendorResource,
} = {}) {
  const parsedItems = cartItems.map((item) => ({ item, allocations: parseItemAllocations(item) }));
  const resourceIds = [...new Set(
    parsedItems.flatMap(({ allocations }) => allocations.map(({ resourceId }) => resourceId))
  )];
  if (resourceIds.length === 0) {
    return parsedItems.map(({ item }) => ({
      ...item,
      resourceId: null,
      resourceName: "",
      stylistAllocations: undefined,
    }));
  }
  if (!mongoose.Types.ObjectId.isValid(String(vendorId || ""))) {
    throw new BillingStylistAllocationError(
      "Vendor authorization is required for stylist assignment.",
      "stylist_vendor_required"
    );
  }

  const resources = await VendorResourceModel.find({
    _id: { $in: resourceIds },
    vendorId,
    status: "Active",
  }).select("_id name").lean();
  const resourceMap = new Map(resources.map((resource) => [String(resource._id), resource]));
  if (resourceMap.size !== resourceIds.length) {
    throw new BillingStylistAllocationError(
      "One or more selected stylists are unavailable or do not belong to this vendor.",
      "stylist_ownership_invalid"
    );
  }

  return parsedItems.map(({ item, allocations }) => {
    if (allocations.length === 0) {
      return {
        ...item,
        resourceId: null,
        resourceName: "",
        stylistAllocations: undefined,
      };
    }
    const normalized = allocations.map(({ resourceId, allocationBps }) => ({
      resourceId,
      resourceName: String(resourceMap.get(resourceId).name || "").trim(),
      allocationBps,
    }));
    return {
      ...item,
      resourceId: normalized.length === 1 ? normalized[0].resourceId : null,
      resourceName: normalized.map(({ resourceName }) => resourceName).filter(Boolean).join(", "),
      stylistAllocations: normalized,
    };
  });
}

module.exports = {
  BillingStylistAllocationError,
  normalizeCartStylistAllocations,
  parseItemAllocations,
};
