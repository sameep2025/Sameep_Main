import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import API_BASE_URL from "../../../../../config";

// Level-2 selector screen for a specific LVL1 category.
// Example: LVL1 = Two Wheeler, LVL2 options = With License / Without License.
// Final pricing and Active/Inactive toggles live in [lvl1Id]/[lvl2Id].jsx.

function flattenTree(node, rows = [], parentLevels = [], parentIds = []) {
  if (!node) return rows;
  const levels = [...parentLevels, node.name ?? "Unnamed"];
  const ids = [...parentIds, node._id ?? node.id];

  if (!node.children || node.children.length === 0) {
    rows.push({
      id: node._id ?? node.id,
      levels,
      levelIds: ids,
      categoryId: node._id ?? node.id,
      pricingStatus: node.pricingStatus,
      image: node.imageUrl || node.iconUrl || node.image || null,
    });
  } else {
    node.children.forEach((child) => flattenTree(child, rows, levels, ids));
  }
  return rows;
}

export default function Level2SelectorPage() {
  const router = useRouter();
  const { vendorId, categoryId, lvl1Id } = router.query;

  const [tree, setTree] = useState([]);
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
        let categories = json?.categories;
        if (!categories) setTree([]);
        else if (Array.isArray(categories)) setTree(categories);
        else setTree([{ ...categories, children: categories.children || [] }]);
      } catch (e) {
        console.error("Level2SelectorPage fetchTree error", e);
        setError(e?.message || "Failed to load categories");
        setTree([]);
      } finally {
        setLoading(false);
      }
    };
    fetchTree();
  }, [vendorId]);

  const rows = useMemo(() => tree.flatMap((root) => flattenTree(root)), [tree]);

  // From rows that match this LVL1, collect unique Level-3 names (LVL2 for this screen).
  const level2Options = useMemo(() => {
    try {
      const out = [];
      const seen = new Set();
      const target = String(lvl1Id || "").trim().toLowerCase();
      rows.forEach((row) => {
        const levels = Array.isArray(row.levels) ? row.levels : [];
        if (!levels.length) return;

        const lvl1Name = levels.length > 1 ? levels[1] : levels[0];
        const n1 = String(lvl1Name || "").trim().toLowerCase();
        if (target && n1 !== target) return;

        const lvl2Name = levels.length > 2 ? levels[2] : levels[levels.length - 1];
        const clean = String(lvl2Name || "").trim();
        if (!clean) return;

        const key = clean.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);

        out.push({ label: clean, image: row.image || null });
      });
      return out;
    } catch {
      return [];
    }
  }, [rows, lvl1Id]);

  const handleOpenLevel2 = (label) => {
    try {
      if (!vendorId || !categoryId) return;
      const safeLvl1 = encodeURIComponent(String(lvl1Id || "").trim());
      const safeLvl2 = encodeURIComponent(String(label || "").trim());
      router.push(
        `/preview/${vendorId}/${categoryId}/my-prices/${safeLvl1}/${safeLvl2}`
      );
    } catch {}
  };

  if (!vendorId || !categoryId) {
    return <div style={{ padding: 16 }}>Missing vendor or category</div>;
  }

  if (loading) {
    return <div style={{ padding: 16 }}>Loading categories...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: 16, color: "#b91c1c" }}>
        {error}
      </div>
    );
  }

  if (!level2Options.length) {
    return <div style={{ padding: 16 }}>No subcategories found.</div>;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "16px 16px 40px",
        background: "#fdfbff",
        fontFamily:
          "Poppins, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => {
            try {
              if (!vendorId || !categoryId) return;
              router.push(`/preview/${vendorId}/${categoryId}`);
            } catch {
              router.push("/");
            }
          }}
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
        {level2Options.map((opt) => (
          <div
            key={opt.label}
            onClick={() => handleOpenLevel2(opt.label)}
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
            <div
              style={{
                width: 88,
                height: 64,
                overflow: "hidden",
                background: "#f3f4f6",
              }}
            >
              {opt.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={opt.image}
                  alt={opt.label}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              ) : null}
            </div>
            <div style={{ flex: 1, padding: "10px 12px" }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{opt.label}</div>
            </div>
            <div
              style={{
                paddingRight: 12,
                paddingLeft: 4,
                fontSize: 20,
                opacity: 0.6,
              }}
            >
              ›
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}