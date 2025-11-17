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
    const check = () => setMobile(window.innerWidth < 900);
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
        zIndex: 50,
      }}
    >
      <div
        className="w-full mx-auto"
        style={{
          width: "100%",
          margin: "0 auto",
          maxWidth: "1150px",
          paddingLeft: 0,
          paddingRight: 40,
          fontFamily:
            "Poppins, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
        }}
      >




        {/* Logo */}
        <div
          className="font-extrabold tracking-tight"
          style={{
            fontSize: "32px",
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
          <button onClick={() => setMenuOpen(!menuOpen)}>
            <Menu size={30} />
          </button>
        )}
      </div>

      {/* Mobile Menu */}
      {mobile && menuOpen && (
        <div
          className="w-full bg-white shadow-md"
          style={{
            marginTop: "80px",
            padding: "20px 30px",
            fontFamily: "Poppins",
            fontSize: "17px",
            fontWeight: "500",
          }}
        >
          <a className="block py-2">Home</a>
          <a className="block py-2">Driving Packages</a>
          <a className="block py-2">Individual Courses</a>
          <a className="block py-2">Commercial Training</a>
          <a className="block py-2">Why Us</a>
          <a className="block py-2">About</a>
          <a className="block py-2">Contact</a>
        </div>
      )}
    </header>
  );
}
