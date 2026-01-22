const BASE_URL = "https://newsameep-backend.go-kar.net/api";

/**
 * Fetch categories or subcategories
 * @param {string | null} parentId
 */
export async function fetchCategories(parentId = null) {
  const url = parentId
    ? `${BASE_URL}/dummy-categories?parentId=${parentId}`
    : `${BASE_URL}/dummy-categories`;

  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok) {
    throw new Error("Failed to fetch categories");
  }

  return Array.isArray(data) ? data : [];
}
