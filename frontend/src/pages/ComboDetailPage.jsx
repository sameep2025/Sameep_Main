import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import API_BASE_URL from "../config";

function ComboDetailPage() {
  const { comboId } = useParams();
  const navigate = useNavigate();
  const [combo, setCombo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [catInfoMap, setCatInfoMap] = useState({}); // id -> { name, parentId, parentName }
  const [isDummy, setIsDummy] = useState(false);

  const toAbs = (u) => {
    if (!u) return "";
    let s = String(u).trim();
    s = s.replace(/\\/g, "/");
    if (/^https?:\/\//i.test(s)) return s;
    s = s.replace(/^\.\//, "");
    s = s.replace(/^\//, "");
    const upIdx = s.toLowerCase().indexOf("uploads/");
    if (upIdx >= 0) s = s.substring(upIdx + "uploads/".length);
    return `${API_BASE_URL}/uploads/${s}`;
  };

  useEffect(() => {
    if (!comboId) return;
    (async () => {
      setLoading(true);
      setError("");
      try {
        // Try dummy combos first
        let data = null;
        try {
          const rDummy = await fetch(`${API_BASE_URL}/api/dummy-combos/${comboId}`);
          if (rDummy.ok) {
            data = await rDummy.json();
            setIsDummy(true);
          }
        } catch {}
        if (!data) {
          const r = await fetch(`${API_BASE_URL}/api/combos/${comboId}`);
          if (!r.ok) throw new Error("Failed to load combo");
          data = await r.json();
          setIsDummy(false);
        }
        setCombo(data);

        // fetch names for category items (and their parents)
        const ids = new Set();
        (data.items || []).forEach((it) => {
          if (it.kind === 'category' && it.categoryId) ids.add(String(it.categoryId));
        });
        if (ids.size) {
          const entries = await Promise.all(Array.from(ids).map(async (id) => {
            try {
              const url = isDummy ? `${API_BASE_URL}/api/dummy-categories/${id}` : `${API_BASE_URL}/api/categories/${id}`;
              const r = await fetch(url);
              if (!r.ok) return [id, { name: 'Service' }];
              const j = await r.json();
              const parentId = j?.parentId || j?.parent || null;
              let parentName = '';
              if (parentId) {
                try {
                  const pr = await fetch(isDummy ? `${API_BASE_URL}/api/dummy-categories/${parentId}` : `${API_BASE_URL}/api/categories/${parentId}`);
                  if (pr.ok) {
                    const pj = await pr.json();
                    parentName = pj?.name || '';
                  }
                } catch {}
              }
              return [id, { name: j?.name || 'Service', parentId: parentId || null, parentName }];
            } catch { return [id, { name: 'Service' }]; }
          }));
          setCatInfoMap(Object.fromEntries(entries));
        } else {
          setCatInfoMap({});
        }
      } catch (e) {
        setError(e.message || "Failed to load combo");
        setCombo(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [comboId, isDummy]);
  
  if (loading) return <div>Loading...</div>;
  if (error) return <div style={{ color: '#991b1b', background: '#fee2e2', border: '1px solid #fecaca', padding: 10, borderRadius: 8 }}>{error}</div>;
  if (!combo) return <div>No combo found.</div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button onClick={async () => {
          const norm = (v) => {
            if (!v) return "";
            if (typeof v === 'string') return v;
            if (typeof v === 'object') return v.$oid || v._id || v.id || String(v);
            return String(v);
          };

          let pid = norm(combo?.parentCategoryId) || norm(combo?.parent);

          if (!pid) {
            const firstCategoryItem = (combo?.items || []).find(it => it.kind === 'category' && it.categoryId);
            if (firstCategoryItem) {
              try {
                const categoryId = norm(firstCategoryItem.categoryId);
                const res = await fetch(isDummy ? `${API_BASE_URL}/api/dummy-categories/${categoryId}` : `${API_BASE_URL}/api/categories/${categoryId}`);
                if (res.ok) {
                  const categoryData = await res.json();
                  pid = norm(categoryData.parentId) || norm(categoryData.parent);
                }
              } catch (e) {
                console.error("Could not fetch parent category ID", e);
              }
            }
          }

          if (pid) {
            navigate(`${isDummy ? '/dummy-categories' : '/categories'}/${pid}?view=packages`, { replace: true });
          } else {
            navigate(-1);
          }
        }} style={{ padding: '6px 12px', border: 'none', borderRadius: 8, background: '#e5e7eb', cursor: 'pointer' }}>← Back</button>
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 24 }}>Manage Combos</h1>

      {/* Per-size cards combining all items */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 24 }}>
        {(() => {
          const items = Array.isArray(combo.items) ? combo.items : [];
          const sizeSet = new Set();
          items.forEach((it) => {
            const vs = Array.isArray(it.variants) ? it.variants : [];
            if (vs.length === 0) sizeSet.add(null);
            vs.forEach((v) => sizeSet.add(v.size || null));
          });
          const sizes = sizeSet.size ? Array.from(sizeSet) : [null];

          return sizes.map((sz, idx) => {
            const title = `${combo.name}${sz ? ` ~ ${sz}` : ''}`;
            // Build display services: parent category names (selected in step 2) or fallback to leaf/custom name
            const services = (() => {
              const seen = new Set();
              const names = [];
              items.forEach((it) => {
                let nm = '';
                if (it.kind === 'custom') nm = it.name || 'Custom Item';
                else {
                  const info = catInfoMap[String(it.categoryId)] || {};
                  nm = info.parentName || info.name || 'Service';
                }
                nm = String(nm || '').trim();
                const key = nm.toLowerCase();
                if (nm && !seen.has(key)) { seen.add(key); names.push(nm); }
              });
              return names;
            })();
            // representative per-size variant: first item with matching size
            const rep = (() => {
              for (const it of items) {
                const vs = Array.isArray(it.variants) ? it.variants : [];
                const v = vs.find((vv) => (vv.size || null) === (sz || null));
                if (v) return v;
              }
              return null;
            })();
            const repPrice = (rep && rep.price != null && rep.price !== '') ? Number(rep.price) : null;
            const base = (combo && combo.basePrice != null && combo.basePrice !== '') ? Number(combo.basePrice) : null;
            const priceText = (repPrice != null && !Number.isNaN(repPrice)) ? `₹${repPrice}` : (base != null && !Number.isNaN(base) ? `₹${base}` : '₹0');
            const termsText = (rep && rep.terms) ? rep.terms : (combo.terms || '');

            return (
              <div key={idx} style={{ border: '1px solid #e2e8f0', borderRadius: 16, background: '#ffffff', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
                <div style={{ height: 150, width: '100%', background: '#f1f5f9', position: 'relative' }}>
                  {rep?.imageUrl ? 
                    <img src={toAbs(rep.imageUrl)} alt={title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> :
                  combo.imageUrl ?
                    <img src={toAbs(combo.imageUrl)} alt={title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> :
                    <div style={{width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontStyle: 'italic'}}>No Image</div>
                  }
                  {combo.iconUrl && 
                    <img src={toAbs(combo.iconUrl)} alt="icon" style={{ position: 'absolute', bottom: -28, right: 20, width: 56, height: 56, borderRadius: '50%', border: '4px solid #fff', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }} />
                  }
                </div>
                <div style={{ padding: '16px', paddingTop: 36 }}>
                  <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 18, marginBottom: 6 }}>{title}</div>
                  <div style={{ fontSize: 13, color: '#1d4ed8', fontWeight: 600, marginBottom: 12, fontStyle: 'italic' }}>{services.join(' • ')}</div>
                  <div style={{ fontSize: 20, color: '#0f172a', fontWeight: 800 }}>{priceText}</div>
                  {termsText ? (
                    <ul style={{ fontSize: 12, color: '#475569', marginTop: 8, paddingLeft: 18, listStylePosition: 'outside' }}>
                      {termsText.split(',').map((term, i) => {
                        const trimmed = term.trim();
                        return trimmed ? <li key={i}>{trimmed}</li> : null;
                      })}
                    </ul>
                  ) : null}
                </div>
              </div>
            );
          });
        })()}
      </div>
    </div>
  );
}

export default ComboDetailPage;
