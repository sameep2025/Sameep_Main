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
  contact,
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
  const hasContact = contact && typeof contact === "object";
  const trimmedBusiness = (businessName && String(businessName).trim()) || "";
  const applyBusinessName = (text) => {
    const raw = text == null ? "" : String(text);
    const base = raw.trim();
    if (!base) return base;
    if (!trimmedBusiness) return base.replace(/\{business name\}/gi, "").trim();
    return base.replace(/\{business name\}/gi, trimmedBusiness);
  };

  const column1Heading = hasContact && (contact.footerHeading1 || contact.footerHeading) && String((contact.footerHeading1 || contact.footerHeading)).trim().length
    ? applyBusinessName(contact.footerHeading1 || contact.footerHeading)
    : titleName;
  const column1Description = hasContact && contact.footerDescription && String(contact.footerDescription).trim().length
    ? String(contact.footerDescription).trim()
    : (description || "Your trusted partner for learning to drive. We offer comprehensive, safe, and effective training tailored to your success.");

  const column2Heading = hasContact && contact.footerHeading2 && String(contact.footerHeading2).trim().length
    ? String(contact.footerHeading2).trim()
    : "Quick Links";
  const column3Heading = hasContact && contact.footerHeading3 && String(contact.footerHeading3).trim().length
    ? String(contact.footerHeading3).trim()
    : "Popular Courses";
  const column4Heading = hasContact && contact.footerHeading4 && String(contact.footerHeading4).trim().length
    ? String(contact.footerHeading4).trim()
    : "Reach Us";

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
            {column1Heading}
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
            {column1Description}
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
            {column2Heading}
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
            {column3Heading}
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
            {Array.isArray(popularCourses) && popularCourses.length > 0
              ? popularCourses.map((label, idx) => (
                  <li key={idx} style={{ fontSize: 16 }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (typeof document === "undefined") return;
                        const el = document.getElementById("products");
                        if (el) el.scrollIntoView({ behavior: "smooth" });
                      }}
                      style={{
                        background: "transparent",
                        border: "none",
                        padding: 0,
                        margin: 0,
                        color: "#e5e7eb",
                        cursor: "pointer",
                        fontSize: 16,
                        textAlign: isMobile ? "center" : "left",
                      }}
                    >
                      {label}
                    </button>
                  </li>
                ))
              : null}
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
            {column4Heading}
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
            {/* <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Clock size={18} color="#22c55e" />
              <span>Mon-Fri: 10 AM - 6 PM</span>
            </div> */}
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
