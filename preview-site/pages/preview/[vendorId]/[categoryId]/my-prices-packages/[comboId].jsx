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

    const role = String(identity?.role || "").trim().toLowerCase();
    if (role === "vendor") return true;
    return !!token;
  } catch {
    return false;
  }
};

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
  const [vendorOverridesBySize, setVendorOverridesBySize] = useState({});
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    if (!comboId) return;
    
    // Check authentication first
    if (!checkAuthentication(vendorId, categoryId)) {
      setSessionExpired(true);
      setLoading(false);
      return;
    }
    
    (async () => {
      try {
        setLoading(true);
        setError("");
        const id = encodeURIComponent(String(comboId));
        const res = await fetch(`${API_BASE_URL}/api/dummy-combos/${id}`);
        if (!res.ok) throw new Error("Failed to load package");
        const data = await res.json().catch(() => null);
        setCombo(data || null);

        // Load vendor-specific overrides for this combo
        if (vendorId) {
          try {
            const ovRes = await fetch(
              `${API_BASE_URL}/api/vendor-combo-pricing/${encodeURIComponent(
                String(vendorId)
              )}/${id}`
            );
            if (ovRes.ok) {
              const rows = await ovRes.json().catch(() => []);
              const map = {};
              (Array.isArray(rows) ? rows : []).forEach((r) => {
                const key = String(r.sizeKey || "default");
                map[key] = r;
              });
              setVendorOverridesBySize(map);
            } else {
              setVendorOverridesBySize({});
            }
          } catch {
            setVendorOverridesBySize({});
          }
        } else {
          setVendorOverridesBySize({});
        }
      } catch (e) {
        console.error("MyPackageDetailPage combo error", e);
        setError(e?.message || "Failed to load package");
        setCombo(null);
        setVendorOverridesBySize({});
      } finally {
        setLoading(false);
      }
    })();
  }, [comboId, vendorId]);

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
        const vendorOverride = vendorOverridesBySize[sz || "default"] || null;
        const overridePrice =
          vendorOverride && vendorOverride.price != null && vendorOverride.price !== ""
            ? Number(vendorOverride.price)
            : null;
        const finalPriceValue =
          overridePrice != null && !Number.isNaN(overridePrice)
            ? overridePrice
            : priceValue;
        const priceText =
          finalPriceValue != null && !Number.isNaN(finalPriceValue)
            ? `₹${finalPriceValue}`
            : "Set price";
        const baseStatus =
          combo.pricingStatusPerSize &&
          typeof combo.pricingStatusPerSize === "object"
            ? combo.pricingStatusPerSize[sz || "default"] || "Inactive"
            : "Inactive";
        const overrideStatus = vendorOverride?.status || null;
        const initialStatus = overrideStatus || baseStatus || "Inactive";
        const mapKey = `${combo._id?.$oid || combo._id || combo.id}|${sz || "default"}`;
        const currentStatus =
          comboPricingStatusByRow[mapKey] || initialStatus || "Inactive";
        return {
          comboId: combo._id?.$oid || combo._id || combo.id,
          comboName,
          size: sz || "Default",
          sizeKey: sz || "default",
          priceValue: finalPriceValue,
          priceText,
          services: allItemsLabel,
          mapKey,
          status: currentStatus,
        };
      });
    } catch {
      return [];
    }
  }, [combo, comboPricingStatusByRow, vendorOverridesBySize]);

  const updateStatus = async (row, nextStatus) => {
    if (!combo || !vendorId) return;
    try {
      const safe = nextStatus === "Active" ? "Active" : "Inactive";
      setComboPricingStatusByRow((prev) => ({ ...prev, [row.mapKey]: safe }));
      const id = combo._id?.$oid || combo._id || combo.id;
      const res = await fetch(
        `${API_BASE_URL}/api/vendor-combo-pricing/${encodeURIComponent(
          String(vendorId)
        )}/${encodeURIComponent(String(id))}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            overrides: [
              {
                sizeKey: row.sizeKey,
                status: safe,
              },
            ],
          }),
        }
      );
      if (!res.ok) {
        if (res.status === 404) {
          console.warn("vendor-combo-pricing status API not found (404); skipping override refresh");
          return;
        }
        throw new Error("Failed to update pricing status");
      }
      const rows = await res.json().catch(() => []);
      const map = {};
      (Array.isArray(rows) ? rows : []).forEach((r) => {
        const key = String(r.sizeKey || "default");
        map[key] = r;
      });
      setVendorOverridesBySize((prev) => ({ ...prev, ...map }));
    } catch (e) {
      console.error("updateStatus error", e);
      alert("Failed to update pricing status");
    }
  };

  const updatePrice = async (row) => {
    if (!combo || !vendorId) return;
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
      const res = await fetch(
        `${API_BASE_URL}/api/vendor-combo-pricing/${encodeURIComponent(
          String(vendorId)
        )}/${encodeURIComponent(String(id))}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            overrides: [
              {
                sizeKey: row.sizeKey,
                price: val,
                status: row.status,
              },
            ],
          }),
        }
      );
      if (!res.ok) {
        if (res.status === 404) {
          console.warn("vendor-combo-pricing price API not found (404); skipping override refresh");
          return;
        }
        throw new Error("Failed to save price");
      }
      const rows = await res.json().catch(() => []);
      const map = {};
      (Array.isArray(rows) ? rows : []).forEach((r) => {
        const key = String(r.sizeKey || "default");
        map[key] = r;
      });
      setVendorOverridesBySize((prev) => ({ ...prev, ...map }));
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

