"use client";

import { useState, useEffect } from "react";
import { SOCIAL_ICONS } from "../../Icons/SocialIcons";
import { useVendor } from "@/app/context/VendorContext";
import { getVendorToken } from "../../utils/vendorAuth";
import "./ProfileSocialHandles.css";
export default function ProfileSocialHandles({
  showTitle = true,
  hideList = false,
  initialSocialKey = "",
  initialSocialLabel = "",
  initialSocialValue = "",
  onCloseEditor,
  onSaved,
}) {
  const { vendorInfo, setVendorInfo } = useVendor();

  const vendorId = vendorInfo?.vendorId || vendorInfo?._id || null;
  const rootCategoryId =
    vendorInfo?.categoryId ||
    vendorInfo?.category?._id ||
    vendorInfo?.rootCategoryId ||
    null;

  const [categorySocials, setCategorySocials] = useState(null);
  const [showSocialPopup, setShowSocialPopup] = useState(false);
  const [socialType, setSocialType] = useState("");
  const [socialValue, setSocialValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [socialLinks, setSocialLinks] = useState({});

  const normalize = (label) =>
    label.toLowerCase().replace(/\s+/g, "");

  const normalizeWhatsappNumber = (value) =>
    (() => {
      const digits = String(value || "").replace(/\D/g, "");
      if (!digits) return "";
      if (digits.length === 10) return `91${digits}`;
      if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
      return digits;
    })();

  const normalizeSocialUrl = (value, key) => {
    const trimmedValue = value.trim();
    if (!trimmedValue) return "";
    if (key === "whatsapp") return normalizeWhatsappNumber(trimmedValue);
    if (key === "email") return trimmedValue;
    if (/^https?:\/\//i.test(trimmedValue)) return trimmedValue;
    return `https://${trimmedValue}`;
  };

  const formatSocialUrl = (value) =>
    value.replace(/^https?:\/\//i, "").replace(/^www\./i, "");

  /* ================= LOAD CATEGORY SOCIALS ================= */
  useEffect(() => {
    if (!rootCategoryId) return;

    fetch(
      `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/dummy-categories/${rootCategoryId}`
    )
      .then((res) => res.json())
      .then((data) => {
        setCategorySocials(data.socialHandle || []);
      })
      .catch(() => setCategorySocials([]));
  }, [rootCategoryId]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const storedUser = JSON.parse(localStorage.getItem("userData") || "{}");
    const nextSocialLinks =
      vendorInfo?.socialLinks || storedUser?.socialLinks || {};
    setSocialLinks(nextSocialLinks);
  }, [vendorInfo?.socialLinks]);

  useEffect(() => {
    if (!initialSocialKey) return;

    setSocialType(initialSocialKey);
    setSocialValue(initialSocialValue || "");
    setShowSocialPopup(true);
  }, [initialSocialKey, initialSocialValue]);

  /* ================= BUILD SOCIAL LIST ================= */
  const socialsToRender =
    categorySocials === null
      ? []
      : (() => {
          const mapped = categorySocials
            .map((label) => {
              const key = normalize(label);
              if (!SOCIAL_ICONS[key]) return null;

              return {
                key,
                label,
                value:
                  key === "whatsapp"
                    ? socialLinks.whatsapp || vendorInfo?.phone || ""
                    : socialLinks[key] || "",
              };
            })
            .filter(Boolean);

          if (!mapped.some(({ key }) => key === "whatsapp")) {
            const whatsappValue = socialLinks.whatsapp || vendorInfo?.phone || "";
            if (whatsappValue) {
              mapped.push({
                key: "whatsapp",
                label: "WhatsApp",
                value: whatsappValue,
              });
            }
          }

          return mapped;
        })();

  /* ================= SAVE SOCIAL ================= */
  const handleSaveSocial = async () => {
    try {
      if (!vendorId) return;

      setSaving(true);
      const token = getVendorToken(vendorId);
      const normalizedValue = normalizeSocialUrl(socialValue, socialType);
      const nextSocialLinks = {
        ...socialLinks,
        [socialType]: normalizedValue,
      };

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/dummy-vendors/${vendorId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            socialLinks: nextSocialLinks,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to save social link");
      }

      setSocialLinks((prev) => ({
        ...prev,
        [socialType]: normalizedValue,
      }));

      setVendorInfo((currentVendorInfo) => {
        if (!currentVendorInfo) return currentVendorInfo;

        return {
          ...currentVendorInfo,
          socialLinks: nextSocialLinks,
        };
      });

      if (typeof window !== "undefined") {
        const storedUser = JSON.parse(localStorage.getItem("userData") || "{}");
        localStorage.setItem(
          "userData",
          JSON.stringify({
            ...storedUser,
            socialLinks: nextSocialLinks,
          })
        );
      }

      setShowSocialPopup(false);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="profile-subsection">
      {showTitle && (
        <div className="profile-subtitle">My Social Handles</div>
      )}

      {categorySocials === null && (
        <p className="profile-empty-state">Loading social options…</p>
      )}

      {!hideList &&
        socialsToRender.map(({ key, label, value }) => {
          const Icon = SOCIAL_ICONS[key];
          const hasValue = Boolean(value?.trim());
          const displayValue = hasValue
            ? key === "whatsapp"
              ? value
              : formatSocialUrl(value)
            : "";

          return (
            <div
              key={key}
              className={`profile-social-task ${!hasValue ? "empty-social" : ""}`}
              onClick={() => {
                setSocialType(key);
                setSocialValue(value);
                setShowSocialPopup(true);
              }}
            >
              <div className="profile-social-task-main">
                <Icon className={`social-icon ${key}`} />

                <div className="profile-social-text">
                  <span className="profile-social-task-label">{label}</span>

                  {hasValue && (
                    <span className="profile-social-link">{displayValue}</span>
                  )}
                </div>
              </div>

              {hasValue ? (
                <a
                  className="profile-social-task-status"
                  href={
                    key === "whatsapp"
                      ? `https://wa.me/${normalizeWhatsappNumber(value)}`
                      : key === "email"
                      ? `mailto:${value}`
                      : value
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                >
                  Open
                </a>
              ) : (
                <span className="profile-social-task-status">Add</span>
              )}
            </div>
          );
        })}

      {showSocialPopup && (
        <div className="popup-overlay">
          <div className="popup-card dashboard-social-popup">
            <h3>Edit {initialSocialLabel || socialType}</h3>

            <input
              className="dashboard-social-input"
              value={socialValue}
              onChange={(e) => setSocialValue(e.target.value)}
              placeholder={
                socialType === "whatsapp"
                  ? "Enter WhatsApp number with country code"
                  : socialType === "email"
                  ? "Enter email address"
                  : "Enter link or handle"
              }
            />

            <div className="popup-actions">
              <button
                className="btn-outline"
                onClick={() => {
                  setShowSocialPopup(false);
                  onCloseEditor?.();
                }}
              >
                Cancel
              </button>

              <button
                className="btn-primary"
                onClick={handleSaveSocial}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
