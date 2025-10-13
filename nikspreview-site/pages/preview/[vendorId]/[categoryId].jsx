// pages/preview/[vendorId]/[categoryId].jsx
import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import TopNavBar from "../../../components/TopNavBar";
import BenefitsSection from "../../../components/BenefitsSection";
import AboutSection from "../../../components/AboutSection";
import ContactSection from "../../../components/ContactSection";
import Footer from "../../../components/Footer";
import FullPageShimmer from "../../../components/FullPageShimmer";
import Link from "next/link";
import categoryThemes from "../../../utils/categoryThemes";

/* ================= Helpers ================= */
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
      n.children.forEach((child) => traverse(child));
    }
  };
  traverse(node);
  return lowest === Infinity ? null : lowest;
};

/* ================= Small Components ================= */
const ImgBox = ({ src, alt }) => {
  const imgUrl = resolveImageUrl(src);
  return (
    <div
      style={{
        height: 200,
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#F0F9FF",
        borderRadius: 16,
        overflow: "hidden",
        transition: "transform 0.3s ease, box-shadow 0.3s ease",
      }}
    >
      {imgUrl ? (
        <img src={imgUrl} alt={alt} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <div style={{ color: "#9ca3af", fontSize: 14 }}>No image</div>
      )}
    </div>
  );
};

/* ================= Category Card ================= */
const CategoryCard = ({ node, onClick, themeColor, cardBg, accentColor }) => {
  const lowestPrice = findLowestPrice(node);
  const hasSubcategories = node.children && node.children.length > 0;

  return (
    <div
      style={{
        borderRadius: 20,
        background: cardBg,
        boxShadow: "0 6px 20px rgba(0,0,0,0.08)",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        padding: 20,
        transition: "transform 0.3s ease, box-shadow 0.3s ease",
        border: `2px solid ${themeColor}`,
        position: "relative",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-6px)";
        e.currentTarget.style.boxShadow = `0 12px 28px ${themeColor}20`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.08)";
      }}
      onClick={() => onClick(node)}
    >
      <ImgBox src={node.imageUrl} alt={node.name} />
      <h3 style={{ marginTop: 16, fontSize: 20, fontWeight: 600, color: themeColor }}>
        {node.name}
      </h3>

      {lowestPrice ? (
        <div
          style={{
            background: accentColor,
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 9999,
            padding: "6px 14px",
            marginTop: 10,
            display: "inline-block",
            boxShadow: `0 3px 10px ${accentColor}50`,
          }}
        >
          {hasSubcategories ? `Starts from ₹${lowestPrice}` : `₹${lowestPrice}`}
        </div>
      ) : (
        <p style={{ fontSize: 14, color: "#6b7280", marginTop: 8 }}>
          {hasSubcategories ? "No pricing yet" : ""}
        </p>
      )}
    </div>
  );
};

/* ================= Product Card ================= */
const ProductCard = ({ node, vendorId, themeColor, cardBg, accentColor }) => {
  const displayPrice = node.vendorPrice ?? node.price;
  return (
    <div
      style={{
        background: cardBg,
        borderRadius: 20,
        padding: 20,
        boxShadow: "0 6px 20px rgba(0,0,0,0.08)",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        transition: "transform 0.3s ease, box-shadow 0.3s ease",
        border: `2px solid ${themeColor}`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-6px)";
        e.currentTarget.style.boxShadow = `0 12px 28px ${themeColor}20`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.08)";
      }}
    >
      <ImgBox src={node.imageUrl} alt={node.name} />
      <h3 style={{ margin: "16px 0 8px", fontSize: 20, fontWeight: 600, color: themeColor }}>
        {node.name}
      </h3>
      {displayPrice && (
        <div
          style={{
            background: accentColor,
            color: "#fff",
            fontWeight: 700,
            borderRadius: 9999,
            padding: "6px 14px",
            marginBottom: 12,
            boxShadow: `0 3px 10px ${accentColor}50`,
            fontSize: 14,
          }}
        >
          ₹ {displayPrice}
        </div>
      )}
      {node.terms && (
        <ul style={{ marginTop: 4, paddingLeft: 18, textAlign: "left", marginBottom: 12 }}>
          {node.terms.split(",").map((t, i) => (
            <li key={i} style={{ fontSize: 13, color: "#1F2937" }}>
              {t.trim()}
            </li>
          ))}
        </ul>
      )}
      <Link href={`/preview/${vendorId}/product/${node._id}`}>
        <button
          style={{
            width: "100%",
            padding: "10px 14px",
            borderRadius: 10,
            border: "none",
            color: "#fff",
            fontWeight: 700,
            cursor: "pointer",
            transition: "all 0.3s ease",
            backgroundImage: `linear-gradient(90deg, ${themeColor}, ${accentColor})`,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = 0.85)}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = 1)}
        >
          View Details
        </button>
      </Link>
    </div>
  );
};

/* ================= Overlay Modal ================= */
const OverlayModal = ({ stack, setStack, vendorId, themeColor, cardBg, accentColor }) => {
  if (!stack || stack.length === 0) return null;
  const current = stack[stack.length - 1];

  const push = (node) => setStack((s) => [...s, node]);
  const goBack = () => setStack((s) => s.slice(0, s.length - 1));
  const close = () => setStack([]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        zIndex: 2000,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        overflowY: "auto",
        padding: "40px 20px",
      }}
    >
      <div
        style={{
          background: cardBg,
          borderRadius: 20,
          width: "100%",
          maxWidth: 900,
          minHeight: 500,
          maxHeight: "80vh",
          padding: 24,
          position: "relative",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ marginBottom: 20 }}>
          <div style={{ marginBottom: 12, cursor: "pointer", color: themeColor }}>
            {stack.map((s, i) => (
              <span key={getNodeId(s)} onClick={() => setStack(stack.slice(0, i + 1))}>
                {s.name} {i < stack.length - 1 && "› "}
              </span>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {stack.length > 1 && (
              <button
                onClick={goBack}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  color: themeColor,
                  fontWeight: 600,
                }}
              >
                ← Back
              </button>
            )}
            <button
              onClick={close}
              style={{
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: themeColor,
                fontWeight: 600,
              }}
            >
              ✕ Close
            </button>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 20,
          }}
        >
          {current.children && current.children.length > 0 ? (
            sortByPrice(current.children).map((child) =>
              child.children && child.children.length > 0 ? (
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
                />
              )
            )
          ) : (
            <p style={{ color: "#6b7280", textAlign: "center", width: "100%" }}>
              No subcategories/products.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

/* ================= Main Page ================= */
const PreviewPage = () => {
  const router = useRouter();
  const { vendorId, categoryId } = router.query;

  const [vendor, setVendor] = useState(null);
  const [categoryTree, setCategoryTree] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stack, setStack] = useState([]);

  useEffect(() => {
    if (!router.isReady || !vendorId) return;

    let intervalId;

    const fetchData = async () => {
      try {
        const [vendorRes, catRes] = await Promise.all([
          fetch(`/api/vendors/${vendorId}`),
          fetch(`/api/vendors/${vendorId}/preview/${categoryId}`),
        ]);
        const vendorData = await vendorRes.json();
        const catData = await catRes.json();

        console.log("Preview Page - Vendor Data:", vendorData);
        console.log("Preview Page - Vendor Location:", vendorData?.location);
        console.log("Preview Page - Category:", categoryId);

        setVendor(vendorData);
        setCategoryTree(catData.categories || { name: "Root", children: [] });
      } catch (err) {
        console.error("Error fetching data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    intervalId = setInterval(fetchData, 10000);
    return () => clearInterval(intervalId);
  }, [router.isReady, vendorId, categoryId]);

  if (loading) return <FullPageShimmer />;
  if (!vendor || !categoryTree) return <p>No data found.</p>;

  console.log("Preview Page - Rendering with vendor:", vendor);
  console.log("Preview Page - Vendor location before ContactSection:", vendor?.location);

  const currentCategory = categoryTree;

  /* ================= Dynamic Theme ================= */
  const categoryName = currentCategory.name.toLowerCase();
  const theme = categoryThemes[categoryName] || categoryThemes.default;

  const themeColor = theme.primary;
  const accentColor = theme.accent;
  const cardBg = theme.cardBg;
  const pageBg = theme.background;

  return (
    <div style={{ fontFamily: "Poppins, sans-serif", background: pageBg, minHeight: "100vh" }}>
      <TopNavBar businessName={vendor.businessName} categoryTree={categoryTree} selectedLeaf={null} onLeafSelect={() => {}} categoryName={categoryName} />

      {/* Hero */}
      <section
        style={{
          position: "relative",
          height: 500,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
          backgroundImage: `url(${resolveImageUrl(currentCategory.imageUrl)})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to bottom, rgba(0,0,0,0.6), rgba(0,0,0,0.6))",
          }}
        />
        <div style={{ position: "relative", zIndex: 1, color: "#fff", maxWidth: 900, padding: "0 20px" }}>
          <h1 style={{ fontSize: 48, fontWeight: 700, marginBottom: 20 }}>{currentCategory.name}</h1>
          <p style={{ fontSize: 20, lineHeight: 1.8, opacity: 0.9 }}>
            Discover professional services and quality solutions designed to meet all your business and personal needs in this category.
          </p>
        </div>
      </section>

      {/* Services */}
      <main style={{ maxWidth: 1240, margin: "64px auto", padding: "48px" }}>
        <h1 style={{ fontSize: 36, fontWeight: 700, color: themeColor, marginBottom: 40 }}>Our Services</h1>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 32 }}>
          {categoryTree.children && categoryTree.children.length > 0 ? (
            sortByPrice(categoryTree.children).map((cat) => (
              <CategoryCard
                key={getNodeId(cat)}
                node={cat}
                onClick={() => setStack([cat])}
                themeColor={themeColor}
                cardBg={cardBg}
                accentColor={accentColor}
              />
            ))
          ) : (
            <p style={{ color: "#6b7280" }}>No services available.</p>
          )}
        </div>
      </main>

      <section style={{ maxWidth: 1240, margin: "48px auto", padding: "48px", background: pageBg }}>
        <BenefitsSection categoryName={categoryName} />
      </section>

      <section style={{ maxWidth: 1240, margin: "48px auto", padding: "48px", background: pageBg }}>
        <AboutSection categoryName={categoryName} />
      </section>

      <section style={{ maxWidth: 1240, margin: "48px auto", padding: "48px", background: pageBg }}>
        <ContactSection
          contactNumber={vendor.customerId?.fullNumber || vendor.phone || "-"}
          location={vendor.location}
          vendorId={vendorId}
          businessHours={vendor.businessHours || []}
          categoryName={categoryName}
        />
      </section>

      <Footer categoryName={categoryName} />

      {stack.length > 0 && (
        <OverlayModal stack={stack} setStack={setStack} vendorId={vendorId} themeColor={themeColor} cardBg={cardBg} accentColor={accentColor} />
      )}
    </div>
  );
};

export default PreviewPage;
