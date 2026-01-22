import React, { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import  categoryThemes  from "../utils/categoryThemes";

// Fix default Leaflet marker icon paths
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require("leaflet/dist/images/marker-icon-2x.png"),
  iconUrl: require("leaflet/dist/images/marker-icon.png"),
  shadowUrl: require("leaflet/dist/images/marker-shadow.png"),
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
  initialPosition = null,
  categoryName = "Default", // safe default category
  title = "Pick Location",
}) {
  const theme = categoryThemes[categoryName] || categoryThemes.Default;

  const defaultPos = [13.0827, 80.2707]; // fallback coordinates
  const [markerPos, setMarkerPos] = useState(initialPosition || defaultPos);
  const [selectedPos, setSelectedPos] = useState(null);

  useEffect(() => {
    if (!show) return;
    setMarkerPos(initialPosition ? [...initialPosition] : [...defaultPos]);
    setSelectedPos(null);
  }, [show, initialPosition]);

  if (!show) return null;

  const handleSave = () => {
    if (!selectedPos) {
      alert("Please click 'Select Location' first.");
      return;
    }
    onSave?.(selectedPos);
    onClose();
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
          background: theme.background || "#fff",
          borderRadius: 12,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: 12,
            borderBottom: "1px solid #eee",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: theme.primary,
            color: theme.text,
          }}
        >
          <h3 style={{ margin: 0 }}>{title}</h3>
          <div>
            <button
              onClick={onClose}
              style={{ marginRight: 8, padding: "6px 10px", background: theme.accent, color: "#fff", border: "none", borderRadius: 6 }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              style={{ padding: "6px 10px", background: theme.accent, color: "#fff", border: "none", borderRadius: 6 }}
            >
              Save
            </button>
          </div>
        </div>

        {/* Map */}
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

        {/* Footer */}
        <div
          style={{
            padding: 12,
            borderTop: "1px solid #eee",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            background: theme.background,
          }}
        >
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div>
              <strong>Marker (live):</strong>
              <div>
                {markerPos?.[0]?.toFixed?.(6) ?? "-"}, {markerPos?.[1]?.toFixed?.(6) ?? "-"}
              </div>
            </div>
            <div>
              <button
                onClick={() => setSelectedPos([...markerPos])}
                style={{ padding: "6px 10px", borderRadius: 6, border: "none", background: theme.accent, color: "#fff", cursor: "pointer" }}
              >
                Select Location
              </button>
            </div>
            <div style={{ marginLeft: "auto" }}>
              <small>Selected:</small>
              <div>{selectedPos ? `${selectedPos[0].toFixed(6)}, ${selectedPos[1].toFixed(6)}` : "—"}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
