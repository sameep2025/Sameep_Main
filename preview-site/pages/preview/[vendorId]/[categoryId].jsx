// pages/preview/[vendorId]/[categoryId].jsx
import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import TopNavBar from "../../../components/TopNavBar";
import HomeSection from "../../../components/HomeSection";
import BenefitsSection from "../../../components/BenefitsSection";
import AboutSection from "../../../components/AboutSection";
import ContactSection from "../../../components/ContactSection";
import Footer from "../../../components/Footer";
import FullPageShimmer from "../../../components/FullPageShimmer";

export default function PreviewPage() {
  const router = useRouter();
  const { vendorId, categoryId, lat, lng, homeLocs } = router.query;

  const parsedHomeLocations = homeLocs ? JSON.parse(homeLocs) : [];

  const [vendor, setVendor] = useState(null);
  const [categoryTree, setCategoryTree] = useState(null);
  const [loadingVendor, setLoadingVendor] = useState(true);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [error, setError] = useState("");
  const [selectedLeaf, setSelectedLeaf] = useState(null);
  const [location, setLocation] = useState(null);
  const [cardSelections, setCardSelections] = useState({});

  const loading = loadingVendor || loadingCategories;

  // ----------------- Fetch vendor & categories -----------------
  useEffect(() => {
    if (!router.isReady || !vendorId) return;

    const fetchData = async () => {
      setLoadingVendor(true);
      setLoadingCategories(true);
      try {
        const [vendorRes, categoryRes, locationRes] = await Promise.all([
          fetch(`/api/vendors/${vendorId}`, { cache: "no-store" }),
          fetch(`/api/vendors/${vendorId}/preview/${categoryId}`, { cache: "no-store" }),
          fetch(`/api/vendors/${vendorId}/location`, { cache: "no-store" }),
        ]);

        const vendorData = await vendorRes.json();
        const categoryData = await categoryRes.json();
        let locationData = null;

        try {
          locationData = await locationRes.json();
        } catch (err) {
          locationData = null;
        }

        setVendor(vendorData);
        console.log("CategoryData from API:", categoryData);

        setCategoryTree(categoryData.categories || null);


        if (locationData?.success) {
          setLocation(locationData.location);
        } else if (vendorData.location) {
          setLocation(vendorData.location);
        }
      } catch (err) {
        setError(err.message || "Something went wrong");
      } finally {
        setLoadingVendor(false);
        setLoadingCategories(false);
      }
    };

    fetchData();
  }, [router.isReady, vendorId, categoryId]);

  // ----------------- Helpers -----------------
  const hasChildren = (node) => node?.children?.length > 0;

  const containsId = (node, id) => {
    if (!node || !id) return false;
    if (node.id === id) return true;
    return node.children?.some((c) => containsId(c, id)) || false;
  };

  // ----------------- Card Component -----------------
  const ParentWithSizesCard = ({ node, selection, onSelectionChange, onLeafSelect }) => {
    if (!node) return null;

    const getDeepestFirstChild = (n) => (!n?.children?.length ? n : getDeepestFirstChild(n.children[0]));

    const selectedParent = selection?.parent || node.children?.[0] || node;
    const selectedChild = selection?.child || getDeepestFirstChild(selectedParent);

    const displayNode = selectedChild || selectedParent;

    return (
      <section style={{ marginBottom: 28 }}>
        <div
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: 16,
            padding: 20,
            background: "#fff",
            width: 300,
            minHeight: 400,
            boxShadow: "0 1px 6px rgba(0,0,0,0.08)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            fontFamily: "Poppins, sans-serif",
          }}
        >
          <h2 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 600 }}>{node.name}</h2>

          {displayNode?.imageUrl && (
            <img
              src={displayNode.imageUrl.startsWith("http") ? displayNode.imageUrl : `http://localhost:5000${displayNode.imageUrl}`}
              alt={displayNode.name}
              style={{ width: 50, height: 50, borderRadius: 8, objectFit: "cover", marginBottom: 12 }}
            />
          )}

          {displayNode && (
            <div style={{ marginBottom: 12 }}>
              {displayNode.price && <p style={{ color: "#059669", fontWeight: 600, margin: 0 }}>₹ {displayNode.vendorPrice ?? displayNode.price ?? "-"}</p>}
              {displayNode.terms && (
                <ul style={{ marginTop: 4, paddingLeft: 18 }}>
                  {displayNode.terms.split(",").map((t, i) => (
                    <li key={i} style={{ fontSize: 13, color: "#4b5563" }}>
                      {t.trim()}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Parent Buttons */}
          {node.children?.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              {node.children.map((opt) => {
                const leaf = getDeepestFirstChild(opt);
                const isSelectedParent = selectedParent?.id === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      onSelectionChange?.(opt, leaf);
                      onLeafSelect?.(leaf);
                    }}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 999,
                      border: isSelectedParent ? "2px solid #059669" : "1px solid #d1d5db",
                      background: isSelectedParent ? "#059669" : "#f9fafb",
                      color: isSelectedParent ? "#fff" : "#111827",
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    {opt.name}
                  </button>
                );
              })}
            </div>
          )}

          {/* Child Buttons */}
          {selectedParent?.children?.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {selectedParent.children.map((child) => (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => {
                    onSelectionChange?.(selectedParent, child);
                    onLeafSelect?.(child);
                  }}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 999,
                    border: selectedChild?.id === child.id ? "2px solid #2563eb" : "1px solid #d1d5db",
                    background: selectedChild?.id === child.id ? "#2563eb" : "#f9fafb",
                    color: selectedChild?.id === child.id ? "#fff" : "#111827",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  {child.name}
                </button>
              ))}
            </div>
          )}

          <button
            onClick={() => alert(`Booking ${displayNode?.name}`)}
            style={{
              marginTop: "auto",
              width: "100%",
              padding: "10px 14px",
              borderRadius: 28,
              border: "none",
              background: "rgb(245 158 11)",
              color: "#111827",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Book Now
          </button>
        </div>
      </section>
    );
  };

  // ----------------- Render tree -----------------
  const renderTree = (root) => {
  if (!root) return <p>No categories available</p>;
  if (!Array.isArray(root.children) || root.children.length === 0)
    return <p>No categories available</p>;


    return root.children.map((lvl1) => {
      const hasNested = lvl1.children?.some((c) => hasChildren(c));
      if (hasNested) {
        const visibleChildren = lvl1.children;
        if (!visibleChildren || visibleChildren.length === 0) return null;

        return (
          <section key={lvl1.id} style={{ marginBottom: 28 }}>
            <h2 style={{ margin: "0 0 12px", textTransform: "uppercase", fontSize: 18, fontWeight: 600 }}>{lvl1.name}</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
              {visibleChildren.map((child) => (
                <ParentWithSizesCard
                  key={child.id}
                  node={child}
                  selection={cardSelections[child.id]}
                  onSelectionChange={(parent, leaf) =>
                    setCardSelections((prev) => ({ ...prev, [child.id]: { parent, child: leaf } }))
                  }
                  onLeafSelect={(leaf) => setSelectedLeaf(leaf)}
                />
              ))}
            </div>
          </section>
        );
      }

      return (
        <div key={lvl1.id} style={{ display: "inline-flex", verticalAlign: "top", marginRight: 16, marginBottom: 28 }}>
          <ParentWithSizesCard
            node={lvl1}
            selection={cardSelections[lvl1.id]}
            onSelectionChange={(parent, leaf) =>
              setCardSelections((prev) => ({ ...prev, [lvl1.id]: { parent, child: leaf } }))
            }
            onLeafSelect={(leaf) => setSelectedLeaf(leaf)}
          />
        </div>
      );
    });
  };

  return (
    <div style={{ padding: 0, background: "#F0FDF4" }}>
      {loading ? (
        <FullPageShimmer />
      ) : (
        <>
          <TopNavBar businessName={vendor?.businessName || "Loading..."} categoryTree={categoryTree} selectedLeaf={selectedLeaf} onLeafSelect={setSelectedLeaf} />
          <HomeSection businessName={vendor?.businessName || "Loading..."} />
          <main id="products" style={{ padding: "20px", marginTop: "10px" }}>
            {renderTree(categoryTree)}
          </main>
          <BenefitsSection />
          <AboutSection />
          <ContactSection
            contactNumber={vendor?.customerId?.fullNumber || vendor?.phone || "-"}
            location={location}
            vendorId={vendorId}
            businessHours={vendor?.businessHours || []}
            onLocationUpdate={(newLoc) => {
              setLocation(newLoc);
              setVendor((prev) => ({ ...prev, location: newLoc }));
            }}
          />
          <Footer />
        </>
      )}
    </div>
  );
}
