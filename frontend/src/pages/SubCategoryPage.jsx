// pages/SubCategoryPage.jsx
import { useEffect, useState } from "react";
import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
import CategoryList from "../components/CategoryList";
import ManageCombosModal from "../components/ManageCombosModal";

function SubCategoryPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [showCombos, setShowCombos] = useState(false);
  const [combos, setCombos] = useState([]);
  const [editingCombo, setEditingCombo] = useState(null);
  const [combosLoading, setCombosLoading] = useState(false);
  const [combosError, setCombosError] = useState("");
  const [showDebug, setShowDebug] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [isTopParentSubcategory, setIsTopParentSubcategory] = useState(false);
  const [viewMode, setViewMode] = useState('individual'); // 'individual' | 'packages'
  const [catNameMap, setCatNameMap] = useState({}); // id -> name

  useEffect(() => {
    const fetchBreadcrumbs = async () => {
      try {
        let currentId = id;
        const chain = [];

        // keep going up until no parent
        while (currentId) {
          const res = await fetch(`http://localhost:5000/api/categories/${currentId}`);
          if (!res.ok) break;
          const data = await res.json();
          chain.unshift(data); // add to front
          currentId = data.parentId || data.parent; // move to parent
        }

        setBreadcrumbs(chain);
        setIsTopParentSubcategory(chain.length === 1);
      } catch (err) {
        console.error("Failed to fetch breadcrumbs", err);
      }
    };

    fetchBreadcrumbs();
  }, [id]);

  // pick up view mode from query parameter (?view=packages)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const v = (params.get('view') || '').toLowerCase();
    if (v === 'packages') setViewMode('packages');
    else if (v === 'individual') setViewMode('individual');
  }, [location.search]);

  const toAbs = (u) => {
    if (!u) return "";
    if (u.startsWith("http://") || u.startsWith("https://")) return u;
    return `http://localhost:5000/uploads/${u}`;
  };

  const loadCombos = async () => {
    setCombosLoading(true);
    setCombosError("");
    try {
      let res = await fetch(`http://localhost:5000/api/combos/byParent/${id}`);
      let data;
      if (res.ok) {
        data = await res.json();
      } else {
        // fallback to query param endpoint
        res = await fetch(`http://localhost:5000/api/combos?parentCategoryId=${id}`);
        data = await res.json();
      }
      let arr = Array.isArray(data) ? data : [];
      // final fallback: fetch all and filter client-side (handles Extended JSON $oid)
      if (arr.length === 0) {
        try {
          const allRes = await fetch(`http://localhost:5000/api/combos`);
          const allData = await allRes.json();
          if (Array.isArray(allData)) {
            const norm = (v) => (typeof v === 'string' ? v : v?.$oid || v?._id || v);
            arr = allData.filter((c) => norm(c.parentCategoryId) === id);
          }
        } catch {}
      }
      setCombos(arr);
      // Build a set of category IDs used in combo items so we can name them in cards
      const ids = new Set();
      arr.forEach((combo) => {
        (combo.items || []).forEach((it) => {
          if (it.kind === 'category' && (it.categoryId || it.categoryID)) {
            const v = String(it.categoryId || it.categoryID);
            if (v) ids.add(v);
          }
        });
      });
      if (ids.size) {
        const entries = await Promise.all(
          Array.from(ids).map(async (cid) => {
            try {
              const r = await fetch(`http://localhost:5000/api/categories/${cid}`);
              if (!r.ok) return [cid, 'Service'];
              const j = await r.json();
              return [cid, j?.name || 'Service'];
            } catch { return [cid, 'Service']; }
          })
        );
        const map = Object.fromEntries(entries);
        setCatNameMap(map);
      } else {
        setCatNameMap({});
      }
    } catch (e) {
      setCombos([]);
      setCombosError("Failed to load combos");
    }
    setCombosLoading(false);
  };

  useEffect(() => {
    if (!id) return;
    loadCombos();
  }, [id]);

  return (
    <div>
      {/* ✅ Breadcrumb Navigation */}
      <nav style={{ marginBottom: "10px" }}>
        <Link to="/categories">Home</Link>
        {breadcrumbs.map((cat, index) => (
          <span key={cat.id || cat._id}>
            {" > "}
            {index === breadcrumbs.length - 1 ? (
              <b>{cat.name}</b> // current category (not clickable)
            ) : (
              <Link to={`/categories/${cat.id || cat._id}`}>{cat.name}</Link>
            )}
          </span>
        ))}
      </nav>

      <h1 style={{ margin: 0 }}>
        {breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1].name : "Subcategories"}
      </h1>

      <div
  style={{
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    margin: "20px 0",
    flexWrap: "wrap",
    gap: 12,
  }}
>
  <h3 style={{ margin: 0, fontWeight: 700, color: "#0f172a" }}>
    {viewMode === "individual"
      ? "Subcategories"
      : `Packages ${combos.length ? `(${combos.length})` : ""}`}
  </h3>

  {/* Right side — toggle + manage combos inline */}
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      border: "1px solid #e5e7eb",
      borderRadius: 8,
      height: 38,
      padding: "4px 5px",
      background: "#f8fafc",
    }}
  >
    <button
      onClick={() => { setViewMode("individual"); navigate(`/categories/${id}?view=individual`); }}
      style={{
        height: 30,
        padding: "0 12px",
        borderRadius: 6,
        border: "none",
        background: viewMode === "individual" ? "#0ea5e9" : "transparent",
        color: viewMode === "individual" ? "#fff" : "#0f172a",
        fontWeight: 600,
        cursor: "pointer",
        transition: "0.2s ease",
      }}
    >
      Individual
    </button>

    <button
      onClick={() => { setViewMode("packages"); navigate(`/categories/${id}?view=packages`); }}
      style={{
        height: 30,
        padding: "0 12px",
        borderRadius: 6,
        border: "none",
        background: viewMode === "packages" ? "#0ea5e9" : "transparent",
        color: viewMode === "packages" ? "#fff" : "#0f172a",
        fontWeight: 600,
        cursor: "pointer",
        transition: "0.2s ease",
      }}
    >
      Packages
    </button>

    {/* ✅ Manage Combos moved here inline */}
    <button
      onClick={() => setShowCombos(true)}
      style={{
        height: 30,
        padding: "0 12px",
        borderRadius: 6,
        background: "#0ea5e9",
        color: "#fff",
        border: "none",
        cursor: "pointer",
        fontWeight: 600,
        boxShadow: "0 2px 6px rgba(14,165,233,0.3)",
        marginLeft: 8,
      }}
    >
      Manage Combos
    </button>
  </div>
</div>



      {viewMode === 'individual' && (
        <CategoryList parentId={id} />
      )}

      {viewMode === 'packages' && (
      <div style={{ marginTop: 12 }}>
        {combosLoading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {[...Array(3)].map((_, i) => (
              <div key={i} style={{ border: "1px solid #eee", borderRadius: 10, padding: 10, background: "#fafafa", height: 70 }} />
            ))}
          </div>
        ) : combosError ? (
          <div style={{ color: "#991b1b", background: "#fee2e2", border: "1px solid #fecaca", padding: 10, borderRadius: 8 }}>{combosError}</div>
        ) : combos.length === 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              border: "1px dashed #cbd5e1",
              borderRadius: 10,
              padding: 14,
              background: "#f8fafc",
              textAlign: "center"
            }}
          >
            <div style={{ color: "#334155" }}>No packages have been created for this subcategory yet.</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
            {combos.flatMap((c) => {
              const cid = c._id?.$oid || c._id || c.id;
              // Build size list by union of variant sizes across items; default to [null]
              const items = Array.isArray(c.items) ? c.items : [];
              const sizeSet = new Set();
              items.forEach(it => {
                const vs = Array.isArray(it.variants) ? it.variants : [];
                if (vs.length === 0) sizeSet.add(null);
                vs.forEach(v => sizeSet.add(v.size || null));
              });
              const sizes = sizeSet.size ? Array.from(sizeSet) : [null];

              return sizes.map((sz, idx) => {
                // Title: Combo Name ~ Size
                const title = `${c.name}${sz ? ` ~ ${sz}` : ""}`;
                // Services: names list
                const services = items.map(it => it.kind === 'custom' ? (it.name || 'Custom Item') : (catNameMap[String(it.categoryId)] || 'Service')).filter(Boolean);
                // Representative variant per size: take first item's matching variant
                const rep = (() => {
                  for (const it of items) {
                    const vs = Array.isArray(it.variants) ? it.variants : [];
                    const v = vs.find(vv => (vv.size || null) === (sz || null));
                    if (v) return v;
                  }
                  return null;
                })();
                const repPrice = (rep && rep.price != null && rep.price !== '') ? Number(rep.price) : null;
                const base = (c && c.basePrice != null && c.basePrice !== '') ? Number(c.basePrice) : null;
                const priceText = (repPrice != null && !Number.isNaN(repPrice))
                  ? `₹${repPrice}`
                  : (base != null && !Number.isNaN(base) ? `₹${base}` : '₹0');
                const termsText = (rep && rep.terms) ? rep.terms : (c.terms || '');

                return (
                  <div key={`${cid}-${idx}`} style={{ border: "1px solid #e2e8f0", borderRadius: 12, background: "#ffffff", boxShadow: '0 2px 8px rgba(0,0,0,0.05)', transition: 'box-shadow 150ms ease', cursor: 'pointer' }}>
                    <div style={{ padding: 12 }} onClick={() => navigate(`/combos/${cid}`)}>
                      {/* Media */}
                      <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                        {rep?.imageUrl ? (
                          <img src={toAbs(rep.imageUrl)} alt={title} style={{ width: 180, height: 120, objectFit: 'cover', borderRadius: 10, border: '1px solid #e2e8f0' }} />
                        ) : (
                          c.imageUrl && (
                            <img src={toAbs(c.imageUrl)} alt={title} style={{ width: 180, height: 120, objectFit: 'cover', borderRadius: 10, border: '1px solid #e2e8f0' }} />
                          )
                        )}

                        {c.iconUrl && (
                          <img src={toAbs(c.iconUrl)} alt={title} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 10, border: '1px solid #e2e8f0', alignSelf: 'flex-start' }} />
                        )}
                      </div>
                      {/* Title */}
                      <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 18, marginBottom: 6 }}>{title}</div>
                      {/* Services list */}
                      <div style={{ fontSize: 13, color: '#1d4ed8', fontWeight: 700, marginBottom: 6 }}>
                        {services.join(', ')}
                      </div>
                      {/* Price and terms */}
                      <div style={{ fontSize: 14, color: '#0f172a', fontWeight: 700 }}>{priceText}</div>
                      {termsText ? <div style={{ fontSize: 12, color: '#475569' }}>{termsText}</div> : null}
                    </div>

                    <div style={{ borderTop: '1px solid #e2e8f0', padding: '8px 12px', display: "flex", justifyContent: "flex-end", gap: 8 }}>
                      <button title="Edit" onClick={() => { setEditingCombo(c); setShowCombos(true); }} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 6, background: "#fff", color: "#0ea5e9", cursor: "pointer", fontWeight: 600 }}>
                        ✏️
                      </button>
                      <button title="Delete"
                        onClick={async () => {
                          if (!window.confirm("Delete this combo?")) return;
                          try {
                            const delId = c._id?.$oid || c._id || c.id;
                            const res = await fetch(`http://localhost:5000/api/combos/${delId}`, { method: "DELETE" });
                            if (!res.ok) throw new Error("Failed to delete");
                            loadCombos();
                          } catch (e) {
                            alert(e.message || "Failed to delete");
                          }
                        }}
                        style={{ border: "1px solid #fee2e2", borderRadius: 8, padding: 6, background: "#fff", color: "#ef4444", cursor: "pointer", fontWeight: 600 }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              });
            })}
          </div>
        )}
      </div>
      )}

      <ManageCombosModal
        show={showCombos}
        onClose={() => { setShowCombos(false); setEditingCombo(null); }}
        subcategoryId={id}
        initialEditingCombo={editingCombo}
        onSaved={() => loadCombos()}
      />
    </div>
  );
}

export default SubCategoryPage;