export function getVendorToken(vendorId) {
  if (typeof window === "undefined") return "";
  return (vendorId ? localStorage.getItem(`vendorToken:${vendorId}`) : "") ||
    localStorage.getItem("authToken") || "";
}

export function getVendorAuthHeaders(vendorId) {
  const token = getVendorToken(vendorId);
  return token ? { Authorization: `Bearer ${token}` } : {};
}
