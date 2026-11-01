"use client";

import "./Profile.css";
import { useState, useEffect } from "react";
import HomeLocationModal from "./HomeLocationModal";
import BusinessLocationsModal from "./BusinessLocationsModal";
import BusinessHoursModal from "./BusinessHoursModal";
import { SOCIAL_ICONS } from "../Icons/SocialIcons";
import { useVendor } from "@/app/context/VendorContext";
import { getVendorAuthHeaders } from "../utils/vendorAuth";

export default function ProfileModal({ onClose, onOpenServices }) {
  const { vendorInfo } = useVendor();
  const vendorId = vendorInfo?.vendorId || vendorInfo?._id || null;
  const rootCategoryId =
    vendorInfo?.categoryId ||
    vendorInfo?.category?._id ||
    vendorInfo?.rootCategoryId ||
    null;
  const vendorName = vendorInfo?.businessName || vendorInfo?.vendor?.businessName || "";

  /* ================= STATE ================= */
  const [opening, setOpening] = useState(false);
const [openingGallery, setOpeningGallery] = useState(false);
  const [showHomeLocation, setShowHomeLocation] = useState(false);
  const [showBusinessLocations, setShowBusinessLocations] = useState(false);
  const [showBusinessHours, setShowBusinessHours] = useState(false);

  const [vendor, setVendor] = useState(null);
  const [loadingVendor, setLoadingVendor] = useState(false);

  const [showSocialPopup, setShowSocialPopup] = useState(false);
  const [socialType, setSocialType] = useState("");
  const [socialValue, setSocialValue] = useState("");
  const [saving, setSaving] = useState(false);
const [enquiries, setEnquiries] = useState([]);
const [loadingEnquiries, setLoadingEnquiries] = useState(false);
const [showEnquiries, setShowEnquiries] = useState(false);

  // null = category not loaded yet
  const [categorySocials, setCategorySocials] = useState(null);

const loadEnquiries = async () => {
  if (!vendorId || !rootCategoryId) return;

  try {
    setLoadingEnquiries(true);

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/enquiries?vendorId=${vendorId}&categoryId=${rootCategoryId}`,
      { headers: getVendorAuthHeaders(vendorId) }
    );

    const data = await res.json();

    if (!res.ok) {
      alert("Failed to load enquiries");
      return;
    }

    setEnquiries(Array.isArray(data) ? data : []);
    setShowEnquiries(true);
  } catch (err) {
    console.error(err);
    alert("Error loading enquiries");
  } finally {
    setLoadingEnquiries(false);
  }
};



  /* ================= USER (LOCAL STORAGE) ================= */
  const user =
    typeof window !== "undefined"
      ? JSON.parse(localStorage.getItem("userData") || "{}")
      : {};

  const socialLinks = user?.socialLinks || {};

  /* ================= HELPERS ================= */
  const normalize = (label) =>
    label.toLowerCase().replace(/\s+/g, "");

  /* ================= FETCH CATEGORY SOCIALS ================= */
useEffect(() => {
  if (!vendorId) return;

  // 🔥 Clear old vendor cache
  // Keep userData to preserve login state.
}, [vendorId]);



  useEffect(() => {
    if (!rootCategoryId) return;

    fetch(
      `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/dummy-categories/${rootCategoryId}`
    )
      .then((res) => res.json())
      .then((data) => {
        setCategorySocials(data.socialHandle || []);
      })
      .catch((err) => {
        console.error("Failed to load category socials", err);
        setCategorySocials([]);
      });
  }, [rootCategoryId]);

  /* ================= BUILD SOCIALS FROM CATEGORY ================= */
  const socialsToRender =
    categorySocials === null
      ? []
      : categorySocials
          .map((label) => {
            const key = normalize(label);
            if (!SOCIAL_ICONS[key]) return null;

            return {
              key,
              label,
              value: socialLinks[key] || "",
            };
          })
          .filter(Boolean);

  /* ================= BUSINESS HOURS ================= */
  const openBusinessHours = async () => {
    try {
      setLoadingVendor(true);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/dummy-vendors/${vendorId}`
      );
      const data = await res.json();
      setVendor(data);
      setShowBusinessHours(true);
    } catch (err) {
      console.error("Failed to load vendor", err);
      alert("Failed to load business hours");
    } finally {
      setLoadingVendor(false);
    }
  };

  /* ================= SAVE SOCIAL ================= */
  const handleSaveSocial = async () => {
    try {
      if (!vendorId) return;

      setSaving(true);
      const token = localStorage.getItem("token");

      const updatedSocials = {
        ...socialLinks,
        [socialType]: socialValue,
      };

      await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/dummy-vendors/${vendorId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ socialLinks: updatedSocials }),
        }
      );

      localStorage.setItem(
        "userData",
        JSON.stringify({
          ...user,
          socialLinks: updatedSocials,
        })
      );

      setShowSocialPopup(false);
    } finally {
      setSaving(false);
    }
  };
const statusCounts = enquiries.reduce(
  (acc, e) => {
    const status = e.status || "New";

    if (status === "New") acc.new++;
    else if (status === "Enquiry Viewed") acc.viewed++;
    else if (status === "Contact Viewed") acc.contact++;
    else if (status === "Cancelled") acc.cancel++;
    else if (status === "Enrolled") acc.enrolled++;

    return acc;
  },
  { new: 0, viewed: 0, contact: 0, cancel: 0, enrolled: 0 }
);

  /* ================= UI ================= */
  return (
    <div className="profile-overlay">
      <div className="profile-card">
        <h2 className="profile-name">{vendorName || user.name || "User"}</h2>
        <p className="profile-phone">📞 {user.phone || "-"}</p>

        <button className="profile-btn" onClick={loadEnquiries}>
  {loadingEnquiries ? "Loading..." : "📩 My Enquiries"}
</button>
{showEnquiries && (
  <div className="popup-overlay">
    <div className="popup-card enquiries-card">

      <h3>My Enquiries</h3>

      {enquiries.length === 0 && (
        <p style={{ opacity: 0.6 }}>No enquiries found</p>
      )}

     <div className="enquiry-summary">

  <div className="summary-box">
    <span>📄 New Enquiries</span>
    <strong>{statusCounts.new}</strong>
  </div>

  <div className="summary-box">
    <span>👁 Enquiries Viewed</span>
    <strong>{statusCounts.viewed}</strong>
  </div>

  <div className="summary-box">
    <span>📞 Contact Viewed</span>
    <strong>{statusCounts.contact}</strong>
  </div>

  <div className="summary-box">
    <span>❌ Cancel Enquiries</span>
    <strong>{statusCounts.cancel}</strong>
  </div>

  <div className="summary-box">
    <span>✅ Enrolled</span>
    <strong>{statusCounts.enrolled}</strong>
  </div>

</div>


      <button
        className="btn-outline"
        onClick={() => setShowEnquiries(false)}
      >
        Close
      </button>
    </div>
  </div>
)}

        <hr />

        <h4 className="section-title">MY PRICES</h4>

        <div
          className="profile-row clickable"
          onClick={() => {
            if (opening) return;
            setOpening(true);
            onOpenServices("packages");
          }}
        >
          <span>My Services</span>
          {opening ? <span className="row-loader" /> : <span className="active-badge">ACTIVE</span>}
        </div>
        <div
  className="profile-row clickable"
  onClick={() => {
    if (openingGallery) return;
    setOpeningGallery(true);

    // open gallery page / modal
    onOpenServices("gallery");
  }}
>
  <span>My Gallery</span>
  {openingGallery ? (
    <span className="row-loader" />
  ) : (
    <span className="active-badge">ACTIVE</span>
  )}
</div>

        <hr />

        {/* ================= SOCIAL HANDLES ================= */}
        <h4 className="section-title">MY SOCIAL HANDLES</h4>

        {categorySocials === null && (
          <p className="profile-link" style={{ opacity: 0.6 }}>
            Loading social options…
          </p>
        )}

        {categorySocials !== null && socialsToRender.length === 0 && (
          <p className="profile-link" style={{ opacity: 0.6 }}>
            No social platforms configured for this category
          </p>
        )}

        {socialsToRender.map(({ key, label, value }) => {
          const Icon = SOCIAL_ICONS[key];
          const hasValue = Boolean(value);

          return (
            <p
              key={key}
              className={`profile-link social clickable ${
                !hasValue ? "empty-social" : ""
              }`}
              onClick={() => {
                setSocialType(key);
                setSocialValue(value);
                setShowSocialPopup(true);
              }}
            >
              <Icon className={`social-icon ${key}`} />
              {label}
              {!hasValue && (
                <span style={{ marginLeft: 6, opacity: 0.6, fontSize: 13 }}>
                  (Add)
                </span>
              )}
            </p>
          );
        })}

        <hr />

        {/* ================= LOCATIONS & HOURS ================= */}
        <h4 className="section-title">LOCATIONS & HOURS</h4>

        <p className="profile-link clickable" onClick={() => setShowHomeLocation(true)}>
          🏠 Home Location
        </p>

        <p className="profile-link clickable" onClick={() => setShowBusinessLocations(true)}>
          📍 Business Locations (Nearby)
        </p>

        {showBusinessLocations && (
          <BusinessLocationsModal
            vendorId={vendorId}
            initialLocations={user?.nearbyLocations || []}
            onClose={() => setShowBusinessLocations(false)}
          />
        )}

        <p className="profile-link clickable" onClick={openBusinessHours}>
          ⏰ Business Hours
        </p>

        {showBusinessHours && vendor && (
          <BusinessHoursModal
            vendorId={vendorId}
            businessName={vendor.businessName}
            initialHours={vendor.businessHours}
            onClose={() => setShowBusinessHours(false)}
          />
        )}

        <button className="close-profile" onClick={onClose}>
          Close
        </button>
      </div>

      {showHomeLocation && (
        <HomeLocationModal
          vendorId={vendorId}
          onClose={() => setShowHomeLocation(false)}
        />
      )}

      {/* ================= SOCIAL POPUP ================= */}
      {showSocialPopup && (
        <div className="popup-overlay">
          <div className="popup-card">
            <h3>Edit {socialType.charAt(0).toUpperCase() + socialType.slice(1)}</h3>

            <input
              type="text"
              value={socialValue}
              onChange={(e) => setSocialValue(e.target.value)}
              placeholder="Enter link / handle"
            />

            <div className="popup-actions">
              <button className="btn-outline" onClick={() => setShowSocialPopup(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleSaveSocial} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


