// components/Footer.jsx
import React, { useEffect, useState } from "react";
import { Phone, MapPin, Clock } from "lucide-react";
import API_BASE_URL, { ASSET_BASE_URL } from "../config";

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
  vendorId,
  socialHandles = [], // category-level social handles
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

  const [socialIcons, setSocialIcons] = useState({}); // normalized handle -> icon URL
  const [vendorSocialLinks, setVendorSocialLinks] = useState({}); // raw map from API
  const [footerSocialIcons, setFooterSocialIcons] = useState([]); // [{ key, label, url, iconUrl }]

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

  const normalizeHandle = (v) => {
    try {
      return String(v == null ? "" : v)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
    } catch {
      return "";
    }
  };

  useEffect(() => {
    const fetchIcons = async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/masters?type=${encodeURIComponent("socialHandle")}`
        );
        if (!res.ok) return;
        const data = await res.json().catch(() => []);
        const arr = Array.isArray(data) ? data : [];
        const map = {};
        arr.forEach((m) => {
          const name = m && typeof m.name === "string" ? m.name : "";
          const key = normalizeHandle(name);
          if (!key) return;
          const rawUrl = (m && typeof m.imageUrl === "string" ? m.imageUrl : "").trim();
          if (!rawUrl) return;
          const full = rawUrl.startsWith("http")
            ? rawUrl
            : `${ASSET_BASE_URL || ""}${rawUrl}`;
          map[key] = full;
        });
        setSocialIcons(map);
      } catch {
        setSocialIcons({});
      }
    };
    fetchIcons();
  }, []);

  useEffect(() => {
    const fetchVendorSocialLinks = async () => {
      try {
        const id = vendorId ? String(vendorId).trim() : "";
        if (!id) {
          setVendorSocialLinks({});
          return;
        }
        let links = {};
        try {
          const res = await fetch(`${API_BASE_URL}/api/dummy-vendors/${id}/social-links`);
          if (res.ok) {
            const data = await res.json().catch(() => ({}));
            if (data && typeof data.socialLinks === "object" && data.socialLinks !== null) {
              links = data.socialLinks;
            }
          }
        } catch {}

        if (!links || Object.keys(links || {}).length === 0) {
          try {
            const res2 = await fetch(`${API_BASE_URL}/api/dummy-vendors/${id}`);
            if (res2.ok) {
              const doc = await res2.json().catch(() => ({}));
              if (doc && typeof doc.socialLinks === "object" && doc.socialLinks !== null) {
                links = doc.socialLinks;
              }
            }
          } catch {}
        }

        setVendorSocialLinks(links || {});
      } catch {
        setVendorSocialLinks({});
      }
    };
    fetchVendorSocialLinks();
  }, [vendorId]);

  useEffect(() => {
    try {
      const handles = Array.isArray(socialHandles) ? socialHandles : [];
      const links = vendorSocialLinks && typeof vendorSocialLinks === "object" ? vendorSocialLinks : {};
      const iconMap = socialIcons && typeof socialIcons === "object" ? socialIcons : {};
      const out = [];

      handles.forEach((rawName) => {
        const label = rawName == null ? "" : String(rawName).trim();
        if (!label) return;
        const nKey = normalizeHandle(label);
        const iconUrl = iconMap[nKey];
        if (!iconUrl) return;

        let url = "";
        const rawKeys = Object.keys(links);
        const directCandidates = [label, nKey];
        for (const k of directCandidates) {
          if (!k) continue;
          if (links[k] != null && String(links[k]).trim() !== "") {
            url = String(links[k]);
            break;
          }
        }
        if (!url && rawKeys.length) {
          const matchKey = rawKeys.find((rk) => {
            const nr = normalizeHandle(rk);
            return nr && nr === nKey;
          });
          if (matchKey && links[matchKey] != null) {
            url = String(links[matchKey]);
          }
        }
        if (!url) return;

        out.push({ key: nKey, label, url, iconUrl });
      });

      setFooterSocialIcons(out);
    } catch {
      setFooterSocialIcons([]);
    }
  }, [socialHandles, vendorSocialLinks, socialIcons]);

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
            {footerSocialIcons.length > 0 && (
              <div
                style={{
                  marginTop: 10,
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  justifyContent: isMobile ? "center" : "flex-start",
                }}
              >
                {footerSocialIcons.map((item) => (
                  <a
                    key={item.key}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 32,
                      height: 32,
                      borderRadius: 999,
                      background: "#111827",
                      border: "1px solid #4b5563",
                      cursor: "pointer",
                    }}
                  >
                    <img
                      src={item.iconUrl}
                      alt={item.label}
                      style={{ width: 18, height: 18, borderRadius: 4, objectFit: "cover" }}
                    />
                  </a>
                ))}
              </div>
            )}
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
