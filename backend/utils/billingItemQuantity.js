function normalizeBillingQuantity(value) {
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null;
}

function toPlainBillingItem(item) {
  if (!item || typeof item !== "object") return {};
  return typeof item.toObject === "function"
    ? item.toObject({ depopulate: true })
    : { ...item };
}

module.exports = {
  normalizeBillingQuantity,
  toPlainBillingItem,
};
