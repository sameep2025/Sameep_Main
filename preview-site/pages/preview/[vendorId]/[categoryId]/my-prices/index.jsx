import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import API_BASE_URL from "../../../../../config";

// Simple LVL1 category list screen: shows top-level children of the dummy
// vendor category tree so the vendor can pick a branch like "With License" / "Without License".
// Clicking a card navigates to /preview/[vendorId]/[categoryId]/my-prices/[lvl1Id].

export default function MyPricesEntryPage() {
  const router = useRouter();
  const { vendorId, categoryId } = router.query;

  const [lvl1Nodes, setLvl1Nodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!vendorId) return;
    const fetchTree = async () => {
      try {
        setLoading(true);
        setError("");
        const url = `${API_BASE_URL}/api/dummy-vendors/${vendorId}/categories`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to load categories");
        const json = await res.json().catch(() => ({}));
        const root = Array.isArray(json?.categories) ? json.categories[0] : json?.categories || null;
        if (!root) {
          setLvl1Nodes([]);
          return;
        }
        const kids = Array.isArray(root.children) ? root.children : [];
        setLvl1Nodes(kids);
      } catch (e) {
        console.error("MyPricesEntryPage fetchTree error", e);
        setError(e?.message || "Failed to load categories");
        setLvl1Nodes([]);
      } finally {
        setLoading(false);
      }
    };
    fetchTree();
  }, [vendorId]);

  const handleOpenLvl1 = (node) => {
    try {
      if (!vendorId || !categoryId || !node) return;
      const id = node._id || node.id;
      if (!id) return;
      router.push(`/preview/${vendorId}/${categoryId}/my-prices/${id}`);
    } catch {}
  };

  if (!vendorId || !categoryId) {
    return <div style={{ padding: 16 }}>Missing vendor or category</div>;
  }

  if (loading) {
    return <div style={{ padding: 16 }}>Loading categories...</div>;
  }

  if (error) {
    return <div style={{ padding: 16, color: "red" }}>{error}</div>;
  }

  if (!lvl1Nodes.length) {
    return <div style={{ padding: 16 }}>No categories configured.</div>;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "16px 16px 40px",
        background: "#fdfbff",
        fontFamily: "Poppins, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => router.back()}
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            marginRight: 8,
            fontSize: 20,
          }}
        >
          ←
        </button>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
          Choose your Category in...
        </h2>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {lvl1Nodes.map((node) => {
          const id = node._id || node.id;
          const title = node.name || "Category";
          const img = node.imageUrl || node.iconUrl || node.image || null;
          return (
            <div
              key={id || title}
              onClick={() => handleOpenLvl1(node)}
              style={{
                display: "flex",
                alignItems: "center",
                background: "#ffffff",
                borderRadius: 16,
                boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                overflow: "hidden",
                cursor: "pointer",
              }}
            >
              <div style={{ width: 88, height: 64, overflow: "hidden", background: "#f3f4f6" }}>
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={img}
                    alt={title}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : null}
              </div>
              <div style={{ flex: 1, padding: "10px 12px" }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
              </div>
              <div style={{ paddingRight: 12, paddingLeft: 4, fontSize: 20, opacity: 0.6 }}>
                ←
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
