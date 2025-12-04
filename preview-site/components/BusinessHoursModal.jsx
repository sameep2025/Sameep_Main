"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import API_BASE_URL from "../config";

const defaultHours = [
  { day: "Sunday", hours: "Closed" },
  { day: "Monday", hours: "8:00 AM - 8:00 PM" },
  { day: "Tuesday", hours: "8:00 AM - 8:00 PM" },
  { day: "Wednesday", hours: "8:00 AM - 8:00 PM" },
  { day: "Thursday", hours: "8:00 AM - 8:00 PM" },
  { day: "Friday", hours: "8:00 AM - 8:00 PM" },
  { day: "Saturday", hours: "10:00 AM - 6:00 PM" },
];

export default function BusinessHoursModal({ show, vendor, onClose, onUpdated }) {
  const normalizeSevenDays = (list) => {
    const days = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const byDay = {};
    (Array.isArray(list) ? list : []).forEach((d) => {
      if (!d?.day) return;
      byDay[d.day.toLowerCase()] = { day: d.day, hours: d.hours || "Closed" };
    });
    return days.map((d) => byDay[d.toLowerCase()] || { day: d, hours: "Closed" });
  };

  const [hours, setHours] = useState(normalizeSevenDays(vendor?.businessHours || defaultHours));

  useEffect(() => {
    setHours(normalizeSevenDays(vendor?.businessHours || defaultHours));
  }, [vendor]);

  if (!show) return null;

  const handleHourChange = (index, value) => {
    const newHours = [...hours];
    newHours[index].hours = value;
    setHours(newHours);
  };

  const handleSave = async () => {
    try {
      if (!vendor?._id) {
        console.error("Missing vendor _id for business hours update");
        return;
      }
      const res = await axios.put(
        `${API_BASE_URL}/api/dummy-vendors/${vendor._id}/business-hours`,
        { businessHours: hours },
        {
          headers: {
            "Content-Type": "application/json",
            "x-actor-role": "vendor",
            "x-vendor-id": vendor?._id,
          },
        },
      );
      onUpdated?.(res.data);
      onClose?.();
    } catch (err) {
      console.error("Error updating dummy business hours", err);
      alert("Error updating business hours");
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 2600,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 4px 15px rgba(0,0,0,0.25)",
          width: "100%",
          maxWidth: 420,
          padding: 20,
          maxHeight: "80vh",
          overflowY: "auto",
          fontFamily: "Poppins, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
        }}
      >
        <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Edit Business Hours</h3>
        <p style={{ marginBottom: 16, color: "#4b5563", fontSize: 14 }}>{vendor?.businessName}</p>

        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {hours.map((dayObj, idx) => (
            <li
              key={dayObj.day}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
                gap: 8,
              }}
            >
              <span style={{ width: 90, fontWeight: 500, fontSize: 14 }}>{dayObj.day}</span>
              <input
                type="text"
                value={dayObj.hours}
                onChange={(e) => handleHourChange(idx, e.target.value)}
                style={{
                  flex: 1,
                  padding: 6,
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  fontSize: 13,
                }}
              />
            </li>
          ))}
        </ul>

        <div
          style={{
            marginTop: 18,
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 14px",
              borderRadius: 6,
              background: "#e5e7eb",
              border: "none",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            style={{
              padding: "8px 14px",
              borderRadius: 6,
              background: "#7c3aed",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
