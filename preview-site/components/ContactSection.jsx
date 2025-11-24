// frontend/src/components/ContactSection.jsx
import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Phone, MapPin, Clock, Send } from "lucide-react";
import API_BASE_URL from "../config";

// dynamically import LocationPickerModal only on client
const LocationPickerModal = dynamic(() => import("./LocationPickerModal"), { ssr: false });

export default function ContactSection({
  contactNumber,
  location,
  vendorId,
  businessHours = [], // ✅ accept from parent
  onLocationUpdate,
  contact,
}) {
  const [areaCity, setAreaCity] = useState("");
  const [isOpenNow, setIsOpenNow] = useState({ open: false, closes: "", nextOpen: "" });
  const [modalOpen, setModalOpen] = useState(false);
  // Default to a narrow viewport on first render so mobile layout does not overflow
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 375);

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

  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', onResize);
      setVw(window.innerWidth);
      return () => window.removeEventListener('resize', onResize);
    }
  }, []);

  const isNarrow = vw <= 900;

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

    // 1) Prefer already-known text fields from location
    if (location.areaCity) {
      setAreaCity(location.areaCity);
      return;
    }

    const textFromLocation = [
      // Match DummyVendorStatusListPage priority as closely as possible
      location.area,
      location.city,
      location.address, // generic address field from backend
      location.addressLine1,
    ]
      .map((v) => (v || "").trim())
      .filter(Boolean)
      .join(", ");

    if (textFromLocation) {
      setAreaCity(textFromLocation);
      return;
    }

    // 2) If we at least have coordinates, show them as a last-resort string
    const plat = Number(location.lat);
    const plng = Number(location.lng);
    if (Number.isFinite(plat) && Number.isFinite(plng)) {
      setAreaCity(`${plat.toFixed(4)}, ${plng.toFixed(4)}`);
    }

    // 3) Fallback to reverse-geocode only if we have valid lat/lng and no text fields
    if (Number.isFinite(Number(location.lat)) && Number.isFinite(Number(location.lng))) {
      const fetchAreaCity = async () => {
        const lat = Number(location.lat);
        const lng = Number(location.lng);
        if (!isFinite(lat) || !isFinite(lng)) {
          setAreaCity("");
          return;
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
          const url = `/api/reverse-geocode?lat=${encodeURIComponent(lat.toFixed(6))}&lng=${encodeURIComponent(lng.toFixed(6))}`;
          const res = await fetch(url, {
            signal: controller.signal,
            headers: { Accept: "application/json" },
          });

          // Some browsers may cache and return 304; just ignore and keep whatever we have
          if (!res.ok) {
            if (res.status === 304) {
              return;
            }
            throw new Error(`Reverse geocode HTTP ${res.status}`);
          }

          const data = await res.json().catch(() => ({}));
          const city =
            data?.city ||
            data?.address?.city ||
            data?.address?.town ||
            data?.address?.village ||
            "";
          const area =
            data?.area ||
            data?.address?.suburb ||
            data?.address?.neighbourhood ||
            "";
          const combined = [area, city].filter(Boolean).join(", ");
          setAreaCity(combined || "");
        } catch (err) {
          console.warn("Reverse geocode failed", err?.message || err);
          setAreaCity("");
        } finally {
          clearTimeout(timeout);
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
      const res = await fetch(`${API_BASE_URL}/api/vendors/${vendorId}/location`, {
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

  const hasContact = contact && typeof contact === "object";
  const heading = hasContact && contact.heading && String(contact.heading).trim().length
    ? String(contact.heading).trim()
    : "Get In Touch";
  const subText = hasContact && contact.description && String(contact.description).trim().length
    ? String(contact.description).trim()
    : "Have questions or ready to book your first lesson? Reach out to us today!";

  return (
    <section
      id="contact"
      style={{
        padding: "80px 24px",
        backgroundColor: "#f9fafb",
        fontFamily: "Poppins, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 1120,
          margin: "0 auto 56px auto",
          textAlign: "center",
        }}
      >
        <h2
          style={{
            fontSize: 36,
            fontWeight: 800,
            color: "#111827",
            margin: "0 0 16px 0",
          }}
        >
          {heading}
        </h2>
        <p
          style={{
            fontSize: 20,
            color: "#4b5563",
            maxWidth: 640,
            margin: "0 auto",
          }}
        >
          {subText}
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isNarrow
            ? "1fr"
            : "minmax(0, 1fr) minmax(0, 1.25fr)",
          paddingRight: 0,
          gap: isNarrow ? 24 : 40,
          maxWidth: 1120,
          margin: "0 auto",
          alignItems: "flex-start",
        }}
      >
        {/* Left column: three info cards */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          {/* Call Us card */}
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: 18,
              padding: 24,
              boxShadow: "0 18px 40px rgba(15,23,42,0.08)",
              border: "1px solid #e5e7eb",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                color: "#16a34a",
                marginBottom: 12,
              }}
            >
              <Phone style={{ width: 32, height: 32, marginRight: 12 }} />
              <h4
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  margin: 0,
                  color: "#111827",
                }}
              >
                Call Us
              </h4>
            </div>
            <p
              style={{
                fontSize: 18,
                color: "#111827",
                margin: 0,
              }}
            >
              <a
                href={contactNumber ? `tel:+91${contactNumber}` : undefined}
                style={{
                  color: "#111827",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                {contactNumber ? `+91 ${contactNumber}` : "-"}
              </a>
            </p>
          </div>

          {/* Our Location card */}
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: 18,
              padding: 24,
              boxShadow: "0 18px 40px rgba(15,23,42,0.08)",
              border: "1px solid #e5e7eb",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                color: "#16a34a",
                marginBottom: 12,
              }}
            >
              <MapPin style={{ width: 32, height: 32, marginRight: 12 }} />
              <h4
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  margin: 0,
                  color: "#111827",
                }}
              >
                Our Location
              </h4>
            </div>
            <p
              style={{
                fontSize: 18,
                color: "#374151",
                margin: "0 0 16px 0",
              }}
            >
              {areaCity || "Location not set"}
            </p>
            {location && (
              <div
                style={{
                  borderRadius: 12,
                  overflow: "hidden",
                  border: "1px solid #e5e7eb",
                }}
              >
                <iframe
                  title="map"
                  width="100%"
                  height="220"
                  loading="lazy"
                  style={{ border: 0 }}
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${location.lng - 0.01}%2C${location.lat - 0.01}%2C${location.lng + 0.01}%2C${location.lat + 0.01}&layer=mapnik&marker=${location.lat}%2C${location.lng}`}
                />
              </div>
            )}
          </div>

          {/* Business Hours card */}
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: 18,
              padding: 24,
              boxShadow: "0 18px 40px rgba(15,23,42,0.08)",
              border: "1px solid #e5e7eb",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                color: "#16a34a",
                marginBottom: 12,
              }}
            >
              <Clock style={{ width: 32, height: 32, marginRight: 12 }} />
              <h4
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  margin: 0,
                  color: "#111827",
                }}
              >
                Business Hours
              </h4>
            </div>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: 8,
                fontSize: 18,
                color: "#374151",
              }}
            >
              {orderedHours.map((item, idx) => {
                const isClosed = !item.hours || item.hours === "Closed";
                const isToday = idx === todayIndex;
                return (
                  <li
                    key={item.day}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontWeight: isToday ? 700 : 500,
                      color: isToday ? "#16a34a" : "#374151",
                    }}
                  >
                    <span>{item.day}:</span>
                    <span
                      style={{
                        color: isClosed ? "#ef4444" : isToday ? "#16a34a" : "#111827",
                        fontWeight: isClosed ? 600 : isToday ? 700 : 500,
                      }}
                    >
                      {isClosed ? "Closed" : item.hours}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* Right column: contact form */}
        <form
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 18,
            padding: isNarrow ? 24 : "32px 40px 32px 32px",
            boxShadow: "0 18px 40px rgba(15,23,42,0.08)",
            border: "1px solid #e5e7eb",
            display: "flex",
            flexDirection: "column",
            gap: 18,
            fontFamily:
              "Poppins, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
            width: "100%",
            boxSizing: "border-box",
          }}
        >
          <input
            id="contact-name"
            type="text"
            placeholder="Your Name"
            required
            style={{
              width: "100%",
              padding: "12px 16px",
              marginTop: 12,
              borderRadius: 10,
              border: "1px solid #d1d5db",
              backgroundColor: "#f9fafb",
              fontSize: 16,
              outline: "none",
              fontFamily:
                "Poppins, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
            }}
          />
          <input
            id="contact-phone"
            type="tel"
            placeholder="Phone Number"
            required
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              backgroundColor: "#f9fafb",
              fontSize: 16,
              outline: "none",
              fontFamily:
                "Poppins, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
            }}
          />
          <textarea
            id="contact-message"
            placeholder="Your Message (Optional)"
            rows={6}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              backgroundColor: "#f9fafb",
              fontSize: 16,
              resize: "none",
              outline: "none",
              fontFamily:
                "Poppins, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
            }}
          />
          <button
            type="submit"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "12px 32px",
              backgroundColor: "#f59e0b",
              color: "#111827",
              borderRadius: 999,
              border: "none",
              fontWeight: 800,
              fontSize: 15,
              cursor: "pointer",
              marginTop: 12,
              alignSelf: "center",
              boxShadow: "0 10px 20px rgba(245,158,11,0.25)",
              gap: 8,
            }}
          >
            <span>Send Message</span>
            <Send style={{ width: 18, height: 18 }} />
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
