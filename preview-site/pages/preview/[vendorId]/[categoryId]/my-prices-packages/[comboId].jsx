import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import API_BASE_URL from "../../../../../config";

// My Prices - single Package detail page
// Mirrors DummyVendorCategoriesDetailPage combo logic for one combo:
// - pricingStatusPerSize
// - price editing per size (or basePrice when no size)

export default function MyPackageDetailPage() {
  const router = useRouter();
  const { vendorId, categoryId, comboId } = router.query;

  const [combo, setCombo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [comboPricingStatusByRow, setComboPricingStatusByRow] = useState({});

  useEffect(() => {
    if (!comboId) return;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const id = encodeURIComponent(String(comboId));
        const res = await fetch(`${API_BASE_URL}/api/dummy-combos/${id}`);
        if (!res.ok) throw new Error("Failed to load package");
        const data = await res.json().catch(() => null);
        setCombo(data || null);
      } catch (e) {
        console.error("MyPackageDetailPage combo error", e);
        setError(e?.message || "Failed to load package");
        setCombo(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [comboId]);

  const rows = useMemo(() => {
    try {
      if (!combo) return [];
      const comboName = combo.name || "Package";
      const items = Array.isArray(combo.items) ? combo.items : [];
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
      return sizes.map((sz) => {
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
        const priceText = priceValue != null ? `₹${priceValue}` : "Set price";
        const id = combo._id?.$oid || combo._id || combo.id;
        const sizeKey = sz || "default";
        const baseStatus =
          combo.pricingStatusPerSize &&
          typeof combo.pricingStatusPerSize === "object"
            ? combo.pricingStatusPerSize[sizeKey] || "Inactive"
            : "Inactive";
        const mapKey = `${id}|${sizeKey}`;
        const currentStatus =
          comboPricingStatusByRow[mapKey] || baseStatus || "Inactive";
        return {
          comboId: id,
          comboName,
          size: sz || "Default",
          sizeKey,
          priceValue,
          priceText,
          services: allItemsLabel,
          mapKey,
          status: currentStatus,
        };
      });
    } catch {
      return [];
    }
  }, [combo, comboPricingStatusByRow]);

  const updateStatus = async (row, nextStatus) => {
    if (!combo) return;
    try {
      const safe = nextStatus === "Active" ? "Active" : "Inactive";
      setComboPricingStatusByRow((prev) => ({ ...prev, [row.mapKey]: safe }));
      const sizeKey = row.sizeKey;
      const currentMap =
        combo.pricingStatusPerSize &&
        typeof combo.pricingStatusPerSize === "object"
          ? combo.pricingStatusPerSize
          : {};
      const nextMap = { ...currentMap, [sizeKey]: safe };
      const id = combo._id?.$oid || combo._id || combo.id;
      const res = await fetch(`${API_BASE_URL}/api/dummy-combos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pricingStatusPerSize: nextMap }),
      });
      if (!res.ok) throw new Error("Failed to update pricing status");
      setCombo((prev) => ({ ...(prev || {}), pricingStatusPerSize: nextMap }));
    } catch (e) {
      console.error("updateStatus error", e);
      alert("Failed to update pricing status");
    }
  };

  const updatePrice = async (row) => {
    if (!combo) return;
    try {
      const input = window.prompt("Enter price", row.priceValue != null ? String(row.priceValue) : "");
      if (input == null) return;
      const val = input === "" ? null : Number(input);
      if (input !== "" && Number.isNaN(val)) {
        alert("Invalid price");
        return;
      }
      setSaving(true);
      const id = combo._id?.$oid || combo._id || combo.id;
      const updated = { ...combo };
      const items = Array.isArray(updated.items) ? updated.items : [];
      if (row.sizeKey === "default") {
        // base price when there is no explicit size variant
        updated.basePrice = val;
      }
      updated.items = items.map((it) => {
        const vs = Array.isArray(it.variants) ? it.variants : [];
        if (!vs.length && row.sizeKey === "default") {
          return { ...it };
        }
        const nextVs = vs.map((vv) => {
          const match = (vv.size || null) === (row.sizeKey === "default" ? null : row.sizeKey);
          if (!match) return vv;
          return { ...vv, price: val };
        });
        return { ...it, variants: nextVs };
      });
      const res = await fetch(`${API_BASE_URL}/api/dummy-combos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      if (!res.ok) throw new Error("Failed to save price");
      const fresh = await res.json().catch(() => updated);
      setCombo(fresh || updated);
    } catch (e) {
      console.error("updatePrice error", e);
      alert("Failed to save price");
    } finally {
      setSaving(false);
    }
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
              router.push(`/preview/${vendorId}/${categoryId}/my-prices-packages`);
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
          {combo?.name || "Package"}
        </h2>
      </div>

      {loading ? (
        <div style={{ padding: 16 }}>Loading package...</div>
      ) : error ? (
        <div style={{ padding: 16, color: "#b91c1c" }}>{error}</div>
      ) : !rows.length ? (
        <div style={{ padding: 16 }}>No sizes found for this package.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {rows.map((row) => {
            const isActive =
              String(row.status || "").trim().toLowerCase() === "active";
            return (
              <div
                key={row.mapKey}
                style={{
                  background: "#ffffff",
                  borderRadius: 16,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                  padding: 12,
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
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>
                      {row.comboName}
                    </div>
                    <div
                      style={{ fontSize: 12, color: "#4b5563", marginTop: 2 }}
                    >
                      Size: {row.size}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: isActive ? "#dcfce7" : "#fee2e2",
                      color: isActive ? "#16a34a" : "#b91c1c",
                    }}
                  >
                    {row.status || "Inactive"}
                  </div>
                </div>
                <div
                  style={{ fontSize: 12, color: "#4b5563", marginBottom: 6 }}
                >
                  {row.services}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginTop: 4,
                  }}
                >
                  <div
                    style={{ fontSize: 14, fontWeight: 700, color: "#16a34a" }}
                  >
                    {row.priceText}
                  </div>
                  <button
                    type="button"
                    onClick={() => updatePrice(row)}
                    disabled={saving}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "#2563eb",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    {saving ? "Saving..." : "Edit price"}
                  </button>
                </div>
                <div
                  style={{
                    borderTop: "1px solid #e5e7eb",
                    marginTop: 8,
                    paddingTop: 6,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: "#4b5563" }}>
                    {isActive
                      ? "Make this package inactive"
                      : "Make this package active"}
                  </span>
                  <label
                    style={{
                      position: "relative",
                      display: "inline-block",
                      width: 44,
                      height: 24,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) =>
                        updateStatus(row, e.target.checked ? "Active" : "Inactive")
                      }
                      style={{ display: "none" }}
                    />
                    <span
                      style={{
                        position: "absolute",
                        cursor: "pointer",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: isActive ? "#16a34a" : "#d1d5db",
                        transition: ".2s",
                        borderRadius: 999,
                      }}
                    />
                    <span
                      style={{
                        position: "absolute",
                        left: isActive ? 22 : 2,
                        top: 2,
                        width: 20,
                        height: 20,
                        backgroundColor: "white",
                        borderRadius: "50%",
                        transition: ".2s",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                      }}
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

