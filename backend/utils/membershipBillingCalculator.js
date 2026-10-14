function toCents(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(Math.round(number * 100), 0);
}

function fromCents(value) {
  return Math.round(Number(value || 0)) / 100;
}

function normalizeId(value) {
  return String(value || "").trim();
}

function normalizeItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const qty = Math.max(Number(item.qty) || 0, 0);
      const priceCents = toCents(item.price);
      const grossCents = item.total !== undefined
        ? toCents(item.total)
        : Math.max(priceCents * qty, 0);
      return {
        itemId: normalizeId(item.itemId || item.id || item.menuItemId),
        name: String(item.name || ""),
        qty,
        grossCents,
      };
    })
    .filter((item) => item.qty > 0 && item.grossCents >= 0);
}

function allocateFixedDiscount(totalDiscountCents, eligibleRows) {
  const cappedDiscountCents = Math.min(
    Math.max(totalDiscountCents, 0),
    eligibleRows.reduce((sum, row) => sum + row.manualEligibleBalanceCents, 0)
  );
  if (cappedDiscountCents <= 0 || eligibleRows.length === 0) return new Map();

  const eligibleTotalCents = eligibleRows.reduce((sum, row) => sum + row.manualEligibleBalanceCents, 0);
  const allocations = eligibleRows.map((row) => {
    const raw = (cappedDiscountCents * row.manualEligibleBalanceCents) / eligibleTotalCents;
    const floor = Math.floor(raw);
    return {
      key: row.key,
      floor,
      remainder: raw - floor,
    };
  });

  let allocated = allocations.reduce((sum, allocation) => sum + allocation.floor, 0);
  let remaining = cappedDiscountCents - allocated;
  allocations
    .sort((left, right) => right.remainder - left.remainder || left.key.localeCompare(right.key))
    .forEach((allocation) => {
      if (remaining <= 0) return;
      allocation.floor += 1;
      remaining -= 1;
    });

  return new Map(allocations.map((allocation) => [allocation.key, allocation.floor]));
}

function calculateMembershipBillingPreview({
  items = [],
  membership = {},
  manualDiscount = {},
  loyalty = {},
} = {}) {
  const normalizedItems = normalizeItems(items);
  const subtotalCents = normalizedItems.reduce((sum, item) => sum + item.grossCents, 0);
  const discountPercentage = Math.min(Math.max(Number(membership.discountPercentage) || 0, 0), 100);
  const minimumBillCents = toCents(membership.minimumBillAmount);
  const qualifiesForMinimum = subtotalCents >= minimumBillCents;
  const eligibleIds = new Set((membership.eligibleMenuItemIds || []).map(String));
  const allowAdditionalDiscountOnMembershipItems =
    membership.allowAdditionalDiscountOnMembershipItems === true;
  const allowRewardsOnMembershipItems = membership.allowRewardsOnMembershipItems === true;
  const canApplyMembershipDiscount = qualifiesForMinimum && discountPercentage > 0;

  const rows = normalizedItems.map((item, index) => {
    const membershipEligible = item.itemId && eligibleIds.has(item.itemId);
    const membershipDiscountCents =
      canApplyMembershipDiscount && membershipEligible
        ? Math.min(Math.floor((item.grossCents * discountPercentage) / 100), item.grossCents)
        : 0;
    const afterMembershipCents = Math.max(item.grossCents - membershipDiscountCents, 0);
    const membershipDiscountApplied = membershipDiscountCents > 0;
    const manualDiscountAllowed =
      !membershipDiscountApplied || allowAdditionalDiscountOnMembershipItems;
    return {
      key: `${index}:${item.itemId}`,
      itemId: item.itemId,
      name: item.name,
      qty: item.qty,
      grossCents: item.grossCents,
      membershipEligible,
      membershipDiscountApplied,
      membershipDiscountCents,
      afterMembershipCents,
      manualDiscountAllowed,
      manualEligibleBalanceCents: manualDiscountAllowed ? afterMembershipCents : 0,
    };
  });

  const requestedManualDiscountCents = toCents(manualDiscount.amount);
  const manualMode = String(manualDiscount.mode || "").toLowerCase();
  let manualDiscountAllocations = new Map();

  if (manualMode === "percent") {
    const percent = Math.min(Math.max(Number(manualDiscount.percent) || 0, 0), 100);
    manualDiscountAllocations = new Map(
      rows.map((row) => [
        row.key,
        row.manualDiscountAllowed
          ? Math.min(Math.floor((row.afterMembershipCents * percent) / 100), row.afterMembershipCents)
          : 0,
      ])
    );
  } else if (manualMode === "amount") {
    manualDiscountAllocations = allocateFixedDiscount(
      requestedManualDiscountCents,
      rows.filter((row) => row.manualEligibleBalanceCents > 0)
    );
  }

  const earnPercent = Math.max(Number(loyalty.percentPer100) || 0, 0);
  let membershipDiscountTotalCents = 0;
  let manualDiscountTotalCents = 0;
  let rewardEligibleCents = 0;

  const breakdown = rows.map((row) => {
    const manualDiscountCents = Math.min(
      manualDiscountAllocations.get(row.key) || 0,
      row.afterMembershipCents
    );
    const finalLineCents = Math.max(row.afterMembershipCents - manualDiscountCents, 0);
    const rewardsAllowed =
      !row.membershipDiscountApplied || allowRewardsOnMembershipItems;
    const rewardBaseCents = rewardsAllowed ? finalLineCents : 0;
    membershipDiscountTotalCents += row.membershipDiscountCents;
    manualDiscountTotalCents += manualDiscountCents;
    rewardEligibleCents += rewardBaseCents;

    return {
      itemId: row.itemId,
      name: row.name,
      qty: row.qty,
      gross: fromCents(row.grossCents),
      membershipEligible: row.membershipEligible,
      membershipDiscountApplied: row.membershipDiscountApplied,
      membershipDiscountAmount: fromCents(row.membershipDiscountCents),
      manualDiscountEligible: row.manualDiscountAllowed,
      manualDiscountAmount: fromCents(manualDiscountCents),
      finalLineAmount: fromCents(finalLineCents),
      rewardsEligible: rewardsAllowed,
      estimatedRewardPoints: Math.floor((fromCents(rewardBaseCents) / 100) * earnPercent),
    };
  });

  const previewPayableCents = Math.max(
    subtotalCents - membershipDiscountTotalCents - manualDiscountTotalCents,
    0
  );
  const cappedManualDiscount = manualMode === "amount" &&
    requestedManualDiscountCents > manualDiscountTotalCents;

  return {
    subtotal: fromCents(subtotalCents),
    minimumBillAmount: fromCents(minimumBillCents),
    qualifiesForMinimum,
    discountPercentage,
    membershipDiscountAmount: fromCents(membershipDiscountTotalCents),
    additionalManualDiscountAmount: fromCents(manualDiscountTotalCents),
    requestedManualDiscountAmount: fromCents(requestedManualDiscountCents),
    manualDiscountCapped: cappedManualDiscount,
    previewPayableAmount: fromCents(previewPayableCents),
    rewardEligibleAmount: fromCents(rewardEligibleCents),
    estimatedRewardPoints: Math.floor((fromCents(rewardEligibleCents) / 100) * earnPercent),
    items: breakdown,
  };
}

module.exports = {
  calculateMembershipBillingPreview,
  _private: {
    toCents,
    fromCents,
    allocateFixedDiscount,
  },
};
