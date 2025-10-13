// BusinessHoursModal.jsx
import React, { useState } from "react";
import axios from "axios";

const defaultHours = [
  { day: "Sunday", hours: "Closed" },
  { day: "Monday", hours: "8:00 AM - 8:00 PM" },
  { day: "Tuesday", hours: "8:00 AM - 8:00 PM" },
  { day: "Wednesday", hours: "8:00 AM - 8:00 PM" },
  { day: "Thursday", hours: "8:00 AM - 8:00 PM" },
  { day: "Friday", hours: "8:00 AM - 8:00 PM" },
  { day: "Saturday", hours: "10:00 AM - 6:00 PM" },
];

function BusinessHoursModal({ vendor, onClose, onUpdated }) {
  const [hours, setHours] = useState(vendor.businessHours || defaultHours);

  const handleHourChange = (index, value) => {
    const newHours = [...hours];
    newHours[index].hours = value;
    setHours(newHours);
  };

  const handleSave = async () => {
    try {
      const res = await axios.put(
        `http://localhost:5000/api/vendors/${vendor._id}/business-hours`,
        { businessHours: hours }
      );

      onUpdated(res.data);
      onClose();
    } catch (err) {
      console.error(err);
      alert("Error updating business hours");
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 4px 15px rgba(0,0,0,0.25)",
          width: "100%",
          maxWidth: 400,
          padding: 20,
          maxHeight: "80vh",
          overflowY: "auto",
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 16 }}>
          Edit Business Hours
        </h2>
        <p style={{ marginBottom: 12, color: "#555" }}>{vendor.businessName}</p>

        <ul style={{ listStyle: "none", padding: 0, margin: 0, gap: 8 }}>
          {hours.map((dayObj, idx) => (
            <li
              key={dayObj.day}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <span style={{ width: 90, fontWeight: 500 }}>{dayObj.day}</span>
              <input
                type="text"
                value={dayObj.hours}
                onChange={(e) => handleHourChange(idx, e.target.value)}
                style={{
                  flex: 1,
                  padding: 6,
                  borderRadius: 6,
                  border: "1px solid #ccc",
                }}
              />
            </li>
          ))}
        </ul>

        <div
          style={{
            marginTop: 20,
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "8px 14px",
              borderRadius: 6,
              background: "#ccc",
              border: "none",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: "8px 14px",
              borderRadius: 6,
              background: "purple",
              color: "#fff",
              border: "none",
              cursor: "pointer",
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export default BusinessHoursModal;
