// frontend/src/components/ContactSection.jsx
import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";

// dynamically import LocationPickerModal only on client
const LocationPickerModal = dynamic(() => import("./LocationPickerModal"), { ssr: false });

export default function ContactSection({
  contactNumber,
  location,
  vendorId,
  businessHours = [],
  onLocationUpdate,
  theme = {
    primary: "#00AEEF",    // highlights, e.g., today's business hours
    accent: "#F59E0B",     // buttons
    cardBg: "#F0FDF4",     // card backgrounds
    background: "#f9f9f9", // section background
    text: "#555",          // normal text
    buttonText: "#000",    // button text
  },
}) {
  const [areaCity, setAreaCity] = useState("");
  const [isOpenNow, setIsOpenNow] = useState({ open: false, closes: "", nextOpen: "" });
  const [modalOpen, setModalOpen] = useState(false);

  const DAY_ORDER = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  const normalizeHours = (list = []) => {
    const byDay = {};
    list.forEach((e) => {
      const day = (e?.day || "").trim();
      if (!day) return;
      let hours = e.hours;
      if (!hours && (e.open || e.close)) {
        const open = (e.open || "").trim();
        const close = (e.close || "").trim();
        hours = open && close ? `${open} - ${close}` : "Closed";
      }
      byDay[day.toLowerCase()] = { day, hours: hours || "Closed" };
    });
    return DAY_ORDER.map((d) => byDay[d.toLowerCase()] || { day: d, hours: "Closed" });
  };

  const orderedHours = normalizeHours(businessHours);
  const todayIndex = new Date().getDay();

  const to24 = (time) => {
    if (!time) return NaN;
    const match = time.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
    if (!match) return NaN;
    let hour = parseInt(match[1], 10);
    const minute = match[2] ? parseInt(match[2], 10) : 0;
    const meridiem = match[3]?.toUpperCase();
    if (meridiem === "PM" && hour !== 12) hour += 12;
    if (meridiem === "AM" && hour === 12) hour = 0;
    return hour + minute / 60;
  };

  const splitRange = (range) => {
    if (!range) return ["", ""];
    const parts = String(range).split("-");
    const start = (parts[0] || "").trim();
    const end = (parts[1] || "").trim();
    return [start, end];
  };

  const getNextOpenTime = () => {
    for (let i = 1; i <= 7; i++) {
      const idx = (todayIndex + i) % 7;
      const nextDay = orderedHours[idx];
      if (nextDay?.hours && nextDay.hours !== "Closed") {
        const [start] = splitRange(nextDay.hours);
        return start;
      }
    }
    return "";
  };

  const checkOpenStatus = () => {
    const now = new Date();
    const today = orderedHours[todayIndex];
    if (!today) return { open: false, closes: "", nextOpen: "" };
    if (!today.hours || today.hours === "Closed") return { open: false, closes: "", nextOpen: getNextOpenTime() };

    const [start, end] = splitRange(today.hours);
    const nowHours = now.getHours() + now.getMinutes() / 60;
    const openStart = to24(start);
    const openEnd = to24(end);
    if (isNaN(openStart) || isNaN(openEnd)) return { open: false, closes: "", nextOpen: "" };

    if (nowHours >= openStart && nowHours <= openEnd) return { open: true, closes: end, nextOpen: "" };
    return { open: false, closes: "", nextOpen: start };
  };

  // Sync area/city from location
  useEffect(() => {
    if (!location) return setAreaCity("");

    if (location.areaCity) {
      setAreaCity(location.areaCity);
      return;
    }

    if (location.lat && location.lng) {
      const fetchAreaCity = async () => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${location.lat}&lon=${location.lng}`
          );
          const data = await res.json();
          const city = data.address?.city || data.address?.town || data.address?.village || "";
          const area = data.address?.suburb || data.address?.neighbourhood || "";
          setAreaCity([area, city].filter(Boolean).join(", "));
        } catch (err) {
          console.error("Reverse geocode failed", err);
          setAreaCity("");
        }
      };
      fetchAreaCity();
    }
  }, [location]);

  // Update open status every minute
  useEffect(() => {
    setIsOpenNow(checkOpenStatus());
    const interval = setInterval(() => setIsOpenNow(checkOpenStatus()), 60000);
    return () => clearInterval(interval);
  }, [businessHours]);

  const handleSaveLocation = async (pos) => {
    if (!pos?.lat || !pos?.lng) return;

    try {
      const res = await fetch(`/api/vendors/${vendorId}/location`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: pos.lat, lng: pos.lng }),
      });
      const data = await res.json();
      if (data.success) {
        onLocationUpdate?.(data.location);
        setModalOpen(false);
      } else {
        alert("Failed to save location");
      }
    } catch (err) {
      console.error(err);
      alert("Error saving location");
    }
  };

  return (
    <section style={{ padding: "60px 20px", backgroundColor: theme.background, fontFamily: "Poppins, sans-serif" }}>
      <div style={{ textAlign: "center", marginBottom: "40px" }}>
        <h2 style={{ fontSize: "32px", fontWeight: "bold", marginBottom: "10px", color: theme.primary }}>Contact Us</h2>
        <p style={{ fontSize: "16px", color: theme.text }}>Get in touch with us</p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "40px",
          maxWidth: "1000px",
          margin: "0 auto",
          fontSize: "16px",
          color: theme.text,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Phone */}
          <div
            style={{
              padding: "20px",
              border: `1px solid ${theme.text}33`,
              borderRadius: "10px",
              background: theme.cardBg,
              boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
            }}
          >
            <h4 style={{ marginBottom: "10px", fontWeight: "bold", color: theme.primary }}>Phone</h4>
            <p>{contactNumber || "-"}</p>
          </div>

          {/* Location */}
          <div
            style={{
              padding: "20px",
              border: `1px solid ${theme.text}33`,
              borderRadius: "10px",
              background: theme.cardBg,
              boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
            }}
            onClick={() => setModalOpen(true)}
          >
            <h4 style={{ marginBottom: "10px", fontWeight: "bold", color: theme.primary }}>Location</h4>
            {location ? (
              <>
                {areaCity && <p>{areaCity}</p>}
                <iframe
                  title="map"
                  width="100%"
                  height="250"
                  style={{ border: 0 }}
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${location.lng - 0.01}%2C${location.lat - 0.01}%2C${location.lng + 0.01}%2C${location.lat + 0.01}&layer=mapnik&marker=${location.lat}%2C${location.lng}`}
                />
              </>
            ) : (
              <p style={{ color: theme.text }}>Location not set. Click to add.</p>
            )}
          </div>

          {/* Business Hours */}
          <div
            style={{
              padding: "20px",
              border: `1px solid ${theme.text}33`,
              borderRadius: "10px",
              background: theme.cardBg,
              boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
            }}
          >
            <h4 style={{ marginBottom: "10px", fontWeight: "bold", color: theme.primary }}>Business Hours</h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {orderedHours.map((item, idx) => (
                <li
                  key={item.day}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "6px 0",
                    fontWeight: todayIndex === idx ? "bold" : "normal",
                    color: todayIndex === idx ? theme.primary : theme.text,
                  }}
                >
                  <span>{item.day}</span>
                  <span>{item.hours}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Contact Form */}
        <form
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "15px",
            background: theme.cardBg,
            padding: "30px",
            borderRadius: "12px",
            boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
          }}
        >
          <input
            type="text"
            placeholder="Your Name"
            required
            style={{
              padding: "12px",
              border: `1px solid ${theme.text}33`,
              borderRadius: "8px",
              backgroundColor: theme.cardBg,
              color: theme.text,
            }}
          />
          <input
            type="tel"
            placeholder="Phone Number"
            required
            style={{
              padding: "12px",
              border: `1px solid ${theme.text}33`,
              borderRadius: "8px",
              backgroundColor: theme.cardBg,
              color: theme.text,
            }}
          />
          <textarea
            placeholder="Message (Optional)"
            rows="4"
            style={{
              padding: "12px",
              border: `1px solid ${theme.text}33`,
              borderRadius: "8px",
              resize: "none",
              backgroundColor: theme.cardBg,
              color: theme.text,
            }}
          />
          <button
            type="submit"
            style={{
              padding: "12px",
              backgroundColor: theme.accent,
              color: theme.buttonText,
              border: "none",
              borderRadius: "30px",
              fontWeight: "bold",
              cursor: "pointer",
              marginTop: "10px",
              width: "150px",
              alignSelf: "flex-start",
              fontFamily: "Poppins, sans-serif",
            }}
          >
            Send Message
          </button>
        </form>
      </div>

      {/* Location Picker Modal */}
      <LocationPickerModal
        show={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSaveLocation}
        initialPosition={location ? [location.lat, location.lng] : null}
        title="Select Location"
      />
    </section>
  );
}
