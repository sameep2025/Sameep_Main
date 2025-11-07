import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import API_BASE_URL from "../config";

function flattenTree(node, rows = [], parentLevels = [], parentIds = []) {
  if (!node) return rows;
  const levels = [...parentLevels, node.name ?? "Unnamed"];
  const ids = [...parentIds, (node._id ?? node.id)];
  if (!node.children || node.children.length === 0) {
    rows.push({
      id: node._id ?? node.id,
      levels,
      levelIds: ids,
      price: typeof node.vendorPrice === "number" ? node.vendorPrice : node.price ?? "-",
      categoryId: node._id ?? node.id,
    });
  } else {
    node.children.forEach((child) => flattenTree(child, rows, levels, ids));
  }
  return rows;
}

export default function DummyVendorCategoriesDetailPage() {
  const { vendorId, categoryId } = useParams();
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null); // category or subcategory id being edited
  const [editingPrice, setEditingPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [inventoryLabelName, setInventoryLabelName] = useState("");
  const [linkedAttributes, setLinkedAttributes] = useState({});
  const [allMasters, setAllMasters] = useState([]);
  const [modelsByFamily, setModelsByFamily] = useState({});
  const [invItems, setInvItems] = useState([]);
  const [activeInvScope, setActiveInvScope] = useState(null); // { family, label }
  const [showLinkedModal, setShowLinkedModal] = useState(false);
  const [draftSelections, setDraftSelections] = useState({}); // { [familyKey]: { field: value } }
  const [rowPriceEdit, setRowPriceEdit] = useState(null); // { key, rowKey, price, labels }

  const fetchTree = async () => {
    try {
      setLoading(true);
      // If this is a local fallback vendor, derive a minimal tree from categoryId or latest local activation
      if (vendorId === "local") {
        let targetCatId = categoryId;
        if (!targetCatId) {
          try {
            const entries = Object.keys(localStorage)
              .filter((k) => k.startsWith("dv_last_"))
              .map((k) => {
                try {
                  const v = JSON.parse(localStorage.getItem(k) || "null") || {};
                  return { key: k, createdAt: Number(v.createdAt || 0) };
                } catch {
                  return { key: k, createdAt: 0 };
                }
              })
              .sort((a, b) => b.createdAt - a.createdAt);
            if (entries.length) targetCatId = entries[0].key.replace("dv_last_", "");
          } catch {}
        }
        if (targetCatId) {
          try {
            const cat = await axios.get(`${API_BASE_URL}/api/dummy-categories/${targetCatId}`);
            const c = cat.data || {};
            setTree([{ _id: c._id || targetCatId, name: c.name || "Category", price: c.price, children: [] }]);
            return;
          } catch {
            setTree([{ _id: targetCatId, name: "Category", children: [] }]);
            return;
          }
        }
        setTree([]);
        setError("No category selected for local vendor");
        return;
      }

      // Normal path: load vendor's dummy category tree
      const url = `${API_BASE_URL}/api/dummy-vendors/${vendorId}/categories`;
      const res = await axios.get(url);
      let categories = res.data.categories;
      if (!categories) setTree([]);
      else if (Array.isArray(categories)) setTree(categories);
      else setTree([{ ...categories, children: categories.children || [] }]);
    } catch (err) {
      // Fallback to minimal view using categoryId if available
      try {
        const status = err?.response?.status;
        const msg = err?.response?.data?.message || err?.message || "Unknown error";
        setError(`Failed to fetch vendor categories (${status || ""}). ${msg}`);
      } catch {}
      try {
        if (categoryId) {
          const cat = await axios.get(`${API_BASE_URL}/api/dummy-categories/${categoryId}`);
          const c = cat.data || {};
          setTree([{ _id: c._id || categoryId, name: c.name || "Category", price: c.price, children: [] }]);
          setError("");
          return;
        }
      } catch {}
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTree(); }, [vendorId, categoryId]);

  // Fetch dummy category meta for showing inventory label buttons
  useEffect(() => {
    (async () => {
      try {
        if (!categoryId) { setInventoryLabelName(""); setLinkedAttributes({}); return; }
        const res = await axios.get(`${API_BASE_URL}/api/dummy-categories/${categoryId}`);
        const c = res.data || {};
        setInventoryLabelName(c.inventoryLabelName || "");
        setLinkedAttributes(c.linkedAttributes || {});
      } catch {
        setInventoryLabelName("");
        setLinkedAttributes({});
      }
    })();
  }, [categoryId]);

  // Fetch masters and vendor selections for dummy vendor
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/api/masters`);
        setAllMasters(Array.isArray(res.data) ? res.data : []);
      } catch { setAllMasters([]); }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        if (!vendorId || !categoryId) return;
        const items = await loadDummyInventorySelections(vendorId, categoryId);
        setInvItems(items);
      } catch { setInvItems([]); }
    })();
  }, [vendorId, categoryId]);

  // Helper: try multiple endpoints to load selections
  const loadDummyInventorySelections = async (vid, cid) => {
    // Backend read endpoints for dummy inventory selections are not available yet.
    // Avoid 404s by returning empty list (UI will still allow creating/saving selections).
    return [];
  };

  // Helper: try multiple endpoints to save selections
  const saveDummyInventorySelections = async (vid, cid, items) => {
    const url = `${API_BASE_URL}/api/dummy-vendors/${vid}`;
    const payload = { inventorySelections: { [cid]: items } };
    await axios.put(url, payload);
    return true;
  };

  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  const fetchModelsForFamily = async (familyKey) => {
    try {
      const orig = String(familyKey || '').trim();
      if (!orig) return [];
      const cached = modelsByFamily[orig];
      if (Array.isArray(cached) && cached.length > 0) return cached;
      const lower = orig.toLowerCase();
      const singular = lower.endsWith('s') ? lower.slice(0, -1) : lower;
      const noSpaces = lower.replace(/\s+/g, '');
      const extras = [];
      if (noSpaces === 'tempobus' || lower === 'tempo bus' || lower.includes('tempo mini') || noSpaces.includes('tempomini') || lower.includes('minibus') || lower.includes('minibuses')) {
        extras.push('tempoBus');
      }
      const candidates = Array.from(new Set([orig, lower, singular, noSpaces, ...extras]));
      let models = [];
      for (const c of candidates) {
        try {
          const res = await axios.get(`${API_BASE_URL}/api/models`, { params: { category: c } });
          const data = Array.isArray(res.data) ? res.data : [];
          if (data.length) { models = data.map((d) => ({ _id: d._id || d.id, name: d.name || d.model || '', raw: d })); break; }
        } catch {}
      }
      setModelsByFamily((prev) => ({ ...prev, [orig]: models }));
      return models;
    } catch { return []; }
  };

  const getCascadeLists = (familyKey) => {
    let models = modelsByFamily[familyKey] || [];
    if (!models.length) {
      const orig = String(familyKey || '');
      const lower = orig.toLowerCase();
      const singular = lower.endsWith('s') ? lower.slice(0, -1) : lower;
      const noSpaces = lower.replace(/\s+/g, '');
      const keys = [orig, lower, singular, noSpaces];
      for (const k of keys) { const m = modelsByFamily[k]; if (Array.isArray(m) && m.length) { models = m; break; } }
    }
    let selectedFields = Array.isArray(linkedAttributes[familyKey]) ? linkedAttributes[familyKey] : [];
    const modelFieldsKey = `${familyKey}:modelFields`;
    const modelFields = Array.isArray(linkedAttributes[modelFieldsKey]) ? linkedAttributes[modelFieldsKey] : [];
    if (modelFields.length) {
      const canon = (s) => String(s).trim();
      const set = new Set((selectedFields || []).map((f) => canon(f)));
      modelFields.forEach((mf) => { const c = canon(mf); if (c.toLowerCase() !== 'model' && c && !set.has(c)) { set.add(c); selectedFields.push(c); } });
    }
    try {
      const mfLower = modelFields.map((x) => String(x).toLowerCase());
      if (!mfLower.includes('model')) selectedFields = (selectedFields || []).filter((f) => String(f).toLowerCase() !== 'model');
    } catch {}
    if (!selectedFields || selectedFields.length === 0) {
      const keys = models.length ? Object.keys(models[0].raw || models[0]) : [];
      const candidates = ['brand','variant','transmission','fuelType','bodyType'];
      selectedFields = candidates.filter((k) => keys.includes(k));
      if (selectedFields.length === 0 && keys.includes('brand')) selectedFields = ['brand'];
    }
    const listsByField = {};
    const fields = selectedFields
      .filter(Boolean)
      .sort((a,b) => {
        const pa = ['brand','model'].indexOf(String(a).toLowerCase());
        const pb = ['brand','model'].indexOf(String(b).toLowerCase());
        if (pa !== -1 || pb !== -1) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
        return 0;
      });
    fields.forEach((field) => {
      const set = new Set();
      const fieldLower = String(field).toLowerCase();
      models.forEach((m) => {
        const raw = m.raw || m;
        const ok = Object.entries({}).every(() => true);
        if (!ok) return;
        const v = raw?.[field];
        if (v !== undefined && v !== null && String(v).trim() !== '') set.add(String(v));
      });
      let arr = Array.from(set);
      if (String(field).toLowerCase() !== 'model') {
        const preKey = `${familyKey}:model:${field}`;
        const pre = linkedAttributes[preKey];
        if (Array.isArray(pre) && pre.length > 0) {
          const allow = pre.map(String);
          const intersected = arr.filter((x) => allow.includes(String(x)));
          if (intersected.length > 0) arr = intersected;
        }
      }
      listsByField[field] = arr;
    });
    return { fields, listsByField };
  };

  // rows from tree
  const rows = useMemo(() => tree.flatMap((root) => flattenTree(root)), [tree]);
  const maxLevels = rows.reduce((max, row) => Math.max(max, row.levels.length), 0);
  const levelHeaders = Array.from({ length: maxLevels }, (_, idx) => (idx === 0 ? "Category" : `Level ${idx + 1}`));

  // Map row.id -> items matching scope (ALL or linked subcategory)
  const rowMatches = useMemo(() => {
    const map = {};
    const items = Array.isArray(invItems) ? invItems : [];
    rows.forEach((row) => {
      const matches = items.filter((it) => {
        const hasScope = it && it.scopeFamily && it.scopeLabel;
        const keyCandidates = hasScope ? [ `${it.scopeFamily}:${it.scopeLabel}:linkedSubcategory`, `${it.scopeFamily}:inventoryLabels:linkedSubcategory` ] : [];
        let linked = [];
        for (const k of keyCandidates) {
          const arr = linkedAttributes?.[k];
          if (Array.isArray(arr) && arr.length) { linked = arr; break; }
        }
        const val = Array.isArray(linked) && linked.length ? String(linked[0]) : '';
        const lvlIds = Array.isArray(row.levelIds) ? row.levelIds.map((x) => String(x)) : [];
        const firstIdx = (lvlIds[0] === 'root') ? 2 : 1;
        const firstSubcatId = lvlIds.length > firstIdx ? lvlIds[firstIdx] : null;
        if (!firstSubcatId) return false;
        if (val === 'ALL') return true;
        return String(firstSubcatId) === val;
      });
      map[row.id] = matches;
    });
    return map;
  }, [rows, invItems, linkedAttributes]);

  const expandedRows = useMemo(() => {
    const out = [];
    rows.forEach((row) => {
      const matches = rowMatches[row.id] || [];
      if (matches.length === 0) out.push({ base: row, match: null, idx: 0 });
      else matches.forEach((m, i) => out.push({ base: row, match: m, idx: i }));
    });
    return out;
  }, [rows, rowMatches]);

  const hasInventory = useMemo(() => {
    try {
      const entries = Object.entries(linkedAttributes || {}).filter(([k, v]) => k.endsWith(':inventoryLabels') && Array.isArray(v) && v.length > 0);
      return (entries.length > 0) || Boolean(inventoryLabelName);
    } catch { return Boolean(inventoryLabelName); }
  }, [linkedAttributes, inventoryLabelName]);

  const onEdit = (row) => {
    setEditingId(row.categoryId);
    setEditingPrice(row.price === "-" || row.price === null || row.price === undefined ? "" : String(row.price));
  };

  const onCancel = () => {
    setEditingId(null);
    setEditingPrice("");
  };

  const onSave = async () => {
    if (!editingId) return;
    const val = editingPrice === "" ? null : Number(editingPrice);
    if (editingPrice !== "" && Number.isNaN(val)) {
      alert("Please enter a valid number for price");
      return;
    }
    try {
      setSaving(true);
      await axios.put(`${API_BASE_URL}/api/dummy-categories/${editingId}`, { price: val });
      setEditingId(null);
      setEditingPrice("");
      await fetchTree();
    } catch (e) {
      alert(e?.response?.data?.message || "Failed to save price");
    } finally {
      setSaving(false);
    }
  };

  const previewCategoryId = categoryId || (rows[0]?.categoryId);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Dummy Vendor Categories</h1>
        <button
          onClick={() => {
            if (!previewCategoryId) return;
            const origin = window.location.origin;
            const url = `${origin}/preview/${vendorId}/${previewCategoryId}`;
            window.open(url, '_blank');
          }}
          disabled={!previewCategoryId}
          style={{ padding: "8px 12px", borderRadius: 8, background: "#2563eb", color: "#fff", textDecoration: "none", opacity: previewCategoryId ? 1 : 0.6, pointerEvents: previewCategoryId ? "auto" : "none", border: 'none' }}
        >
          Preview
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        {(() => {
          try {
            const entries = Object.entries(linkedAttributes || {}).filter(([k, v]) => k.endsWith(':inventoryLabels') && Array.isArray(v));
            const labels = entries.flatMap(([k, arr]) => (arr || []).map((name) => ({ family: String(k).split(':')[0], name: String(name) })));
            const unique = [];
            const seen = new Set();
            labels.forEach((it) => {
              const key = `${it.family}|${it.name}`;
              if (!seen.has(key)) { seen.add(key); unique.push(it); }
            });
            if (unique.length === 0 && inventoryLabelName) {
              unique.push({ family: 'inventory', name: inventoryLabelName });
            }
            return unique.map((it, idx) => (
              <button
                key={`${it.family}:${it.name}:${idx}`}
                onClick={() => { setActiveInvScope({ family: it.family, label: it.name }); setShowLinkedModal(true); fetchModelsForFamily(it.family); }}
                style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff' }}
                title={`${it.family}: ${it.name}`}
              >
                {it.name}
              </button>
            ));
          } catch { return null; }
        })()}
      </div>
      {loading ? (
        <div>Loading...</div>
      ) : error ? (
        <div style={{ color: "#991b1b", background: "#fee2e2", border: "1px solid #fecaca", padding: 10, borderRadius: 8 }}>{error}</div>
      ) : rows.length === 0 ? (
        <div>No categories found</div>
        ) : (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              {levelHeaders.map((header, idx) => (
                <th key={idx} style={{ border: "1px solid #ccc", padding: "8px" }}>{header}</th>
              ))}
              {hasInventory ? (
                <th style={{ border: '1px solid #ccc', padding: 8 }}>Attributes</th>
              ) : null}
              <th style={{ border: "1px solid #ccc", padding: "8px" }}>Price</th>
              <th style={{ border: "1px solid #ccc", padding: "8px" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {expandedRows.map(({ base: row, match, idx }) => (
              <tr key={`${row.id}-${idx}`}>
                {levelHeaders.map((_, i) => (
                  <td key={i} style={{ border: '1px solid #ccc', padding: 8 }}>{row.levels[i] ?? '-'}</td>
                ))}
                {hasInventory ? (
                  <td style={{ border: '1px solid #ccc', padding: 8 }}>
                    {match ? (
                      (() => {
                        const blocks = Object.entries(match.selections || {}).flatMap(([fam, fields]) => {
                          const entries = Object.entries(fields || {}).filter(([k, v]) => {
                            const fn = String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
                            return fn !== 'modelfields' && v != null && String(v).trim() !== '';
                          });
                          return entries.map(([k, v]) => ({ key: `${fam}:${k}`, label: `${k}:`, value: String(v) }));
                        });
                        return (
                          <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 6, background: '#f8fafc' }}>
                            {blocks.length === 0 ? (
                              <div style={{ fontSize: 12, color: '#64748b' }}>No attributes</div>
                            ) : (
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6 }}>
                                {blocks.map((b) => (
                                  <div key={b.key} style={{ fontSize: 12, color: '#334155' }}>
                                    <span style={{ fontWeight: 600 }}>{b.label}</span> <span>{b.value}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()
                    ) : (
                      <span style={{ color: '#94a3b8' }}>—</span>
                    )}
                  </td>
                ) : null}
                <td style={{ border: '1px solid #ccc', padding: 8 }}>
                  {editingId === row.categoryId ? (
                    <input type="number" value={editingPrice} onChange={(e) => setEditingPrice(e.target.value)} style={{ width: 100, padding: 6 }} placeholder="Price" />
                  ) : (
                    <span>{row.price === undefined || row.price === null || row.price === '-' ? '-' : row.price}</span>
                  )}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 8 }}>
                  {match ? (
                    <button
                      onClick={() => {
                        const rowKey = Array.isArray(row.levelIds) && row.levelIds.length ? row.levelIds.map(String).join('|') : String(row.id);
                        const pbr = match && match.pricesByRow && typeof match.pricesByRow === 'object' ? match.pricesByRow : null;
                        const rowPrice = pbr && (pbr[rowKey] !== undefined) ? pbr[rowKey] : (match.price ?? '');
                        setRowPriceEdit({ key: match._id || match.at, rowKey, price: rowPrice, labels: { category: row.levels.slice(-1)[0], attrs: match.selections || {} } })
                      }}
                      style={{ padding: '4px 8px', borderRadius: 4, background: '#0ea5e9', color: '#fff', border: 'none' }}
                    >Edit</button>
                  ) : (
                    <>
                      {editingId === row.categoryId ? (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={onSave} disabled={saving} style={{ padding: '6px 10px', borderRadius: 6, background: '#16a34a', color: '#fff', border: 'none' }}>{saving ? 'Saving...' : 'Save'}</button>
                          <button onClick={onCancel} disabled={saving} style={{ padding: '6px 10px', borderRadius: 6, background: '#9ca3af', color: '#111', border: 'none' }}>Cancel</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button onClick={() => setEditingId(row.categoryId)} style={{ padding: '6px 10px', borderRadius: 6, background: '#0ea5e9', color: '#fff', border: 'none' }}>Edit</button>
                        </div>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showLinkedModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}>
          <div style={{ background: '#fff', padding: 16, borderRadius: 10, minWidth: 600, maxWidth: '95vw', maxHeight: '80vh', overflow: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>{activeInvScope?.label || inventoryLabelName}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(() => {
                if (!activeInvScope) return null;
                const familyKey = String(activeInvScope.family);
                const { fields, listsByField } = getCascadeLists(familyKey);
                const curr = draftSelections[familyKey] || {};
                return (
                  <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>{familyKey}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                      {fields.map((heading) => {
                        const values = Array.isArray(listsByField[heading]) ? listsByField[heading] : [];
                        const val = curr[heading] || '';
                        return (
                          <label key={`${familyKey}:${heading}`} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <span style={{ fontSize: 12, color: '#475569' }}>{heading}</span>
                            <select value={val} onChange={(e) => {
                              setDraftSelections((prev) => ({
                                ...prev,
                                [familyKey]: { ...(prev[familyKey] || {}), [heading]: e.target.value }
                              }));
                            }} style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6 }}>
                              <option value="">Select</option>
                              {values.map((v) => (
                                <option key={`${familyKey}:${heading}:${v}`} value={v}>{v}</option>
                              ))}
                            </select>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button onClick={() => { setShowLinkedModal(false); setDraftSelections({}); }} style={{ padding: '6px 10px', borderRadius: 6, background: '#e5e7eb', border: 'none' }}>Close</button>
              <button onClick={async () => {
                try {
                  if (!vendorId || !categoryId || !activeInvScope) return;
                  const fam = String(activeInvScope.family);
                  const label = String(activeInvScope.label);
                  const sel = draftSelections[fam] || {};
                  const item = {
                    at: Date.now(),
                    scopeFamily: fam,
                    scopeLabel: label,
                    selections: { [fam]: sel },
                  };
                  const next = [...(Array.isArray(invItems) ? invItems : []), item];
                  setInvItems(next);
                  await saveDummyInventorySelections(vendorId, categoryId, next);
                  setShowLinkedModal(false);
                  setDraftSelections({});
                } catch (e) {
                  alert(e?.response?.data?.message || 'Failed to save');
                }
              }} style={{ padding: '6px 10px', borderRadius: 6, background: '#0ea5e9', color: '#fff', border: 'none' }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {rowPriceEdit && (
        <div style={{ position: 'fixed', inset: 0, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
          <div style={{ background: '#fff', padding: 16, borderRadius: 10, minWidth: 340 }}>
            <h3 style={{ marginTop: 0 }}>Edit Row Price</h3>
            <div style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>
              <div><b>Category:</b> {rowPriceEdit.labels?.category}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input type="number" placeholder="Price" value={rowPriceEdit.price}
                     onChange={(e) => setRowPriceEdit((p) => ({ ...p, price: e.target.value }))}
                     style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                <button onClick={() => setRowPriceEdit(null)} style={{ padding: '6px 10px', borderRadius: 6, background: '#e5e7eb', border: 'none' }}>Cancel</button>
                <button onClick={async () => {
                  try {
                    const key = rowPriceEdit.key;
                    const rowKey = rowPriceEdit.rowKey;
                    const priceVal = rowPriceEdit.price === '' ? null : Number(rowPriceEdit.price);
                    const next = (Array.isArray(invItems) ? invItems : []).map((p) => {
                      if ((p._id || p.at) !== key) return p;
                      const updated = { ...p };
                      const currentMap = (updated.pricesByRow && typeof updated.pricesByRow === 'object') ? { ...updated.pricesByRow } : {};
                      currentMap[rowKey] = priceVal;
                      updated.pricesByRow = currentMap;
                      return updated;
                    });
                    setInvItems(next);
                    if (vendorId && categoryId) { await saveDummyInventorySelections(vendorId, categoryId, next); }
                    setRowPriceEdit(null);
                  } catch (e) {
                    alert(e?.response?.data?.message || 'Failed to update');
                  }
                }} style={{ padding: '6px 10px', borderRadius: 6, background: '#0ea5e9', color: '#fff', border: 'none' }}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
