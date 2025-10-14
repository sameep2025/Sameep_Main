import React, { useState } from "react";
import ProductsMenu from "./ProductsMenu";
import categoryThemes from "../utils/categoryThemes";

export default function TopNavBar({ businessName, categoryTree, selectedLeaf, onLeafSelect, categoryName, onCategoryClick }) {
  const [open, setOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState({});

  // Use theme from props, fallback to 'default' if key missing
  const theme = categoryThemes[categoryName] || categoryThemes.default;

  const navItems = ["Benefits", "About", "Contact"];
  
  // Determine the label based on categoryType
  const categoryType = categoryTree?.categoryType || "Services";
  const servicesLabel = categoryType === "Products" ? "Our Products" : 
                        categoryType === "Services" ? "Our Services" : 
                        "Our Products & Services";

  const toggleCategory = (categoryId) => {
    setExpandedCategories(prev => ({
      ...prev,
      [categoryId]: !prev[categoryId]
    }));
  };

  const handleCategoryClick = (category) => {
    if (onCategoryClick) {
      onCategoryClick(category);
      setOpen(false);
      // Scroll to the services section
      const el = document.getElementById("our-services");
      if (el) el.scrollIntoView({ behavior: "smooth" });
    }
  };

  // Recursive function to render category items with unlimited nesting
  const renderCategoryItem = (category, index, level) => {
    const categoryId = category.id || category._id || index;
    const hasChildren = category.children && category.children.length > 0;
    const isExpanded = expandedCategories[categoryId];
    const paddingLeft = level * 20;

    return (
      <div key={categoryId}>
        {/* Category Item */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 12px",
            paddingLeft: `${12 + paddingLeft}px`,
            cursor: "pointer",
            borderRadius: 6,
            transition: "background 0.2s ease",
            color: theme.text,
            fontSize: level === 0 ? "14px" : "13px",
            fontWeight: hasChildren ? 600 : 400,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = theme.accent + (level === 0 ? "20" : "15");
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          <span
            onClick={(e) => {
              e.stopPropagation();
              if (hasChildren) {
                toggleCategory(categoryId);
              } else {
                handleCategoryClick(category);
              }
            }}
            style={{ flex: 1 }}
          >
            {category.name}
          </span>
          {hasChildren && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                toggleCategory(categoryId);
              }}
              style={{ padding: "0 5px", fontSize: "12px" }}
            >
              {isExpanded ? "▼" : "▶"}
            </span>
          )}
        </div>

        {/* Nested Children - Recursive */}
        {hasChildren && isExpanded && (
          <div>
            {category.children.map((child, childIndex) => 
              renderCategoryItem(child, childIndex, level + 1)
            )}
          </div>
        )}
      </div>
    );
  };

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

          {/* Our Services/Products - show dropdown with nested subcategories */}
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
              {servicesLabel} ▾
            </button>

            {open && categoryTree?.children?.length > 0 && (
              <div
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
                  minWidth: 250,
                  maxHeight: 500,
                  overflowY: "auto",
                }}
              >
                {categoryTree.children.map((child, index) => 
                  renderCategoryItem(child, index, 0)
                )}
              </div>
            )}
          </li>

          {/* Other Nav Items */}
          {navItems.map((item) => (
            <li key={item}>
              <a
                onClick={(e) => {
                  e.preventDefault();
                  const el = document.getElementById(item.toLowerCase());
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
                {item}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
