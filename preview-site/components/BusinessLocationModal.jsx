"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import API_BASE_URL from "../config";

export default function BusinessLocationModal({ show, onClose, vendorId, onUpdated }) {
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
      onUpdated?.(vendorId, nextNearby);
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
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 2600,
      }}
    >
      <div
        style={{
          background: "#fff",
          padding: 20,
          borderRadius: 12,
          minWidth: 340,
          maxWidth: 480,
          width: "90%",
          fontFamily: "Poppins, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: 12 }}>Business Locations (Nearby)</h3>
        {loading ? (
          <p style={{ margin: 0 }}>Loading...</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
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
                  style={{ flex: 1, padding: 6, borderRadius: 6, border: "1px solid #e5e7eb" }}
                />
                <button
                  type="button"
                  onClick={() => saveNearby(index)}
                  style={{ padding: "6px 8px", borderRadius: 6, border: "none", background: "#16a34a", color: "#fff", fontSize: 12 }}
                >
                  Save
                </button>
                {loc && (
                  <button
                    type="button"
                    onClick={() => handleDelete(index)}
                    style={{ padding: "6px 8px", borderRadius: 6, border: "none", background: "#ef4444", color: "#fff", fontSize: 12 }}
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff" }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
