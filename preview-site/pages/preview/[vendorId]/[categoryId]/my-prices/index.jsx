import React, { useEffect, useState } from "react";
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

    const role = String(identity?.role || "").trim().toLowerCase();
    if (role === "vendor") return true;
    return !!token;
  } catch {
    return false;
  }
};

// Simple LVL1 category list screen: shows top-level children of the dummy
// vendor category tree so the vendor can pick a branch like "With License" / "Without License".
// Clicking a card navigates to /preview/[vendorId]/[categoryId]/my-prices/[lvl1Id].

export default function MyPricesEntryPage() {
  const router = useRouter();
  const { vendorId, categoryId } = router.query;

  const [lvl1Nodes, setLvl1Nodes] = useState([]);
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
        
        // Use vendor-flow API to get services
        const url = `${API_BASE_URL}/api/vendor-flow/vendor/${vendorId}${categoryId ? `?categoryId=${categoryId}` : ''}`;
        const res = await fetch(url);
        
        if (!res.ok) {
          console.log("Vendor-flow API failed, trying fallback...");
          throw new Error("Vendor-flow API failed");
        }
        
        const json = await res.json().catch(() => ({}));
        // VendorFlow GET returns an array; support both shapes (array or {services})
        const services = Array.isArray(json) ? json : (Array.isArray(json?.services) ? json.services : []);
        
        if (services.length === 0) {
          console.log("No services found, trying fallback...");
          throw new Error("No services found");
        }
        
        // Build unique Level-1 labels from services.categoryPath[0]
        const categories = [];
        const seen = new Set();
        (services || []).forEach((service) => {
          const cp = Array.isArray(service?.categoryPath) ? service.categoryPath : [];
          const lvl1 = cp.length ? String(cp[0]).trim() : '';
          if (!lvl1) return;
          const key = lvl1.toLowerCase();
          if (seen.has(key)) return;
          seen.add(key);
          categories.push({ _id: key, name: lvl1, children: [] });
        });
        
        console.log("Created categories:", categories);
        setLvl1Nodes(categories);
        
      } catch (e) {
        console.error("Primary approach failed, using fallback:", e);
        
        // Fallback to dummy-categories API
        try {
          console.log("Trying fallback to dummy-categories API...");
          const fallbackUrl = `${API_BASE_URL}/api/dummy-vendors/${vendorId}/categories/${categoryId}`;
          const fallbackRes = await fetch(fallbackUrl);
          if (fallbackRes.ok) {
            const fallbackJson = await fallbackRes.json().catch(() => ({}));
            console.log("Fallback API response:", fallbackJson);
            
            // Try to get categories from different possible structures
            let categories = [];
            
            // Check if categories is directly an array
            if (Array.isArray(fallbackJson?.categories)) {
              categories = fallbackJson.categories;
            }
            // Check if categories is an object with a children array
            else if (fallbackJson?.categories?.children && Array.isArray(fallbackJson.categories.children)) {
              categories = fallbackJson.categories.children;
            }
            // Check if there's a direct categories array at root
            else if (Array.isArray(fallbackJson)) {
              categories = fallbackJson;
            }
            
            console.log("Extracted categories:", categories);
            
            if (categories.length > 0) {
              setLvl1Nodes(categories);
              return;
            }
          }
        } catch (fallbackError) {
          console.error("Fallback also failed:", fallbackError);
        }
        
        // Last resort - create dummy categories
        setLvl1Nodes([
          { _id: 'dummy1', name: 'Services', children: [] },
          { _id: 'dummy2', name: 'Products', children: [] }
        ]);
        
        setError("Using fallback categories");
      } finally {
        setLoading(false);
      }
    };
    fetchTree();
  }, [vendorId]);

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

  const handleOpenLvl1 = (node) => {
    try {
      if (!vendorId || !categoryId || !node) return;
      const label = node.name || node._id || node.id;
      if (!label) return;
      router.push(`/preview/${vendorId}/${categoryId}/my-prices/${encodeURIComponent(String(label))}`);
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
