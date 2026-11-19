function createDeviceId(randomUUID) {
  if (typeof randomUUID === "function") {
    return randomUUID();
  }

  return `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const handoffExchanges = new Map();

export function exchangeAdminHandoff({ apiBaseUrl, handoffCode, fetchImpl = fetch }) {
  const code = String(handoffCode || "").trim();
  if (!code) {
    return Promise.reject(new Error("Admin handoff code is required"));
  }

  const existing = handoffExchanges.get(code);
  if (existing) return existing;

  const exchange = (async () => {
    const response = await fetchImpl(`${apiBaseUrl}/api/customers/admin-impersonate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handoffCode: code }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.token) {
      throw new Error(data?.message || "Admin handoff failed");
    }
    return data;
  })();

  handoffExchanges.set(code, exchange);
  exchange.catch(() => {
    if (handoffExchanges.get(code) === exchange) {
      handoffExchanges.delete(code);
    }
  });
  return exchange;
}

export function clearAdminHandoffExchangesForTests() {
  handoffExchanges.clear();
}

export function persistAdminVendorSession({
  storage,
  expectedVendorId,
  response,
  randomUUID,
  now = Date.now,
}) {
  const vendorId = String(expectedVendorId || "").trim();
  const responseVendorId = String(response?.vendorId || "").trim();
  const token = String(response?.token || "").trim();

  if (!vendorId || !responseVendorId || responseVendorId !== vendorId) {
    throw new Error("Admin handoff does not match this vendor");
  }
  if (!token) {
    throw new Error("Admin handoff did not provide a session token");
  }

  let deviceId = String(storage.getItem("deviceId") || "").trim();
  if (!deviceId) {
    deviceId = createDeviceId(randomUUID);
    storage.setItem("deviceId", deviceId);
  }

  storage.setItem("sessionDeviceId", deviceId);
  storage.setItem(`vendorToken:${vendorId}`, token);
  storage.setItem("authToken", token);
  storage.setItem("vendorSessionVendorId", vendorId);
  storage.setItem("vendorLoginTime", String(now()));
  storage.setItem("userType", "vendor");
  storage.setItem("isAdminLogin", "true");

  return { deviceId, token, vendorId };
}
