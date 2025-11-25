"use client";

import React, { useState, useEffect } from "react";
import { Menu, ChevronDown, User } from "lucide-react";

export default function TopNavBar({
  businessName,
  services = [
    "Driving Packages",
    "Individual Courses",
    "Commercial Training",
  ],
  hasPackages = false,
  webMenu = null,
  servicesNavLabel = "Our Services",
}) {
  const [mobile, setMobile] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hoverKey, setHoverKey] = useState(null);
  const [servicesOpen, setServicesOpen] = useState(false);

  const effectiveServices = hasPackages
    ? ["Packages", ...services]
    : services;

  const scrollToSection = (id) => {
    try {
      if (typeof window === "undefined") return;
      // Measure actual header height so content is fully visible below it
      const header = document.querySelector("header");
      const headerHeight = header ? header.getBoundingClientRect().height : 80;
      const HEADER_OFFSET = headerHeight + 16; // small extra gap

      if (!id || id === "home") {
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      const el = document.getElementById(id);
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const targetY = window.scrollY + rect.top - HEADER_OFFSET;
      window.scrollTo({ top: targetY, behavior: "smooth" });
    } catch {}
  };

  const normalizeMenu = (items) => {
    const base = Array.isArray(items) ? items : [];
    const cleaned = base
      .map((v) => (v == null ? "" : String(v).trim()))
      .filter(Boolean)
      .map((label) => {
        const key = String(label || "").toLowerCase();
        return key === "categories" ? (servicesNavLabel || "Our Services") : label;
      });
    if (cleaned.length === 0) {
      return ["Home", servicesNavLabel || "Our Services", "Why Us", "About", "Contact"];
    }
    return cleaned;
  };

  const menuItems = normalizeMenu(webMenu);

  const getTargetForLabel = (label) => {
    const key = String(label || "").toLowerCase();
    const servicesKey = String(servicesNavLabel || "").toLowerCase();
    if (key === "home") return "home";
    if (
      key === "categories" ||
      key === servicesKey ||
      key === "ourservices" ||
      key === "our-services"
    )
      return "products";
    if (key === "why us" || key === "whyus" || key === "why-us") return "benefits";
    if (key === "about") return "about";
    if (key === "contact") return "contact";
    return "home";
  };

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
          maxWidth: "1180px",
          paddingLeft: 0,
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
            marginLeft: -8,
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

            {/* Render menu items dynamically. "Categories" controls the services dropdown. */}
            {menuItems.map((label) => {
              const key = String(label).toLowerCase();
              const servicesKey = String(servicesNavLabel || "").toLowerCase();

              // Categories / Our Services item controls the services dropdown
              if (
                key === "categories" ||
                key === servicesKey ||
                key === "ourservices" ||
                key === "our-services"
              ) {
                return (
                  <div
                    key={label}
                    style={{ position: "relative", background: "transparent", backgroundColor: "transparent" }}
                    onMouseEnter={() => {
                      setHoverKey("services");
                    }}
                    onMouseLeave={() => {
                      setHoverKey(null);
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        cursor: "pointer",
                        fontSize: 18,
                        fontWeight: 500,
                        color: hoverKey === "services" ? "#059669" : "#111827",
                        paddingBottom: 4,
                        position: "relative",
                        background: "transparent",
                        backgroundColor: "transparent",
                      }}
                    >
                      <span onClick={() => scrollToSection("products")}>
                        {label}
                      </span>
                      <ChevronDown
                        style={{ width: 16, height: 16, cursor: "pointer" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setServicesOpen((open) => !open);
                        }}
                      />
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
                        {effectiveServices.map((svc, index) => (
                          <div
                            key={index}
                            style={{
                              cursor: "pointer",
                              fontSize: 18,
                              fontWeight: 500,
                              color: "#111827",
                              padding: "10px 12px",
                              borderBottom:
                                index === effectiveServices.length - 1
                                  ? "none"
                                  : "1px solid #e5e7eb",
                            }}
                            onClick={() => {
                              try {
                                const raw = String(svc || "");
                                const skey = raw
                                  .toLowerCase()
                                  .replace(/[^a-z0-9]+/g, "-")
                                  .replace(/(^-|-$)/g, "");
                                scrollToSection("products");
                                setServicesOpen(false);
                                if (typeof window !== "undefined" && skey) {
                                  const evt = new CustomEvent("preview:service-click", {
                                    detail: { label: raw, key: skey },
                                  });
                                  window.dispatchEvent(evt);
                                }
                              } catch {}
                            }}
                          >
                            {svc}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              const target = getTargetForLabel(label);
              const hoverId = target === "home" ? "home" : target;

              // All other labels (Home, Why Us, About, Contact, etc.) become simple nav items
              return (
                <div
                  key={label}
                  style={{
                    position: "relative",
                    cursor: "pointer",
                    fontSize: 18,
                    fontWeight: 500,
                    color: hoverKey === hoverId ? "#059669" : "#111827",
                    paddingBottom: 4,
                    background: "transparent",
                    backgroundColor: "transparent",
                  }}
                  onMouseEnter={() => setHoverKey(hoverId)}
                  onMouseLeave={() => setHoverKey(null)}
                  onClick={() => scrollToSection(target)}
                >
                  {label}
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      bottom: 0,
                      height: 2,
                      background: "#22c55e",
                      transformOrigin: "left",
                      transform: hoverKey === hoverId ? "scaleX(1)" : "scaleX(0)",
                      transition: "transform 0.2s ease",
                    }}
                  />
                </div>
              );
            })}

            {/* Login icon at the end */}
            <button
              type="button"
              style={{
                border: "none",
                background: "transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <User size={22} color="#111827" />
              <span
                style={{
                  marginLeft: 6,
                  fontSize: 16,
                  fontWeight: 500,
                  color: "#111827",
                }}
              >
                Log In
              </span>
            </button>
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
              cursor: "pointer",
            }}
          >
            <Menu size={26} />
          </button>
        )}
      </div>

      {/* Mobile Menu - full screen overlay */}
      {mobile && menuOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 999,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-start",
            paddingTop: 90,
            background:
              "linear-gradient(160deg, rgba(15,23,42,0.96), rgba(15,23,42,0.7))",
          }}
        >
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            style={{
              position: "absolute",
              top: 18,
              right: 18,
              width: 30,
              height: 30,
              borderRadius: 999,
              border: "1px solid rgba(248,250,252,0.9)",
              background: "transparent",
              color: "#F9FAFB",
              fontSize: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            ×
          </button>

          <div
            style={{
              margin: "0 16px 24px",
              borderRadius: 28,
              background: "#ffffff",
              padding: "18px 18px 14px",
              boxShadow: "0 18px 45px rgba(15,23,42,0.55)",
              fontFamily:
                "Poppins, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
              maxHeight: "calc(100vh - 160px)",
              overflowY: "auto",
            }}
          >
            {menuItems.map((label) => {
              const key = String(label).toLowerCase();
              const servicesKey = String(servicesNavLabel || "").toLowerCase();

              if (
                key === "categories" ||
                key === servicesKey ||
                key === "ourservices" ||
                key === "our-services"
              ) {
                return (
                  <React.Fragment key={label}>
                    <div
                      style={{
                        padding: "10px 4px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        fontSize: 18,
                        fontWeight: 600,
                        cursor: "pointer",
                        borderBottom: servicesOpen ? "none" : "1px solid #e5e7eb",
                      }}
                      onClick={() => {
                        setServicesOpen((open) => !open);
                        scrollToSection("products");
                      }}
                    >
                      <span>{label}</span>
                      <span style={{ fontSize: 18 }}>{servicesOpen ? "↑" : "↗"}</span>
                    </div>

                    {servicesOpen && (
                      <div
                        style={{
                          paddingTop: 8,
                          paddingBottom: 10,
                          borderBottom: "1px solid #e5e7eb",
                        }}
                      >
                        {effectiveServices.map((svc, index) => (
                          <div
                            key={index}
                            style={{
                              padding: "8px 4px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              fontSize: 15,
                              cursor: "pointer",
                            }}
                            onClick={() => {
                              try {
                                const raw = String(svc || "");
                                const skey = raw
                                  .toLowerCase()
                                  .replace(/[^a-z0-9]+/g, "-")
                                  .replace(/(^-|-$)/g, "");
                                scrollToSection("products");
                                setMenuOpen(false);
                                if (typeof window !== "undefined" && skey) {
                                  const evt = new CustomEvent("preview:service-click", {
                                    detail: { label: raw, key: skey },
                                  });
                                  window.dispatchEvent(evt);
                                }
                              } catch {}
                            }}
                          >
                            <span>{svc}</span>
                            <span style={{ fontSize: 16 }}>›</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </React.Fragment>
                );
              }

              const target = getTargetForLabel(label);

              return (
                <div
                  key={label}
                  style={{
                    padding: "10px 4px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: 18,
                    fontWeight: 600,
                    cursor: "pointer",
                    borderBottom: "1px solid #e5e7eb",
                  }}
                  onClick={() => {
                    scrollToSection(target);
                    setMenuOpen(false);
                  }}
                >
                  <span>{label}</span>
                </div>
              );
            })}

            {/* Mobile Log In action */}
            <div
              style={{
                marginTop: 16,
                paddingTop: 12,
                borderTop: "1px solid #e5e7eb",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                cursor: "pointer",
              }}
              onClick={() => {
                // Placeholder: hook this to real login navigation when available
                setMenuOpen(false);
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <User size={20} color="#111827" />
                <span
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    color: "#111827",
                  }}
                >
                  Log In
                </span>
              </div>
            </div>

            {/* Services submenu (already rendered above for Categories) */}

            {false && servicesOpen && (
              <div
                style={{
                  paddingTop: 8,
                  paddingBottom: 10,
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                {effectiveServices.map((label, index) => (
                  <div
                    key={index}
                    style={{
                      padding: "8px 4px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontSize: 15,
                      cursor: "pointer",
                    }}
                    onClick={() => {
                      try {
                        const raw = String(label || "");
                        const key = raw
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, "-")
                          .replace(/(^-|-$)/g, "");
                        scrollToSection("products");
                        setMenuOpen(false);
                        if (typeof window !== "undefined" && key) {
                          const evt = new CustomEvent("preview:service-click", {
                            detail: { label: raw, key },
                          });
                          window.dispatchEvent(evt);
                        }
                      } catch {}
                    }}
                  >
                    <span>{label}</span>
                    <span style={{ fontSize: 16 }}>›</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
