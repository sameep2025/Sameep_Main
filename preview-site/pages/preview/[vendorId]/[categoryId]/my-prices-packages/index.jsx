import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import API_BASE_URL from "../../../../../config";

// My Prices - Packages list page
// Shows all dummy combos (packages) for this category and lets the vendor
// drill down into a combo detail page for price + status editing.

export default function MyPackagesListPage() {
  const router = useRouter();
  const { vendorId, categoryId } = router.query;

  const [combos, setCombos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!categoryId) return;
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
      } catch (e) {
        console.error("MyPackagesListPage combos error", e);
        setError(e?.message || "Failed to load packages");
        setCombos([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [categoryId]);

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
          const priceText = priceValue != null ? `₹${priceValue}` : "—";
          const comboId = combo._id?.$oid || combo._id || combo.id;
          const sizeKey = sz || "default";
          const baseStatus =
            combo.pricingStatusPerSize &&
            typeof combo.pricingStatusPerSize === "object"
              ? combo.pricingStatusPerSize[sizeKey] || "Inactive"
              : "Inactive";
          out.push({
            comboId,
            comboName,
            size: sz || "Default",
            priceText,
            status: baseStatus,
            services: allItemsLabel,
          });
        });
      });
      return out;
    } catch {
      return [];
    }
  }, [combos]);

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
    </div>
  );
}

