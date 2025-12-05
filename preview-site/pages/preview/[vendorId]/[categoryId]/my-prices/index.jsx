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

    if (!token || !identityStr) return false;

    const identity = JSON.parse(identityStr);
    return !!(identity && identity.loggedIn === true);
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
      return;
    }
    
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
