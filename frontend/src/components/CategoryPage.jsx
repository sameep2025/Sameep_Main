import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";

import CategoryList from "./CategoryList";
import ManageCombosModal from "../components/ManageCombosModal";

function CategoryPage() {
  const { parentId } = useParams();
  const navigate = useNavigate();
  const [showCombos, setShowCombos] = useState(false);
  const [combos, setCombos] = useState([]);

  const [combosLoading, setCombosLoading] = useState(false);
  const [combosError, setCombosError] = useState("");
  const [editingCombo, setEditingCombo] = useState(null);
  const [viewMode, setViewMode] = useState("individual"); // 'individual' | 'packages'

  const [isTopParentSubcategory, setIsTopParentSubcategory] = useState(false);
  // Linked attributes selector state for top-level parent
  const [showMasterSelector, setShowMasterSelector] = useState(false);
  const [allMasters, setAllMasters] = useState([]);
  const [selectedMasterIndex, setSelectedMasterIndex] = useState(null);
  const [linkedAttributes, setLinkedAttributes] = useState({});
  const [savingLinked, setSavingLinked] = useState(false);
  const [modelsByFamily, setModelsByFamily] = useState({});
  const familyToModelCategory = {
    cars: 'car',
    bikes: 'bike',
    tempobus: 'tempoBus',
    tempoBus: 'tempoBus',
    tempoMinibuses: 'tempoBus',
  };
  const fetchModelsForFamily = async (familyKey) => {
    if (!familyKey) return;
    if (modelsByFamily[familyKey]) return modelsByFamily[familyKey];
    const exact = familyKey.toString().trim();
    const normalized = exact.toLowerCase();
    const category = familyToModelCategory[exact] || familyToModelCategory[normalized] || exact;
    try {
      const url = `http://localhost:5000/api/models?category=${encodeURIComponent(category)}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      const models = Array.isArray(data)
        ? data.map((d) => ({ _id: d._id, name: d.model || d.name || d.modelName || '', raw: d }))
        : [];
      setModelsByFamily((prev) => ({ ...prev, [familyKey]: models }));
      return models;
    } catch {}
  };

  const toAbs = (u) => {
    if (!u) return "";
    let s = String(u).trim();
    // normalize slashes
    s = s.replace(/\\/g, "/");
    // if absolute URL, return as is
    if (/^https?:\/\//i.test(s)) return s;
    // strip leading ./ or /
    s = s.replace(/^\.\//, "");
    s = s.replace(/^\//, "");
    // if path contains uploads/, take the part after it
    const upIdx = s.toLowerCase().indexOf("uploads/");
    if (upIdx >= 0) s = s.substring(upIdx + "uploads/".length);
    // now compose absolute URL to backend uploads
    return `http://localhost:5000/uploads/${s}`;
  };

  const loadCombos = async () => {
    if (!parentId) return;
    setCombosLoading(true);
    setCombosError("");
    try {
      let res = await fetch(`http://localhost:5000/api/combos/byParent/${parentId}`);
      let data;
      if (res.ok) {
        data = await res.json();
      } else {
        res = await fetch(`http://localhost:5000/api/combos?parentCategoryId=${parentId}`);
        data = await res.json();
      }
      let arr = Array.isArray(data) ? data : [];
      if (arr.length === 0) {
        try {
          const allRes = await fetch(`http://localhost:5000/api/combos`);
          const allData = await allRes.json();
          if (Array.isArray(allData)) {
            const norm = (v) => (typeof v === 'string' ? v : v?.$oid || v?._id || v);
            arr = allData.filter((c) => norm(c.parentCategoryId) === parentId);
          }
        } catch {}
      }
      setCombos(arr);
    } catch (e) {
      setCombos([]);
      setCombosError("Failed to load combos");
    }
    setCombosLoading(false);
  };

  useEffect(() => {
    if (!parentId) return;
    loadCombos();
  }, [parentId]);

  useEffect(() => {
    const checkTop = async () => {
      if (!parentId) { setIsTopParentSubcategory(false); return; }
      try {
        const res = await fetch(`http://localhost:5000/api/categories/${parentId}`);
        if (!res.ok) { setIsTopParentSubcategory(false); return; }
        const data = await res.json();
        const hasParent = Boolean(data?.parent || data?.parentId);
        setIsTopParentSubcategory(!hasParent);
        // preload existing linked attributes for this category
        setLinkedAttributes(data?.linkedAttributes || {});
      } catch {
        setIsTopParentSubcategory(false);
      }
    };
    checkTop();
  }, [parentId]);

  // Load masters when opening selector
  useEffect(() => {
    if (!showMasterSelector) return;
    (async () => {
      try {
        const res = await fetch('http://localhost:5000/api/masters');
        const data = await res.json();
        setAllMasters(Array.isArray(data) ? data : []);
      } catch { setAllMasters([]); }
    })();
  }, [showMasterSelector]);

  return (
    <div>
      <h1 style={{ margin: "4px 0 8px 0", fontSize: "22px", fontWeight: "700" }}>
        {parentId ? "Subcategories" : "Categories"}
      </h1>

      {parentId && isTopParentSubcategory && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", margin: "20px 0" }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', border: '1px solid #e5e7eb', padding: 4, borderRadius: 8 }}>
              <button onClick={() => setViewMode('individual')} style={{ padding: '6px 10px', borderRadius: 6, border: 'none', background: viewMode==='individual' ? '#0ea5e9' : 'transparent', color: viewMode==='individual' ? '#fff' : '#0f172a', fontWeight: 600 }}>Individual</button>
              <button onClick={() => setViewMode('packages')} style={{ padding: '6px 10px', borderRadius: 6, border: 'none', background: viewMode==='packages' ? '#0ea5e9' : 'transparent', color: viewMode==='packages' ? '#fff' : '#0f172a', fontWeight: 600 }}>Packages</button>
            </div>
            {/* Link Attributes for Pricing button removed for subcategories */}
          </div>
        </div>
      )}

      {(!parentId || viewMode === 'individual') && (
        <CategoryList
          parentId={parentId || null}
          onManageCombosClick={() => setShowCombos(true)}
          showManageCombosButton={parentId && isTopParentSubcategory}
        />
      )}

      {parentId && viewMode === 'packages' && (
        <div style={{ marginTop: 12 }}>
          {combosLoading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
              {[...Array(3)].map((_, i) => (
                <div key={i} style={{ border: "1px solid #eee", borderRadius: 10, padding: 10, background: "#fafafa", height: 70 }} />
              ))}
            </div>
          ) : combosError ? (
            <div style={{ color: '#991b1b', background: '#fee2e2', border: '1px solid #fecaca', padding: 10, borderRadius: 8 }}>{combosError}</div>
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
                textAlign: "center",
              }}
            >
              <div style={{ color: "#334155" }}>No packages have been created for this subcategory yet.</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
              {combos.map((c) => {
                const cid = c._id?.$oid || c._id || c.id;
                return (
                  <div key={cid} style={{ border: "1px solid #e2e8f0", borderRadius: 12, background: "#ffffff", boxShadow: '0 2px 8px rgba(0,0,0,0.05)', overflow: 'hidden', cursor: 'pointer' }} onClick={() => navigate(`/combos/${cid}`)}>
                    {/* Hero image with overlay title/price */}
                    <div style={{ position: 'relative', width: '100%', height: 160, background: '#f1f5f9' }}>
                      {c.iconUrl || c.imageUrl ? (
                        <img src={toAbs(c.iconUrl || c.imageUrl)} alt={c.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : null}
                      <div style={{ position: 'absolute', left: 10, bottom: 10, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>
                        <div style={{ fontWeight: 700, fontSize: 18 }}>{c.name}</div>
                        <div style={{ fontWeight: 500, opacity: 0.95 }}>{typeof c.basePrice === 'number' ? `₹${c.basePrice} onWards` : ''}</div>
                      </div>
                    </div>
                    <div style={{ borderTop: '1px solid #e2e8f0', padding: '8px 12px', display: "flex", justifyContent: "flex-end", gap: 8 }}>
                      <button title="Edit" onClick={(e) => { e.stopPropagation(); setEditingCombo(c); setShowCombos(true); }} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 6, background: "#fff", color: "#0ea5e9", cursor: "pointer", fontWeight: 600 }}>
                        ✏️
                      </button>
                      <button title="Delete"
                        onClick={async (e) => {
                          e.stopPropagation();
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
              })}
            </div>
          )}
        </div>
      )}

      <ManageCombosModal
        show={showCombos}
        onClose={() => { setShowCombos(false); setEditingCombo(null); }}
        subcategoryId={parentId || null}
        initialEditingCombo={editingCombo}
        onSaved={() => loadCombos()}
      />

      {/* Linked Attributes Selector Modal (Top-level parent) */}
      {showMasterSelector && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}>
          <div style={{ background: '#fff', borderRadius: 12, width: 800, maxWidth: '95vw', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: 14, borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, color: '#0078d7' }}>Link Attributes for Pricing</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => setShowMasterSelector(false)} style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: '#d9534f', color: '#fff', fontWeight: 600 }}>Close</button>
                <button type="button" onClick={() => setLinkedAttributes({})} style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 600 }}>Clear</button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 0, minHeight: 420 }}>
              {/* Left pane: master families/types */}
              <div style={{ borderRight: '1px solid #eee', overflowY: 'auto' }}>
                {(() => {
                  const masters = Array.isArray(allMasters) ? allMasters : [];
                  const titleCase = (key) => key
                    .replace(/([A-Z])/g, ' $1')
                    .replace(/[-_]/g, ' ')
                    .replace(/^\s+|\s+$/g, '')
                    .split(' ')
                    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(' ');
                  const byFamily = new Map();
                  masters.forEach((m) => {
                    const fam = (m.type || '').toString().trim();
                    const ft = (m.fieldType || '').toString().trim();
                    if (!fam) return;
                    if (ft) {
                      if (!byFamily.has(fam)) byFamily.set(fam, new Set());
                      byFamily.get(fam).add(ft);
                    }
                  });
                  const familyItems = Array.from(byFamily.keys()).map((fam) => ({ _id: `family:${fam}`, name: titleCase(fam), __mode: 'family', key: fam }));
                  const typesWithFieldTypes = new Set(byFamily.keys());
                  const otherTypesSet = new Set();
                  masters.forEach((m) => {
                    const t = (m.type || '').toString().trim();
                    const ft = (m.fieldType || '').toString().trim();
                    if (t && !ft && !typesWithFieldTypes.has(t)) otherTypesSet.add(t);
                  });
                  const otherItems = Array.from(otherTypesSet).map((t) => ({ _id: `type:${t}`, name: titleCase(t), __mode: 'type', key: t }));
                  const items = [...familyItems, ...otherItems];
                  if (items.length === 0) return <div style={{ padding: 10, color: '#64748b' }}>No data found.</div>;
                  return items.map((m, idx) => (
                    <div
                      key={m._id}
                      onClick={() => {
                        setSelectedMasterIndex(idx);
                        const famKey = m.key;
                        fetchModelsForFamily(famKey)?.catch(() => {});
                      }}
                      style={{ padding: 10, cursor: 'pointer', background: selectedMasterIndex === idx ? '#e8f2ff' : '#fff', color: selectedMasterIndex === idx ? '#0f69c9' : '#333', borderBottom: '1px solid #f3f4f6' }}
                    >
                      {m.name}
                    </div>
                  ));
                })()}
              </div>
              {/* Right pane: children for selected group */}
              <div style={{ overflowY: 'auto', padding: 10 }}>
                {(() => {
                  const masters = Array.isArray(allMasters) ? allMasters : [];
                  const titleCase = (key) => key
                    .replace(/([A-Z])/g, ' $1')
                    .replace(/[-_]/g, ' ')
                    .replace(/^\s+|\s+$/g, '')
                    .split(' ')
                    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(' ');
                  const byFamily = new Map();
                  const typeOnlyCounts = new Map();
                  masters.forEach((m) => {
                    const fam = (m.type || '').toString().trim();
                    const ft = (m.fieldType || '').toString().trim();
                    if (fam && ft) {
                      if (!byFamily.has(fam)) byFamily.set(fam, new Set());
                      byFamily.get(fam).add(ft);
                    }
                    if (fam && !ft) typeOnlyCounts.set(fam, (typeOnlyCounts.get(fam) || 0) + 1);
                  });
                  const familyItems = Array.from(byFamily.keys()).map((fam) => ({ _id: `family:${fam}`, name: titleCase(fam), __mode: 'family', key: fam.toString().trim() }));
                  const otherItems = Array.from(typeOnlyCounts.keys()).filter((t) => !byFamily.has(t)).map((t) => ({ _id: `type:${t}`, name: titleCase(t), __mode: 'type', key: t.toString().trim() }));
                  const categories = [...familyItems, ...otherItems];
                  const sel = categories.length > 0 ? categories[Math.min(selectedMasterIndex ?? 0, categories.length - 1)] : null;
                  if (!sel) return <div style={{ padding: 10, color: '#64748b' }}>Select a dataset.</div>;

                  if (sel.__mode === 'family') {
                    if (sel.key === 'businessField') {
                      const items = masters.filter((m) => (m.type || '').toString().trim() === 'businessField');
                      if (items.length === 0) return <div style={{ padding: 10, color: '#64748b' }}>No business fields found.</div>;
                      const selectedForType = linkedAttributes['businessField'] || [];
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {items.sort((a, b) => (a.sequence || 0) - (b.sequence || 0)).map((c) => {
                            const isChecked = selectedForType.includes(c.name);
                            return (
                              <label key={String(c._id) || c.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', borderBottom: '1px dashed #f1f5f9' }}>
                                <input type="checkbox" checked={isChecked} onChange={(e) => {
                                  const checked = e.target.checked;
                                  setLinkedAttributes((prev) => {
                                    const prevArr = Array.isArray(prev['businessField']) ? prev['businessField'] : [];
                                    const nextArr = checked ? Array.from(new Set([...prevArr, c.name])) : prevArr.filter((x) => x !== c.name);
                                    const next = { ...prev };
                                    if (nextArr.length === 0) delete next['businessField']; else next['businessField'] = nextArr;
                                    return next;
                                  });
                                }} />
                                <span>{c.name}</span>
                              </label>
                            );
                          })}
                        </div>
                      );
                    }

                    const familyKey = sel.key;
                    const normFam = String(familyKey || '').toLowerCase().replace(/[^a-z]/g, '');
                    const vehicleKeys = new Set(['car','cars','bike','bikes','tempo','tempobus','tempobuses','tempominibus','tempominibuses','minibus','minibuses']);
                    if (vehicleKeys.has(normFam)) {
                      // derive headings from masters: distinct fieldType under this family
                      const typeKeysSet = new Set();
                      masters.forEach((m) => {
                        const t = (m.type || m.category || '').toString().trim().toLowerCase();
                        const ft = (m.fieldType || '').toString().trim();
                        if (!ft) return;
                        if (t === normFam || t === familyKey.toString().trim().toLowerCase()) typeKeysSet.add(ft);
                      });
                      const headings = Array.from(typeKeysSet);
                      const selected = Array.isArray(linkedAttributes[familyKey]) ? linkedAttributes[familyKey] : [];
                      const titleCase = (key) => key
                        .replace(/([A-Z])/g, ' $1')
                        .replace(/[-_]/g, ' ')
                        .replace(/^\s+|\s+$/g, '')
                        .split(' ')
                        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                        .join(' ');
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ fontWeight: 600, marginBottom: 6 }}>Attributes</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                            {headings.map((h) => {
                              const checked = selected.includes(h);
                              return (
                                <label key={h} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 150 }}>
                                  <input type="checkbox" checked={checked} onChange={(e) => {
                                    const on = e.target.checked;
                                    setLinkedAttributes((prev) => {
                                      const prevArr = Array.isArray(prev[familyKey]) ? prev[familyKey] : [];
                                      const nextArr = on ? Array.from(new Set([...prevArr, h])) : prevArr.filter((x) => x !== h);
                                      const next = { ...prev };

                                      // Persist model cascade fields for this vehicle family so Vendor page can render cascading dropdowns
                                      const modelFieldCandidates = ['brand','model','variant','transmission','fuelType','bodyType'];
                                      const modelFields = nextArr.filter((x) => modelFieldCandidates.includes(String(x).toLowerCase()));
                                      const perFamKey = `${familyKey}:modelFields`;
                                      if (modelFields.length > 0) {
                                        next[perFamKey] = modelFields;
                                      } else {
                                        // remove if none selected to avoid stale config
                                        if (perFamKey in next) delete next[perFamKey];
                                      }

                                      if (nextArr.length === 0) delete next[familyKey]; else next[familyKey] = nextArr;
                                      return next;
                                    });
                                  }} />
                                  <span>{titleCase(h)}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }

                    const typesForFamily = Array.from(byFamily.get(familyKey) || []);

                    let typeKeys = Array.from(byFamily.get(sel.key) || []);
                    const modelLike = typeKeys.filter((k) => /model/i.test(k));
                    if (modelLike.length > 0) typeKeys = modelLike;
                    if (typeKeys.length === 0) return <div style={{ padding: 10, color: '#64748b' }}>No attribute types under {sel.name}.</div>;
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {typeKeys.map((t) => {
                          const itemsForType = masters.filter((m) => {
                            const type = (m.type || m.category || '').toString().trim().toLowerCase();
                            const fieldType = (m.fieldType || '').toString().trim().toLowerCase();
                            if (['car', 'bike', 'tempobus'].includes(type)) {
                              return type === sel.key.toLowerCase() && m.model;
                            }
                            return type === sel.key.toLowerCase() && fieldType === t.toLowerCase();
                          });
                          const selectedArr = Array.isArray(linkedAttributes[t]) ? linkedAttributes[t] : [];
                          const typeChecked = selectedArr.length > 0;
                          return (
                            <div key={t} style={{ padding: '8px 6px', borderBottom: '1px dashed #f1f5f9' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <input
                                  type="checkbox"
                                  checked={typeChecked}
                                  onChange={(e) => {
                                    const isOn = e.target.checked;
                                    setLinkedAttributes((prev) => {
                                      const next = { ...prev };
                                      if (isOn) {
                                        next[t] = Array.isArray(next[t]) ? next[t] : [];
                                      } else {
                                        delete next[t];
                                      }
                                      return next;
                                    });
                                  }}
                                />
                                <span style={{ fontWeight: 600 }}>{titleCase(t)}</span>
                              </label>

                              {itemsForType.length > 0 ? (
                                <div style={{ marginLeft: 22, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  {itemsForType.sort((a, b) => (a.sequence || 0) - (b.sequence || 0)).map((c) => {
                                    const isChecked = (linkedAttributes[t] || []).includes(c.name);
                                    const optKey = `${t}:${c.name}`;
                                    const selectedOpts = Array.isArray(linkedAttributes[optKey]) ? linkedAttributes[optKey] : [];
                                    return (
                                      <div key={String(c._id) || c.name} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                          <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={(e) => {
                                              const on = e.target.checked;
                                              setLinkedAttributes((prev) => {
                                                const prevArr = Array.isArray(prev[t]) ? prev[t] : [];
                                                const nextArr = on ? Array.from(new Set([...prevArr, c.name])) : prevArr.filter((x) => x !== c.name);
                                                const next = { ...prev };
                                                if (nextArr.length === 0) delete next[t]; else next[t] = nextArr;
                                                return next;
                                              });
                                            }}
                                          />
                                          <span>{c.name}</span>
                                        </label>
                                        {Array.isArray(c.options) && c.options.length > 0 ? (
                                          <div style={{ marginLeft: 22, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            {c.options.map((opt) => {
                                              const oc = selectedOpts.includes(opt);
                                              return (
                                                <label key={`${optKey}:${opt}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                  <input
                                                    type="checkbox"
                                                    checked={oc}
                                                    onChange={(e) => {
                                                      const on = e.target.checked;
                                                      setLinkedAttributes((prev) => {
                                                        const prevArr = Array.isArray(prev[optKey]) ? prev[optKey] : [];
                                                        const nextArr = on ? Array.from(new Set([...prevArr, opt])) : prevArr.filter((x) => x !== opt);
                                                        const next = { ...prev };
                                                        if (nextArr.length === 0) delete next[optKey]; else next[optKey] = nextArr;
                                                        return next;
                                                      });
                                                    }}
                                                  />
                                                  <span>{opt}</span>
                                                </label>
                                              );
                                            })}
                                          </div>
                                        ) : null}
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    );
                  }
                })}
              </div>
            </div>
            <div style={{ padding: 12, borderTop: '1px solid #eee', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={async () => {
                  if (!parentId) return;
                  try {
                    setSavingLinked(true);
                    await fetch(`http://localhost:5000/api/categories/${parentId}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ linkedAttributes: JSON.stringify(linkedAttributes), linkAttributesPricing: true })
                    });
                    setShowMasterSelector(false);
                  } catch {}
                  finally { setSavingLinked(false); }
                }}
                style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: '#0078d7', color: '#fff', fontWeight: 600 }}
              >
                {savingLinked ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CategoryPage;