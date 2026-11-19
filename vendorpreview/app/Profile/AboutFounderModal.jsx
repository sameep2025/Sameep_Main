"use client";

import "./Business.css";
import { useMemo, useState } from "react";
import { API_BASE_URL } from "../../config";
import { useVendor } from "@/app/context/VendorContext";
import { getVendorAuthHeaders } from "@/app/utils/vendorAuth";

const MAX_HEADING = 120;
const MAX_BODY = 2000;
const MAX_NAME = 80;
const MAX_ROLE = 80;
const MAX_IMAGE_URL = 500;

function normalizeFounderAbout(input) {
  const source = input && typeof input === "object" ? input : {};

  return {
    heading: String(source.heading || "").slice(0, MAX_HEADING),
    body: String(source.body || "").slice(0, MAX_BODY),
    founderName: String(source.founderName || "").slice(0, MAX_NAME),
    founderRole: String(source.founderRole || "").slice(0, MAX_ROLE),
    founderImageUrl: String(source.founderImageUrl || "").slice(0, MAX_IMAGE_URL),
  };
}

export default function AboutFounderModal({
  vendorId,
  businessName,
  initialFounderAbout = {},
  onClose,
}) {
  const { setVendorInfo } = useVendor();
  const [founderAbout, setFounderAbout] = useState(() =>
    normalizeFounderAbout(initialFounderAbout)
  );
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const previewFounderImageUrl = useMemo(
    () => String(founderAbout.founderImageUrl || "").trim(),
    [founderAbout.founderImageUrl]
  );

  const updateField = (field, value, maxLength) => {
    setFounderAbout((prev) => ({
      ...prev,
      [field]: String(value || "").slice(0, maxLength),
    }));
  };

  async function uploadFounderImage(file) {
    const endpoint = `${API_BASE_URL}/api/upload?vendorId=${encodeURIComponent(vendorId)}`;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folderType", "newvendor");
    formData.append(
      "hierarchy",
      JSON.stringify([
        "vendor-profile",
        String(vendorId),
        `founder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ])
    );

    const response = await fetch(endpoint, {
      method: "POST",
      headers: getVendorAuthHeaders(vendorId),
      body: formData,
    });
    const json = await response.json().catch(() => ({}));

    if (!response.ok || json?.success === false) {
      throw new Error(json?.message || json?.error || "Upload failed");
    }

    return json?.url || "";
  }

  const handleFounderImageUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      setUploadingImage(true);
      const uploadedUrl = await uploadFounderImage(file);
      const cacheBustedUrl = `${uploadedUrl}${uploadedUrl.includes("?") ? "&" : "?"}v=${Date.now()}`;
      updateField("founderImageUrl", cacheBustedUrl, MAX_IMAGE_URL);
    } catch (error) {
      console.error("Failed to upload founder image", error);
      alert(error.message || "Failed to upload founder image");
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async () => {
    if (!vendorId) {
      alert("Vendor ID missing");
      return;
    }

    const token = localStorage.getItem("authToken") || localStorage.getItem("token") || "";
    const payload = {
      founderAbout: {
        heading: String(founderAbout.heading || "").trim().slice(0, MAX_HEADING),
        body: String(founderAbout.body || "").trim().slice(0, MAX_BODY),
        founderName: String(founderAbout.founderName || "").trim().slice(0, MAX_NAME),
        founderRole: String(founderAbout.founderRole || "").trim().slice(0, MAX_ROLE),
        founderImageUrl: String(founderAbout.founderImageUrl || "").trim().slice(0, MAX_IMAGE_URL),
      },
    };

    try {
      setSaving(true);
      const response = await fetch(`${API_BASE_URL}/api/dummy-vendors/${vendorId}/custom-fields`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.message || "Failed to save About Founder");
      }

      const vendorRefreshResponse = await fetch(`${API_BASE_URL}/api/dummy-vendors/${vendorId}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        cache: "no-store",
      });
      const refreshedVendor = await vendorRefreshResponse.json().catch(() => null);

      setVendorInfo((prev) =>
        prev
          ? {
              ...prev,
              ...(refreshedVendor && typeof refreshedVendor === "object" ? refreshedVendor : {}),
              customFields: {
                ...(prev.customFields || {}),
                ...(refreshedVendor?.customFields || {}),
                ...(data?.customFields || {}),
              },
            }
          : prev
      );

      onClose?.();
    } catch (error) {
      console.error("Failed to save About Founder", error);
      alert(error.message || "Failed to save About Founder");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="popup-overlay">
      <div className="popup-card business-hours-theme branding-contact-theme">
        <h2 className="popup-title">About Founder</h2>
        <p className="popup-subtitle">{businessName}</p>

        <div className="branding-contact-body">
          <div className="branding-contact-grid">
            <div className="branding-contact-section">
              <label className="branding-label" htmlFor="founder-about-heading">
                Section Heading
              </label>
              <input
                id="founder-about-heading"
                className="branding-text-input"
                type="text"
                maxLength={MAX_HEADING}
                placeholder="Enter section heading"
                value={founderAbout.heading}
                onChange={(event) => updateField("heading", event.target.value, MAX_HEADING)}
              />
              <div className="branding-helper-text">
                {founderAbout.heading.trim().length}/{MAX_HEADING} characters
              </div>
            </div>

            <div className="branding-contact-section">
              <label className="branding-label" htmlFor="founder-about-body">
                Founder Story
              </label>
              <textarea
                id="founder-about-body"
                className="branding-textarea-input"
                maxLength={MAX_BODY}
                placeholder="Share the founder or business story in detail"
                value={founderAbout.body}
                onChange={(event) => updateField("body", event.target.value, MAX_BODY)}
                rows={10}
              />
              <div className="branding-helper-text">
                {founderAbout.body.trim().length}/{MAX_BODY} characters
              </div>
            </div>

            <div className="branding-contact-section">
              <label className="branding-label" htmlFor="founder-about-name">
                Founder Name
              </label>
              <input
                id="founder-about-name"
                className="branding-text-input"
                type="text"
                maxLength={MAX_NAME}
                placeholder="Enter founder name"
                value={founderAbout.founderName}
                onChange={(event) => updateField("founderName", event.target.value, MAX_NAME)}
              />
              <div className="branding-helper-text">
                {founderAbout.founderName.trim().length}/{MAX_NAME} characters
              </div>
            </div>

            <div className="branding-contact-section">
              <label className="branding-label" htmlFor="founder-about-role">
                Founder Role
              </label>
              <input
                id="founder-about-role"
                className="branding-text-input"
                type="text"
                maxLength={MAX_ROLE}
                placeholder="Founder, Managing Director, etc."
                value={founderAbout.founderRole}
                onChange={(event) => updateField("founderRole", event.target.value, MAX_ROLE)}
              />
              <div className="branding-helper-text">
                {founderAbout.founderRole.trim().length}/{MAX_ROLE} characters
              </div>
            </div>

            <div className="branding-contact-section">
              <label className="branding-label" htmlFor="founder-about-image">
                Founder Image
              </label>
              <div className="branding-logo-row">
                <div className="branding-logo-preview">
                  {previewFounderImageUrl ? (
                    <img src={previewFounderImageUrl} alt={founderAbout.founderName || "Founder"} />
                  ) : (
                    <span>No image</span>
                  )}
                </div>

                <div className="branding-logo-actions">
                  <input
                    id="founder-about-image"
                    className="branding-text-input"
                    type="url"
                    maxLength={MAX_IMAGE_URL}
                    placeholder="Paste public image URL"
                    value={founderAbout.founderImageUrl}
                    onChange={(event) =>
                      updateField("founderImageUrl", event.target.value, MAX_IMAGE_URL)
                    }
                  />
                  <label className="branding-upload-btn">
                    {uploadingImage ? "Uploading..." : "Upload Image"}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFounderImageUpload}
                      hidden
                    />
                  </label>
                </div>
              </div>
              <div className="branding-helper-text">
                Optional. Modern Light preview shows this section right now.
              </div>
            </div>
          </div>
        </div>

        <div className="business-hours-actions">
          <button className="ghost-btn" type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="save-btn"
            type="button"
            onClick={handleSave}
            disabled={saving || uploadingImage}
          >
            {saving ? "Saving..." : "Save Founder Story"}
          </button>
        </div>
      </div>
    </div>
  );
}
