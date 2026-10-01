"use client";

import "./Footer.css";
import { useEffect, useState } from "react";
import { FaPhoneAlt, FaMapMarkerAlt } from "react-icons/fa";
import { useVendor } from "@/app/context/VendorContext";
import { SOCIAL_ICONS } from "../Icons/SocialIcons";
import { getYnotBaseUrl } from "../utils/ynotBaseUrl";

const PAGE_SECTIONS = {
  Home: "home",
  Categories: "categories",
  "Why Us": "why-us",
  About: "about",
  Contact: "contact",
};
const FOOTER_GALLERY_OPEN_EVENT = "ynot-footer-open-gallery";

function sanitizeWhatsappNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  return digits;
}

export default function Footer() {
  const { vendorInfo } = useVendor() || {};
  const poweredByUrl = getYnotBaseUrl();

  const popular = vendorInfo?.popularCategories || [];
  const socialLinks = vendorInfo?.socialLinks || {};
  const categoryId = vendorInfo?.categoryId;

  const [categoryData, setCategoryData] = useState(null);
  const [categorySocials, setCategorySocials] = useState([]);

  // ---------- HELPERS ----------
  const toAnchor = (label) =>
    label.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-");

  const normalize = (label) =>
    label.toLowerCase().replace(/\s+/g, "");

  const handleQuickLinkClick = (event, item) => {
    const normalized = String(item || "").trim().toLowerCase();
    if (normalized !== "gallery") return;
    event.preventDefault();
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent(FOOTER_GALLERY_OPEN_EVENT, {
        detail: { source: "footer" },
      })
    );
  };

  // ==============================
  // ✅ LOAD CATEGORY DATA (MENU + SOCIALS)
  // ==============================
  useEffect(() => {
    if (!categoryId) return;

    fetch(
      `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/dummy-categories/${categoryId}`,
      { cache: "no-store" }
    )
      .then((res) => res.json())
      .then((data) => {
        setCategoryData(data);
        setCategorySocials(data.socialHandle || []);
      })
      .catch(() => {
        setCategoryData(null);
        setCategorySocials([]);
      });
  }, [categoryId]);

  const webMenu = categoryData?.webMenu || [];
  const secondaryPhones = Array.isArray(vendorInfo?.secondaryPhones)
    ? vendorInfo.secondaryPhones.filter(Boolean)
    : [];

  // ---------- FINAL SOCIALS ----------
  const socialsToRender = (() => {
    const mapped = categorySocials
      .map((label) => {
        const key = normalize(label);
        const rawValue =
          key === "whatsapp"
            ? socialLinks.whatsapp || vendorInfo?.phone || ""
            : socialLinks[key];
        const value = String(rawValue || "").trim();
        if (!value || !SOCIAL_ICONS[key]) return null;
        return { key, value };
      })
      .filter(Boolean);

    const hasWhatsapp = mapped.some(({ key }) => key === "whatsapp");
    const whatsappValue = String(socialLinks.whatsapp || vendorInfo?.phone || "").trim();

    if (!hasWhatsapp && whatsappValue) {
      mapped.push({ key: "whatsapp", value: whatsappValue });
    }

    return mapped;
  })();

  return (
    <footer className="footer">
      <div className="footer-container">

        {/* BRAND */}
        <div className="footer-col">
          <h3 className="footer-title">
            {vendorInfo?.businessName || "Business"}
          </h3>
        </div>

        {/* ✅ QUICK LINKS (NOW WORKS EVERYWHERE) */}
        <div className="footer-col">
          <h3 className="footer-title">Quick Links</h3>
          <ul className="footer-links">
            {webMenu.map((item) => (
              <li key={item}>
                <a
                  href={`#${PAGE_SECTIONS[item] || toAnchor(item)}`}
                  onClick={(event) => handleQuickLinkClick(event, item)}
                >
                  {item}
                </a>
              </li>
            ))}
          </ul>
        </div>

        {/* POPULAR */}
        {popular.length > 0 && (
          <div className="footer-col">
            <h3 className="footer-title">Popular</h3>
            <ul className="footer-links">
              {popular.map((cat) => (
                <li key={cat.name}>
                  <a href={`#cat-${toAnchor(cat.name)}`}>{cat.name}</a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* SOCIALS */}
        {socialsToRender.length > 0 && (
          <div className="footer-col">
            <h3 className="footer-title">Follow Us</h3>
            <div className="footer-socials">
              {socialsToRender.map(({ key, value }) => {
                const Icon = SOCIAL_ICONS[key];
                const href =
                  value.startsWith("http")
                    ? value
                    : key === "email"
                    ? `mailto:${value}`
                    : key === "whatsapp"
                    ? `https://wa.me/${sanitizeWhatsappNumber(value)}`
                    : `https://${key}.com/${value}`;

                return (
                  <a key={key} href={href} target="_blank" rel="noopener noreferrer">
                    <Icon className={`social-icon ${key}`} />
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {/* CONTACT */}
        <div className="footer-col">
          <h3 className="footer-title">Reach Us</h3>

          {vendorInfo?.phone && (
            <p className="footer-info">
              <FaPhoneAlt className="footer-icon" />
              <a href={`tel:${vendorInfo.phone}`}>{vendorInfo.phone}</a>
            </p>
          )}

          {secondaryPhones.length > 0 && (
            <div className="footer-secondary-list">
              {secondaryPhones.map((secondaryPhone) => (
                <p className="footer-info footer-info-secondary" key={secondaryPhone}>
                  <FaPhoneAlt className="footer-icon" />
                  <a href={`tel:${secondaryPhone}`}>{secondaryPhone}</a>
                </p>
              ))}
            </div>
          )}

          {vendorInfo?.location?.address && (
            <p className="footer-info">
              <FaMapMarkerAlt className="footer-icon" />
              {vendorInfo.location.address}
            </p>
          )}
        </div>

      </div>

      <div className="footer-bottom">
        <span>
          © {new Date().getFullYear()} {vendorInfo?.businessName || "Business"} All Rights Reserved.
        </span>
        <a
          className="footer-powered-by"
          href={poweredByUrl}
          target="_blank"
          rel="noreferrer"
        >
          <img src="/favicon.svg" alt="Ynot" className="footer-powered-by-logo" />
          <span>Powered by Ynot</span>
        </a>
      </div>
    </footer>
  );
}
