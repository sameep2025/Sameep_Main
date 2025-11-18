// components/Footer.jsx
import React, { useEffect, useState } from "react";
import { Phone, MapPin, Clock } from "lucide-react";

export default function Footer({
  businessName,
  categoryName = "Driving School",
  description,
  navLinks = [
    { label: "Home", href: "#home" },
    { label: "Our Services", href: "#services" },
    { label: "Why Us", href: "#benefits" },
    { label: "About", href: "#about" },
    { label: "Contact", href: "#contact" },
  ],
  popularCourses = [],
  reachUs = {},
}) {
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', onResize);
      setVw(window.innerWidth);
      return () => window.removeEventListener('resize', onResize);
    }
  }, []);
  const isMobile = vw <= 640;
  const isTablet = vw > 640 && vw <= 1024;

  const titleName = (businessName && String(businessName).trim()) || categoryName || "Driving School";

  return (
    <footer
      style={{
        background: "#1F2937", // dark background like reference
        color: "#d1d5db",
        padding: isMobile ? "32px 16px 20px" : "48px 40px 24px",
        fontFamily: "Poppins, sans-serif",
      }}
    >
      {/* Top Section - 4 Columns */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : isTablet ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
          gap: isMobile ? "20px" : "40px",
          maxWidth: "1150px",
          margin: "0 auto",
        }}
      >
        {/* Column 1 - About / Business */}
        <div style={{ textAlign: isMobile ? 'center' : 'left' }}>
          <h3
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "#ffffff",
              marginBottom: 10,
            }}
          >
            {titleName}
          </h3>
          <p
            style={{
              fontSize: 16,
              lineHeight: 1.8,
              color: "#d1d5db",
              maxWidth: 320,
              margin: isMobile ? "0 auto" : 0,
            }}
          >
            {description || "Your trusted partner for learning to drive. We offer comprehensive, safe, and effective training tailored to your success."}
          </p>
        </div>

        {/* Column 2 - Quick Links (navbar items) */}
        <div style={{ textAlign: isMobile ? 'center' : 'left' }}>
          <h3
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "#ffffff",
              marginBottom: 10,
            }}
          >
            Quick Links
          </h3>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              lineHeight: 2,
              display: isMobile ? "inline-block" : "block",
            }}
          >
            {navLinks.map((link) => (
              <li key={link.label}>
                <a
                  href={link.href}
                  style={{
                    color: "#e5e7eb",
                    textDecoration: "none",
                    fontSize: 16,
                  }}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        {/* Column 3 - Popular Courses (services) */}
        <div style={{ textAlign: isMobile ? 'center' : 'left' }}>
          <h3
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "#ffffff",
              marginBottom: 10,
            }}
          >
            Popular Courses
          </h3>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              lineHeight: 2,
              display: isMobile ? "inline-block" : "block",
            }}
          >
            {popularCourses.length > 0
              ? popularCourses.map((label, idx) => (
                  <li key={idx} style={{ fontSize: 16 }}>
                    {label}
                  </li>
                ))
              : ["Special Combo Package", "Two Wheeler Training", "Four Wheeler Training", "Commercial Vehicle Course"].map((label) => (
                  <li key={label} style={{ fontSize: 16 }}>
                    {label}
                  </li>
                ))}
          </ul>
        </div>

        {/* Column 4 - Reach Us (contact info) */}
        <div style={{ textAlign: isMobile ? 'center' : 'left' }}>
          <h3
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "#ffffff",
              marginBottom: 10,
            }}
          >
            Reach Us
          </h3>
          <div style={{ fontSize: 16, lineHeight: 2, color: "#d1d5db" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Phone size={18} color="#22c55e" />
              <span>{reachUs.phone || "-"}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <MapPin size={18} color="#22c55e" />
              <span>{reachUs.address || "-"}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Clock size={18} color="#22c55e" />
              <span>Mon-Fri: 10 AM - 6 PM</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section - Copyright */}
      <div
        style={{
          textAlign: "center",
          marginTop: isMobile ? "24px" : "36px",
          borderTop: "1px solid #1f2937",
          paddingTop: isMobile ? "12px" : "14px",
          fontSize: 13,
          color: "#9ca3af",
        }}
      >
        © {new Date().getFullYear()} {titleName}. All Rights Reserved.
      </div>
    </footer>
  );
}
