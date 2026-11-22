export function toCategorySlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-and-/g, "-");
}

export function getCategoryId(category) {
  return String(category?._id || category?.id || category?.categoryId || "").trim();
}

export function getCategorySlug(category) {
  const configuredSlug =
    category?.slug || category?.categorySlug || category?.urlSlug || "";
  return toCategorySlug(configuredSlug || category?.name);
}

export function resolveRequestedCategory(
  categories,
  { categorySlug = "", categoryId = "" } = {}
) {
  const available = Array.isArray(categories) ? categories : [];
  const requestedSlug = toCategorySlug(categorySlug);
  const requestedId = String(categoryId || "").trim();

  if (requestedSlug) {
    return available.find((category) => getCategorySlug(category) === requestedSlug) || null;
  }

  if (requestedId) {
    return available.find((category) => getCategoryId(category) === requestedId) || null;
  }

  return null;
}
