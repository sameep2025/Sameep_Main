"use client";

import { useState, useEffect } from "react";
import { LuLogOut } from "react-icons/lu";
import { useSessionGuard } from "../Login/useSessionGuard";
import "./Header.css";

import { useVendor } from "../context/VendorContext";
import Login from "../Login/Login";
import ProfileModal from "../Profile/Profile";
import Portal from "../Portal/Portal";
import PackagesPortal from "../PackagesPortal/PackagesPortal";
import VendorGalleryModal from "../components/gallery/VendorGalleryModal";
import {
  buildVendorPreviewAnalyticsPayload,
  trackVendorPreviewEvent,
} from "../utils/siteAnalytics";
import {
  ENQUIRY_OPEN_EVENT,
  getEnquiryTypeLabel,
} from "../utils/enquiryFlow";
import {
  openAdminDashboard,
  openAdminMenu,
} from "../utils/adminQuickActions";

const PAGE_SECTIONS = {
  Home: "home",
  Categories: "categories",
  "Why Us": "why-us",
  About: "about",
  Contact: "contact",
};

function getCentralYnotBaseUrl() {
  const rawBaseUrl = (
    process.env.NEXT_PUBLIC_VENDOR_PREVIEW_ROOT_URL ||
    process.env.NEXT_PUBLIC_PREVIEW_BASE_URL ||
    "http://localhost:4000"
  )
    .trim()
    .replace(/\/$/, "");

  try {
    const url = new URL(rawBaseUrl);

    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      url.port = "6001";
      return url.toString().replace(/\/$/, "");
    }

    const hostnameParts = url.hostname.split(".");
    if (hostnameParts.length > 2) {
      url.hostname = hostnameParts.slice(1).join(".");
    }

    return url.toString().replace(/\/$/, "");
  } catch {
    return "https://ynot.co.in";
  }
}

export default function Header() {
  useSessionGuard();

  const { vendorInfo } = useVendor();
  const classicThemeKey =
    String(vendorInfo?.classicColorScheme || "blackgold").trim().toLowerCase() || "blackgold";

  const rootCategoryId =
    vendorInfo?.categoryId ||
    vendorInfo?.category?._id ||
    vendorInfo?.rootCategoryId ||
    null;

  const [categoryData, setCategoryData] = useState(null);
  const [openLogin, setOpenLogin] = useState(false);
  const [openProfile, setOpenProfile] = useState(false);
  const [openServices, setOpenServices] = useState(false);
  const [serviceType, setServiceType] = useState(null);
  const [galleryReadOnly, setGalleryReadOnly] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  const showHeaderLogout = hasSession && vendorInfo;
  // --------------------------------------------------
  // 🔹 Load category for Header (fallback-safe)
  // --------------------------------------------------
  useEffect(() => {
    if (!rootCategoryId) return;
    if (categoryData) return;

    async function loadCategory() {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/dummy-categories/${rootCategoryId}`,
          { cache: "no-store" }
        );

        const data = await res.json();
        const categoryObj = Array.isArray(data) ? data[0] : data;
        setCategoryData(categoryObj || null);
      } catch (e) {
        console.error("Header category fetch failed", e);
      }
    }

    loadCategory();
  }, [rootCategoryId, categoryData]);

  // --------------------------------------------------
  // 🔹 User session
  // --------------------------------------------------
const vendorId =
  vendorInfo?._id || vendorInfo?.vendor?._id || null;

  useEffect(() => {
    const syncSessionState = () => {
      const raw = localStorage.getItem("userData");
      if (raw) {
        try {
          JSON.parse(raw);
        } catch {
          // Ignore malformed stored user data and continue session detection.
        }
      }


const token =
  localStorage.getItem("authToken") ||
  (vendorId
    ? localStorage.getItem(`vendorToken:${vendorId}`)
    : null);
      setHasSession(Boolean(token));
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        syncSessionState();
      }
    };

    syncSessionState();
    window.addEventListener("storage", syncSessionState);
    window.addEventListener("auth-changed", syncSessionState);
    window.addEventListener("session-expired", syncSessionState);
    window.addEventListener("focus", syncSessionState);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("storage", syncSessionState);
      window.removeEventListener("auth-changed", syncSessionState);
      window.removeEventListener("session-expired", syncSessionState);
      window.removeEventListener("focus", syncSessionState);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
}, [vendorId]);

  const logout = () => {
    localStorage.removeItem("authToken");
 const vendorId =
  vendorInfo?._id || vendorInfo?.vendor?._id || null;

if (vendorId) {
  localStorage.removeItem(`vendorToken:${vendorId}`);
}
    localStorage.removeItem("userData");
    localStorage.removeItem("loginTime");
    localStorage.removeItem("vendorLoginTime");
    localStorage.removeItem("vendorSessionVendorId");
    localStorage.removeItem("sessionHour");

    window.dispatchEvent(new Event("storage"));
    window.dispatchEvent(new Event("auth-changed"));
  };

  // --------------------------------------------------
  // 🔹 Menu helpers
  // --------------------------------------------------
  const webMenu = categoryData?.webMenu || [];
  const showGalleryMenu = webMenu.some(
    (item) => String(item || "").trim().toLowerCase() === "gallery"
  );
  const enquiryConfig = categoryData?.enquiryConfig || null;
  const enquiryCtaLabel = enquiryConfig?.enabled
    ? getEnquiryTypeLabel(enquiryConfig?.enquiryType)
    : "Contact Us";
  const customerPortalUrl = `${getCentralYnotBaseUrl()}/mybills`;

  // --------------------------------------------------
  // 🔹 UI
  // --------------------------------------------------
  const title =
    vendorInfo?.businessName ||
    vendorInfo?.vendor?.businessName ||
    "";
  const logoUrl =
    typeof vendorInfo?.logoUrl === "string" ? vendorInfo.logoUrl.trim() : "";

  const galleryRowId =
    vendorInfo?.galleryRowId ||
    vendorInfo?.rowId ||
    vendorInfo?.rows?.[0]?._id ||
    "default";

  const handleEnquiryClick = () => {
    if (vendorId) {
      trackVendorPreviewEvent(
        process.env.NEXT_PUBLIC_API_BASE_URL,
        buildVendorPreviewAnalyticsPayload({
          vendorId,
          eventType: "cta_click",
          meta: { sourceLabel: "header_enquiry_cta" },
        })
      );
    }
    if (typeof window === "undefined") return;

    window.dispatchEvent(
      new CustomEvent(ENQUIRY_OPEN_EVENT, {
        detail: { source: "header" },
      })
    );

    const contactSection = document.getElementById("contact");
    contactSection?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const openGallery = (readOnly = true) => {
    if (vendorId) {
      trackVendorPreviewEvent(
        process.env.NEXT_PUBLIC_API_BASE_URL,
        buildVendorPreviewAnalyticsPayload({
          vendorId,
          eventType: "cta_click",
          meta: { sourceLabel: readOnly ? "gallery_open_public" : "gallery_open_edit" },
        })
      );
    }
    setGalleryReadOnly(readOnly);
    setServiceType("gallery");
    setOpenProfile(false);
    setOpenServices(true);
  };

  return (
    <>
      <nav className={`navbar navbar-expand-lg bg-body-tertiary custom-navbar theme-${classicThemeKey}`}>
        <div className="container-fluid">
          <a className="navbar-brand fw-bold" href="#home">
            {logoUrl ? (
              <img className="navbar-brand-logo" src={logoUrl} alt={`${title || "Business"} logo`} />
            ) : null}
            <span className="navbar-brand-text">{title}</span>
          </a>

          <button
            className="navbar-toggler"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#navbarSupportedContent"
          >
            <span className="navbar-toggler-icon" />
          </button>

          <div className="collapse navbar-collapse" id="navbarSupportedContent">
            <ul className="navbar-nav ms-auto mb-lg-0">
              {/* 🔹 Dynamic menu */}
              {webMenu.map((item) => (
                String(item || "").trim().toLowerCase() === "gallery" ? null : (
                  <li key={item} className="nav-item">
                    <a className="nav-link" href={`#${PAGE_SECTIONS[item]}`}>
                      {item}
                    </a>
                  </li>
                )
              ))}

              {showGalleryMenu ? (
                <li className="nav-item">
                  <button
                    className="nav-link btn-link gallery-nav-btn"
                    onClick={() => openGallery(true)}
                    type="button"
                  >
                    Gallery
                  </button>
                </li>
              ) : null}

              <li className="nav-item">
                <a
                  className="nav-link"
                  href={customerPortalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  My Bills & Rewards
                </a>
              </li>

              <li className="nav-item header-admin-menu">
                <button
                  className="header-admin-button"
                  type="button"
                  onClick={() => setShowAdminMenu((current) => !current)}
                >
                  Admin
                </button>
                {showAdminMenu ? (
                  <div className="header-admin-dropdown">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAdminMenu(false);
                        openAdminMenu();
                      }}
                    >
                      Menu
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAdminMenu(false);
                        openAdminDashboard();
                      }}
                    >
                      Dashboard
                    </button>
                  </div>
                ) : null}
              </li>

              <li className="nav-item">
                <button
                  className="setup-business-btn"
                  onClick={handleEnquiryClick}
                  type="button"
                >
                  {enquiryCtaLabel}
                </button>
              </li>

            {showHeaderLogout && (
                <li className="nav-item">
                  <button
                    className="logout-icon-btn"
                    onClick={logout}
                    type="button"
                    aria-label="Logout"
                    title="Logout"
                  >
                    <LuLogOut />
                  </button>
                </li>
              )}

              {/* {!user && (
                <li className="nav-item">
                  <button
                    className="nav-link login-btn btn-link"
                    onClick={() => setOpenLogin(true)}
                  >
                    Log In
                  </button>
                </li>
              )} */}

              {/* {user && (
                <li className="nav-item profile-wrapper">
                  <div
                    className="profile-action"
                    onClick={() => setOpenProfile(true)}
                  >
                    <span className="profile-icon">
                      {(user?.name || user?.phone || "U")
                        .charAt(0)
                        .toUpperCase()}
                    </span>
                    <span className="profile-text">My Profile</span>
                  </div>

                  <div className="profile-action logout" onClick={logout}>
                    <span className="logout-icon">⏻</span>
                    <span className="profile-text">Logout</span>
                  </div>
                </li>
              )} */}
            </ul>
          </div>
        </div>
      </nav>

      {openLogin && (
        <Portal>
          <Login onClose={() => setOpenLogin(false)} />
        </Portal>
      )}

      {openProfile && (
        <Portal>
          <ProfileModal
            onClose={() => setOpenProfile(false)}
            onOpenServices={(type) => {
              setProfileLoading(type === "packages");
              setServiceType(type);
              setGalleryReadOnly(type === "gallery" ? false : galleryReadOnly);
              setOpenProfile(false);
              setOpenServices(true);
            }}
          />
        </Portal>
      )}

      {openServices && serviceType === "packages" && (
        <Portal>
          <PackagesPortal
            onLoaded={() => setProfileLoading(false)}
            onClose={() => {
              setOpenServices(false);
              setServiceType(null);
              setProfileLoading(false);
            }}
          />
        </Portal>
      )}

      {openServices && serviceType === "gallery" && (
        <Portal>
          <VendorGalleryModal
            vendorId={vendorInfo?.vendorId || vendorInfo?._id || vendorInfo?.vendor?._id || null}
            rowId={galleryRowId}
            readOnly={galleryReadOnly}
            onClose={() => {
              setOpenServices(false);
              setServiceType(null);
              setProfileLoading(false);
              setGalleryReadOnly(false);
            }}
          />
        </Portal>
      )}

      {profileLoading && (
        <div className="profile-loader-overlay">
          <div className="profile-loader-spinner" />
        </div>
      )}

    </>
  );
}
