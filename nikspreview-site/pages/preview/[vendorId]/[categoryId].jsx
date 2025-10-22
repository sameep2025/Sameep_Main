"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";

import TopNavBar from "../../../components/TopNavBar";
import { CartProvider } from "../../../components/CartContext";
import { useCart } from "../../../components/CartContext";
import BenefitsSection from "../../../components/BenefitsSection";
import AboutSection from "../../../components/AboutSection";
import ContactSection from "../../../components/ContactSection";
import Footer from "../../../components/Footer";
import FullPageShimmer from "../../../components/FullPageShimmer";
import categoryThemes from "../../../utils/categoryThemes";



/* Helper Functions */
const resolveImageUrl = (url) => {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return `http://localhost:5000${url}`;
};

const getNodeId = (n) => n?.id || n?._id || Math.random().toString(36).slice(2, 9);

const sortByPrice = (items) => {
  if (!items || !Array.isArray(items)) return items;
  return [...items].sort((a, b) => {
    const priceA = a.vendorPrice ?? a.price ?? Infinity;
    const priceB = b.vendorPrice ?? b.price ?? Infinity;
    return priceA - priceB;
  });
};

const findLowestPrice = (node) => {
  if (!node) return null;
  let lowest = Infinity;
  const traverse = (n) => {
    if (n.vendorPrice || n.price) {
      const price = n.vendorPrice ?? n.price;
      if (price < lowest) lowest = price;
    }
    if (n.children && n.children.length > 0) {
      n.children.forEach(traverse);
    }
  };
  traverse(node);
  return lowest === Infinity ? null : lowest;
};

/* NEW Helper: find parent of a node by id in the category tree */
const findParent = (targetId, root) => {
  if (!root || !root.children) return null;
  let parent = null;
  const dfs = (node, parentNode) => {
    if (!node) return;
    const id = node._id || node.id;
    if (id === targetId) {
      parent = parentNode;
      return;
    }
    if (node.children && node.children.length) {
      for (let child of node.children) {
        if (parent) break;
        dfs(child, node);
      }
    }
    // also check any nested products that might be objects in node.products (unlikely to have children, but safe)
    if (!parent && node.products && node.products.length) {
      for (let p of node.products) {
        const pid = p._id || p.id;
        if (pid === targetId) {
          parent = node;
          break;
        }
      }
    }
  };
  dfs(root, null);
  return parent;
};

/* Image Box */
const ImgBox = ({ src, alt }) => {
  const imgUrl = resolveImageUrl(src);
  return (
    <div
      style={{
        height: 160,
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#F8FAFC",
        borderRadius: 14,
        overflow: "hidden",
      }}
    >
      {imgUrl ? (
        <img
          src={imgUrl}
          alt={alt}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          onError={(e) => {
            e.currentTarget.style.display = "none";
            e.currentTarget.parentElement.innerHTML =
              '<span style="color: #94a3b8; fontSize: 13px">Image failed to load</span>';
          }}
        />
      ) : (
        <span style={{ color: "#94a3b8", fontSize: 13 }}>No image</span>
      )}
    </div>
  );
};

/* Category Card */
const CategoryCard = ({ node, onClick, themeColor, cardBg, accentColor, isHighlighted }) => {
  const lowestPrice = findLowestPrice(node);
  const hasSubcategories = node.children && node.children.length > 0;
  const hasImage = node.imageUrl && resolveImageUrl(node.imageUrl);
  
  return (
    <div
      onClick={() => onClick(node)}
      style={{
        background: isHighlighted ? `linear-gradient(135deg, ${themeColor}95, ${accentColor}95)` : cardBg,

        borderRadius: 12,
        boxShadow: isHighlighted ? `0 8px 28px ${themeColor}90, 0 0 0 3px ${accentColor}40` : "0 4px 12px rgba(0,0,0,0.08)",

        border: isHighlighted ? `3px solid ${accentColor}` : `1.5px solid ${themeColor}`,

        padding: 14,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        cursor: "pointer",
        transition: "transform 0.25s ease, box-shadow 0.25s ease, background 0.3s ease",
        transform: isHighlighted ? "scale(1.05)" : "scale(1)",
        minHeight: hasImage ? "auto" : "130px",
      }}
      onMouseEnter={(e) => {
        if (!isHighlighted) {
          e.currentTarget.style.transform = "translateY(-5px)";
          e.currentTarget.style.boxShadow = `0 10px 20px ${themeColor}25`;
        }
      }}
      onMouseLeave={(e) => {
        if (!isHighlighted) {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.08)";
        }
      }}
    >
      {hasImage && <ImgBox src={node.imageUrl} alt={node.name} />}
      <h3 style={{ fontSize: 15, fontWeight: 600, margin: hasImage ? "10px 0 6px" : "0 0 6px", color: themeColor, textAlign: "center" }}>
        {node.name}
      </h3>
      {lowestPrice ? (
        <div
          style={{
            background: `linear-gradient(135deg, ${accentColor}, ${themeColor})`,
            color: "#fff",
            fontSize: 16,
            fontWeight: 700,
            borderRadius: 6,
            padding: "6px 12px",
            boxShadow: `0 3px 10px ${accentColor}40`,
            marginTop: 6,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div style={{ position: "relative", zIndex: 1 }}>
            {hasSubcategories ? `Starts from ₹${lowestPrice}` : `₹${lowestPrice}`}
          </div>
          <div
            style={{
              position: "absolute",
              top: 0,
              right: -20,
              width: 40,
              height: "100%",
              background: "rgba(255,255,255,0.1)",
              transform: "skewX(-15deg)",
            }}
          />
        </div>
      ) : (
        <p style={{ color: "#64748b", fontSize: 13, marginTop: 6 }}>No pricing yet</p>
      )}
    </div>
  );
};

/* Product Card */
/* Product Card */
const ProductCard = ({ node, vendorId, themeColor, cardBg, accentColor, categoryType, isHighlighted }) => {
  const displayPrice = node.vendorPrice ?? node.price;
  const nodeCategoryType = node.categoryType || categoryType || "Services";
  const isProducts = nodeCategoryType === "Products";
  const hasImage = node.imageUrl && resolveImageUrl(node.imageUrl);
  const { addItem: addToCart } = useCart();
  const [qty, setQty] = React.useState(1);
  const handleAdd = () => {
    const quantity = Math.max(1, parseInt(qty || 1, 10));
    addToCart(node, quantity);
    alert("Added to cart successfully.");
  };
  
  return (
    <div
      style={{
        background: isHighlighted ? `linear-gradient(135deg, ${themeColor}15, ${accentColor}15)` : cardBg,
        borderRadius: 12,
        boxShadow: isHighlighted ? `0 8px 24px ${themeColor}40` : "0 4px 12px rgba(0,0,0,0.08)",
        border: isHighlighted ? `2.5px solid ${themeColor}` : `1.5px solid ${themeColor}`,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        transition: "transform 0.25s ease, box-shadow 0.25s ease, background 0.3s ease",
        overflow: "hidden",
        height: "100%",
        minHeight: hasImage ? "320px" : "200px",
        transform: isHighlighted ? "scale(1.05)" : "scale(1)",
      }}
      onMouseEnter={(e) => {
        if (!isHighlighted) {
          e.currentTarget.style.transform = "translateY(-5px)";
          e.currentTarget.style.boxShadow = `0 10px 20px ${themeColor}25`;
        }
      }}
      onMouseLeave={(e) => {
        if (!isHighlighted) {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.08)";
        }
      }}
    >
      {hasImage && <ImgBox src={node.imageUrl} alt={node.name} />}
      <h3
        style={{
          fontSize: 17,
          fontWeight: 600,
          margin: hasImage ? "12px 0 8px" : "0 0 8px",
          color: themeColor,
          textAlign: "center",
        }}
      >
        {node.name}
      </h3>

      {displayPrice && (
        <div
          style={{
            background: `linear-gradient(135deg, ${accentColor}, ${themeColor})`,
            color: "#fff",
            fontSize: 20,
            fontWeight: 700,
            borderRadius: 8,
            padding: "10px 20px",
            marginBottom: 10,
            whiteSpace: "nowrap",
            boxShadow: `0 4px 12px ${accentColor}40`,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div style={{ position: "relative", zIndex: 1 }}>₹{displayPrice}</div>
          <div
            style={{
              position: "absolute",
              top: 0,
              right: -20,
              width: 40,
              height: "100%",
              background: "rgba(255,255,255,0.1)",
              transform: "skewX(-15deg)",
            }}
          />
        </div>
      )}

      {node.terms && node.terms.trim() && (
        <ul
          style={{
            width: "100%",
            textAlign: "left",
            fontSize: 12,
            color: "#1e293b",
            marginBottom: 10,
            lineHeight: "1.4em",
            paddingLeft: 18,
            flex: 1,
            overflowY: "auto",
            maxHeight: 120,
            margin: "8px 0",
          }}
        >
          {node.terms
            .split(",")
            .filter((t) => t.trim())
            .map((t, i) => (
              <li key={i} style={{ marginBottom: 3 }}>
                {t.trim()}
              </li>
            ))}
        </ul>
      )}

      <div style={{ display: "flex", gap: 8, width: "100%", marginTop: "auto", alignItems: "center" }}>
        <input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          style={{
            width: 70,
            padding: "8px 10px",
            border: `1px solid ${themeColor}`,
            borderRadius: 8,
            fontWeight: 600,
          }}
        />
        <button
          onClick={handleAdd}
          style={{
            flex: 1,
            padding: "8px 12px",
            background: `linear-gradient(90deg, ${themeColor}, ${accentColor})`,
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontWeight: 600,
            cursor: "pointer",
            transition: "opacity 0.3s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = 0.85)}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = 1)}
        >
          Add to Cart
        </button>
      </div>
    </div>
  );
};


/* Overlay Modal */
const OverlayModal = ({
  stack,
  setStack,
  vendorId,
  themeColor,
  cardBg,
  accentColor,
  categoryName,
  categoryType,
  selectedCategoryId,
  setSelectedCategoryId,
}) => {
  if (!stack.length) return null;
  const current = stack[stack.length - 1];
  const push = (n) => setStack([...stack, n]);
  const goBack = () => setStack(stack.slice(0, -1));
  const close = () => setStack([]);

  const gridMinWidth = "220px";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        zIndex: 9999,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "40px 20px",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          background: cardBg,
          borderRadius: 20,
          width: "90%",
          maxWidth: 1000,
          maxHeight: "85vh",
          padding: 24,
          position: "relative",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            marginBottom: 20,
            display: "flex",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          {stack.length > 1 ? (
            <button
              onClick={goBack}
              style={{
                border: "none",
                background: "none",
                color: themeColor,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              ← Back
            </button>
          ) : (
            <div />
          )}
          <button
            onClick={close}
            style={{
              border: "none",
              background: "none",
              color: themeColor,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            ✕ Close
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(auto-fill, minmax(${gridMinWidth}, 1fr))`,
            gap: 16,
            justifyContent: "center",
            alignItems: "start",
            overflowY: "auto",
            paddingRight: 10,
          }}
        >
          {current.children?.length ? (
            sortByPrice(current.children).map((child) => {
              const hasChildren = child.children && child.children.length > 0;
              const isHighlighted = selectedCategoryId === (child._id || child.id);
              
              return (
                <div
                  key={getNodeId(child)}
                  onClick={() => setSelectedCategoryId(child._id || child.id)}
                  style={{ cursor: "pointer" }}
                >
                  {hasChildren ? (
                    <CategoryCard
                      node={child}
                      onClick={(category) => {
                        console.log("🔍 Overlay CategoryCard clicked:", category.name);
                        console.log("🔍 Has children?", category.children?.length);
                        
                        if (category.children && category.children.length > 0) {
                          console.log("✅ Pushing to stack to show subcategories");
                          push(category); // Navigate deeper into subcategories
                          setSelectedCategoryId(null); // Reset highlight
                        } else {
                          console.log("✅ Just highlighting leaf category");
                          setSelectedCategoryId(category._id || category.id);
                        }
                      }}
                      themeColor={themeColor}
                      cardBg={cardBg}
                      accentColor={accentColor}
                      isHighlighted={isHighlighted}
                    />
                  ) : (
                    <ProductCard
                      node={child}
                      vendorId={vendorId}
                      themeColor={themeColor}
                      cardBg={cardBg}
                      accentColor={accentColor}
                      categoryType={categoryType}
                      isHighlighted={isHighlighted}
                    />
                  )}
                </div>
              );
            })
          ) : (
            <p style={{ color: "#64748b", textAlign: "center" }}>No items found.</p>
          )}
        </div>
      </div>
    </div>
  );
};



/* Color Scheme Picker Popup */
const ColorSchemePickerPopup = ({ availableSchemes, onSelectScheme, onClose }) => {
  if (!availableSchemes || availableSchemes.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.8)",
        backdropFilter: "blur(8px)",
        zIndex: 99999,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "20px",
        animation: "fadeIn 0.3s ease",
      }}
    >
      <div
        style={{
          background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
          borderRadius: 24,
          padding: "40px 30px",
          maxWidth: 500,
          width: "100%",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
          position: "relative",
          animation: "slideUp 0.4s ease",
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 15,
            right: 15,
            background: "#ef4444",
            color: "#fff",
            border: "none",
            borderRadius: "50%",
            width: 32,
            height: 32,
            cursor: "pointer",
            fontSize: 18,
            fontWeight: "bold",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#dc2626";
            e.currentTarget.style.transform = "scale(1.1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#ef4444";
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          ✕
        </button>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 30 }}>
          <h2
            style={{
              fontSize: 28,
              fontWeight: 700,
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              marginBottom: 8,
            }}
          >
            🎨 Choose Your Color Theme
          </h2>
          <p style={{ color: "#64748b", fontSize: 15 }}>
            Pick a color scheme that matches your style
          </p>
        </div>

        {/* Color scheme options */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))",
            gap: 16,
            marginBottom: 20,
          }}
        >
          {availableSchemes.map((scheme, index) => (
            <div
              key={index}
              onClick={() => onSelectScheme(scheme)}
              style={{
                cursor: "pointer",
                textAlign: "center",
                transition: "transform 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "scale(1.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: 80,
                  borderRadius: 16,
                  background: `linear-gradient(135deg, ${scheme.primary}, ${scheme.accent})`,
                  boxShadow: `0 8px 20px ${scheme.primary}40`,
                  border: "3px solid #fff",
                  marginBottom: 8,
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {/* Shine effect */}
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: -100,
                    width: 50,
                    height: "100%",
                    background: "rgba(255, 255, 255, 0.3)",
                    transform: "skewX(-20deg)",
                    animation: "shine 3s infinite",
                  }}
                />
              </div>
              <span
                style={{
                  fontSize: 12,
                  color: "#475569",
                  fontWeight: 500,
                }}
              >
                {scheme.name}
              </span>
            </div>
          ))}
        </div>

        {/* Use default button */}
        <button
          onClick={onClose}
          style={{
            width: "100%",
            padding: "12px 20px",
            background: "linear-gradient(135deg, #64748b, #475569)",
            color: "#fff",
            border: "none",
            borderRadius: 12,
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow = "0 8px 20px rgba(0, 0, 0, 0.2)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          Continue with Default Theme
        </button>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes shine {
          0% { left: -100px; }
          50% { left: 100%; }
          100% { left: 100%; }
        }
      `}</style>
    </div>
  );
};

/* Main Component */
function PreviewPage() {
  const router = useRouter();
  const { vendorId, categoryId } = router.query;
  const [vendor, setVendor] = useState(null);
  const [categoryTree, setCategoryTree] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stack, setStack] = useState([]);
  const [activeTab, setActiveTab] = useState("all");
  const [highlightedCategory, setHighlightedCategory] = useState(null);
  const [selectedLeafCategory, setSelectedLeafCategory] = useState(null);
  
  // Color scheme picker states
  
  const [availableColorSchemes, setAvailableColorSchemes] = useState([]);
  const [selectedTheme, setSelectedTheme] = useState(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  useEffect(() => {
  if (!categoryTree) return;

  const fetchColorSchemes = async () => {
    try {
      const res = await fetch("http://localhost:5000/api/categories/colors/parents");
      const allCategories = await res.json();

      // Find matching category
      const currentCategory = allCategories.find(
        (cat) => cat.name.toLowerCase() === categoryTree.name.toLowerCase()
      );

      let schemes = [];
      if (currentCategory?.colorSchemes?.length > 0) {
        schemes = currentCategory.colorSchemes;
      } else {
        // fallback default 5 schemes
        schemes = [
          { name: "Ocean Blue", primary: "#0EA5E9", accent: "#38BDF8", background: "#F0F9FF", cardBg: "#E0F2FE", text: "#075985" },
          { name: "Sunset Orange", primary: "#F59E0B", accent: "#FBBF24", background: "#FFFAEB", cardBg: "#FFF6D9", text: "#92400E" },
          { name: "Forest Green", primary: "#059669", accent: "#10B981", background: "#ECFDF5", cardBg: "#D1FAE5", text: "#065F46" },
          { name: "Royal Purple", primary: "#8B5CF6", accent: "#A78BFA", background: "#F5F3FF", cardBg: "#EDE9FE", text: "#5B21B6" },
          { name: "Rose Pink", primary: "#E75480", accent: "#FDBA74", background: "#FFF1F2", cardBg: "#FFE4E6", text: "#7C2D12" },
        ];
      }

      setAvailableColorSchemes(schemes);

      // Show picker if not already selected
      if (!sessionStorage.getItem("colorSchemeSelected")) {
        setShowColorPicker(true);
      }
    } catch (err) {
      console.error("Error fetching color schemes:", err);
    }
  };

  fetchColorSchemes();
}, [categoryTree]);



  // // Fetch color schemes from backend API
  // useEffect(() => {
  //   if (!categoryTree) return;
    
  //   const fetchColorSchemes = async () => {
  //     try {
  //       console.log("🎨 Fetching color schemes for category:", categoryTree.name);
        
  //       // Fetch all parent categories with color schemes
  //       const response = await fetch("http://localhost:5000/api/categories/colors/parents");
  //       const allCategories = await response.json();
        
  //       console.log("🎨 All categories from API:", allCategories);
        
  //       // Find the current category's color schemes
  //       const currentCategory = allCategories.find(
  //         cat => cat.name.toLowerCase() === categoryTree.name.toLowerCase()
  //       );
        
  //       console.log("🎨 Current category match:", currentCategory);
        
  //       let schemes = [];
  //       if (currentCategory && currentCategory.colorSchemes && currentCategory.colorSchemes.length > 0) {
  //         schemes = currentCategory.colorSchemes;
  //         console.log("✅ Found color schemes from database:", schemes);
  //       } else {
  //         // Fallback to default schemes if none in database
  //         console.log("⚠️ No color schemes in database, using defaults");
  //         schemes = [
  //           {
  //             name: "Ocean Blue",
  //             primary: "#0EA5E9",
  //             accent: "#38BDF8",
  //             background: "#F0F9FF",
  //             cardBg: "#E0F2FE",
  //             text: "#075985"
  //           },
  //           {
  //             name: "Sunset Orange",
  //             primary: "#F59E0B",
  //             accent: "#FBBF24",
  //             background: "#FFFAEB",
  //             cardBg: "#FFF6D9",
  //             text: "#92400E"
  //           },
  //           {
  //             name: "Forest Green",
  //             primary: "#059669",
  //             accent: "#10B981",
  //             background: "#ECFDF5",
  //             cardBg: "#D1FAE5",
  //             text: "#065F46"
  //           },
  //           {
  //             name: "Royal Purple",
  //             primary: "#8B5CF6",
  //             accent: "#A78BFA",
  //             background: "#F5F3FF",
  //             cardBg: "#EDE9FE",
  //             text: "#5B21B6"
  //           },
  //           {
  //             name: "Rose Pink",
  //             primary: "#E75480",
  //             accent: "#FDBA74",
  //             background: "#FFF1F2",
  //             cardBg: "#FFE4E6",
  //             text: "#7C2D12"
  //           }
  //         ];
  //       }
        
  //       setAvailableColorSchemes(schemes);
        
  //       // Show popup if user hasn't selected yet
  //       if (!sessionStorage.getItem("colorSchemeSelected")) {
  //         setTimeout(() => {
  //           console.log("🎨 Showing color picker popup with", schemes.length, "schemes");
  //           setShowColorPicker(true);
  //         }, 1000); // Show after 1 second
  //       } else {
  //         console.log("🎨 Color scheme already selected in this session");
  //       }
  //     } catch (err) {
  //       console.error("❌ Error fetching color schemes:", err);
  //     }
  //   };
    
  //   fetchColorSchemes();
  // }, [categoryTree]);

  useEffect(() => {
    if (!router.isReady || !vendorId) return;

    const fetchData = async () => {
      try {
        // Fetch from preview API which returns both vendor and categories
        const response = await fetch(`/api/vendors/${vendorId}/preview/${categoryId}`);
        const data = await response.json();
        
        console.log("📦 Preview API Response:", data);
        
        // Set vendor data from preview API
        setVendor(data.vendor || {});
        setCategoryTree(data.categories || { name: "Root", children: [] });
      } catch (err) {
        console.error("Error fetching data:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [router.isReady, vendorId, categoryId]);

  // Handle color scheme selection
  const handleColorSchemeSelect = (scheme) => {
    setSelectedTheme(scheme);
    setShowColorPicker(false);
    sessionStorage.setItem("colorSchemeSelected", "true");
    sessionStorage.setItem("selectedColorScheme", JSON.stringify(scheme));
  };

  
  if (loading) return <FullPageShimmer />;
  if (!vendor || !categoryTree) return <p>No data found.</p>;

  // Use selected theme or fallback to hardcoded theme
  const theme = selectedTheme || categoryThemes[categoryTree.name.toLowerCase()] || categoryThemes.default;
  const { primary, accent, cardBg, background } = theme;

  const categoryType = categoryTree.categoryType || "Services";
  const isProducts = categoryType === "Products";
  const isServices = categoryType === "Services";
  const isBoth = categoryType === "Products & Services";

  // Force TopNavBar to show Products for Tutor & Driving School
  const forcedProducts = ["tutor", "driving school"].includes(categoryTree.name.toLowerCase());

  const sectionLabel = isProducts ? "Our Products" : "Our Services";
  const itemLabel = isProducts ? "product" : "service";

  /* ----------- Helpers for nested product handling ----------- */
  // Helper to collect all products nested inside children recursively
  const collectAllProducts = (node) => {
  let products = [];
  if (!node) return products;

  // If node itself is a product, include it
  if (node.categoryType === "Products") products.push(node);

  // Include products in node.products array if exists
  if (node.products && node.products.length > 0) {
    products = products.concat(node.products);
  }

  // Recursively collect from children
  if (node.children && node.children.length > 0) {
    node.children.forEach((child) => {
      products = products.concat(collectAllProducts(child));
    });
  }

  return products;
};


  // Updated getFilteredChildren
  const getFilteredChildren = () => {
    if (selectedLeafCategory) return [selectedLeafCategory];
    if (!categoryTree.children) return [];

    let children = categoryTree.children;

    // If the current category is configured as Products in DB,
    // show only product leaves across the entire subtree
    if (isProducts) {
      const allProducts = collectAllProducts(categoryTree);
      return allProducts;
    }

    // If root is a Service but has Products nested, we still want to show Products
    if (categoryTree.categoryType === "Services") {
      const allProducts = collectAllProducts(categoryTree);
      if (allProducts.length > 0) {
        children = [...children, ...allProducts];
      }
    }

    if (isBoth || forcedProducts) {
      if (activeTab === "all") return children;
      return children.filter((child) => {
        const childType = child.categoryType || "Products";
        if (activeTab === "products")
          return childType === "Products" || childType === "Products & Services";
        if (activeTab === "services")
          return childType === "Services" || childType === "Products & Services";
        return true;
      });
    }

    // For Services root: strictly services-only
    return children.filter((child) => {
      const childType = child.categoryType || "Services";
      return childType === "Services";
    });
  };

  const filteredChildren = getFilteredChildren();

  /* ---------- Updated onCategoryClick behavior ----------
     - If clicked category is a leaf (no children), try to find its parent
     - If parent exists: scroll to services section, open overlay with parent, and highlight the clicked leaf
     - If no parent: fallback to original leaf behavior
  */
  const handleCategoryClick = (category) => {
    const catId = category._id || category.id;
    console.log("🔍 Category clicked:", category.name, "ID:", catId);
    console.log("🔍 Has children?", category.children?.length > 0);
    
    if (category.children && category.children.length > 0) {
      console.log("✅ Opening overlay for parent category with children");
      setStack([category]);
      setHighlightedCategory(category._id || category.id);
      setSelectedLeafCategory(null);
      // scroll main section into view (optional UX)
      setTimeout(() => {
        const mainEl = document.getElementById("our-services");
        if (mainEl) mainEl.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    } else {
      // Leaf clicked - find parent to check if it has siblings
      console.log("✅ Leaf category clicked:", category.name);
      const parent = findParent(catId, categoryTree);
      console.log("🔍 Found parent:", parent?.name || "None");
      
      const mainEl = document.getElementById("our-services");
      if (mainEl) mainEl.scrollIntoView({ behavior: "smooth", block: "start" });

      if (parent && parent.children && parent.children.length > 1) {
        // Has siblings - show all siblings with this one highlighted
        console.log("✅ Has siblings, showing all with highlight on:", category.name);
        setHighlightedCategory(catId);
        setTimeout(() => {
          setStack([parent]);
          setSelectedLeafCategory(null);
        }, 200);
      } else {
        // No siblings - show only this category
        console.log("✅ No siblings, showing ONLY:", category.name);
        const wrapperParent = {
          _id: `wrapper-${catId}`,
          name: category.name,
          children: [category],
        };
        setHighlightedCategory(catId);
        setTimeout(() => {
          setStack([wrapperParent]);
          setSelectedLeafCategory(null);
        }, 200);
      }
    }
  };

  return (
    <>
      {/* Color Scheme Picker Popup */}
      

      <CartProvider>
      <div style={{ fontFamily: "Poppins, sans-serif", background, minHeight: "100vh" }}>
      <TopNavBar
        businessName={vendor.businessName}
        categoryTree={categoryTree}
        categoryName={categoryTree.name.toLowerCase()}
        onCategoryClick={(category) => handleCategoryClick(category)}
        theme={theme}
         availableColorSchemes={availableColorSchemes}  // ADD
  selectedTheme={selectedTheme}                  // ADD
  setSelectedTheme={setSelectedTheme} 
      />
     


      {/* HERO / BANNER */}
      <section
        id="home"
        style={{
          height: 480,
          backgroundImage: `url(${resolveImageUrl(categoryTree.imageUrl)})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          color: "#fff",
          position: "relative",
        }}
      >
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)" }} />
        <div style={{ zIndex: 1, textAlign: "center", maxWidth: 800, padding: 20 }}>
          <h1 style={{ fontSize: 44, fontWeight: 700, marginBottom: 20 }}>
            {vendor.contactName} {categoryTree.name}
          </h1>
    <p
  style={{
    fontSize: 18,
    opacity: 0.95,
    marginTop: 10,
    lineHeight: "1.6",
    maxWidth: 700,
    margin: "0 auto",
  }}
>
  {vendor ? (
    <>
      With over 10 years of experience in the {categoryTree?.name?.toLowerCase() || "services"} industry, {vendor.contactName || vendor.businessName} is dedicated to providing top-notch care for your clients.
      <br />
      At our main business location in {vendor.location?.areaCity || "your area"}
      {vendor.location?.homeLocation &&
        `, and home services at ${
          typeof vendor.location.homeLocation === "string"
            ? vendor.location.homeLocation
            : vendor.location.homeLocation.name || "your home location"
        }`}
      , we offer a wide range of products and services designed to keep your customers satisfied and happy.
      {vendor.location?.nearbyLocations?.length > 0 && (
        <> We proudly extend our services to surrounding areas, including {vendor.location.nearbyLocations.join(", ")}.</>
      )}
    </>
  ) : (
    `Your trusted partner for premium ${categoryTree?.name?.toLowerCase() || "services"} services. We deliver quality, reliability, and excellence in every service we provide.`
  )}
</p>



        </div>
      </section>

      {/* MAIN CONTENT */}
      <main id="our-services" style={{ maxWidth: 1200, margin: "60px auto", padding: "0 24px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 30,
          }}
        >
          <h2 style={{ fontSize: 32, fontWeight: 700, color: primary, margin: 0 }}>
            {selectedLeafCategory ? selectedLeafCategory.name : sectionLabel}
          </h2>
          {selectedLeafCategory && (
            <button
              onClick={() => {
                setSelectedLeafCategory(null);
                setHighlightedCategory(null);
              }}
              style={{
                padding: "10px 20px",
                background: `linear-gradient(90deg, ${primary}, ${accent})`,
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
                transition: "opacity 0.3s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = 0.85)}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = 1)}
            >
              ← Show All {sectionLabel}
            </button>
          )}
        </div>

        {/* Tabs for Products & Services */}
        {(isBoth || forcedProducts) && !selectedLeafCategory && (
          <div
            style={{
              display: "flex",
              gap: 12,
              marginBottom: 30,
              borderBottom: `2px solid ${primary}20`,
              paddingBottom: 0,
            }}
          >
            {["all", "products", "services"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: "12px 24px",
                  background: activeTab === tab ? `linear-gradient(90deg, ${primary}, ${accent})` : "transparent",
                  color: activeTab === tab ? "#fff" : primary,
                  border: "none",
                  borderBottom: activeTab === tab ? `3px solid ${accent}` : "3px solid transparent",
                  fontWeight: 600,
                  fontSize: 16,
                  cursor: "pointer",
                  transition: "all 0.3s ease",
                  borderRadius: "8px 8px 0 0",
                }}
                onMouseEnter={(e) => {
                  if (activeTab !== tab) e.currentTarget.style.background = `${primary}10`;
                }}
                onMouseLeave={(e) => {
                  if (activeTab !== tab) e.currentTarget.style.background = "transparent";
                }}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: selectedLeafCategory
              ? "repeat(auto-fill, minmax(300px, 1fr))"
              : "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 30,
          }}
        >
          {filteredChildren.length ? (
            sortByPrice(filteredChildren).map((cat) => {
              const isLeaf = !cat.children || cat.children.length === 0;

              return isLeaf ? (
                <ProductCard
                  key={getNodeId(cat)}
                  node={cat}
                  vendorId={vendorId}
                  themeColor={primary}
                  cardBg={cardBg}
                  accentColor={accent}
                  categoryType={categoryType}
                />
              ) : (
                <CategoryCard
                  key={getNodeId(cat)}
                  node={cat}
                  onClick={(category) => {
                    console.log("🔍 CategoryCard clicked:", category.name);
                    console.log("🔍 Has children?", category.children?.length);
                    
                    if (category.children && category.children.length > 0) {
                      console.log("✅ Opening overlay with children:", category.children);
                      setStack([category]);
                      setHighlightedCategory(null);
                      setSelectedLeafCategory(null);
                    } else {
                      console.log("✅ Showing as selected leaf");
                      setSelectedLeafCategory(category);
                      setHighlightedCategory(category._id || category.id);
                    }
                  }}
                  themeColor={primary}
                  cardBg={cardBg}
                  accentColor={accent}
                  isHighlighted={highlightedCategory === (cat._id || cat.id)}
                />
              );
            })
          ) : (
            <p style={{ color: "#64748b" }}>
              No {activeTab === "all" ? "categories" : activeTab} found.
            </p>
          )}
        </div>
      </main>

      <BenefitsSection categoryName={categoryTree.name.toLowerCase()} theme={theme} />
      <AboutSection categoryName={categoryTree.name.toLowerCase()} theme={theme} />
      <ContactSection
  contactNumber={vendor.phone}
  location={vendor.location}
  vendorId={vendorId}
  businessHours={vendor.businessHours}
  categoryName={categoryTree.name.toLowerCase()}
  theme={selectedTheme || theme} // <- use selectedTheme if exists
/>

      <Footer categoryName={categoryTree.name.toLowerCase()} theme={theme} />

      {stack.length > 0 && (
        <>
          {console.log("🎯 Rendering OverlayModal with stack:", stack)}
          <OverlayModal
            stack={stack}
            setStack={setStack}
            vendorId={vendorId}
            themeColor={primary}
            cardBg={cardBg}
            accentColor={accent}
            categoryName={categoryTree.name}
            categoryType={categoryType}
            selectedCategoryId={highlightedCategory}
            setSelectedCategoryId={setHighlightedCategory}
          />
        </>
      )}
      
    </div>
    </CartProvider>
    </>
  );
}

export default PreviewPage;
