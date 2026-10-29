export function hasEnabledGstBilling(responsePayload) {
  return Boolean(
    responsePayload?.success === true &&
    responsePayload?.data?.draftConfigured === true &&
    responsePayload?.data?.activation?.enabled === true
  );
}

export function isGstPreviewAvailable({
  status,
  loadedVendorId,
  currentVendorId,
  hasActiveVendorSession,
  viewMode,
}) {
  return Boolean(
    hasActiveVendorSession &&
    viewMode === "menu" &&
    status === "configured" &&
    String(loadedVendorId || "") === String(currentVendorId || "")
  );
}
