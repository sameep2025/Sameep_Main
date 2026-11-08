const PUBLISHED_VENDOR_STATUS = "Published";

function compareCategoryPopularity(left, right) {
  const countDifference =
    Number(right?.totalVendors || 0) - Number(left?.totalVendors || 0);
  if (countDifference !== 0) return countDifference;

  const nameDifference = String(left?.name || "").localeCompare(
    String(right?.name || ""),
    "en",
    { sensitivity: "base" }
  );
  if (nameDifference !== 0) return nameDifference;

  return String(left?.categoryId || "").localeCompare(
    String(right?.categoryId || "")
  );
}

function buildPublishedCategoryCounts(categories, statusAggregation) {
  const statusCountsByCategory = new Map();

  for (const row of statusAggregation || []) {
    const categoryId = String(row?._id?.categoryId || "");
    if (!categoryId) continue;

    const status = String(row?._id?.status || "Registered");
    if (!statusCountsByCategory.has(categoryId)) {
      statusCountsByCategory.set(categoryId, {});
    }
    statusCountsByCategory.get(categoryId)[status] = Number(row?.count || 0);
  }

  return (categories || [])
    .map((category) => {
      const categoryId = String(category?._id || "");
      const statusCounts = statusCountsByCategory.get(categoryId) || {};

      return {
        categoryId: category._id,
        name: category.name,
        imageUrl: category.imageUrl,
        totalVendors: Number(statusCounts[PUBLISHED_VENDOR_STATUS] || 0),
        statusCounts,
        visibleToVendor: category.visibleToVendor !== false,
        onboardingEnabled: category.visibleToVendor !== false,
      };
    })
    .sort(compareCategoryPopularity);
}

module.exports = {
  PUBLISHED_VENDOR_STATUS,
  buildPublishedCategoryCounts,
  compareCategoryPopularity,
};
