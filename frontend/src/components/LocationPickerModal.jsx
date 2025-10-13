import React, { useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import axios from "axios";
import "leaflet/dist/leaflet.css";

// Fix leaflet's default icon path issue with webpack
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require("leaflet/dist/images/marker-icon-2x.png"),
  iconUrl: require("leaflet/dist/images/marker-icon.png"),
  shadowUrl: require("leaflet/dist/images/marker-shadow.png"),
});

/**
 * A controller component to handle map clicks and marker dragging.
 */
function MapController({ position, setPosition }) {
  const map = useMapEvents({
    click(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
      map.flyTo(e.latlng, map.getZoom());
    },
  });

  return position ? (
    <Marker
      position={position}
      draggable={true}
      eventHandlers={{
        dragend: (e) => {
          const { lat, lng } = e.target.getLatLng();
          setPosition([lat, lng]);
        },
      }}
    />
  ) : null;
}

export function LocationPickerModal({
  show,
  onClose,
  vendorId,
  initialLocation, // { lat, lng, areaCity }
  onLocationSave,
}) {
  const defaultPosition = [13.0827, 80.2707]; // Default to Chennai
  const [markerPos, setMarkerPos] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState("Click on the map or drag the marker.");
  const mapRef = useRef();

  useEffect(() => {
    if (show) {
      // Use existing location if available, otherwise use default
      const startPos =
        initialLocation && initialLocation.lat && initialLocation.lng
          ? [initialLocation.lat, initialLocation.lng]
          : defaultPosition;
      setMarkerPos(startPos);
      setSelectedLocation(initialLocation);
      setStatus("Click on the map or drag the marker.");

      // When the modal opens, if we have a position, fly to it.
      // Use a timeout to ensure the map container is sized correctly.
      setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.flyTo(startPos, 13);
        }
      }, 100);
    }
  }, [show, initialLocation]);

  if (!show) return null;

  const handleSelectLocation = async () => {
    if (!markerPos) return;
    setStatus("Fetching address...");
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${markerPos[0]}&lon=${markerPos[1]}`
      );
      const data = await res.json();
      const area = data.address?.suburb || data.address?.neighbourhood || "";
      const city = data.address?.city || data.address?.town || data.address?.village || "";
      const areaCity = [area, city].filter(Boolean).join(", ");

      setSelectedLocation({
        lat: markerPos[0],
        lng: markerPos[1],
        areaCity: areaCity || "Address not found",
      });
      setStatus(`Selected: ${areaCity || "Address not found"}`);
    } catch (err) {
      console.error("Reverse geocoding failed", err);
      setStatus("Could not fetch address.");
    }
  };

  const handleSave = async () => {
  if (!selectedLocation) {
    alert("Please click 'Select Location' first.");
    return;
  }
  setIsSaving(true);
  try {
    const { lat, lng, areaCity } = selectedLocation;

    // Send areaCity along with lat/lng
    const res = await axios.put(
      `http://localhost:5000/api/vendors/${vendorId}/location`,
      { lat, lng, areaCity }
    );

    if (onLocationSave) {
      onLocationSave(res.data.location); // should include areaCity
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
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.5)", display: "flex",
        justifyContent: "center", alignItems: "center", zIndex: 3000,
      }}
    >
      <div style={{ width: "90%", maxWidth: 800, height: "85%", background: "#fff", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <h3 style={{ padding: "12px 16px", margin: 0, borderBottom: "1px solid #eee" }}>
          Set Home Location
        </h3>
        
        <div style={{ flex: 1, position: "relative" }}>
          {markerPos && (
            <MapContainer
              whenCreated={(mapInstance) => { mapRef.current = mapInstance; }}
              center={markerPos}
              zoom={13}
              style={{ width: "100%", height: "100%" }}
            >
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <MapController position={markerPos} setPosition={setMarkerPos} />
            </MapContainer>
          )}
        </div>

        <div style={{ padding: 12, borderTop: "1px solid #eee", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 150 }}>
              <strong>Marker: </strong>
              <small>{markerPos ? `${markerPos[0].toFixed(4)}, ${markerPos[1].toFixed(4)}` : "N/A"}</small>
            </div>
            <div style={{ flex: 2, minWidth: 200, textAlign: "right" }}>
              <small>{status}</small>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <button onClick={onClose} style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ccc" }}>
              Cancel
            </button>
            <div>
              <button onClick={handleSelectLocation} style={{ padding: "8px 12px", borderRadius: 6, border: "none", background: "#007bff", color: "#fff", marginRight: 8 }}>
                Select Location
              </button>
              <button onClick={handleSave} disabled={isSaving || !selectedLocation} style={{ padding: "8px 12px", borderRadius: 6, border: "none", background: "#28a745", color: "#fff" }}>
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
