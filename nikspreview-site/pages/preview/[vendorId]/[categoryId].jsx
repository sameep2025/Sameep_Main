"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";

import TopNavBar from "../../../components/TopNavBar";
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

/* Image Box */
const ImgBox = ({ src, alt }) => {
  const imgUrl = resolveImageUrl(src);
  console.log("🖼️ Image URL for", alt, ":", imgUrl, "| Original src:", src);
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
            console.error("❌ Failed to load image:", imgUrl);
            e.currentTarget.style.display = "none";
            e.currentTarget.parentElement.innerHTML = '<span style="color: #94a3b8; fontSize: 13px">Image failed to load</span>';
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
  return (
    <div
      onClick={() => onClick(node)}
      style={{
        background: isHighlighted ? `linear-gradient(135deg, ${themeColor}15, ${accentColor}15)` : cardBg,
        borderRadius: 16,
        boxShadow: isHighlighted ? `0 8px 24px ${themeColor}40` : "0 6px 16px rgba(0,0,0,0.08)",
        border: isHighlighted ? `2.5px solid ${themeColor}` : `1.5px solid ${themeColor}`,
        padding: 18,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        cursor: "pointer",
        transition: "transform 0.25s ease, box-shadow 0.25s ease, background 0.3s ease",
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
      <ImgBox src={node.imageUrl} alt={node.name} />
      <h3 style={{ fontSize: 17, fontWeight: 600, margin: "12px 0 8px", color: themeColor }}>
        {node.name}
      </h3>
      {lowestPrice ? (
        <div
          style={{
            background: accentColor,
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            borderRadius: 9999,
            padding: "4px 12px",
            whiteSpace: "nowrap",
          }}
        >
          {hasSubcategories ? `Starts from ₹${lowestPrice}` : `₹${lowestPrice}`}
        </div>
      ) : (
        <p style={{ color: "#64748b", fontSize: 13, marginTop: 6 }}>No pricing yet</p>
      )}
    </div>
  );
};

/* Product Card */
const ProductCard = ({ node, vendorId, themeColor, cardBg, accentColor, categoryType }) => {
  const displayPrice = node.vendorPrice ?? node.price;
  // Use node's own categoryType if available, otherwise fall back to passed categoryType
  const nodeCategoryType = node.categoryType || categoryType || "Services";
  const isProducts = nodeCategoryType === "Products";
  const buttonLabel = isProducts ? "View Product" : "View Details";
  return (
    <div
      style={{
        background: cardBg,
        borderRadius: 12,
        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
        border: `1.5px solid ${themeColor}`,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        transition: "transform 0.25s ease, box-shadow 0.25s ease",
        overflow: "hidden",
        height: "100%",
        minHeight: "320px",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-5px)";
        e.currentTarget.style.boxShadow = `0 10px 20px ${themeColor}25`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.08)";
      }}
    >
      <ImgBox src={node.imageUrl} alt={node.name} />
      <h3
        style={{
          fontSize: 17,
          fontWeight: 600,
          margin: "12px 0 8px",
          color: themeColor,
          textAlign: "center",
        }}
      >
        {node.name}
      </h3>

      {displayPrice && (
        <div
          style={{
            background: accentColor,
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            borderRadius: 20,
            padding: "4px 10px",
            marginBottom: 10,
            whiteSpace: "nowrap",
          }}
        >
          ₹{displayPrice}
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
          {node.terms.split(",").filter(t => t.trim()).map((t, i) => (
            <li key={i} style={{ marginBottom: 3 }}>{t.trim()}</li>
          ))}
        </ul>
      )}

      <Link href={`/preview/${vendorId}/product/${node._id}`} style={{ width: "100%", marginTop: "auto", flexShrink: 0 }}>
        <button
          style={{
            width: "100%",
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
          {buttonLabel}
        </button>
      </Link>
    </div>
  );
};

/* Overlay Modal (Fixed layout & card alignment) */
const OverlayModal = ({ stack, setStack, vendorId, themeColor, cardBg, accentColor, categoryName, categoryType }) => {
  if (!stack.length) return null;
  const current = stack[stack.length - 1];
  const push = (n) => setStack([...stack, n]);
  const goBack = () => setStack(stack.slice(0, -1));
  const close = () => setStack([]);
  
  // Adjust grid columns for Cold Pressed Oils to prevent image compression
  const isColdPressedOils = categoryName?.toLowerCase().includes('cold pressed oils');
  const gridMinWidth = isColdPressedOils ? '220px' : '280px';

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
        <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", flexShrink: 0 }}>
          {stack.length > 1 ? (
            <button onClick={goBack} style={{ border: "none", background: "none", color: themeColor, fontWeight: 600, cursor: "pointer" }}>
              ← Back
            </button>
          ) : (
            <div />
          )}
          <button onClick={close} style={{ border: "none", background: "none", color: themeColor, fontWeight: 600, cursor: "pointer" }}>
            ✕ Close
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(auto-fill, minmax(240px, 1fr))`,
            gap: 20,
            justifyContent: "center",
            alignItems: "stretch",
            overflowY: "auto",
            paddingRight: 10,
          }}
        >
          {current.children?.length ? (
            sortByPrice(current.children).map((child) =>
              child.children?.length ? (
                <CategoryCard
                  key={getNodeId(child)}
                  node={child}
                  onClick={push}
                  themeColor={themeColor}
                  cardBg={cardBg}
                  accentColor={accentColor}
                />
              ) : (
                <ProductCard
                  key={getNodeId(child)}
                  node={child}
                  vendorId={vendorId}
                  themeColor={themeColor}
                  cardBg={cardBg}
                  accentColor={accentColor}
                  categoryType={categoryType}
                />
              )
            )
          ) : (
            <p style={{ color: "#64748b", textAlign: "center" }}>No items found.</p>
          )}
        </div>
      </div>
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
  const [activeTab, setActiveTab] = useState("all"); // "all", "products", "services"
  const [highlightedCategory, setHighlightedCategory] = useState(null);
  const [selectedLeafCategory, setSelectedLeafCategory] = useState(null); // For categories with no children

  useEffect(() => {
    if (!router.isReady || !vendorId) return;

    const fetchData = async () => {
      try {
        const [vendorRes, catRes] = await Promise.all([
          fetch(`/api/vendors/${vendorId}`),
          fetch(`/api/vendors/${vendorId}/preview/${categoryId}`),
        ]);
        const vendorData = await vendorRes.json();
        const catData = await catRes.json();
        setVendor(vendorData);
        setCategoryTree(catData.categories || { name: "Root", children: [] });
      } catch (err) {
        console.error("Error fetching data:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [router.isReady, vendorId, categoryId]);

  if (loading) return <FullPageShimmer />;
  if (!vendor || !categoryTree) return <p>No data found.</p>;

  const theme = categoryThemes[categoryTree.name.toLowerCase()] || categoryThemes.default;
  const { primary, accent, cardBg, background } = theme;

  // Determine the label based on categoryType
  const categoryType = categoryTree.categoryType || "Services";
  console.log("🔍 CategoryType received:", categoryType, "Full tree:", categoryTree);
  const isProducts = categoryType === "Products";
  const isServices = categoryType === "Services";
  const isBoth = categoryType === "Products & Services";
  
  const sectionLabel = isProducts ? "Our Products" : isServices ? "Our Services" : "Our Products & Services";
  const itemLabel = isProducts ? "product" : isServices ? "service" : "item";

  // Filter children based on category type and active tab
  const getFilteredChildren = () => {
    // If a leaf category is selected from TopNavBar, show only that
    if (selectedLeafCategory) {
      return [selectedLeafCategory];
    }
    
    if (!categoryTree.children) return [];
    
    // If it's "Products & Services", use tab filtering
    if (isBoth) {
      if (activeTab === "all") return categoryTree.children;
      return categoryTree.children.filter(child => {
        const childType = child.categoryType || "Products"; // Default to Products if not set
        if (activeTab === "products") return childType === "Products" || childType === "Products & Services";
        if (activeTab === "services") return childType === "Services" || childType === "Products & Services";
        return true;
      });
    }
    
    // If it's only "Products", filter to show only products
    if (isProducts) {
      return categoryTree.children.filter(child => {
        const childType = child.categoryType || "Products"; // Default to Products if not set
        return childType === "Products" || childType === "Products & Services";
      });
    }
    
    // If it's only "Services", filter to show only services
    if (isServices) {
      return categoryTree.children.filter(child => {
        const childType = child.categoryType || "Products"; // Default to Products if not set
        return childType === "Services" || childType === "Products & Services";
      });
    }
    
    return categoryTree.children;
  };

  const filteredChildren = getFilteredChildren();

  return (
    <div style={{ fontFamily: "Poppins, sans-serif", background, minHeight: "100vh" }}>
      <TopNavBar 
        businessName={vendor.businessName} 
        categoryTree={categoryTree}
        categoryName={categoryTree.name.toLowerCase()}
        onCategoryClick={(category) => {
          // If category has children, open modal
          if (category.children && category.children.length > 0) {
            setStack([category]);
            setHighlightedCategory(null);
            setSelectedLeafCategory(null);
          } else {
            // If no children, show it as selected leaf category
            setSelectedLeafCategory(category);
            setHighlightedCategory(category._id || category.id);
            setStack([]);
          }
        }}
      />
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
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
          }}
        />
        <div style={{ zIndex: 1, textAlign: "center", maxWidth: 800, padding: 20 }}>
          <h1 style={{ fontSize: 44, fontWeight: 700 }}>{categoryTree.name}</h1>
          <p style={{ fontSize: 18, opacity: 0.9, marginTop: 10 }}>
            Explore a range of {categoryType.toLowerCase()} under this category.
          </p>
        </div>
      </section>

      <main id="our-services" style={{ maxWidth: 1200, margin: "60px auto", padding: "0 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 30 }}>
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
        
        {/* Tab Menu for Products & Services */}
        {isBoth && !selectedLeafCategory && (
          <div style={{ 
            display: "flex", 
            gap: 12, 
            marginBottom: 30,
            borderBottom: `2px solid ${primary}20`,
            paddingBottom: 0
          }}>
            <button
              onClick={() => setActiveTab("all")}
              style={{
                padding: "12px 24px",
                background: activeTab === "all" ? `linear-gradient(90deg, ${primary}, ${accent})` : "transparent",
                color: activeTab === "all" ? "#fff" : primary,
                border: "none",
                borderBottom: activeTab === "all" ? `3px solid ${accent}` : "3px solid transparent",
                fontWeight: 600,
                fontSize: 16,
                cursor: "pointer",
                transition: "all 0.3s ease",
                borderRadius: "8px 8px 0 0",
              }}
              onMouseEnter={(e) => {
                if (activeTab !== "all") {
                  e.currentTarget.style.background = `${primary}10`;
                }
              }}
              onMouseLeave={(e) => {
                if (activeTab !== "all") {
                  e.currentTarget.style.background = "transparent";
                }
              }}
            >
              All
            </button>
            <button
              onClick={() => setActiveTab("products")}
              style={{
                padding: "12px 24px",
                background: activeTab === "products" ? `linear-gradient(90deg, ${primary}, ${accent})` : "transparent",
                color: activeTab === "products" ? "#fff" : primary,
                border: "none",
                borderBottom: activeTab === "products" ? `3px solid ${accent}` : "3px solid transparent",
                fontWeight: 600,
                fontSize: 16,
                cursor: "pointer",
                transition: "all 0.3s ease",
                borderRadius: "8px 8px 0 0",
              }}
              onMouseEnter={(e) => {
                if (activeTab !== "products") {
                  e.currentTarget.style.background = `${primary}10`;
                }
              }}
              onMouseLeave={(e) => {
                if (activeTab !== "products") {
                  e.currentTarget.style.background = "transparent";
                }
              }}
            >
              Products
            </button>
            <button
              onClick={() => setActiveTab("services")}
              style={{
                padding: "12px 24px",
                background: activeTab === "services" ? `linear-gradient(90deg, ${primary}, ${accent})` : "transparent",
                color: activeTab === "services" ? "#fff" : primary,
                border: "none",
                borderBottom: activeTab === "services" ? `3px solid ${accent}` : "3px solid transparent",
                fontWeight: 600,
                fontSize: 16,
                cursor: "pointer",
                transition: "all 0.3s ease",
                borderRadius: "8px 8px 0 0",
              }}
              onMouseEnter={(e) => {
                if (activeTab !== "services") {
                  e.currentTarget.style.background = `${primary}10`;
                }
              }}
              onMouseLeave={(e) => {
                if (activeTab !== "services") {
                  e.currentTarget.style.background = "transparent";
                }
              }}
            >
              Services
            </button>
          </div>
        )}
        
        <div
          style={{
            display: "grid",
            gridTemplateColumns: selectedLeafCategory ? "repeat(auto-fill, minmax(300px, 1fr))" : "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 30,
          }}
        >
          {filteredChildren.length ? (
            sortByPrice(filteredChildren).map((cat) => {
              // If it's a selected leaf category or has no children, show as ProductCard
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
                    if (category.children && category.children.length > 0) {
                      setStack([category]);
                      setHighlightedCategory(null);
                      setSelectedLeafCategory(null);
                    } else {
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
            <p style={{ color: "#64748b" }}>No {activeTab === "all" ? "categories" : activeTab} found.</p>
          )}
        </div>
      </main>

      <BenefitsSection categoryName={categoryTree.name.toLowerCase()} />
      <AboutSection categoryName={categoryTree.name.toLowerCase()} />
      <ContactSection
        contactNumber={vendor.customerId?.fullNumber || vendor.phone}
        location={vendor.location}
        vendorId={vendorId}
        businessHours={vendor.businessHours}
        categoryName={categoryTree.name.toLowerCase()}
      />
      <Footer categoryName={categoryTree.name.toLowerCase()} />

      {stack.length > 0 && (
        <OverlayModal
          stack={stack}
          setStack={setStack}
          vendorId={vendorId}
          themeColor={primary}
          cardBg={cardBg}
          accentColor={accent}
          categoryName={categoryTree.name}
          categoryType={categoryType}
        />
      )}
    </div>
  );
}

export default PreviewPage;
