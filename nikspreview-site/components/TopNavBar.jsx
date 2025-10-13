import React, { useState } from "react";
import ProductsMenu from "./ProductsMenu";
import categoryThemes from "../utils/categoryThemes";

export default function TopNavBar({ businessName, categoryTree, selectedLeaf, onLeafSelect, categoryName }) {
  const [open, setOpen] = useState(false);

  // Use theme from props, fallback to 'default' if key missing
  const theme = categoryThemes[categoryName] || categoryThemes.default;

  const navItems = ["Benefits", "About", "Contact"];

  return (
    <header
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "15px 30px",
        backgroundColor: theme.background,
        color: theme.text,
        position: "sticky",
        top: 0,
        zIndex: 1000,
        fontFamily: "Poppins, sans-serif",
      }}
    >
      <div style={{ fontSize: "24px", fontWeight: "700", color: theme.primary }}>
        {businessName}
      </div>

      <nav style={{ position: "relative" }}>
        <ul style={{ display: "flex", gap: "20px", listStyle: "none", margin: 0, padding: 0 }}>
          {/* Home */}
          <li>
            <a
              onClick={(e) => {
                e.preventDefault();
                const el = document.getElementById("home");
                if (el) el.scrollIntoView({ behavior: "smooth" });
              }}
              style={{
                color: theme.text,
                textDecoration: "none",
                fontWeight: 500,
                fontSize: "16px",
                cursor: "pointer",
              }}
            >
              Home
            </a>
          </li>

          {/* Products Dropdown */}
          <li style={{ position: "relative" }}>
            <button
              onClick={() => setOpen(!open)}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                fontWeight: 500,
                fontSize: "16px",
                color: theme.text,
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
                  background: theme.background,
                  border: `1px solid ${theme.accent}`,
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
                    setOpen(false);
                    const el = document.getElementById("products");
                    if (el) el.scrollIntoView({ behavior: "smooth" });
                  }}
                  theme={theme}
                />
              </div>
            )}
          </li>

          {/* Other Nav Items */}
          {navItems.map((item) => (
            <li key={item}>
              <a
                href={`#${item.toLowerCase()}`}
                style={{
                  color: theme.text,
                  textDecoration: "none",
                  fontWeight: 500,
                  fontSize: "16px",
                  cursor: "pointer",
                }}
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
