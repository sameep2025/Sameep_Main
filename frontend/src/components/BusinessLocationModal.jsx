import React, { useEffect, useState } from "react";
import axios from "axios";

export default function BusinessLocationModal({ show, onClose, vendorId, onUpdate }) {
  const [nearbyLocations, setNearbyLocations] = useState(["", "", "", "", ""]);
  const [loading, setLoading] = useState(false);

  // Fetch latest nearby locations whenever modal opens
  useEffect(() => {
    if (show && vendorId) {
      setLoading(true);
      axios
        .get(`http://localhost:5000/api/vendors/${vendorId}/location`)
        .then((res) => {
          const locs = res.data.location?.nearbyLocations || [];
          const filled = locs.slice(0, 5);
          while (filled.length < 5) filled.push("");
          setNearbyLocations(filled);
        })
        .catch((err) => {
          console.error("Failed to fetch vendor locations:", err);
        })
        .finally(() => setLoading(false));
    }
  }, [show, vendorId]);

  const saveNearby = async (index) => {
    const value = nearbyLocations[index].trim();
    try {
      if (value === "") {
        await axios.delete(
          `http://localhost:5000/api/vendors/vendor-locations/${vendorId}/nearby/${index}`
        );
      } else {
        await axios.put(
          `http://localhost:5000/api/vendors/vendor-locations/${vendorId}/nearby/${index}`,
          { location: value }
        );
      }

      if (onUpdate) onUpdate(vendorId, nearbyLocations);
    } catch (err) {
      console.error(err);
      alert("Failed to save location");
    }
  };

  const handleDelete = async (index) => {
    try {
      await axios.delete(
        `http://localhost:5000/api/vendors/vendor-locations/${vendorId}/nearby/${index}`
      );
      const updated = [...nearbyLocations];
      updated[index] = "";
      setNearbyLocations(updated);

      if (onUpdate) onUpdate(vendorId, updated);
    } catch (err) {
      console.error("Failed to delete location:", err);
      alert("Failed to delete location");
    }
  };

  const handleChange = (index, value) => {
    const updated = [...nearbyLocations];
    updated[index] = value;
    setNearbyLocations(updated);
  };

  if (!show) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 1000,
      }}
    >
      <div style={{ background: "#fff", padding: 20, borderRadius: 10, minWidth: 350 }}>
        <h2>Business Locations (Nearby)</h2>
        {loading ? (
          <p>Loading...</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {nearbyLocations.map((loc, index) => (
              <li
                key={index}
                style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}
              >
                <input
                  type="text"
                  value={loc}
                  placeholder={`Nearby location ${index + 1}`}
                  onChange={(e) => handleChange(index, e.target.value)}
                  style={{ flex: 1, padding: 4 }}
                />
                <button onClick={() => saveNearby(index)} style={{ padding: "4px 8px" }}>
                  Save
                </button>
                {loc && (
                  <button onClick={() => handleDelete(index)} style={{ padding: "4px 8px" }}>
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <button onClick={onClose} style={{ marginTop: 20, padding: "6px 12px" }}>
          Close
        </button>
      </div>
    </div>
  );
}
