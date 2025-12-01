"use client";

import React, { useState, useEffect, useRef } from "react";

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
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

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

  const businessName = (() => {
    try {
      const raw = vendor && typeof vendor.businessName === "string" ? vendor.businessName : "";
      const t = String(raw || "").trim();
      return t || "Vendor";
    } catch {
      return "Vendor";
    }
  })();

  const socialHandles = (() => {
    try {
      const v = vendor && typeof vendor === "object" ? vendor : {};
      const base = [
        { key: "website",   label: "Website",   icon: "🌐",  value: v.website || v.siteUrl || v.url },
        { key: "whatsapp",  label: "WhatsApp",  icon: "🟢",  value: v.whatsapp || v.whatsApp || v.whatsappNumber },
        { key: "instagram", label: "Instagram", icon: "📸", value: v.instagram || v.instagramHandle || v.ig },
        { key: "facebook",  label: "Facebook",  icon: "📘", value: v.facebook || v.fb || v.facebookPage },
        { key: "youtube",   label: "YouTube",   icon: "▶️", value: v.youtube || v.youtubeChannel },
      ];
      return base.map((item) => {
        const t = item.value == null ? "" : String(item.value).trim();
        return { ...item, value: t };
      });
    } catch {
      return [
        { key: "website",   label: "Website",   icon: "🌐",  value: "" },
        { key: "whatsapp",  label: "WhatsApp",  icon: "🟢",  value: "" },
        { key: "instagram", label: "Instagram", icon: "📸", value: "" },
        { key: "facebook",  label: "Facebook",  icon: "📘", value: "" },
        { key: "youtube",   label: "YouTube",   icon: "▶️", value: "" },
      ];
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
          cursor: "pointer",
          boxShadow: "0 4px 10px rgba(15,23,42,0.18)",
        }}
        aria-label={businessName}
      >
        {avatarLetter}
      </div>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 8,
            width: 260,
            borderRadius: 16,
            background: "#FFFFFF",
            boxShadow: "0 16px 40px rgba(15,23,42,0.22)",
            border: "1px solid #E5E7EB",
            padding: 16,
            color: "#0F172A",
            zIndex: 1200,
            fontFamily: "Poppins, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
          }}
        >
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
            <div
              style={{
                marginTop: 6,
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                color: "#9CA3AF",
              }}
            >
              My Social Handles
            </div>
          </div>

          <div
            style={{
              height: 2,
              background: "#E5E7EB",
              margin: "6px 0 8px",
              opacity: 0.8,
              borderRadius: 999,
            }}
          />

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
                    onClick={onNavigateInventory}
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
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              color: "#4B5563",
            }}
          >
            My Prices
          </div>
          {Array.isArray(servicesForMyPrices) && servicesForMyPrices.length > 0
            ? servicesForMyPrices.map((svc, idx) => {
                const label = (svc == null ? "" : String(svc)).trim();
                if (!label) return null;
                const key = label.toLowerCase();
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
                    onClick={clickable ? handle : undefined}
                  >
                    <span style={{ fontSize: 16, fontWeight: 400 }}>{label}</span>
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
