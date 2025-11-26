import React, { useState, useEffect } from "react";
import API from "../api";

function AppConfigurationsPage() {
  const [availableHours, setAvailableHours] = useState([]);
  const [selectedHour, setSelectedHour] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [newHour, setNewHour] = useState("");

  // Load config from backend on mount
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await API.get("/api/app-config/session-validity");
        const { availableHours: hrs = [], selectedHour: sel = null } = res.data || {};
        setAvailableHours(Array.isArray(hrs) ? hrs : []);
        setSelectedHour(typeof sel === "number" ? sel : null);
      } catch (err) {
        console.error("Failed to load session validity config", err);
      }
    };

    fetchConfig();
  }, []);

  const saveConfig = async (hours, selected) => {
    try {
      await API.post("/api/app-config/session-validity", {
        availableHours: hours,
        selectedHour: selected,
      });
    } catch (err) {
      console.error("Failed to save session validity config", err);
    }
  };

  const handleSaveHour = () => {
    const value = Number(newHour);
    if (!value || value <= 0) {
      return;
    }

    if (!availableHours.includes(value)) {
      const updated = [...availableHours, value].sort((a, b) => a - b);
      setAvailableHours(updated);
      const newSelected = selectedHour != null ? selectedHour : value;
      setSelectedHour(newSelected);
      saveConfig(updated, newSelected);
    } else {
      const newSelected = selectedHour != null ? selectedHour : value;
      setSelectedHour(newSelected);
      saveConfig(availableHours, newSelected);
    }

    setNewHour("");
    setShowModal(false);
  };

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "20px", color: "#333" }}>
        App Configurations
      </h1>

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: "8px",
          padding: "20px",
          marginBottom: "20px",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <h2 style={{ fontSize: "18px", marginBottom: "10px", color: "#00AEEF" }}>
          Session Management
        </h2>
        <p style={{ marginBottom: "15px", color: "#555" }}>
          Configure how long a customer session should remain active before
          requiring a new OTP login.
        </p>

        <div style={{ marginBottom: "15px" }}>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            style={{
              padding: "8px 14px",
              borderRadius: "4px",
              border: "1px solid #00AEEF",
              background: "#00AEEF",
              color: "#fff",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            + Add Session Hour
          </button>
        </div>

        {availableHours.length > 0 && (
          <div style={{ marginBottom: "10px" }}>
            {availableHours.map((hour) => (
              <label key={hour} style={{ marginRight: "16px", fontSize: "14px" }}>
                <input
                  type="radio"
                  name="sessionHour"
                  value={hour}
                  checked={selectedHour === hour}
                  onChange={() => {
                    setSelectedHour(hour);
                    saveConfig(availableHours, hour);
                  }}
                  style={{ marginRight: "4px" }}
                />
                {hour} hrs
              </label>
            ))}
          </div>
        )}

        {selectedHour && (
          <div style={{ marginTop: "8px", fontSize: "13px", color: "#555" }}>
            Selected session validity: <strong>{selectedHour} hrs</strong>
          </div>
        )}
      </div>

      {showModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: "rgba(0,0,0,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "#fff",
              padding: "20px",
              borderRadius: "8px",
              width: "320px",
              boxShadow: "0 4px 10px rgba(0,0,0,0.15)",
            }}
          >
            <h3
              style={{
                fontSize: "16px",
                marginBottom: "10px",
                color: "#333",
              }}
            >
              Add Session Hour
            </h3>
            <label style={{ fontSize: "14px", display: "block", marginBottom: "6px" }}>
              Enter hours
            </label>
            <input
              type="number"
              min="1"
              value={newHour}
              onChange={(e) => setNewHour(e.target.value)}
              style={{
                width: "100%",
                padding: "8px",
                borderRadius: "4px",
                border: "1px solid #ccc",
                marginBottom: "12px",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                type="button"
                onClick={() => {
                  setShowModal(false);
                  setNewHour("");
                }}
                style={{
                  padding: "6px 12px",
                  borderRadius: "4px",
                  border: "1px solid #ccc",
                  background: "#f5f5f5",
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveHour}
                style={{
                  padding: "6px 12px",
                  borderRadius: "4px",
                  border: "1px solid #00AEEF",
                  background: "#00AEEF",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AppConfigurationsPage;
