import React, { useState } from "react";
import ProductsMenu from "./ProductsMenu";

export default function TopNavBar({ businessName, categoryTree, selectedLeaf, onLeafSelect, onProductsClick }) {
  const [open, setOpen] = useState(false);

  const navItems = ["Benefits", "About", "Contact"];

  return (
    <header
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "15px 30px",
        backgroundColor: "#E4E7EC",
        position: "sticky",
        top: 0,
        zIndex: 1000,
        fontFamily: "Poppins, sans-serif",
      }}
    >
      {/* Left: Business Name */}
      <div style={{ fontSize: "24px", fontWeight: "700", color: "#059669" }}>
        {businessName}
      </div>

      {/* Right: Nav */}
      <nav style={{ position: "relative" }}>
        <ul style={{ display: "flex", gap: "20px", listStyle: "none", margin: 0, padding: 0 }}>
          {/* Home */}
          <li key="Home">
            <a
              onClick={(e) => {
                e.preventDefault();
                const el = document.getElementById("home");
                if (el) el.scrollIntoView({ behavior: "smooth" });
              }}
              style={{
                color: "#333333",
                textDecoration: "none",
                fontWeight: 500,
                fontSize: "16px",
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
              onClick={() => setOpen(!open)} // toggle dropdown
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                fontWeight: 500,
                fontSize: "16px",
              }}
            >
              Our Services ▾
            </button>

            {open && categoryTree && (
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
                    setOpen(false); // close after selection
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
                  fontSize: "16px",
                  transition: "color 0.2s",
                }}
                onMouseOver={(e) => (e.currentTarget.style.color = "#059669")}
                onMouseOut={(e) => (e.currentTarget.style.color = "#333333")}
              >
                {item}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
