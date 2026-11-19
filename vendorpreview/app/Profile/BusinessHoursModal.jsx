"use client";

import "./Business.css";
import { useEffect, useState } from "react";
import { useVendor } from "@/app/context/VendorContext";
import { getVendorToken } from "../utils/vendorAuth";
const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/* Generate time options (30 min interval) */
const TIME_OPTIONS = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 30) {
    const hour = String(h).padStart(2, "0");
    const minute = String(m).padStart(2, "0");
    TIME_OPTIONS.push(`${hour}:${minute}`);
  }
}

function createEmptyDay(day) {
  return {
    day,
    openingTime: "",
    closingTime: "",
    closed: false,
  };
}

function to12HourTime(value) {
  const [hourRaw, minuteRaw = "00"] = String(value).split(":");
  const hour24 = Number(hourRaw);

  if (!Number.isFinite(hour24)) return "";

  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;

  return `${hour12}:${minuteRaw} ${period}`;
}

function parseHoursValue(value = "") {
  if (String(value).trim().toLowerCase() === "closed") {
    return {
      openingTime: "",
      closingTime: "",
      closed: true,
    };
  }

  const match = String(value)
    .trim()
    .match(
      /^(\d{1,2}(?::\d{2})?)\s*(AM|PM)\s*-\s*(\d{1,2}(?::\d{2})?)\s*(AM|PM)$/i
    );

  if (!match) return null;

  const [, openingTimeRaw, openingPeriod, closingTimeRaw, closingPeriod] =
    match;

  const convert = (time, period) => {
    const [h, m = "00"] = time.split(":");
    let hour = Number(h);

    if (period === "PM" && hour !== 12) hour += 12;
    if (period === "AM" && hour === 12) hour = 0;

    return `${String(hour).padStart(2, "0")}:${m}`;
  };

  return {
    openingTime: convert(openingTimeRaw, openingPeriod),
    closingTime: convert(closingTimeRaw, closingPeriod),
    closed: false,
  };
}

function buildHoursState(initialHours = []) {
  const map = {};
  initialHours.forEach((item) => {
    map[item.day] = parseHoursValue(item.hours);
  });

  return DAYS.map((day) => ({
    ...createEmptyDay(day),
    ...(map[day] || {}),
  }));
}

function formatHoursValue(item) {
  if (item.closed) return "Closed";
  if (!item.openingTime || !item.closingTime) return "";

  return `${to12HourTime(item.openingTime)} - ${to12HourTime(
    item.closingTime
  )}`;
}

export default function BusinessHoursModal({
  vendorId,
  businessName,
  initialHours = [],
  onClose,
}) {
  const [hours, setHours] = useState(() => buildHoursState(initialHours));
  const [saving, setSaving] = useState(false);
  const { setVendorInfo } = useVendor();

  useEffect(() => {
    setHours(buildHoursState(initialHours));
  }, [initialHours]);

  const handleChange = (index, field, value) => {
    setHours((current) => {
      const copy = [...current];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleClosedToggle = (index, checked) => {
    setHours((current) => {
      const copy = [...current];
      copy[index] = {
        ...copy[index],
        closed: checked,
        openingTime: checked ? "" : copy[index].openingTime,
        closingTime: checked ? "" : copy[index].closingTime,
      };
      return copy;
    });
  };

const handleSave = async () => {
  try {
    if (!vendorId) return alert("Vendor ID missing");

    setSaving(true);
    const token = getVendorToken(vendorId);

    const payload = hours
      .map((item) => ({
        day: item.day,
        hours: formatHoursValue(item),
      }))
      .filter((item) => item.hours);

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/dummy-vendors/${vendorId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          businessHours: payload,
        }),
      }
    );

    if (!res.ok) throw new Error("Update failed");

    /* ⭐ IMPORTANT: update vendor context */
    setVendorInfo((prev) => ({
      ...prev,
      businessHours: payload,
    }));

    onClose();
  } catch (err) {
    console.error("Failed to save business hours", err);
    alert("Failed to save business hours");
  } finally {
    setSaving(false);
  }
};   

  return (
    <div className="popup-overlay">
      <div className="popup-card business-hours-theme">
        <h2 className="popup-title">Edit Business Hours</h2>
        <p className="popup-subtitle">{businessName}</p>

        <div className="hours-grid-head">
          <span className="hours-grid-head-day">Day</span>
          <span>Opening Time</span>
          <span></span>
          <span>Closing Time</span>
        </div>

        <div className="hours-grid">
          {hours.map((item, index) => (
            <div key={item.day} className="hours-row">
              <span className="day-label">{item.day}</span>

              <label className="hours-field">
                <select
                  disabled={item.closed}
                  value={item.openingTime}
                  onChange={(e) =>
                    handleChange(index, "openingTime", e.target.value)
                  }
                >
                  <option value="">Select</option>
                  {TIME_OPTIONS.map((time) => (
                    <option key={time} value={time}>
                      {to12HourTime(time)}
                    </option>
                  ))}
                </select>
              </label>

              <span className="hours-arrow">→</span>

              <label className="hours-field">
                <select
                  disabled={item.closed}
                  value={item.closingTime}
                  onChange={(e) =>
                    handleChange(index, "closingTime", e.target.value)
                  }
                >
                  <option value="">Select</option>
                  {TIME_OPTIONS.map((time) => (
                    <option key={time} value={time}>
                      {to12HourTime(time)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="closed-toggle">
                <input
                  type="checkbox"
                  checked={item.closed}
                  onChange={(e) =>
                    handleClosedToggle(index, e.target.checked)
                  }
                />
                Closed
              </label>
            </div>
          ))}
        </div>

        <div className="popup-footer">
          <button className="btn-cancel" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="btn-save primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
