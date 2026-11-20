export function formatAllocationPercent(allocationBps) {
  return String(Number(allocationBps || 0) / 100);
}

export function buildEqualStylistAllocations(resources = []) {
  if (!resources.length) return [];
  const base = Math.floor(10000 / resources.length);
  let assigned = 0;
  return resources.map((resource, index) => {
    const allocationBps = index === resources.length - 1 ? 10000 - assigned : base;
    assigned += allocationBps;
    return {
      resourceId: String(resource._id || resource.resourceId || ""),
      resourceName: String(resource.name || resource.resourceName || ""),
      allocationPercent: formatAllocationPercent(allocationBps),
    };
  });
}

export function getItemStylistAllocations(item = {}) {
  if (Array.isArray(item.stylistAllocations) && item.stylistAllocations.length) {
    return item.stylistAllocations.map((allocation) => ({
      resourceId: String(allocation.resourceId || ""),
      resourceName: String(allocation.resourceName || ""),
      allocationPercent: allocation.allocationPercent ?? formatAllocationPercent(allocation.allocationBps),
    }));
  }
  return item.resourceId
    ? [{
        resourceId: String(item.resourceId),
        resourceName: String(item.resourceName || ""),
        allocationPercent: "100",
      }]
    : [];
}

export function toggleStylistAllocation(item, resource) {
  const current = getItemStylistAllocations(item);
  const resourceId = String(resource?._id || "");
  const selected = current.some((allocation) => allocation.resourceId === resourceId);
  const nextResources = selected
    ? current.filter((allocation) => allocation.resourceId !== resourceId)
    : [...current, { resourceId, resourceName: resource?.name || "" }];
  return buildEqualStylistAllocations(nextResources);
}

export function updateStylistAllocationPercent(item, resourceId, value) {
  return getItemStylistAllocations(item).map((allocation) =>
    allocation.resourceId === String(resourceId)
      ? { ...allocation, allocationPercent: value }
      : allocation
  );
}

export function parseAllocationPercent(value) {
  const text = String(value ?? "").trim();
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(text)) return null;
  const percent = Number(text);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return null;
  return Math.round(percent * 100);
}

export function getStylistAllocationError(item = {}) {
  const allocations = getItemStylistAllocations(item);
  if (!allocations.length) return "";
  const parsed = allocations.map((allocation) => parseAllocationPercent(allocation.allocationPercent));
  if (parsed.some((allocationBps) => allocationBps === null)) {
    return "Enter percentages between 0 and 100 with at most two decimal places.";
  }
  if (parsed.reduce((sum, allocationBps) => sum + allocationBps, 0) !== 10000) {
    return "Stylist percentages must total exactly 100%.";
  }
  return "";
}

export function getCartStylistAllocationError(cartItems = []) {
  for (const item of cartItems) {
    const error = getStylistAllocationError(item);
    if (error) return `${item.name || "Service"}: ${error}`;
  }
  return "";
}

export function getStylistAllocationTotalPercent(item = {}) {
  const allocations = getItemStylistAllocations(item);
  const parsed = allocations.map((allocation) => parseAllocationPercent(allocation.allocationPercent));
  if (parsed.some((allocationBps) => allocationBps === null)) return null;
  return parsed.reduce((sum, allocationBps) => sum + allocationBps, 0) / 100;
}

export function getStylistSelectionSummary(item = {}, resourceLabel = "Stylist") {
  const allocations = getItemStylistAllocations(item);
  if (!allocations.length) return `Select ${resourceLabel}`;
  if (allocations.length <= 2) {
    return allocations.map(({ resourceName }) => resourceName).filter(Boolean).join(", ");
  }
  return `${allocations.length} stylists selected`;
}

export function serializeStylistAllocations(item = {}) {
  return getItemStylistAllocations(item).map((allocation) => ({
    resourceId: allocation.resourceId,
    allocationBps: parseAllocationPercent(allocation.allocationPercent),
  }));
}
