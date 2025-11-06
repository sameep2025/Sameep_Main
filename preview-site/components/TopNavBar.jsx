import React, { useState, useEffect } from "react";
import ProductsMenu from "./ProductsMenu";

export default function TopNavBar({ businessName, categoryTree, selectedLeaf, onLeafSelect, onProductsClick }) {
  const [menuOpen, setMenuOpen] = useState(false); // mobile hamburger menu
  const [productsOpen, setProductsOpen] = useState(false); // products dropdown
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 0);

  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', onResize);
      setVw(window.innerWidth);
      return () => window.removeEventListener('resize', onResize);
    }
  }, []);

  const isMobile = vw <= 768;
  const isVerySmall = vw <= 640;



  const navItems = ["Benefits", "About", "Contact"];

  const handleSmoothNav = (id) => (e) => {
    e.preventDefault();
    const key = String(id || '').toLowerCase();
    // Benefits/About likely have IDs
    if (key === 'benefits' || key === 'about') {
      const el = document.getElementById(key);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    }
    // Home: scroll to top or first section
    if (key === 'home') {
      const hero = document.querySelector('#preview-page > section:first-of-type');
      if (hero) { hero.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    // Contact: find section containing the Connect With Us heading or the contact form
    if (key === 'contact') {
      const h = Array.from(document.querySelectorAll('#preview-page h2'))
        .find((n) => /connect\s+with\s+us/i.test(n.textContent || ''));
      if (h) { h.closest('section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      const form = document.querySelector('#preview-page form');
      if (form) { form.closest('section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    }
    // Fallback by id if present
    const el = document.getElementById(key);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <header
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: isMobile ? "12px 16px" : "15px 30px",
        backgroundColor: "#E4E7EC",
        position: "sticky",
        top: 0,
        zIndex: 1000,
        fontFamily: "Poppins, sans-serif",
      }}
    >
      {/* Left: Business Name */}
      <div style={{ fontSize: isMobile ? "18px" : "24px", fontWeight: "700", color: "#059669" }}>
        {businessName}
      </div>

      {/* Right: Nav */}
      {/* Hamburger button for very small devices */}
      {isVerySmall ? (
        <button
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          onClick={() => setMenuOpen((v) => !v)}
          style={{
            background: "transparent",
            border: "1px solid #d1d5db",
            borderRadius: 8,
            padding: '6px 8px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <span style={{ display: 'inline-block', width: 18, height: 2, background: '#111827', position: 'relative' }}>
            <span style={{ position: 'absolute', left: 0, right: 0, top: -6, height: 2, background: '#111827' }} />
            <span style={{ position: 'absolute', left: 0, right: 0, top: 6, height: 2, background: '#111827' }} />
          </span>
        </button>
      ) : null}

      <nav style={{ position: "relative", marginLeft: isMobile ? 8 : 0 }}>
        <ul style={{
          display: isVerySmall ? (menuOpen ? 'flex' : 'none') : 'flex',
          flexDirection: isVerySmall ? 'column' : 'row',
          position: isVerySmall ? 'absolute' : 'static',
          top: isVerySmall ? '100%' : 'auto',
          right: isVerySmall ? 0 : 'auto',
          background: isVerySmall ? '#ffffff' : 'transparent',
          border: isVerySmall ? '1px solid #e5e7eb' : 'none',
          borderRadius: isVerySmall ? 12 : 0,
          padding: isVerySmall ? 12 : 0,
          boxShadow: isVerySmall ? '0 10px 18px rgba(0,0,0,0.1)' : 'none',
          zIndex: 100,
          gap: isMobile ? "12px" : "20px",
          listStyle: "none",
          margin: 0,
          alignItems: isVerySmall ? 'flex-start' : 'center'
        }}>
          {/* Home */}
          <li key="Home">
            <a
              onClick={(e) => {
                handleSmoothNav('home')(e);
                if (isVerySmall) setMenuOpen(false);
                setProductsOpen(false);
              }}
              style={{
                color: "#333333",
                textDecoration: "none",
                fontWeight: 500,
                fontSize: isMobile ? "14px" : "16px",
                transition: "color 0.2s",
                cursor: "pointer",
              }}
            >
              Home
            </a>
          </li>

          {/* Products Dropdown */}
          <li style={{ position: "relative" }} key="Products">
            <button
              onClick={() => setProductsOpen((v) => !v)} // toggle dropdown
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                fontWeight: 500,
                fontSize: isMobile ? "14px" : "16px",
              }}
            >
              Our Services ▾
            </button>

            {productsOpen && categoryTree && !isVerySmall && (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                  zIndex: 100,
                  padding: 8,
                  minWidth: 220,
                }}
              >
                <ProductsMenu
                  root={categoryTree}
                  selectedLeaf={selectedLeaf}
                  onLeafSelect={(leaf) => {
                    onLeafSelect(leaf);
                    setProductsOpen(false); // close after selection
                    const el = document.getElementById("products");
                    if (el) el.scrollIntoView({ behavior: "smooth" });
                  }}
                />
              </div>
            )}
          </li>

          {/* Other nav items */}
          {navItems.map((item) => (
            <li key={item}>
              <a
                href={`#${item.toLowerCase()}`}
                style={{
                  color: "#333333",
                  textDecoration: "none",
                  fontWeight: 500,
                  fontSize: isMobile ? "14px" : "16px",
                  transition: "color 0.2s",
                }}
                onClick={(e) => {
                  handleSmoothNav(item)(e);
                  if (isVerySmall) setMenuOpen(false);
                  setProductsOpen(false);
                }}
                onMouseOver={(e) => (e.currentTarget.style.color = "#059669")}
                onMouseOut={(e) => (e.currentTarget.style.color = "#333333")}
              >
                {item}
              </a>
            </li>
          ))}
          {/* On very small devices, place the ProductsMenu inline within the dropdown list when open */}
          {isVerySmall && menuOpen && productsOpen && categoryTree ? (
            <li style={{ width: '100%' }}>
              <div style={{
                marginTop: 6,
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                padding: 8,
              }}>
                <ProductsMenu
                  root={categoryTree}
                  selectedLeaf={selectedLeaf}
                  onLeafSelect={(leaf) => {
                    onLeafSelect(leaf);
                    setProductsOpen(false);
                    setMenuOpen(false);
                    const el = document.getElementById('products');
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                  }}
                />
              </div>
            </li>
          ) : null}
        </ul>
      </nav>
    </header>
  );
}
