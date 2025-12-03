// frontend/src/components/LocationPickerModal.jsx
import React, { useState, useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

// Use plain Leaflet in an imperative way so it works reliably with Next.js
// production builds without relying on react-leaflet hooks.

const DEFAULT_POS = [13.0827, 80.2707]; // Chennai fallback

export default function LocationPickerModal({
  show,
  onClose,
  onSave,
  initialPosition = null, // [lat, lng] or null
  title = "Pick Location",
}) {
  const containerRef = useRef(null); // DOM node for the map
  const mapRef = useRef(null); // Leaflet map instance
  const markerRef = useRef(null); // Leaflet marker instance
  const leafletRef = useRef(null); // cached Leaflet module

  const [markerPos, setMarkerPos] = useState(
    Array.isArray(initialPosition) && initialPosition.length === 2
      ? [...initialPosition]
      : [...DEFAULT_POS]
  );
  const [selectedPos, setSelectedPos] = useState(null); // [lat, lng]
  const [selectedLabel, setSelectedLabel] = useState(""); // area, city text

  // Reset position whenever modal is opened or initialPosition changes
  useEffect(() => {
    if (!show) return;
    const nextPos =
      Array.isArray(initialPosition) && initialPosition.length === 2
        ? [...initialPosition]
        : [...DEFAULT_POS];
    setMarkerPos(nextPos);
    setSelectedPos(null);
    setSelectedLabel("");
  }, [show, initialPosition]);

  // Initialize Leaflet map once when the modal is shown
  useEffect(() => {
    if (!show) return;
    let cancelled = false;

    const initMap = async () => {
      try {
        const LModule = await import("leaflet");
        const L = LModule.default || LModule;
        leafletRef.current = L;

        // Fix default icon paths for Leaflet using bundler-resolved URLs
        try {
          const iconRetinaUrl = (await import("leaflet/dist/images/marker-icon-2x.png")).default;
          const iconUrl = (await import("leaflet/dist/images/marker-icon.png")).default;
          const shadowUrl = (await import("leaflet/dist/images/marker-shadow.png")).default;
          delete L.Icon.Default.prototype._getIconUrl;
          L.Icon.Default.mergeOptions({
            iconRetinaUrl,
            iconUrl,
            shadowUrl,
          });
        } catch {
          // If this fails, keep default icons; map will still be usable.
        }

        if (!containerRef.current || cancelled) return;

        // Destroy any existing map (defensive)
        if (mapRef.current) {
          try {
            mapRef.current.remove();
          } catch {}
          mapRef.current = null;
          markerRef.current = null;
        }

        const start =
          Array.isArray(markerPos) && markerPos.length === 2
            ? markerPos
            : DEFAULT_POS;

        const map = L.map(containerRef.current).setView(start, 13);
        mapRef.current = map;

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);

        const marker = L.marker(start, { draggable: true }).addTo(map);
        markerRef.current = marker;

        const updateFromLatLng = (latlng) => {
          if (!latlng) return;
          const { lat, lng } = latlng;
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
          setMarkerPos([lat, lng]);
          setSelectedPos(null);
          setSelectedLabel("");
        };

        map.on("click", (e) => {
          if (cancelled) return;
          updateFromLatLng(e.latlng);
          try {
            marker.setLatLng(e.latlng);
          } catch {}
        });

        marker.on("dragend", (e) => {
          if (cancelled) return;
          const latlng = e.target.getLatLng();
          updateFromLatLng(latlng);
        });
      } catch (err) {
        console.error("Failed to initialize Leaflet map", err);
      }
    };

    initMap();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch {}
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  }, [show]);

  // Keep marker on map in sync when markerPos changes
  useEffect(() => {
    if (!show) return;
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    try {
      if (Array.isArray(markerPos) && markerPos.length === 2) {
        marker.setLatLng(markerPos);
        // Do not aggressively recenter; this just keeps marker in place.
      }
    } catch {}
  }, [show, markerPos]);

  if (!show) return null;

  const handleSelect = async () => {
    try {
      if (!Array.isArray(markerPos) || markerPos.length !== 2) return;
      const [lat, lng] = markerPos;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      setSelectedPos([lat, lng]);
      setSelectedLabel("");

      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "preview-location-picker",
        },
      });
      if (!res.ok) {
        throw new Error(`Reverse geocode HTTP ${res.status}`);
      }
      const data = await res.json().catch(() => ({}));
      const area = data.address?.suburb || data.address?.neighbourhood || "";
      const city =
        data.address?.city ||
        data.address?.town ||
        data.address?.village ||
        "";
      const combined = [area, city].filter(Boolean).join(", ");
      setSelectedLabel(combined || "");
    } catch (err) {
      console.warn("Reverse geocode failed", err?.message || err);
    }
  };

  const handleSave = async () => {
    try {
      if (!Array.isArray(selectedPos) || selectedPos.length !== 2) {
        alert("Please click 'Select Location' first.");
        return;
      }
      const [lat, lng] = selectedPos;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        alert("Please click 'Select Location' first.");
        return;
      }

      if (typeof onSave === "function") {
        await onSave({ lat, lng, label: selectedLabel || "" });
      }

      if (typeof onClose === "function") {
        onClose();
      }
    } catch (err) {
      console.error("LocationPickerModal save error", err);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 3000,
      }}
    >
      <div
        style={{
          width: "92%",
          maxWidth: 900,
          height: "80%",
          background: "#fff",
          borderRadius: 12,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: 12,
            borderBottom: "1px solid #eee",
            display: "flex",
            justifyContent: "flex-start",
            alignItems: "center",
          }}
        >
          <h3 style={{ margin: 0 }}>{title}</h3>
        </div>

        <div style={{ flex: 1, position: "relative" }}>
          <div
            ref={containerRef}
            style={{ width: "100%", height: "100%", background: "#e5e7eb" }}
          />
        </div>

        <div
          style={{
            padding: 12,
            borderTop: "1px solid #eee",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div>
              <strong>Marker (live):</strong>
              <div>
                {markerPos?.[0] != null && markerPos?.[1] != null
                  ? `${Number(markerPos[0]).toFixed(6)}, ${Number(markerPos[1]).toFixed(6)}`
                  : "-"}
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={handleSelect}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "none",
                  background: "#00AEEF",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Select Location
              </button>
            </div>

            <div style={{ marginLeft: "auto" }}>
              <small>Selected:</small>
              <div>
                {selectedPos
                  ? selectedLabel && selectedLabel.trim()
                    ? selectedLabel
                    : `${selectedPos[0].toFixed(6)}, ${selectedPos[1].toFixed(6)}`
                  : "—"}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid #ccc",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "none",
                background: "#16a34a",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              Save Location
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
