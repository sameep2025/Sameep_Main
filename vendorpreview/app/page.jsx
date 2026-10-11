"use client";
import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useVendor } from "./context/VendorContext";
import { API_BASE_URL } from "../config";

import Explore from "./_Explore/Explore";
import Header from "./Header/Header";
import Root from "./Root/RootSection";
import About from "./About/About";
import Contact from "./Contact/Contact";
import Load from "./Load/Load";
import Portal from "./Portal/Portal";
import OffersRewardsPopup from "./components/OffersRewardsPopup";
import ScrollToTop from "./components/ScrollToTop";
import {
  buildVendorPreviewPageViewPayload,
  shouldTrackVendorPageViewOnce,
  trackVendorPreviewPageView,
} from "./utils/siteAnalytics";
import { useRuntimeTeluguPreviewTranslation } from "./utils/runtimeTranslation";

function normalizePreviewTemplateKey(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["classic", "modern", "catalog", "astrology", "nurseries", "ecommerce", "premium_light"].includes(normalized) ? normalized : "";
}

export default function Home() {
  const searchParams = useSearchParams();
  const activeTemplate = String(searchParams.get("template") || "").trim().toLowerCase();
  const { vendorInfo } = useVendor();
  const previewRootRef = useRef(null);
  const [defaultTemplateKey, setDefaultTemplateKey] = useState("classic");
  const effectiveTemplateKey =
    normalizePreviewTemplateKey(activeTemplate) ||
    normalizePreviewTemplateKey(vendorInfo?.selectedTemplateKey) ||
    normalizePreviewTemplateKey(defaultTemplateKey) ||
    "classic";
  const isImmersiveTemplate = effectiveTemplateKey !== "classic";
  const [loading, setLoading] = useState(true);
  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionAllowed, setSessionAllowed] = useState(() => {
    if (typeof window === "undefined") return false;
    return Boolean(localStorage.getItem("authToken"));
  });

  useEffect(() => {
    let cancelled = false;

    async function loadDefaultTemplate() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/preview-templates/default`, {
          cache: "no-store",
        });
        const data = await response.json();
        if (!cancelled) {
          setDefaultTemplateKey(normalizePreviewTemplateKey(data?.key) || "classic");
        }
      } catch {
        if (!cancelled) {
          setDefaultTemplateKey("classic");
        }
      }
    }

    loadDefaultTemplate();
    return () => {
      cancelled = true;
    };
  }, []);


useEffect(() => {
  let intervalId;

  const checkSession = async () => {
    const token = localStorage.getItem("authToken");
    const user = localStorage.getItem("userData");
    const parsedUser = user ? JSON.parse(user) : null;

    // no session → allow public view
    if (!token) {
      setSessionAllowed(true);
      setCheckingSession(false);
      return;
    }

    if (parsedUser?.isAdmin) {
      setSessionAllowed(true);
      setCheckingSession(false);
      return;
    }

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/customers/session-status-token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        }
      );

      if (res.ok) {
        setSessionAllowed(true);
      } else if (res.status === 401 || res.status === 403) {
        localStorage.removeItem("authToken");
        localStorage.removeItem("userData");
        setSessionAllowed(false);
      } else {
        setSessionAllowed(Boolean(localStorage.getItem("authToken")));
      }
    } catch {
      setSessionAllowed(Boolean(localStorage.getItem("authToken")));
    } finally {
      setCheckingSession(false);
    }
  };

  // 🔁 1. Run immediately on load
  checkSession();

  // 🔁 2. Run every 10 seconds
  intervalId = setInterval(checkSession, 10_000);

  // 🔁 3. Run after login/logout
  const onStorage = () => {
    setCheckingSession(true);
    checkSession();
  };

  window.addEventListener("storage", onStorage);

  // 🧹 cleanup
  return () => {
    clearInterval(intervalId);
    window.removeEventListener("storage", onStorage);
  };
}, []);

useRuntimeTeluguPreviewTranslation({
  enabled: String(vendorInfo?.languagePreference || "").trim().toLowerCase() === "te",
  rootRef: previewRootRef,
  ready: !loading,
});

useEffect(() => {
  const vendorId =
    vendorInfo?.vendorId ||
    vendorInfo?._id ||
    vendorInfo?.vendor?._id ||
    "";
  if (!vendorId) return;
  if (!shouldTrackVendorPageViewOnce(vendorId)) return;

  const payload = buildVendorPreviewPageViewPayload(vendorId);
  trackVendorPreviewPageView(API_BASE_URL, payload);
}, [vendorInfo]);
if (checkingSession) {
  return <Load />; // reuse your loader
}

if (!sessionAllowed) {
  return null; // or show login modal / message
}

  return (
    <div>
      {/* Loader overlay */}
      {loading && <Load />}

      {/* IMPORTANT:
          visibility:hidden keeps DOM in place
          so anchor scrolling still works */}
      <div
        ref={previewRootRef}
        lang={String(vendorInfo?.languagePreference || "").trim().toLowerCase() === "te" ? "te" : "en"}
        style={{ visibility: loading ? "hidden" : "visible" }}
      >

        {/* HEADER */}
{!isImmersiveTemplate ? <Header /> : null}
<Explore onReady={() => setLoading(false)} />
{!isImmersiveTemplate ? <Root /> : null}
{!isImmersiveTemplate ? <About /> : null}
{!isImmersiveTemplate ? <Contact /> : null}


	<ScrollToTop />
  <OffersRewardsPopup
    vendorId={vendorInfo?.vendorId || vendorInfo?._id || vendorInfo?.vendor?._id || ""}
    businessName={vendorInfo?.businessName || ""}
    templateKey={effectiveTemplateKey}
    enabled={!loading}
  />
	        {/* GLOBAL PORTAL */}
	        <Portal />
      </div>
    </div>
  );
}
