function countUniqueItems(items, keyForItem) {
  const keys = new Set();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const key = keyForItem(item);
    if (key) keys.add(key);
  });
  return keys.size;
}

export function getMembershipEligibilityCoverage({
  standardItems = [],
  discountItems = standardItems,
  prepaidItems = [],
} = {}) {
  const menuKey = (item) => {
    const itemId = String(item?.id || "").trim();
    return itemId ? `${String(item?.sourceType || "menu")}:${itemId}` : "";
  };
  const prepaidKey = (item) => {
    const itemId = String(item?.itemId || "").trim();
    return itemId ? `${String(item?.itemSource || "")}:${itemId}` : "";
  };

  return {
    standardMenu: countUniqueItems(standardItems, menuKey),
    discountEligible: countUniqueItems(discountItems, menuKey),
    prepaidEligible: countUniqueItems(prepaidItems, prepaidKey),
  };
}
