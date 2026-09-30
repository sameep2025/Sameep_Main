"use client";

import { useEffect } from "react";

const SESSION_CHECK_INTERVAL_MS = 30000;

const getSafeDeviceId = () => {
  if (typeof globalThis !== "undefined") {
    const randomUuid = globalThis.crypto?.randomUUID;
    if (typeof randomUuid === "function") {
      return randomUuid.call(globalThis.crypto);
    }
  }

  return `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const guardState = {
  refCount: 0,
  intervalId: null,
  logoutTimerId: null,
  visibilityHandler: null,
  focusHandler: null,
  storageHandler: null,
  sessionCheckInFlight: false,
};

const clearLogoutTimer = () => {
  if (guardState.logoutTimerId) {
    clearTimeout(guardState.logoutTimerId);
    guardState.logoutTimerId = null;
  }
};

const clearSessionStorage = () => {
  localStorage.removeItem("authToken");
 Object.keys(localStorage).forEach((key) => {
  if (key.startsWith("vendorToken:")) {
    localStorage.removeItem(key);
  }
});
  localStorage.removeItem("userData");
  localStorage.removeItem("loginTime");
  localStorage.removeItem("authLoginTime");
  localStorage.removeItem("vendorLoginTime");
  localStorage.removeItem("vendorSessionVendorId");
  localStorage.removeItem("sessionDeviceId");
  localStorage.removeItem("sessionHour");
};

const getSessionToken = () => {
  const authToken = localStorage.getItem("authToken");

  if (authToken) return authToken;

  // 🔥 get active vendorId
  const vendorId = localStorage.getItem("vendorSessionVendorId");

  if (vendorId) {
    return localStorage.getItem(`vendorToken:${vendorId}`);
  }

  return null;
};

const notifySessionExpired = (reason) => {
  window.dispatchEvent(
    new CustomEvent("session-expired", { detail: { reason } })
  );
};

const forceLogout = () => {
  console.warn("Session expired -> logging out");

  clearSessionStorage();
  clearLogoutTimer();
  window.dispatchEvent(new Event("storage"));
  notifySessionExpired("expired");
};

const scheduleLogoutAt = (expiryTime) => {
  const expiryMs = new Date(expiryTime).getTime();
  if (!Number.isFinite(expiryMs)) return;

  const remainingTime = expiryMs - Date.now();
  if (remainingTime <= 0) {
    forceLogout();
    return;
  }

  clearLogoutTimer();
  guardState.logoutTimerId = setTimeout(forceLogout, remainingTime);
};

const checkSession = async () => {
  if (guardState.sessionCheckInFlight) return;
  guardState.sessionCheckInFlight = true;

  try {
    const token = getSessionToken();
    if (!token) return;

    console.log("Checking session API...");

    const deviceId = localStorage.getItem("deviceId");
   const vendorId = localStorage.getItem("vendorSessionVendorId");

const body = deviceId
  ? { token, deviceId, vendorId }
  : { token, vendorId };

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/customers/session-status-token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    if (res.status === 401 || res.status === 403) {
      console.warn("Session invalid");
      clearSessionStorage();
      clearLogoutTimer();
      window.dispatchEvent(new Event("storage"));
      notifySessionExpired("invalid");
    } else if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data?.status !== "active") {
        console.warn("Session inactive");
        clearSessionStorage();
        clearLogoutTimer();
        window.dispatchEvent(new Event("storage"));
        notifySessionExpired("inactive");
      } else {
        scheduleLogoutAt(data?.expiryTime);
      }
    } else if (!res.ok) {
      console.warn("Session check failed");
    }
  } catch {
    console.warn("API check failed");
  } finally {
    guardState.sessionCheckInFlight = false;
  }
};

const startSessionGuard = () => {
  if (guardState.intervalId) return;

  checkSession();
  guardState.intervalId = setInterval(checkSession, SESSION_CHECK_INTERVAL_MS);

  guardState.visibilityHandler = () => {
    if (document.visibilityState === "visible") {
      checkSession();
    }
  };
  guardState.focusHandler = () => {
    checkSession();
  };
  guardState.storageHandler = () => {
    checkSession();
  };

  document.addEventListener("visibilitychange", guardState.visibilityHandler);
  window.addEventListener("focus", guardState.focusHandler);
  window.addEventListener("storage", guardState.storageHandler);
};

const stopSessionGuard = () => {
  if (guardState.intervalId) {
    clearInterval(guardState.intervalId);
    guardState.intervalId = null;
  }

  clearLogoutTimer();

  if (guardState.visibilityHandler) {
    document.removeEventListener(
      "visibilitychange",
      guardState.visibilityHandler
    );
    guardState.visibilityHandler = null;
  }

  if (guardState.focusHandler) {
    window.removeEventListener("focus", guardState.focusHandler);
    guardState.focusHandler = null;
  }

  if (guardState.storageHandler) {
    window.removeEventListener("storage", guardState.storageHandler);
    guardState.storageHandler = null;
  }
};

export function useSessionGuard() {
  useEffect(() => {
    let deviceId = localStorage.getItem("deviceId");

    if (!deviceId) {
      deviceId = getSafeDeviceId();
      localStorage.setItem("deviceId", deviceId);
    }

    const sessionDeviceId = localStorage.getItem("sessionDeviceId");
   const vendorId = localStorage.getItem("vendorSessionVendorId");

const token = vendorId
  ? localStorage.getItem(`vendorToken:${vendorId}`)
  : null;

    if (token && (!sessionDeviceId || deviceId !== sessionDeviceId)) {
      console.warn("Device mismatch -> logout");

     Object.keys(localStorage).forEach((key) => {
  if (key.startsWith("vendorToken:")) {
    localStorage.removeItem(key);
  }
});
      localStorage.removeItem("vendorLoginTime");
      localStorage.removeItem("vendorSessionVendorId");
      localStorage.removeItem("sessionDeviceId");

      window.dispatchEvent(new Event("storage"));
      window.dispatchEvent(new Event("session-expired"));
    }
  }, []);

  useEffect(() => {
    guardState.refCount += 1;
    if (!guardState.intervalId) {
      startSessionGuard();
    }

    return () => {
      guardState.refCount -= 1;
      if (guardState.refCount <= 0) {
        guardState.refCount = 0;
        stopSessionGuard();
      }
    };
  }, []);
}
