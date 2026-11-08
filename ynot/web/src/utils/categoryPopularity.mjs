function categoryId(category) {
  return String(category?.categoryId || category?._id || category?.id || "");
}

export function compareCategoryPopularity(left, right) {
  const countDifference =
    Number(right?.vendorCount || right?.totalVendors || 0) -
    Number(left?.vendorCount || left?.totalVendors || 0);
  if (countDifference !== 0) return countDifference;

  const nameDifference = String(left?.name || "").localeCompare(
    String(right?.name || ""),
    "en",
    { sensitivity: "base" }
  );
  if (nameDifference !== 0) return nameDifference;

  return categoryId(left).localeCompare(categoryId(right));
}

export function sortCategoriesByPopularity(categories) {
  return [...(Array.isArray(categories) ? categories : [])].sort(
    compareCategoryPopularity
  );
}
