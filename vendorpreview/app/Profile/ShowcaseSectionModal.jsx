"use client";

import "./Business.css";
import { useMemo, useState } from "react";
import { API_BASE_URL } from "../../config";
import { useVendor } from "@/app/context/VendorContext";
import { getVendorAuthHeaders } from "@/app/utils/vendorAuth";

const MAX_HEADING = 120;
const MAX_SUBHEADING = 260;
const MAX_LABEL = 40;
const MAX_ITEMS = 10;
const MAX_NAME = 90;
const MAX_DESCRIPTION = 2200;
const MAX_IMAGE_URL = 500;
const MAX_IMAGES_PER_ITEM = 10;

function createEmptyItem() {
  return {
    name: "",
    description: "",
    imageUrls: [],
  };
}

function normalizeShowcaseSection(input) {
  const source = input && typeof input === "object" ? input : {};
  const items = Array.isArray(source.items) ? source.items : [];

  return {
    heading: String(source.heading || "").slice(0, MAX_HEADING),
    subHeading: String(source.subHeading || "").slice(0, MAX_SUBHEADING),
    itemLabel: String(source.itemLabel || "").slice(0, MAX_LABEL),
    items: items
      .slice(0, MAX_ITEMS)
      .map((item) => ({
        name: String(item?.name || item?.title || "").slice(0, MAX_NAME),
        description: String(item?.description || "").slice(0, MAX_DESCRIPTION),
        imageUrls: Array.isArray(item?.imageUrls)
          ? item.imageUrls
              .map((url) => String(url || "").slice(0, MAX_IMAGE_URL))
              .filter(Boolean)
              .slice(0, MAX_IMAGES_PER_ITEM)
          : [],
      })),
  };
}

export default function ShowcaseSectionModal({
  vendorId,
  businessName,
  initialShowcaseSection = {},
  onClose,
}) {
  const { setVendorInfo } = useVendor();
  const [showcaseSection, setShowcaseSection] = useState(() =>
    normalizeShowcaseSection(initialShowcaseSection)
  );
  const [saving, setSaving] = useState(false);
  const [uploadingIndex, setUploadingIndex] = useState(null);

  const itemLabel = useMemo(
    () => String(showcaseSection.itemLabel || "").trim() || "Profile",
    [showcaseSection.itemLabel]
  );

  const updateRootField = (field, value, maxLength) => {
    setShowcaseSection((prev) => ({
      ...prev,
      [field]: String(value || "").slice(0, maxLength),
    }));
  };

  const updateItemField = (index, field, value, maxLength) => {
    setShowcaseSection((prev) => ({
      ...prev,
      items: prev.items.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [field]: String(value || "").slice(0, maxLength),
            }
          : item
      ),
    }));
  };

  const addItem = () => {
    setShowcaseSection((prev) => {
      if (prev.items.length >= MAX_ITEMS) return prev;
      return {
        ...prev,
        items: [...prev.items, createEmptyItem()],
      };
    });
  };

  const removeItem = (index) => {
    setShowcaseSection((prev) => ({
      ...prev,
      items: prev.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const removeImage = (itemIndex, imageIndex) => {
    setShowcaseSection((prev) => ({
      ...prev,
      items: prev.items.map((item, currentIndex) =>
        currentIndex === itemIndex
          ? {
              ...item,
              imageUrls: item.imageUrls.filter((_, currentImageIndex) => currentImageIndex !== imageIndex),
            }
          : item
      ),
    }));
  };

  async function uploadImage(file, index) {
    const endpoint = `${API_BASE_URL}/api/upload?vendorId=${encodeURIComponent(vendorId)}`;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folderType", "newvendor");
    formData.append(
      "hierarchy",
      JSON.stringify([
        "vendor-profile",
        String(vendorId),
        `showcase-${index + 1}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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

  const handleUpload = async (event, index) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;

    const currentCount = showcaseSection.items[index]?.imageUrls?.length || 0;
    const remainingSlots = Math.max(0, MAX_IMAGES_PER_ITEM - currentCount);
    const filesToUpload = files.slice(0, remainingSlots);

    try {
      setUploadingIndex(index);
      const uploadedUrls = [];
      for (const file of filesToUpload) {
        const uploadedUrl = await uploadImage(file, index);
        uploadedUrls.push(`${uploadedUrl}${uploadedUrl.includes("?") ? "&" : "?"}v=${Date.now()}`);
      }

      setShowcaseSection((prev) => ({
        ...prev,
        items: prev.items.map((item, itemIndex) =>
          itemIndex === index
            ? {
                ...item,
                imageUrls: [...(item.imageUrls || []), ...uploadedUrls].slice(0, MAX_IMAGES_PER_ITEM),
              }
            : item
        ),
      }));
    } catch (error) {
      console.error("Failed to upload showcase image", error);
      alert(error.message || "Failed to upload showcase image");
    } finally {
      setUploadingIndex(null);
    }
  };

  const handleSave = async () => {
    if (!vendorId) {
      alert("Vendor ID missing");
      return;
    }

    const token = localStorage.getItem("authToken") || localStorage.getItem("token") || "";
    const payload = {
      showcaseSection: {
        heading: String(showcaseSection.heading || "").trim().slice(0, MAX_HEADING),
        subHeading: String(showcaseSection.subHeading || "").trim().slice(0, MAX_SUBHEADING),
        itemLabel: String(showcaseSection.itemLabel || "").trim().slice(0, MAX_LABEL),
        items: (Array.isArray(showcaseSection.items) ? showcaseSection.items : [])
          .slice(0, MAX_ITEMS)
          .map((item) => ({
            name: String(item?.name || "").trim().slice(0, MAX_NAME),
            title: String(item?.name || "").trim().slice(0, MAX_NAME),
            description: String(item?.description || "").trim().slice(0, MAX_DESCRIPTION),
            imageUrls: Array.isArray(item?.imageUrls)
              ? item.imageUrls
                  .map((url) => String(url || "").trim().slice(0, MAX_IMAGE_URL))
                  .filter(Boolean)
                  .slice(0, MAX_IMAGES_PER_ITEM)
              : [],
          }))
          .filter(
            (item) => item.name || item.description || (Array.isArray(item.imageUrls) && item.imageUrls.length)
          ),
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
        throw new Error(data?.message || "Failed to save showcase section");
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
      console.error("Failed to save showcase section", error);
      alert(error.message || "Failed to save showcase section");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="popup-overlay">
      <div className="popup-card business-hours-theme branding-contact-theme showcase-section-modal">
        <h2 className="popup-title">Showcase Section</h2>
        <p className="popup-subtitle">{businessName}</p>

        <div className="branding-contact-body showcase-section-body">
          <div className="branding-contact-grid">
            <div className="branding-contact-section">
              <label className="branding-label" htmlFor="showcase-heading">
                Section Heading
              </label>
              <input
                id="showcase-heading"
                className="branding-text-input"
                type="text"
                maxLength={MAX_HEADING}
                placeholder="Enter showcase section heading"
                value={showcaseSection.heading}
                onChange={(event) => updateRootField("heading", event.target.value, MAX_HEADING)}
              />
            </div>

            <div className="branding-contact-section">
              <label className="branding-label" htmlFor="showcase-subheading">
                Section Description
              </label>
              <textarea
                id="showcase-subheading"
                className="branding-textarea-input"
                maxLength={MAX_SUBHEADING}
                placeholder="Add a short intro for this premium section"
                rows={3}
                value={showcaseSection.subHeading}
                onChange={(event) => updateRootField("subHeading", event.target.value, MAX_SUBHEADING)}
              />
            </div>

            <div className="branding-contact-section">
              <label className="branding-label" htmlFor="showcase-item-label">
                Item Label
              </label>
              <input
                id="showcase-item-label"
                className="branding-text-input"
                type="text"
                maxLength={MAX_LABEL}
                placeholder="Examples: Project, Partner, Client"
                value={showcaseSection.itemLabel}
                onChange={(event) => updateRootField("itemLabel", event.target.value, MAX_LABEL)}
              />
              <div className="branding-helper-text">
                Used as the singular label inside this section. Current label: {itemLabel}
              </div>
            </div>
          </div>

          <div className="showcase-section-toolbar">
            <div className="branding-helper-text">
              {showcaseSection.items.length}/{MAX_ITEMS} {itemLabel.toLowerCase()}
              {showcaseSection.items.length === 1 ? "" : "s"} configured
            </div>
            <button
              type="button"
              className="btn-save primary showcase-add-item-btn"
              onClick={addItem}
              disabled={showcaseSection.items.length >= MAX_ITEMS}
            >
              + Add {itemLabel}
            </button>
          </div>

            <div className="showcase-item-list">
            {showcaseSection.items.map((item, index) => (
              <div key={`showcase-item-${index}`} className="showcase-item-card">
                <div className="showcase-item-card-head">
                  <div>
                    <h3>{itemLabel} {index + 1}</h3>
                    <p>{(item.imageUrls || []).length}/{MAX_IMAGES_PER_ITEM} images</p>
                  </div>
                  <button
                    type="button"
                    className="btn-cancel showcase-remove-item-btn"
                    onClick={() => removeItem(index)}
                  >
                    Remove
                  </button>
                </div>

                <div className="branding-contact-grid">
                  <div className="branding-contact-section">
                    <label className="branding-label" htmlFor={`showcase-name-${index}`}>
                      {itemLabel} Name
                    </label>
                    <input
                      id={`showcase-name-${index}`}
                      className="branding-text-input"
                      type="text"
                      maxLength={MAX_NAME}
                      placeholder={`Enter ${itemLabel.toLowerCase()} name`}
                      value={item.name}
                      onChange={(event) => updateItemField(index, "name", event.target.value, MAX_NAME)}
                    />
                  </div>

                  <div className="branding-contact-section">
                    <label className="branding-label" htmlFor={`showcase-description-${index}`}>
                      Description
                    </label>
                    <textarea
                      id={`showcase-description-${index}`}
                      className="branding-textarea-input"
                      rows={5}
                      maxLength={MAX_DESCRIPTION}
                      placeholder={`Describe this ${itemLabel.toLowerCase()} in detail`}
                      value={item.description}
                      onChange={(event) => updateItemField(index, "description", event.target.value, MAX_DESCRIPTION)}
                    />
                  </div>

                  <div className="branding-contact-section">
                    <label className="branding-label">Images</label>
                    <div className="showcase-image-actions">
                      <label className="btn-cancel showcase-upload-btn">
                        {uploadingIndex === index ? "Uploading..." : `Upload ${itemLabel} Images`}
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          hidden
                          disabled={uploadingIndex === index || (item.imageUrls || []).length >= MAX_IMAGES_PER_ITEM}
                          onChange={(event) => handleUpload(event, index)}
                        />
                      </label>
                      <span className="branding-helper-text">
                        Up to {MAX_IMAGES_PER_ITEM} images per {itemLabel.toLowerCase()}
                      </span>
                    </div>

                    {(item.imageUrls || []).length ? (
                      <div className="showcase-image-grid">
                        {item.imageUrls.map((imageUrl, imageIndex) => (
                          <div key={`${imageUrl}-${imageIndex}`} className="showcase-image-thumb">
                            <img src={imageUrl} alt={`${item.name || itemLabel} ${imageIndex + 1}`} />
                            <button
                              type="button"
                              className="showcase-image-remove"
                              onClick={() => removeImage(index, imageIndex)}
                              aria-label="Remove image"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}

            {!showcaseSection.items.length ? (
              <div className="showcase-empty-state">
                <strong>No {itemLabel.toLowerCase()} entries yet.</strong>
                <span>Add up to 10 items with a name, description, and image gallery.</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="popup-footer">
          <button type="button" className="btn-cancel" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn-save primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Showcase"}
          </button>
        </div>
      </div>
    </div>
  );
}
