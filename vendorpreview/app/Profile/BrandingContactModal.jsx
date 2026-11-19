"use client";

import "./Business.css";
import { useMemo, useState } from "react";
import { useVendor } from "@/app/context/VendorContext";
import { getVendorAuthHeaders } from "@/app/utils/vendorAuth";

function normalizePhoneInput(value) {
  return String(value || "").replace(/\D/g, "").slice(-10);
}

function normalizeLogoUrl(value) {
  return String(value || "").trim();
}

export default function BrandingContactModal({
  vendorId,
  businessName,
  initialLogoUrl = "",
  initialSecondaryPhones = [],
  initialLanguagePreference = "en",
  onClose,
}) {
  const { setVendorInfo } = useVendor();
  const [logoUrl, setLogoUrl] = useState(() => normalizeLogoUrl(initialLogoUrl));
  const [secondaryPhones, setSecondaryPhones] = useState(() => {
    const base = Array.isArray(initialSecondaryPhones)
      ? initialSecondaryPhones.slice(0, 3)
      : [];
    while (base.length < 3) base.push("");
    return base.map(normalizePhoneInput);
  });
  const [languagePreference, setLanguagePreference] = useState(() =>
    String(initialLanguagePreference || "").trim().toLowerCase() === "te"
      ? "te"
      : "en"
  );
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const previewLogoUrl = useMemo(() => normalizeLogoUrl(logoUrl), [logoUrl]);

  const updatePhone = (index, value) => {
    setSecondaryPhones((current) =>
      current.map((phone, phoneIndex) =>
        phoneIndex === index ? normalizePhoneInput(value) : phone
      )
    );
  };

  async function uploadLogo(file) {
    const endpoint = `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/upload?vendorId=${encodeURIComponent(vendorId)}`;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folderType", "newvendor");
    formData.append(
      "hierarchy",
      JSON.stringify([
        "vendor-branding",
        String(vendorId),
        `logo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ])
    );

    const response = await fetch(endpoint, {
      method: "POST",
      headers: getVendorAuthHeaders(vendorId),
      body: formData,
    });
    const json = await response.json();

    if (!response.ok || json?.success === false) {
      throw new Error(json?.message || json?.error || "Upload failed");
    }

    return json?.url || "";
  }

  const handleLogoUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      setUploadingLogo(true);
      const uploadedUrl = await uploadLogo(file);
      const cacheBustedUrl = `${uploadedUrl}${uploadedUrl.includes("?") ? "&" : "?"}v=${Date.now()}`;
      setLogoUrl(cacheBustedUrl);
    } catch (error) {
      console.error("Failed to upload logo", error);
      alert(error.message || "Failed to upload logo");
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSave = async () => {
    if (!vendorId) {
      alert("Vendor ID missing");
      return;
    }

    const token =
      localStorage.getItem("authToken") ||
      localStorage.getItem("token") ||
      "";

    const payload = {
      logoUrl: normalizeLogoUrl(logoUrl),
      secondaryPhones: secondaryPhones
        .map(normalizePhoneInput)
        .filter(Boolean),
      languagePreference,
    };

    try {
      setSaving(true);
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/dummy-vendors/${vendorId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || "Failed to save branding details");
      }

      setVendorInfo((prev) =>
        prev
          ? {
              ...prev,
              logoUrl: data?.logoUrl || payload.logoUrl,
              secondaryPhones:
                data?.secondaryPhones || payload.secondaryPhones,
              languagePreference:
                data?.languagePreference || payload.languagePreference,
            }
          : prev
      );

      onClose?.();
    } catch (error) {
      console.error("Failed to save branding details", error);
      alert(error.message || "Failed to save branding details");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="popup-overlay">
      <div className="popup-card business-hours-theme branding-contact-theme">
        <h2 className="popup-title">Branding & Contact</h2>
        <p className="popup-subtitle">{businessName}</p>

        <div className="branding-contact-body">
          <div className="branding-contact-grid">
            <div className="branding-contact-section">
              <label className="branding-label">Vendor Logo</label>
              <div className="branding-logo-row">
                <div className="branding-logo-preview">
                  {previewLogoUrl ? (
                    <img src={previewLogoUrl} alt={`${businessName} logo`} />
                  ) : (
                    <span>No logo</span>
                  )}
                </div>

                <div className="branding-logo-actions">
                  <input
                    className="branding-text-input"
                    type="text"
                    placeholder="Paste public logo URL"
                    value={logoUrl}
                    onChange={(event) => setLogoUrl(event.target.value)}
                  />
                  <label className="branding-upload-btn">
                    {uploadingLogo ? "Uploading..." : "Upload Logo"}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      hidden
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="branding-contact-section">
              <label className="branding-label">Secondary Numbers</label>
              <div className="branding-phone-list">
                {secondaryPhones.map((phone, index) => (
                  <input
                    key={index}
                    className="branding-text-input"
                    type="text"
                    inputMode="numeric"
                    placeholder={`Secondary number ${index + 1}`}
                    value={phone}
                    onChange={(event) => updatePhone(index, event.target.value)}
                  />
                ))}
              </div>
            </div>

            <div className="branding-contact-section">
              <label className="branding-label" htmlFor="vendor-language-preference">
                Language Preference
              </label>
              <select
                id="vendor-language-preference"
                className="branding-text-input"
                value={languagePreference}
                onChange={(event) => setLanguagePreference(event.target.value)}
              >
                <option value="en">English</option>
                <option value="te">Telugu</option>
              </select>
            </div>
          </div>
        </div>

        <div className="popup-footer">
          <button className="btn-cancel" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="btn-save primary"
            onClick={handleSave}
            disabled={saving || uploadingLogo}
          >
            {saving ? "Saving..." : "Save Details"}
          </button>
        </div>
      </div>
    </div>
  );
}
