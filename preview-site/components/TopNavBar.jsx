"use client";

import React, { useState, useEffect } from "react";
import { Menu, ChevronDown } from "lucide-react";

export default function TopNavBar({ businessName, services = [
  "Driving Packages",
  "Individual Courses",
  "Commercial Training",
] }) {
  const [mobile, setMobile] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hoverKey, setHoverKey] = useState(null);
  const [servicesOpen, setServicesOpen] = useState(false);

  useEffect(() => {
    const check = () => {
      const isMobile = window.innerWidth < 900;
      setMobile(isMobile);
      // Reset menus when breakpoint changes
      if (!isMobile) {
        setMenuOpen(false);
      }
      setServicesOpen(false);
      setHoverKey(null);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return (
    <header
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: 80,
        display: "flex",
        alignItems: "center",
        background: "#ffffff",
        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
        zIndex: 1000,
      }}
    >
      <div
        className="w-full mx-auto"
        style={{
          width: "100%",
          margin: "0 auto",
          maxWidth: "1150px",
          paddingLeft: 16,
          paddingRight: 16,
          fontFamily:
            "Poppins, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >




        {/* Logo */}
        <div
          className="font-extrabold tracking-tight"
          style={{
            fontSize: "28px",
            background: "linear-gradient(to right, #06b26b, #00dba2)",
            WebkitBackgroundClip: "text",
            color: "transparent",
            cursor: "pointer",
          }}
        >
          {businessName || "Driving"}
        </div>

        {/* Desktop Menu */}
        {!mobile && (
          <nav
  style={{
    display: "flex",
    alignItems: "center",
    gap: 32,
    marginLeft: "auto",
    background: "transparent",
    backgroundColor: "transparent",
    boxShadow: "none",
    border: "none",
  }}
>


            {/* Home */}
            <div
              style={{
                position: "relative",
                cursor: "pointer",
                fontSize: 15,
                fontWeight: 500,
                color: hoverKey === "home" ? "#059669" : "#111827",
                paddingBottom: 4,
                background: "transparent",
                backgroundColor: "transparent",
              }}
              onMouseEnter={() => setHoverKey("home")}
              onMouseLeave={() => setHoverKey(null)}
            >
              Home
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: 2,
                  background: "#22c55e",
                  transformOrigin: "left",
                  transform: hoverKey === "home" ? "scaleX(1)" : "scaleX(0)",
                  transition: "transform 0.2s ease",
                }}
              />
            </div>

            {/* Our Services dropdown */}
            <div
              style={{ position: "relative", background: "transparent", backgroundColor: "transparent" }}
              onMouseEnter={() => {
                setHoverKey("services");
                setServicesOpen(true);
              }}
              onMouseLeave={() => {
                setHoverKey(null);
                setServicesOpen(false);
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  cursor: "pointer",
                  fontSize: 15,
                  fontWeight: 500,
                  color: hoverKey === "services" ? "#059669" : "#111827",
                  paddingBottom: 4,
                  position: "relative",
                  background: "transparent",
                  backgroundColor: "transparent",
                }}
              >
                <span>Our Services</span>
                <ChevronDown style={{ width: 16, height: 16 }} />
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: 2,
                    background: "#22c55e",
                    transformOrigin: "left",
                    transform: hoverKey === "services" ? "scaleX(1)" : "scaleX(0)",
                    transition: "transform 0.2s ease",
                  }}
                />
              </div>

              {/* Dropdown */}
              {servicesOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    marginTop: 8,
                    width: 240,
                    background: "#ffffff",
                    borderRadius: 12,
                    boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
                    padding: 8,
                  }}
                >
                  {services.map((label, index) => (
                    <div
                      key={index}
                      style={{
                        cursor: "pointer",
                        fontSize: 15,
                        fontWeight: 500,
                        color: "#111827",
                        padding: "10px 12px",
                        borderBottom: index === services.length - 1 ? "none" : "1px solid #e5e7eb",
                      }}
                    >
                      {label}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Why Us */}
            <div
              style={{
                position: "relative",
                cursor: "pointer",
                fontSize: 15,
                fontWeight: 500,
                color: hoverKey === "why-us" ? "#059669" : "#111827",
                paddingBottom: 4,
                background: "transparent",
                backgroundColor: "transparent",
              }}
              onMouseEnter={() => setHoverKey("why-us")}
              onMouseLeave={() => setHoverKey(null)}
            >
              Why Us
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: 2,
                  background: "#22c55e",
                  transformOrigin: "left",
                  transform: hoverKey === "why-us" ? "scaleX(1)" : "scaleX(0)",
                  transition: "transform 0.2s ease",
                  background: "transparent",
                }}
              />
            </div>

            {/* About */}
            <div
              style={{
                position: "relative",
                cursor: "pointer",
                fontSize: 15,
                fontWeight: 500,
                color: hoverKey === "about" ? "#059669" : "#111827",
                paddingBottom: 4,
                background: "transparent",
                backgroundColor: "transparent",
              }}
              onMouseEnter={() => setHoverKey("about")}
              onMouseLeave={() => setHoverKey(null)}
            >
              About
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: 2,
                  background: "#22c55e",
                  transformOrigin: "left",
                  transform: hoverKey === "about" ? "scaleX(1)" : "scaleX(0)",
                  transition: "transform 0.2s ease",
                  background: "transparent",
                }}
              />
            </div>

            {/* Contact */}
            <div
              style={{
                position: "relative",
                cursor: "pointer",
                fontSize: 15,
                fontWeight: 500,
                color: hoverKey === "contact" ? "#059669" : "#111827",
                paddingBottom: 4,
                background: "transparent",
                backgroundColor: "transparent",
              }}
              onMouseEnter={() => setHoverKey("contact")}
              onMouseLeave={() => setHoverKey(null)}
            >
              Contact
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: 2,
                  background: "#22c55e",
                  transformOrigin: "left",
                  transform: hoverKey === "contact" ? "scaleX(1)" : "scaleX(0)",
                  transition: "transform 0.2s ease",
                }}
              />
            </div>
          </nav>
        )}

        {/* Mobile Menu Button */}
        {mobile && (
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            style={{
              marginLeft: "auto",
              background: "transparent",
              border: "none",
              padding: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Menu size={28} />
          </button>
        )}
      </div>

      {/* Mobile Menu */}
      {mobile && menuOpen && (
        <div
          className="w-full bg-white shadow-md"
          style={{
            position: "fixed",
            top: 80,
            left: 0,
            right: 0,
            padding: "14px 24px",
            fontFamily: "Poppins, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
            fontSize: "15px",
            fontWeight: 500,
            zIndex: 999,
            backgroundColor: "#ffffff",
            textAlign: "center",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <div style={{ padding: "6px 0" }}>Home</div>
          <div
            style={{
              padding: "6px 0",
              cursor: "pointer",
            }}
            onClick={() => setServicesOpen((open) => !open)}
          >
            Our Services {servicesOpen ? "▲" : "▼"}
          </div>
          {servicesOpen && (
            <div
              style={{
                paddingBottom: 4,
              }}
            >
              {services.map((label, index) => (
                <div
                  key={index}
                  style={{
                    padding: "4px 0",
                    fontSize: 14,
                  }}
                >
                  {label}
                </div>
              ))}
            </div>
          )}
          <div style={{ padding: "6px 0" }}>Why Us</div>
          <div style={{ padding: "6px 0" }}>About</div>
          <div style={{ padding: "6px 0" }}>Contact</div>
        </div>
      )}
    </header>
  );
}
