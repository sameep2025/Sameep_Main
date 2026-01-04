import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import API_BASE_URL from "../../../../../config";

// Authentication check helper (pure boolean, no UI side-effects)
const checkAuthentication = (vendorId, categoryId) => {
  try {
    if (typeof window === "undefined") return false;
    const tokenKey = `previewToken:${vendorId}:${categoryId}`;
    const identityKey = `previewIdentity:${vendorId}:${categoryId}`;

    const token = window.localStorage.getItem(tokenKey);
    const identityStr = window.localStorage.getItem(identityKey);

    if (!identityStr) return false;

    const identity = JSON.parse(identityStr);
    if (!(identity && identity.loggedIn === true)) return false;

    // Vendor My Prices pages should work for SetupMyBusiness previews even when
    // there is no customer session token.
    const role = String(identity?.role || "").trim().toLowerCase();
    if (role === "vendor") return true;

    // For any non-vendor identity, require a token.
    return !!token;
  } catch {
    return false;
  }
};

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
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    if (!vendorId) return;
    
    // Check authentication first
    if (!checkAuthentication(vendorId, categoryId)) {
      setSessionExpired(true);
      setLoading(false);
      return;
    }
    
    const fetchTree = async () => {
      try {
        setLoading(true);
        setError("");
        
        // Use vendor-flow API exactly like the admin page
        const url = `${API_BASE_URL}/api/vendor-flow/vendor/${vendorId}${categoryId ? `?categoryId=${categoryId}` : ''}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to load services");
        const json = await res.json().catch(() => ({}));
        
        // Extract services from vendor flow response (same as admin page)
        const services = Array.isArray(json?.services) ? json.services : [];
        
        // Filter services that belong to the selected lvl1 category
        const lvl1Services = services.filter(service => {
          const categoryPath = Array.isArray(service?.categoryPath) ? service.categoryPath : [];
          return categoryPath.length > 0 && categoryPath[0] === lvl1Id;
        });
        
        // Group services by their second-level category
        const lvl2Map = new Map();
        lvl1Services.forEach(service => {
          const categoryPath = Array.isArray(service?.categoryPath) ? service.categoryPath : [];
          if (categoryPath.length > 1) {
            const lvl2Name = categoryPath[1];
            if (!lvl2Map.has(lvl2Name)) {
              lvl2Map.set(lvl2Name, {
                _id: service._serviceId || service._id || service.categoryId,
                name: lvl2Name,
                children: [],
                pricingStatus: service.status || 'Active'
              });
            }
          } else if (categoryPath.length === 1) {
            // Direct service under lvl1, create a placeholder
            const serviceName = service.serviceName || service.name || 'Service';
            if (!lvl2Map.has(serviceName)) {
              lvl2Map.set(serviceName, {
                _id: service._serviceId || service._id || service.categoryId,
                name: serviceName,
                children: [],
                pricingStatus: service.status || 'Active'
              });
            }
          }
        });
        
        setTree(Array.from(lvl2Map.values()));
      } catch (e) {
        console.error("Level2SelectorPage fetchTree error", e);
        
        // Fallback to dummy-categories API if vendor-flow fails
        try {
          const fallbackUrl = `${API_BASE_URL}/api/dummy-vendors/${vendorId}/categories`;
          const fallbackRes = await fetch(fallbackUrl);
          if (fallbackRes.ok) {
            const fallbackJson = await fallbackRes.json().catch(() => ({}));
            let categories = fallbackJson?.categories;
            if (!categories) setTree([]);
            else if (Array.isArray(categories)) setTree(categories);
            else setTree([{ ...categories, children: categories.children || [] }]);
            return;
          }
        } catch (fallbackError) {
          console.error("Fallback also failed:", fallbackError);
        }
        
        setError(e?.message || "Failed to load services");
        setTree([]);
      } finally {
        setLoading(false);
      }
    };
    fetchTree();
  }, [vendorId, categoryId, lvl1Id]);

  useEffect(() => {
    if (!vendorId || !categoryId) return;
    if (typeof window === "undefined") return;

    const id = setInterval(() => {
      try {
        if (!checkAuthentication(vendorId, categoryId)) {
          setSessionExpired(true);
          clearInterval(id);
        }
      } catch {}
    }, 2000);

    return () => clearInterval(id);
  }, [vendorId, categoryId, router]);

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

      {sessionExpired && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              width: 280,
              borderRadius: 16,
              background: "#ffffff",
              padding: "20px 16px 12px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
              textAlign: "center",
              fontFamily:
                "Poppins, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
            }}
          >
            <div
              style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}
            >
              Session Expired
            </div>
            <div
              style={{
                fontSize: 14,
                color: "#4b5563",
                marginBottom: 16,
              }}
            >
              Please log in again.
            </div>
            <button
              type="button"
              onClick={() => {
                try {
                  if (vendorId && categoryId) {
                    router.replace(`/preview/${vendorId}/${categoryId}`);
                  } else {
                    router.replace("/");
                  }
                } catch {
                  router.replace("/");
                }
              }}
              style={{
                minWidth: 80,
                padding: "8px 24px",
                borderRadius: 999,
                border: "none",
                background: "#16a34a",
                color: "#ffffff",
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}