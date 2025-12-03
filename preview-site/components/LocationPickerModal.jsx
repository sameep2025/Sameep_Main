// frontend/src/components/LocationPickerModal.jsx
import React, { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import axios from "axios";
import API_BASE_URL from "../config";

// Fix default marker icon paths (Leaflet) using bundler-safe ESM imports
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl,
  iconUrl,
  shadowUrl,
});

function MarkerController({ position, setPosition }) {
  useMapEvents({
    click(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

export default function LocationPickerModal({
  show,
  onClose,
  onSave,
  initialPosition = null, // [lat, lng] or null
  title = "Pick Location",
}) {
  const defaultPos = [13.0827, 80.2707]; // Chennai fallback
  const [markerPos, setMarkerPos] = useState(initialPosition || defaultPos);
  const [selectedPos, setSelectedPos] = useState(null); // [lat, lng]
  const [selectedLabel, setSelectedLabel] = useState(""); // area, city text

  useEffect(() => {
    if (!show) return;
    setMarkerPos(initialPosition ? [...initialPosition] : [...defaultPos]);
    setSelectedPos(null);
    setSelectedLabel("");
  }, [show, initialPosition]);

  if (!show) return null;

  const handleSave = async () => {
    try {
      if (!Array.isArray(selectedPos) || selectedPos.length !== 2) {
        alert("Please click 'Select Location' first.");
        return;
      }
      const [lat, lng] = selectedPos;
      if (typeof lat !== "number" || typeof lng !== "number") {
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
      <div style={{ width: "92%", maxWidth: 900, height: "80%", background: "#fff", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: 12, borderBottom: "1px solid #eee", display: "flex", justifyContent: "flex-start", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
        </div>

        <div style={{ flex: 1, position: "relative" }}>
          <MapContainer center={markerPos} zoom={13} style={{ width: "100%", height: "100%" }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Marker
              position={markerPos}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const { lat, lng } = e.target.getLatLng();
                  setMarkerPos([lat, lng]);
                },
              }}
            />
            <MarkerController position={markerPos} setPosition={setMarkerPos} />
          </MapContainer>
        </div>

        <div style={{ padding: 12, borderTop: "1px solid #eee", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div>
              <strong>Marker (live):</strong>
              <div>{markerPos?.[0]?.toFixed?.(6) ?? "-"}, {markerPos?.[1]?.toFixed?.(6) ?? "-"}</div>
            </div>

            <div>
              <button
                onClick={async () => {
                  try {
                    const [lat, lng] = markerPos || [];
                    const plat = Number(lat);
                    const plng = Number(lng);
                    if (!Number.isFinite(plat) || !Number.isFinite(plng)) {
                      return;
                    }

                    setSelectedPos([plat, plng]);
                    setSelectedLabel("");

                    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${plat}&lon=${plng}`;
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
                    const city = data.address?.city || data.address?.town || data.address?.village || "";
                    const combined = [area, city].filter(Boolean).join(", ");
                    setSelectedLabel(combined || "");
                  } catch (err) {
                    console.warn("Reverse geocode failed", err?.message || err);
                  }
                }}
                style={{ padding: "6px 10px", borderRadius: 6, border: "none", background: "#00AEEF", color: "#fff", cursor: "pointer" }}
              >
                Select Location
              </button>
            </div>

            <div style={{ marginLeft: "auto" }}>
              <small>Selected:</small>
              <div>
                {selectedPos
                  ? (selectedLabel && selectedLabel.trim()
                      ? selectedLabel
                      : `${selectedPos[0].toFixed(6)}, ${selectedPos[1].toFixed(6)}`)
                  : "—"}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button onClick={onClose} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #ccc", background: "#fff" }}>
              Cancel
            </button>
            <button onClick={handleSave} style={{ padding: "6px 10px", borderRadius: 6, border: "none", background: "#16a34a", color: "#fff" }}>
              Save Location
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
