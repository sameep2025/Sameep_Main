"use client";

import React, { useState, useEffect, useRef } from "react";
import API_BASE_URL, { ASSET_BASE_URL } from "../config";

export default function VendorMenuDropdown({
  vendor,
  hasCombos = false,
  inventoryLabel,
  inventoryLabels = [],
  isInventoryModel = false,
  onNavigateMyPricesCombos,
  onNavigateMyPricesNonCombos,
  onNavigateHomeLocation,
  onNavigateBusinessLocation,
  onNavigateBusinessHours,
  onNavigateInventory,
  avatarLetter = "V",
  servicesForMyPrices = [],
  activeServicesForMyPrices = [],
  socialHandles = [],
}) {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const containerRef = useRef(null);
  const [socialIcons, setSocialIcons] = useState({}); // normalized handle -> icon URL
  const [vendorSocialLinks, setVendorSocialLinks] = useState({}); // raw map from API
  const [editingHandleKey, setEditingHandleKey] = useState(""); // normalized key
  const [editingHandleLabel, setEditingHandleLabel] = useState(""); // display label
  const [editingValue, setEditingValue] = useState("");
  const [savingSocial, setSavingSocial] = useState(false);
  const [showSocialModal, setShowSocialModal] = useState(false);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const update = () => {
      try {
        if (typeof window === "undefined") return;
        setIsMobile(window.innerWidth < 900);
      } catch {}
    };
    update();
    if (typeof window !== "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    return undefined;
  }, []);

  useEffect(() => {
    const fetchIcons = async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/masters?type=${encodeURIComponent("socialHandle")}`
        );
        if (!res.ok) return;
        const data = await res.json().catch(() => []);
        const arr = Array.isArray(data) ? data : [];
        const map = {};
        arr.forEach((m) => {
          const name = m && typeof m.name === "string" ? m.name : "";
          const key = normalizeHandle(name);
          if (!key) return;
          const rawUrl = (m && typeof m.imageUrl === "string" ? m.imageUrl : "").trim();
          if (!rawUrl) return;
          const full = rawUrl.startsWith("http")
            ? rawUrl
            : `${ASSET_BASE_URL || ""}${rawUrl}`;
          map[key] = full;
        });
        setSocialIcons(map);
      } catch {
        setSocialIcons({});
      }
    };
    fetchIcons();
  }, []);

  useEffect(() => {
    const fetchVendorSocialLinks = async () => {
      try {
        const id = vendor && typeof vendor === "object" ? vendor._id || vendor.vendorId : null;
        if (!id) {
          setVendorSocialLinks({});
          return;
        }
        let links = {};
        try {
          const res = await fetch(`${API_BASE_URL}/api/dummy-vendors/${id}/social-links`);
          if (res.ok) {
            const data = await res.json().catch(() => ({}));
            if (data && typeof data.socialLinks === "object" && data.socialLinks !== null) {
              links = data.socialLinks;
            }
          }
        } catch {}

        // Fallback: read from full vendor doc if needed
        if (!links || Object.keys(links || {}).length === 0) {
          try {
            const res2 = await fetch(`${API_BASE_URL}/api/dummy-vendors/${id}`);
            if (res2.ok) {
              const doc = await res2.json().catch(() => ({}));
              if (doc && typeof doc.socialLinks === "object" && doc.socialLinks !== null) {
                links = doc.socialLinks;
              }
            }
          } catch {}
        }

        setVendorSocialLinks(links || {});
      } catch {
        setVendorSocialLinks({});
      }
    };
    fetchVendorSocialLinks();
  }, [vendor]);

  const businessName = (() => {
    try {
      const raw = vendor && typeof vendor.businessName === "string" ? vendor.businessName : "";
      const t = String(raw || "").trim();
      return t || "Vendor";
    } catch {
      return "Vendor";
    }
  })();

  const handleSaveSocialLink = async (normKey, label, origKey) => {
    try {
      const id = vendor && typeof vendor === "object" ? vendor._id || vendor.vendorId : null;
      if (!id) return;
      setSavingSocial(true);
      const existing = vendorSocialLinks && typeof vendorSocialLinks === "object" ? vendorSocialLinks : {};
      const next = { ...existing };
      const val = String(editingValue || "").trim();

      // Update any existing keys whose normalized form matches this handle
      Object.keys(existing).forEach((k) => {
        const nk = normalizeHandle(k);
        if (nk && (nk === normKey || nk === normalizeHandle(label))) {
          next[k] = val;
        }
      });

      if (label) next[label] = val;
      if (origKey) next[origKey] = val;
      if (normKey) next[normKey] = val;

      const res = await fetch(`${API_BASE_URL}/api/dummy-vendors/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ socialLinks: next }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Failed to save social link");
      }
      setVendorSocialLinks(next);
      setEditingHandleKey("");
      setEditingHandleLabel("");
      setEditingValue("");
      setShowSocialModal(false);
    } catch (err) {
      alert((err && err.message) || "Failed to save social link");
    } finally {
      setSavingSocial(false);
    }
  };

  const normalizeHandle = (v) => {
    try {
      return String(v == null ? "" : v)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
    } catch {
      return "";
    }
  };

  const allSocialHandles = (() => {
    try {
      const v = vendor && typeof vendor === "object" ? vendor : {};
      const base = [
        { key: "website",   label: "Website",   value: v.website || v.siteUrl || v.url },
        { key: "whatsapp",  label: "WhatsApp",  value: v.whatsapp || v.whatsApp || v.whatsappNumber },
        { key: "instagram", label: "Instagram", value: v.instagram || v.instagramHandle || v.ig },
        { key: "facebook",  label: "Facebook",  value: v.facebook || v.fb || v.facebookPage },
        { key: "youtube",   label: "YouTube",   value: v.youtube || v.youtubeChannel },
        { key: "linkedin",  label: "LinkedIn",  value: v.linkedin || v.linkedIn || v.linkedinUrl },
        { key: "twitter",   label: "Twitter",   value: v.twitter || v.x || v.twitterHandle },
      ];
      return base.map((item) => {
        const t = item.value == null ? "" : String(item.value).trim();
        return { ...item, value: t };
      });
    } catch {
      return [
        { key: "website",   label: "Website",   value: "" },
        { key: "whatsapp",  label: "WhatsApp",  value: "" },
        { key: "instagram", label: "Instagram", value: "" },
        { key: "facebook",  label: "Facebook",  value: "" },
        { key: "youtube",   label: "YouTube",   value: "" },
        { key: "linkedin",  label: "LinkedIn",  value: "" },
        { key: "twitter",   label: "Twitter",   value: "" },
      ];
    }
  })();

  const selectedSocialHandles = (() => {
    try {
      const base = Array.isArray(allSocialHandles) ? allSocialHandles : [];
      const selected = Array.isArray(socialHandles) ? socialHandles : [];
      if (!selected.length) return [];

      const index = new Set(
        selected
          .map((v) => normalizeHandle(v))
          .filter(Boolean)
      );

      const out = base.filter((item) => {
        const key = normalizeHandle(item.key);
        const label = normalizeHandle(item.label);
        if (!index.size) return false;
        const match = index.has(key) || index.has(label);
        return match;
      });

      return out;
    } catch {
      return [];
    }
  })();

  const phoneNumber = (() => {
    try {
      if (!vendor || typeof vendor !== "object") return "";
      const candidates = [
        vendor.phone,
        vendor.mobile,
        vendor.mobileNumber,
        vendor.contactNumber,
        vendor.contactPhone,
        vendor?.contact?.phone,
      ];
      const first = candidates.find((v) => v != null && String(v).trim() !== "");
      return first != null ? String(first).trim() : "";
    } catch {
      return "";
    }
  })();

  const effectiveInventoryLabel = (() => {
    try {
      const primaryFromList = Array.isArray(inventoryLabels) && inventoryLabels.length
        ? inventoryLabels[0]
        : null;
      const raw = primaryFromList || inventoryLabel || (isInventoryModel ? "Inventory" : "");
      const t = String(raw || "").trim();
      return t || "";
    } catch {
      return "";
    }
  })();

  const handleToggle = () => {
    setOpen((prev) => !prev);
  };

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", display: "flex", alignItems: "center" }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={handleToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleToggle();
          }
        }}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          cursor: "pointer",
        }}
        aria-label={businessName}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "999px",
            border: "none",
            backgroundColor: "#10B981", // solid green circle always
            color: "#FFFFFF",
            fontSize: 16,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 10px rgba(15,23,42,0.18)",
          }}
        >
          {avatarLetter}
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            color: "#6b7280",
            lineHeight: 1.1,
          }}
        >
          My Profile
        </span>
      </div>

      {open && (
        <div
          style={{
            position: isMobile ? "fixed" : "absolute",
            top: isMobile ? "auto" : "100%",
            bottom: isMobile ? 20 : "auto",
            left: isMobile ? 16 : "auto",
            right: isMobile ? 16 : 0,
            marginTop: isMobile ? 0 : 8,
            width: isMobile ? "auto" : 260,
            maxHeight: isMobile ? "68vh" : "none",
            overflowY: "auto",
            borderRadius: isMobile ? 24 : 16,
            background: "#FFFFFF",
            boxShadow: "0 20px 45px rgba(15,23,42,0.55)",
            border: "1px solid #E5E7EB",
            padding: isMobile ? 14 : 16,
            color: "#0F172A",
            zIndex: 2000,
            fontFamily: "Poppins, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
          }}
        >
          {isMobile && (
            <div
              style={{
                width: 40,
                height: 4,
                borderRadius: 999,
                background: "#E5E7EB",
                margin: "4px auto 10px",
              }}
            />
          )}
          <div style={{ marginBottom: 8 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: "#020617",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {businessName}
            </div>
            {phoneNumber && (
              <div
                style={{
                  marginTop: 2,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11,
                  color: "#4B5563",
                }}
              >
                <span style={{ fontSize: 12, opacity: 0.5 }}>📞</span>
                <span
                  style={{
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {phoneNumber}
                </span>
              </div>
            )}
          </div>

          {showSocialModal && editingHandleKey && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 3000,
              }}
              onClick={() => {
                if (!savingSocial) {
                  setShowSocialModal(false);
                  setEditingHandleKey("");
                }
              }}
            >
              <div
                style={{
                  background: "#fff",
                  padding: 16,
                  borderRadius: 12,
                  minWidth: 260,
                  maxWidth: 380,
                  width: "90%",
                  boxShadow: "0 18px 40px rgba(15,23,42,0.45)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    marginBottom: 10,
                    textTransform: "none",
                  }}
                >
                  Edit {editingHandleLabel || editingHandleKey} link
                </div>
                <input
                  style={{
                    width: "100%",
                    padding: 8,
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                    fontSize: 12,
                    marginBottom: 12,
                  }}
                  placeholder="Enter link / handle"
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSaveSocialLink(editingHandleKey, editingHandleLabel, editingHandleLabel);
                    }
                  }}
                />
                <div
                  style={{
                    marginTop: 10,
                    display: "flex",
                    justifyContent: "center",
                    gap: 10,
                  }}
                >
                  <div
                    role="button"
                    aria-label="Cancel"
                    onClick={() => {
                      if (!savingSocial) {
                        setShowSocialModal(false);
                        setEditingHandleKey("");
                        setEditingHandleLabel("");
                      }
                    }}
                    style={{
                      padding: "4px 12px",
                      borderRadius: 999,
                      border: "1px solid #0ea5e9",
                      fontSize: 10,
                      fontWeight: 500,
                      textTransform: "uppercase",
                      background: savingSocial ? "#e5e7eb" : "#e0f2fe",
                      color: savingSocial ? "#9ca3af" : "#0369a1",
                      cursor: savingSocial ? "default" : "pointer",
                      minWidth: 70,
                      textAlign: "center",
                      letterSpacing: 0.6,
                    }}
                  >
                    Cancel
                  </div>
                  <div
                    role="button"
                    aria-label="Save social link"
                    onClick={() => {
                      if (savingSocial) return;
                      handleSaveSocialLink(
                        editingHandleKey,
                        editingHandleLabel,
                        editingHandleLabel
                      );
                    }}
                    style={{
                      padding: "4px 14px",
                      borderRadius: 999,
                      background: savingSocial ? "#93c5fd" : "#0ea5e9",
                      color: "#fff",
                      border: "1px solid #0284c7",
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      cursor: savingSocial ? "default" : "pointer",
                      minWidth: 70,
                      textAlign: "center",
                      letterSpacing: 0.6,
                    }}
                  >
                    {savingSocial ? "Saving..." : "Save"}
                  </div>
                </div>
              </div>
            </div>
          )}

          {effectiveInventoryLabel && (
            <>
              <div
                style={{
                  marginBottom: 4,
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                  color: "#4B5563",
                }}
              >
                Inventory
              </div>
              {(Array.isArray(inventoryLabels) && inventoryLabels.length ? inventoryLabels : [effectiveInventoryLabel])
                .filter((lbl) => lbl && String(lbl).trim() !== "")
                .map((lbl, idx) => (
                  <div
                    key={`${String(lbl)}-${idx}`}
                    role="button"
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-start",
                      padding: "6px 8px",
                      borderRadius: 8,
                      fontSize: 10,
                      fontWeight: 400,
                      cursor: "pointer",
                      color: "#111827",
                    }}
                    onClick={() => {
                      if (typeof onNavigateInventory === "function") {
                        onNavigateInventory(String(lbl).trim());
                      }
                    }}
                  >
                    <span style={{ fontSize: 16, fontWeight: 400 }}>{`My ${String(lbl).trim()}`}</span>
                  </div>
                ))}
            </>
          )}

          {/* Divider between Inventory and My Prices */}
          <div
            style={{
              height: 2,
              background: "#E5E7EB",
              margin: "8px 0 6px",
              opacity: 0.8,
              borderRadius: 999,
            }}
          />

          <div
            style={{
              marginBottom: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 6,
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                color: "#4B5563",
              }}
            >
              My Prices
            </span>
            
          </div>
          {Array.isArray(servicesForMyPrices) && servicesForMyPrices.length > 0
            ? servicesForMyPrices.map((svc, idx) => {
                const label = (svc == null ? "" : String(svc)).trim();
                if (!label) return null;
                const key = label.toLowerCase();
                const isActive = Array.isArray(activeServicesForMyPrices)
                  ? activeServicesForMyPrices.some((v) => {
                      const t = (v == null ? "" : String(v)).trim().toLowerCase();
                      return t === key;
                    })
                  : false;
                const isComboLike =
                  key.includes("package") ||
                  key.includes("combo");
                const handle = isComboLike
                  ? onNavigateMyPricesCombos
                  : onNavigateMyPricesNonCombos;
                const clickable = typeof handle === "function";
                return (
                  <div
                    key={`${key}-${idx}`}
                    role={clickable ? "button" : undefined}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "6px 8px",
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 400,
                      cursor: clickable ? "pointer" : "default",
                      color: "#111827",
                    }}
                    onClick={clickable ? () => handle(label) : undefined}
                  >
                    <span style={{ fontSize: 16, fontWeight: 400 }}>{label}</span>
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 9,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        padding: "2px 6px",
                        borderRadius: 999,
                        backgroundColor: isActive ? "#DCFCE7" : "#F3F4F6",
                        color: isActive ? "#16A34A" : "#6B7280",
                      }}
                    >
                      {isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                );
              })
            : null}

          <div
            style={{
              height: 2,
              background: "#E5E7EB",
              margin: "8px 0 6px",
              opacity: 0.8,
              borderRadius: 999,
            }}
          />

          {selectedSocialHandles.length > 0 && (
            <>
              <div
                style={{
                  marginBottom: 4,
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                  color: "#4B5563",
                }}
              >
                My Social Handles
              </div>
              <div style={{ marginBottom: 6 }}>
                {selectedSocialHandles.map((item) => {
                  const nKey = normalizeHandle(item.key || item.label);
                  const nLabel = normalizeHandle(item.label);
                  const iconUrl = socialIcons[nKey] || socialIcons[nLabel] || null;
                  let current = "";
                  try {
                    const links = vendorSocialLinks && typeof vendorSocialLinks === "object"
                      ? vendorSocialLinks
                      : {};
                    const rawKeys = Object.keys(links);
                    const directCandidates = [item.label, item.key, nKey];
                    for (const k of directCandidates) {
                      if (!k) continue;
                      if (links[k] != null && String(links[k]).trim() !== "") {
                        current = String(links[k]);
                        break;
                      }
                    }
                    if (!current && rawKeys.length) {
                      const matchKey = rawKeys.find((rk) => {
                        const nr = normalizeHandle(rk);
                        return nr && (nr === nKey || nr === nLabel);
                      });
                      if (matchKey && links[matchKey] != null) {
                        current = String(links[matchKey]);
                      }
                    }
                    if (!current && item.value) {
                      current = String(item.value);
                    }
                  } catch {}
                  return (
                    <div
                      key={item.key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-start",
                        width: "100%",
                        padding: "6px 8px",
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 400,
                        color: "#111827",
                        gap: 8,
                        marginBottom: 4,
                        cursor: "pointer",
                      }}
                      onClick={() => {
                        setEditingHandleKey(nKey);
                        setEditingHandleLabel(item.label || "");
                        setEditingValue(current);
                        setShowSocialModal(true);
                      }}
                    >
                      {iconUrl && (
                        <img
                          src={iconUrl}
                          alt={item.label}
                          style={{ width: 16, height: 16, borderRadius: 4, objectFit: "cover" }}
                        />
                      )}
                      <span style={{ fontSize: 16, fontWeight: 400 }}>{item.label}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <div
            style={{
              height: 2,
              background: "#E5E7EB",
              margin: "8px 0 6px",
              opacity: 0.8,
              borderRadius: 999,
            }}
          />

          <div
            style={{
              marginBottom: 4,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              color: "#4B5563",
            }}
          >
            Locations & Hours
          </div>
          <div
            role="button"
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-start",
              padding: "4px 6px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 400,
              cursor: "pointer",
              color: "#111827",
              gap: 6,
            }}
            onClick={onNavigateHomeLocation}
          >
            <span style={{ fontSize: 12, opacity: 0.55 }}>🏠</span>
            <span style={{ fontSize: 16, fontWeight: 400 }}>Home Location</span>
          </div>
          <div
            role="button"
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-start",
              padding: "4px 6px",
              borderRadius: 8,
              fontSize: 10,
              fontWeight: 400,
              cursor: "pointer",
              color: "#111827",
              gap: 6,
            }}
            onClick={onNavigateBusinessLocation}
          >
            <span style={{ fontSize: 12, opacity: 0.55 }}>📍</span>
            <span style={{ fontSize: 16, fontWeight: 400 }}>Business Location</span>
          </div>
          <div
            role="button"
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-start",
              padding: "4px 6px",
              borderRadius: 8,
              fontSize: 10,
              fontWeight: 400,
              cursor: "pointer",
              color: "#111827",
              gap: 6,
            }}
            onClick={onNavigateBusinessHours}
          >
            <span style={{ fontSize: 12, opacity: 0.55 }}>⏰</span>
            <span style={{ fontSize: 16, fontWeight: 400 }}>Business Hours</span>
          </div>
        </div>
      )}
    </div>
  );
}
