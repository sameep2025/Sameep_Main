import { API_BASE_URL } from "../utils/config";

function getAuthToken() {
  if (typeof window === "undefined") return "";
  try {
    return String(window.localStorage.getItem("authToken") || "").trim();
  } catch {
    return "";
  }
}

async function request(path, options = {}) {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await res.json()
    : await res.text();

  if (!res.ok) {
    throw new Error(data?.message || "Request failed");
  }

  return data;
}

export function fetchDummyCategories() {
  return request("/api/dummy-vendors/categories/counts", { method: "GET" });
}

export function fetchCategoryTree(rootCategoryId) {
  return request(
    `/api/categories/tree?rootCategoryId=${encodeURIComponent(rootCategoryId)}`,
    { method: "GET" }
  );
}

export function searchGooglePlaces(query) {
  return request(
    `/api/google/places/search?query=${encodeURIComponent(query)}`,
    { method: "GET" }
  );
}

export function getGooglePlaceDetails(placeId) {
  return request(
    `/api/google/places/details?placeId=${encodeURIComponent(placeId)}`,
    { method: "GET" }
  );
}

export function requestOtp(payload) {
  return request("/api/customers/request-otp", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function verifyOtp(payload) {
  return request("/api/customers/verify-otp", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function bypassOtp(payload) {
  return request("/api/customers/bypass-otp", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function adminImpersonate(payload) {
  return request("/api/customers/admin-impersonate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchAdminPasscode() {
  return request("/api/app-config/admin-passcode", {
    method: "GET",
  });
}

export function createVendor(payload) {
  return request("/api/dummy-vendors", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchTrustQuestions(categoryName) {
  return request(
    `/api/trust/questions?category=${encodeURIComponent(categoryName)}`,
    { method: "GET" }
  );
}

export function saveTrustAnswers(payload) {
  return request("/api/trust/save", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function suggestServiceAreas(lat, lng) {
  return request(
    `/api/location/suggest-areas?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`,
    { method: "GET" }
  );
}

export function saveServiceAreas(payload) {
  return request("/api/vendor/service-areas", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function syncVendorPriceNodes(payload) {
  return request("/api/vendor-price-nodes/sync", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateVendorStatus(vendorId, status) {
  return request(`/api/dummy-vendors/${vendorId}`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
}

export function updateVendorPricingSource(vendorId, payload) {
  return request(`/api/vendor-menu/${vendorId}/source`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function scopeCustomerSession(payload) {
  return request("/api/customers/scope-session", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getSubdomainSuggestions(businessName, locations) {
  return request(
    `/api/vendor/subdomain-check?businessName=${encodeURIComponent(
      businessName
    )}&locations=${encodeURIComponent(locations.join(","))}`,
    { method: "GET" }
  );
}

export function setVendorSubdomain(vendorId, subdomain) {
  return request(`/api/vendor/${vendorId}/set-subdomain`, {
    method: "POST",
    body: JSON.stringify({ subdomain }),
  });
}

export async function parseMenuFile(file) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE_URL}/api/onboarding/parse-menu-file`, {
    method: "POST",
    body: formData,
  });

  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await res.json()
    : await res.text();

  if (!res.ok) {
    throw new Error(data?.message || "Failed to parse menu file");
  }

  return data;
}

export async function importVendorMenuExcel(vendorId, file, options = {}) {
  const formData = new FormData();
  formData.append("file", file);
  if (options.archiveExisting !== undefined) {
    formData.append("archiveExisting", String(options.archiveExisting));
  }

  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}/api/vendor-menu/${vendorId}/import-excel`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });

  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await res.json()
    : await res.text();

  if (!res.ok) {
    throw new Error(data?.message || "Failed to import vendor menu from Excel");
  }

  return data;
}

export function saveVendorMenuTree(vendorId, payload) {
  return request(`/api/vendor-menu/${vendorId}/save-tree`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
