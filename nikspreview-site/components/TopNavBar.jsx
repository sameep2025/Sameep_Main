import React, { useState, useEffect } from "react";
import { useCart } from "./CartContext";
import categoryThemes from "../utils/categoryThemes";

export default function TopNavBar({
  businessName,
  categoryTree,
  selectedLeaf,
  onLeafSelect,
  categoryName,
  onCategoryClick,
  theme: propTheme,
  availableColorSchemes = [],
  selectedTheme,
  setSelectedTheme,
}) {
  const [openDropdown, setOpenDropdown] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});
  const { totalItems, items, totalAmount, removeItem, clear } = useCart();
  const [showCart, setShowCart] = useState(false);

  // Set default theme on first render
  useEffect(() => {
    if (!selectedTheme && availableColorSchemes.length > 0) {
      const savedScheme = sessionStorage.getItem("selectedColorScheme");
      if (savedScheme) {
        setSelectedTheme(JSON.parse(savedScheme));
      } else {
        setSelectedTheme(availableColorSchemes[0]); // default to first scheme
      }
    }
  }, [availableColorSchemes, selectedTheme, setSelectedTheme]);

  const theme = selectedTheme || propTheme || categoryThemes[categoryName] || categoryThemes.default;
  const navItems = ["Benefits", "About", "Contact"];

  const toggleCategory = (categoryId) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [categoryId]: !prev[categoryId],
    }));
  };

  const handleCategoryClick = (category) => {
    if (onCategoryClick) {
      onCategoryClick(category);
      setOpenDropdown(null);
      const el = document.getElementById("our-services");
      if (el) el.scrollIntoView({ behavior: "smooth" });
    }
  };

  const collectAllProducts = (node) => {
    let products = [];
    if (!node) return products;
    if (node.categoryType === "Products") products.push(node);
    if (node.children && node.children.length > 0) {
      node.children.forEach((child) => {
        products = products.concat(collectAllProducts(child));
      });
    }
    if (node.products) products = products.concat(node.products);
    return products;
  };

  const collectCategoriesByType = (cats, type) => {
    if (!cats || !Array.isArray(cats)) return [];
    return cats.filter((cat) => {
      const cType = (cat.categoryType || "Services").toLowerCase();
      const catName = (cat.name || "").toLowerCase();
      if (type === "products") {
        return cType === "products" || catName.includes("product");
      } else if (type === "services") {
        return cType === "services" && !catName.includes("product");
      }
      return false;
    });
  };

  const separateCategories = (type) => {
    const children = categoryTree?.children ? [...categoryTree.children] : [];
    let filtered = collectCategoriesByType(children, type);
    if (type === "products" && filtered.length === 0) {
      filtered.push({
        _id: "fake-products",
        name: "Products",
        children: [],
        categoryType: "Products",
        products: [
          {
            _id: "fake-product",
            name: "Products will be available soon",
          },
        ],
      });
    }
    return filtered;
  };

  const renderCategoryItem = (category, index, level) => {
    const categoryId = category.id || category._id || index;
    const hasChildren = category.children && category.children.length > 0;
    const hasProducts = category.products && category.products.length > 0;
    const isExpanded = expandedCategories[categoryId];
    const paddingLeft = level * 20;

    return (
      <div key={categoryId}>
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
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren || hasProducts) {
              toggleCategory(categoryId);
            } else {
              handleCategoryClick(category);
            }
          }}
        >
          <span style={{ flex: 1 }}>{category.name}</span>

          {(hasChildren || hasProducts) && (
            <span
              style={{
                padding: "0 5px",
                fontSize: "12px",
                transition: "transform 0.2s ease",
                display: "inline-block",
                transform: isExpanded ? "rotate(0deg)" : "rotate(0deg)",
              }}
            >
              {isExpanded ? "▼" : "▶"}
            </span>
          )}
        </div>

        {hasProducts && isExpanded && (
          <div>
            {category.products.map((product) => (
              <div
                key={product.id || product._id}
                style={{
                  padding: "6px 12px",
                  paddingLeft: `${24 + paddingLeft}px`,
                  cursor: "pointer",
                  fontSize: "13px",
                  color: theme.text,
                  borderRadius: 4,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = theme.accent + "10";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
                onClick={() => handleCategoryClick(product)}
              >
                {product.name}
              </div>
            ))}
          </div>
        )}

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
      {/* Business name placeholder */}
      <div></div>

      <nav style={{ position: "relative", display: "flex", alignItems: "center", gap: 20 }}>
        <ul style={{ display: "flex", gap: "20px", listStyle: "none", margin: 0, padding: 0 }}>
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
          {separateCategories("products").length > 0 && (
            <li style={{ position: "relative" }}>
              <button
                onClick={() =>
                  setOpenDropdown(openDropdown === "products" ? null : "products")
                }
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 500,
                  fontSize: "16px",
                  color: theme.text,
                }}
              >
                Products ▾
              </button>

              {openDropdown === "products" && (
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
                  {separateCategories("products").map((cat, index) =>
                    renderCategoryItem(cat, index, 0)
                  )}
                </div>
              )}
            </li>
          )}

          {/* Services Dropdown */}
          {separateCategories("services").length > 0 && (
            <li style={{ position: "relative" }}>
              <button
                onClick={() =>
                  setOpenDropdown(openDropdown === "services" ? null : "services")
                }
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 500,
                  fontSize: "16px",
                  color: theme.text,
                }}
              >
                Services ▾
              </button>

              {openDropdown === "services" && (
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
                  {separateCategories("services").map((cat, index) =>
                    renderCategoryItem(cat, index, 0)
                  )}
                </div>
              )}
            </li>
          )}

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

        {/* Color Theme Selector with Preview */}
        {availableColorSchemes && availableColorSchemes.length > 0 && setSelectedTheme && (
          <div style={{ marginLeft: 20, display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
            <span style={{ fontWeight: 500, color: "#475569" }}>Theme:</span>

            {/* Dropdown button */}
            <div
              onClick={() => setOpenDropdown(openDropdown === "theme" ? null : "theme")}
              style={{
                padding: "4px 8px",
                borderRadius: 6,
                border: "1px solid #cbd5e1",
                cursor: "pointer",
                minWidth: 120,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "#fff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    display: "inline-block",
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    background: selectedTheme?.primary || "#000",
                    border: "1px solid #cbd5e1",
                  }}
                ></span>
                <span>{selectedTheme?.name || "Select"}</span>
              </div>
              <span style={{ fontSize: 12 }}>{openDropdown === "theme" ? "▲" : "▼"}</span>
            </div>

            {/* Dropdown list */}
            {openDropdown === "theme" && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  marginTop: 4,
                  background: "#fff",
                  border: "1px solid #cbd5e1",
                  borderRadius: 6,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                  zIndex: 100,
                  maxHeight: 200,
                  overflowY: "auto",
                }}
              >
                {availableColorSchemes.map((scheme) => (
                  <div
                    key={scheme.name}
                    onClick={() => {
                      setSelectedTheme(scheme);
                      sessionStorage.setItem("selectedColorScheme", JSON.stringify(scheme));
                      setOpenDropdown(null);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 12px",
                      cursor: "pointer",
                      background: selectedTheme?.name === scheme.name ? "#e2e8f0" : "#fff",
                      transition: "background 0.2s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#e2e8f0")}
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background =
                        selectedTheme?.name === scheme.name ? "#e2e8f0" : "#fff")
                    }
                  >
                    <span
                      style={{
                        display: "inline-block",
                        width: 16,
                        height: 16,
                        borderRadius: 4,
                        background: scheme.primary,
                        border: "1px solid #cbd5e1",
                      }}
                    ></span>
                    <span>{scheme.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {/* Cart Button */}
        <div style={{ marginLeft: 16, position: "relative" }}>
          <button
            onClick={() => setShowCart(true)}
            style={{
              background: theme.accent,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            My Cart ({totalItems || 0})
          </button>
        </div>
      </nav>

      {/* Cart Modal */}
      {showCart && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={() => setShowCart(false)}
        >
          <div
            style={{
              width: "95%",
              maxWidth: 700,
              background: "#fff",
              borderRadius: 12,
              padding: 16,
              color: "#0f172a",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>My Cart</h3>
              <button onClick={() => setShowCart(false)} style={{ background: "transparent", border: "none", fontSize: 18, cursor: "pointer" }}>✕</button>
            </div>

            {items && items.length > 0 ? (
              <div>
                {items.map((it) => (
                  <div key={it.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #e2e8f0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {it.imageUrl && (
                        <img src={it.imageUrl.startsWith("http") ? it.imageUrl : `http://localhost:5000${it.imageUrl}`} alt={it.name} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6 }} />
                      )}
                      <div>
                        <div style={{ fontWeight: 600 }}>{it.name}</div>
                        <div style={{ fontSize: 12, color: "#475569" }}>Qty: {it.quantity} × ₹{it.price}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ fontWeight: 700 }}>₹{(it.price * it.quantity).toFixed(2)}</div>
                      <button onClick={() => removeItem(it.id)} style={{ background: "#fee2e2", color: "#991b1b", border: "none", borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}>Remove</button>
                    </div>
                  </div>
                ))}

                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 12, fontWeight: 700 }}>
                  <span>Total</span>
                  <span>₹{totalAmount.toFixed(2)}</span>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
                  <button onClick={clear} style={{ background: "#f1f5f9", border: "none", borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}>Clear Cart</button>
                  <button onClick={() => alert("Checkout coming soon")} style={{ background: theme.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}>Checkout</button>
                </div>
              </div>
            ) : (
              <div style={{ padding: 20, textAlign: "center", color: "#64748b" }}>Your cart is empty.</div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
