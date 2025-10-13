// frontend/src/components/LocationPickerModal.jsx
import React, { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icon paths (Leaflet + CRA)
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
  initialPosition = null, // [lat, lng] or null
  title = "Pick Location",
}) {
  const defaultPos = [13.0827, 80.2707]; // Chennai fallback
  const [markerPos, setMarkerPos] = useState(initialPosition || defaultPos);
  const [selectedPos, setSelectedPos] = useState(null);

  useEffect(() => {
    if (!show) return;
    setMarkerPos(initialPosition ? [...initialPosition] : [...defaultPos]);
    setSelectedPos(null);
  }, [show, initialPosition]);

  if (!show) return null;

  const handleSave = async () => {
  if (!selectedLocation) {
    alert("Please click 'Select Location' first.");
    return;
  }
  setIsSaving(true);
  try {
    const { lat, lng } = selectedLocation;
    const res = await axios.put(`http://localhost:5000/api/vendors/${vendorId}/location`, { lat, lng });

    // Send **backend returned location**, not just selectedLocation
    if (onLocationSave) {
      onLocationSave(res.data.location);
    }
    onClose();
  } catch (err) {
    console.error("Failed to save location", err);
    alert("Failed to save location.");
  } finally {
    setIsSaving(false);
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
        <div style={{ padding: 12, borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <div>
            <button onClick={onClose} style={{ marginRight: 8, padding: "6px 10px" }}>Cancel</button>
            <button onClick={handleSave} style={{ padding: "6px 10px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 6 }}>Save</button>
          </div>
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
                onClick={() => setSelectedPos([...markerPos])}
                style={{ padding: "6px 10px", borderRadius: 6, border: "none", background: "#00AEEF", color: "#fff", cursor: "pointer" }}
              >
                Select Location
              </button>
            </div>

            <div style={{ marginLeft: "auto" }}>
              <small>Selected:</small>
              <div>{selectedPos ? `${selectedPos[0].toFixed(6)}, ${selectedPos[1].toFixed(6)}` : "—"}</div>
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
