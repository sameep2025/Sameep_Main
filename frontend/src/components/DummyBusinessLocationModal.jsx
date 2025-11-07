import React, { useEffect, useState } from "react";
import axios from "axios";
import API_BASE_URL from "../config";

export default function DummyBusinessLocationModal({ show, onClose, vendorId, onUpdate }) {
  const [nearbyLocations, setNearbyLocations] = useState(["", "", "", "", ""]);
  const [home, setHome] = useState({ lat: null, lng: null, address: "" });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (show && vendorId) {
      setLoading(true);
      axios
        .get(`${API_BASE_URL}/api/dummy-vendors/${vendorId}/location`)
        .then((res) => {
          const loc = res.data?.location || {};
          const locs = Array.isArray(loc.nearbyLocations) ? loc.nearbyLocations : [];
          const filled = locs.slice(0, 5);
          while (filled.length < 5) filled.push("");
          setNearbyLocations(filled);
          setHome({ lat: loc.lat ?? null, lng: loc.lng ?? null, address: loc.address || "" });
        })
        .catch((err) => {
          console.error("Failed to fetch dummy vendor locations:", err);
        })
        .finally(() => setLoading(false));
    }
  }, [show, vendorId]);

  const persist = async (nextNearby) => {
    try {
      await axios.put(`${API_BASE_URL}/api/dummy-vendors/${vendorId}/location`, {
        lat: home.lat,
        lng: home.lng,
        address: home.address || "",
        nearbyLocations: nextNearby,
      });
      onUpdate?.(vendorId, nextNearby);
    } catch (err) {
      console.error(err);
      alert("Failed to save dummy business locations");
    }
  };

  const saveNearby = async (index) => {
    const value = (nearbyLocations[index] || "").trim();
    const next = [...nearbyLocations];
    next[index] = value;
    setNearbyLocations(next);
    await persist(next);
  };

  const handleDelete = async (index) => {
    const next = [...nearbyLocations];
    next[index] = "";
    setNearbyLocations(next);
    await persist(next);
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
        <h2>Business Locations (Nearby) — Dummy</h2>
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
