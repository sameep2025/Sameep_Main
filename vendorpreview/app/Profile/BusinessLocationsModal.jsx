"use client";
import "./BusinessLocation.css";
import { useEffect, useState } from "react";
import { getVendorToken } from "../utils/vendorAuth";

const INPUT_COUNT = 5;

function buildLocationInputs(values = []) {
  return [...values, ...Array(INPUT_COUNT).fill("")].slice(0, INPUT_COUNT);
}

function normalizeLocations(values = []) {
  return values.map((value) => value.trim()).filter(Boolean);
}

export default function BusinessLocationsModal({
  vendorId,
  initialLocations = [],
  onClose,
  onSaved,
}) {
  const [locations, setLocations] = useState(() =>
    buildLocationInputs(initialLocations)
  );
  const [savedLocations, setSavedLocations] = useState(() =>
    buildLocationInputs(initialLocations)
  );

  const [savingIndex, setSavingIndex] = useState(null);
  const [editingIndex, setEditingIndex] = useState(null);

  useEffect(() => {
    setLocations(buildLocationInputs(initialLocations));
    setSavedLocations(buildLocationInputs(initialLocations));
  }, [initialLocations]);

  const saveToBackend = async (updatedLocations, index) => {
    try {
      if (!vendorId) return alert("Vendor ID missing");

      const cleaned = normalizeLocations(updatedLocations);

      setSavingIndex(index);
      const token = getVendorToken(vendorId);

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/dummy-vendors/${vendorId}/location`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            address: "",
            lat: null,
            lng: null,
            nearbyLocations: cleaned,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to update locations");
      }

      setLocations(buildLocationInputs(cleaned));
      setSavedLocations(buildLocationInputs(cleaned));
      setEditingIndex(null);
      onSaved?.(cleaned);
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to save locations");
    } finally {
      setSavingIndex(null);
    }
  };

  const handleChange = (i, val) => {
    setLocations((currentLocations) => {
      const nextLocations = [...currentLocations];
      nextLocations[i] = val;
      return nextLocations;
    });
  };

  const handleSave = async (i) => {
    const trimmedValue = locations[i].trim();
    if (!trimmedValue) return;

    const savedValue = (savedLocations[i] || "").trim();
    if (trimmedValue === savedValue) {
      setEditingIndex(null);
      return;
    }

    const nextLocations = [...locations];
    nextLocations[i] = trimmedValue;
    await saveToBackend(nextLocations, i);
  };

  const handleDelete = async (i) => {
    const nextLocations = [...locations];
    nextLocations[i] = "";
    setLocations(nextLocations);
    await saveToBackend(nextLocations, i);
  };

  return (
    <div className="popup-overlay">
      <div className="popup-card nearby-theme">
        <h2 className="popup-title">Business Locations (Nearby)</h2>

        {locations.map((loc, i) => {
          const isEditing = editingIndex === i;
          const trimmedValue = loc.trim();
          const savedValue = (savedLocations[i] || "").trim();
          const canSave =
            Boolean(trimmedValue) &&
            trimmedValue !== savedValue &&
            savingIndex !== i;

          return (
            <div key={i} className="nearby-row">
              <input
                className={`nearby-input ${isEditing ? "editing" : ""}`}
                placeholder={`Nearby location ${i + 1}`}
                value={loc}
                onFocus={() => setEditingIndex(i)}
                onChange={(e) => handleChange(i, e.target.value)}
              />

              <button
                className="nearby-save"
                disabled={!canSave}
                onClick={() => handleSave(i)}
              >
                {savingIndex === i ? "Saving..." : "Save"}
              </button>

              {isEditing && Boolean(trimmedValue) && (
                <button
                  className="nearby-delete"
                  disabled={savingIndex === i}
                  onClick={() => handleDelete(i)}
                >
                  Delete
                </button>
              )}
            </div>
          );
        })}

        <button className="close-btn soft" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
