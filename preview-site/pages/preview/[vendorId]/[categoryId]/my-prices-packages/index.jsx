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

    if (!token || !identityStr) return false;

    const identity = JSON.parse(identityStr);
    return !!(identity && identity.loggedIn === true);
  } catch {
    return false;
  }
};

// My Prices - Packages list page
// Shows all dummy combos (packages) for this category and lets the vendor
// drill down into a combo detail page for price + status editing.

export default function MyPackagesListPage() {
  const router = useRouter();
  const { vendorId, categoryId } = router.query;

  const [combos, setCombos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [vendorOverrides, setVendorOverrides] = useState({}); // key: `${comboId}|${sizeKey}` -> { price, status }
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    if (!categoryId) return;
    
    // Check authentication first
    if (!checkAuthentication(vendorId, categoryId)) {
      setSessionExpired(true);
      return;
    }
    
    (async () => {
      try {
        setLoading(true);
        setError("");
        let res = await fetch(
          `${API_BASE_URL}/api/dummy-combos?parentCategoryId=${categoryId}`
        );
        if (!res.ok) throw new Error("Failed to load packages");
        let data = await res.json().catch(() => []);
        let arr = Array.isArray(data) ? data : [];
        if (!arr.length) {
          // Fallback endpoint used in admin page
          try {
            res = await fetch(
              `${API_BASE_URL}/api/dummy-combos/byParent/${categoryId}`
            );
            data = await res.json().catch(() => []);
            arr = Array.isArray(data) ? data : [];
          } catch {}
        }
        setCombos(arr);

        // Fetch vendor-specific overrides for all combos in this category
        if (vendorId) {
          try {
            const ovRes = await fetch(
              `${API_BASE_URL}/api/vendor-combo-pricing/${encodeURIComponent(
                String(vendorId)
              )}?categoryId=${encodeURIComponent(String(categoryId))}`
            );
            if (ovRes.ok) {
              const rows = await ovRes.json().catch(() => []);
              const map = {};
              (Array.isArray(rows) ? rows : []).forEach((r) => {
                const cid = String(r.comboId || "");
                const sk = String(r.sizeKey || "default");
                if (!cid) return;
                map[`${cid}|${sk}`] = {
                  price: typeof r.price === "number" ? r.price : null,
                  status: r.status || "Inactive",
                };
              });
              setVendorOverrides(map);
            } else {
              setVendorOverrides({});
            }
          } catch {
            setVendorOverrides({});
          }
        } else {
          setVendorOverrides({});
        }
      } catch (e) {
        console.error("MyPackagesListPage combos error", e);
        setError(e?.message || "Failed to load packages");
        setCombos([]);
        setVendorOverrides({});
      } finally {
        setLoading(false);
      }
    })();
  }, [categoryId, vendorId]);

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

  const comboRows = useMemo(() => {
    try {
      const out = [];
      const list = Array.isArray(combos) ? combos : [];
      list.forEach((combo) => {
        const comboName = combo?.name || "Package";
        const items = Array.isArray(combo?.items) ? combo.items : [];
        const sizeSet = new Set();
        items.forEach((it) => {
          const vs = Array.isArray(it?.variants) ? it.variants : [];
          if (vs.length === 0) sizeSet.add(null);
          vs.forEach((v) => sizeSet.add(v?.size ?? null));
        });
        const sizes = sizeSet.size ? Array.from(sizeSet) : [null];
        const allItemsLabel = (() => {
          const seen = new Set();
          const names = [];
          items.forEach((it) => {
            let nm = "";
            if (it.kind === "custom") nm = it.name || "Custom";
            else nm = it.displayName || it.name || "Service";
            nm = String(nm || "").trim();
            const key = nm.toLowerCase();
            if (nm && !seen.has(key)) {
              seen.add(key);
              names.push(nm);
            }
          });
          return names.join(", ");
        })();
        sizes.forEach((sz) => {
          let rep = null;
          for (const it of items) {
            const vs = Array.isArray(it?.variants) ? it.variants : [];
            const v = vs.find((vv) => (vv?.size ?? null) === (sz ?? null));
            if (v) {
              rep = v;
              break;
            }
          }
          const repPrice =
            rep && rep.price != null && rep.price !== ""
              ? Number(rep.price)
              : null;
          const base =
            combo && combo.basePrice != null && combo.basePrice !== ""
              ? Number(combo.basePrice)
              : null;
          const priceValue =
            repPrice != null && !Number.isNaN(repPrice)
              ? repPrice
              : base != null && !Number.isNaN(base)
              ? base
              : null;
          const comboId = combo._id?.$oid || combo._id || combo.id;
          const sizeKey = sz || "default";
          const ovKey = `${comboId}|${sizeKey}`;
          const override = vendorOverrides[ovKey];
          const overridePrice =
            override && override.price != null && !Number.isNaN(override.price)
              ? override.price
              : null;
          const finalPriceValue =
            overridePrice != null ? overridePrice : priceValue;
          const priceText =
            finalPriceValue != null && !Number.isNaN(finalPriceValue)
              ? `₹${finalPriceValue}`
              : "—";
          const baseStatus =
            combo.pricingStatusPerSize &&
            typeof combo.pricingStatusPerSize === "object"
              ? combo.pricingStatusPerSize[sizeKey] || "Inactive"
              : "Inactive";
          const finalStatus = override?.status || baseStatus || "Inactive";
          out.push({
            comboId,
            comboName,
            size: sz || "Default",
            priceText,
            status: finalStatus,
            services: allItemsLabel,
          });
        });
      });
      return out;
    } catch {
      return [];
    }
  }, [combos, vendorOverrides]);

  const handleOpenCombo = (comboId) => {
    try {
      if (!vendorId || !categoryId || !comboId) return;
      router.push(
        `/preview/${vendorId}/${categoryId}/my-prices-packages/${encodeURIComponent(
          String(comboId)
        )}`
      );
    } catch {}
  };

  if (!vendorId || !categoryId) {
    return <div style={{ padding: 16 }}>Missing vendor or category</div>;
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
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
          My Packages
        </h2>
      </div>

      {loading ? (
        <div style={{ padding: 16 }}>Loading packages...</div>
      ) : error ? (
        <div style={{ padding: 16, color: "#b91c1c" }}>{error}</div>
      ) : !comboRows.length ? (
        <div style={{ padding: 16 }}>No packages found.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {comboRows.map((row, idx) => (
            <div
              key={`${row.comboId}-${idx}`}
              onClick={() => handleOpenCombo(row.comboId)}
              style={{
                background: "#ffffff",
                borderRadius: 16,
                boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                padding: 12,
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 4,
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 700 }}>
                  {row.comboName}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    padding: "2px 8px",
                    borderRadius: 999,
                    background:
                      String(row.status || "").toLowerCase() === "active"
                        ? "#dcfce7"
                        : "#fee2e2",
                    color:
                      String(row.status || "").toLowerCase() === "active"
                        ? "#16a34a"
                        : "#b91c1c",
                  }}
                >
                  {row.status || "Inactive"}
                </div>
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "#4b5563",
                  marginBottom: 4,
                }}
              >
                {row.services || "Services"}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#16a34a" }}>
                {row.priceText}
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 11,
                  color: "#6b7280",
                }}
              >
                Tap to manage sizes & pricing
              </div>
            </div>
          ))}
        </div>
      )}

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

