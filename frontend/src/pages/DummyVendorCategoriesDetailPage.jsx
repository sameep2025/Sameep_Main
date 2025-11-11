import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import API_BASE_URL, { PREVIEW_BASE_URL } from "../config";

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
  const [vendor, setVendor] = useState(null);
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
  const [editingItemKey, setEditingItemKey] = useState(null); // currently edited selection row key
  const [combos, setCombos] = useState([]);
  const [combosLoading, setCombosLoading] = useState(false);
  const [combosError, setCombosError] = useState("");
  const [categoryInfoCache, setCategoryInfoCache] = useState({}); // id -> { name, parentId, parentName }

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

  // Fetch Dummy Combos for this category to show "Packages" table
  useEffect(() => {
    (async () => {
      if (!categoryId) { setCombos([]); return; }
      setCombosLoading(true); setCombosError("");
      try {
        let res = await axios.get(`${API_BASE_URL}/api/dummy-combos`, { params: { parentCategoryId: categoryId } });
        let arr = Array.isArray(res.data) ? res.data : [];
        if (arr.length === 0) {
          try {
            const r2 = await axios.get(`${API_BASE_URL}/api/dummy-combos/byParent/${categoryId}`);
            arr = Array.isArray(r2.data) ? r2.data : [];
          } catch {}
        }
        setCombos(arr);
        // prefetch category names and parent names for items (to display selected services from step 2)
        const ids = [];
        arr.forEach((c) => (c.items||[]).forEach((it) => { if (it.kind === 'category' && it.categoryId) ids.push(String(it.categoryId)); }));
        const uniq = Array.from(new Set(ids));
        await Promise.all(uniq.map(async (id) => {
          if (categoryInfoCache[id]) return;
          try {
            const r = await axios.get(`${API_BASE_URL}/api/dummy-categories/${id}`);
            const cat = r.data || {};
            const parentId = cat?.parentId || cat?.parent || null;
            let parentName = '';
            if (parentId) {
              try {
                const pr = await axios.get(`${API_BASE_URL}/api/dummy-categories/${parentId}`);
                parentName = pr.data?.name || '';
              } catch {}
            }
            setCategoryInfoCache((prev) => ({ ...prev, [id]: { name: cat?.name || '', parentId: parentId || null, parentName } }));
          } catch {}
        }));
      } catch (e) {
        setCombos([]); setCombosError(e?.response?.data?.message || 'Failed to load packages');
      } finally { setCombosLoading(false); }
    })();
  }, [categoryId]);

  // Fetch dummy vendor for preview params (nearbyLocations, etc.)
  useEffect(() => {
    (async () => {
      if (!vendorId) { setVendor(null); return; }
      try {
        const res = await axios.get(`${API_BASE_URL}/api/dummy-vendors/${vendorId}`);
        const v = res.data || {};
        try {
          // try to hydrate location details if endpoint exists; ignore failures
          const lr = await axios.get(`${API_BASE_URL}/api/dummy-vendors/${vendorId}/location`);
          v.location = lr.data?.location || v.location || {};
          v.location.nearbyLocations = v.location.nearbyLocations || [];
        } catch {}
        setVendor(v);
      } catch {
        setVendor(null);
      }
    })();
  }, [vendorId]);

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
        if (!vendorId) return;
        const topCatId = (vendor && (vendor.categoryId || vendor.category?._id)) || categoryId;
        if (!topCatId) return;
        const items = await loadDummyInventorySelections(vendorId, topCatId);
        setInvItems(items);
      } catch { setInvItems([]); }
    })();
  }, [vendorId, categoryId, vendor]);

  // Helper: try multiple endpoints to load selections
  const loadDummyInventorySelections = async (vid, cid) => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/dummy-vendors/${vid}`);
      const map = (res.data && typeof res.data.inventorySelections === 'object') ? res.data.inventorySelections : {};
      const items = Array.isArray(map?.[cid]) ? map[cid] : [];
      return items;
    } catch {
      return [];
    }
  };

  // Helper: try multiple endpoints to save selections
  const saveDummyInventorySelections = async (vid, cid, items) => {
    const url = `${API_BASE_URL}/api/dummy-vendors/${vid}`;
    const payload = { inventorySelections: { [cid]: items } };
    await axios.put(url, payload);
    return true;
  };

  // Ensure preview knows where to place items: default to ALL if no link is set for this scope
  const ensureLinkedSubcategoryForScope = async (cid, fam, label) => {
    try {
      const keySpecific = `${fam}:${label}:linkedSubcategory`;
      const keyGeneric = `${fam}:inventoryLabels:linkedSubcategory`;
      const la = linkedAttributes || {};
      const hasSpecific = Array.isArray(la[keySpecific]) && la[keySpecific].length > 0;
      const hasGeneric = Array.isArray(la[keyGeneric]) && la[keyGeneric].length > 0;
      if (hasSpecific || hasGeneric) return;
      const next = { ...la, [keySpecific]: ['ALL'] };
      await axios.put(`${API_BASE_URL}/api/dummy-categories/${cid}`, { linkedAttributes: next });
      setLinkedAttributes(next);
    } catch { /* ignore */ }
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
    const famLower = String(familyKey || '').toLowerCase();
    const brandFieldForFamily = (famLower === 'bikes') ? 'bikeBrand' : 'brand';
    const modelFieldsKey = `${familyKey}:modelFields`;
    const modelFields = Array.isArray(linkedAttributes[modelFieldsKey]) ? linkedAttributes[modelFieldsKey] : [];
    if (modelFields.length) {
      const canon = (s) => String(s).trim();
      const set = new Set((selectedFields || []).map((f) => canon(f)));
      modelFields.forEach((mf) => { const c = canon(mf); if (c && !set.has(c)) { set.add(c); selectedFields.push(c); } });
    }
    const keysInFirst = models.length ? Object.keys(models[0].raw || models[0]) : [];
    if (!selectedFields || selectedFields.length === 0) {
      const candidates = ['brand','model','variant','transmission','fuelType','bodyType','seats'];
      selectedFields = candidates.filter((k) => keysInFirst.includes(k));
      if (!selectedFields.includes(brandFieldForFamily) && (keysInFirst.includes('brand') || keysInFirst.includes('bikeBrand'))) selectedFields.unshift(brandFieldForFamily);
      if (!selectedFields.includes('model') && (keysInFirst.includes('model') || keysInFirst.includes('modelName'))) selectedFields.splice(1, 0, 'model');
    } else {
      const low = selectedFields.map((s)=>String(s).toLowerCase());
      if (!low.includes(String(brandFieldForFamily).toLowerCase())) selectedFields.unshift(brandFieldForFamily);
      if (!low.includes('model')) selectedFields.splice(1, 0, 'model');
    }

    const curr = draftSelections[familyKey] || {};
    const pickFirst = (obj, arr) => {
      for (const k of arr) { if (obj && obj[k] != null && String(obj[k]).trim() !== '') return String(obj[k]); }
      return '';
    };
    const selectedBrand = pickFirst(curr, famLower === 'bikes' ? ['bikeBrand','brand','Brand','make','Make'] : ['brand','Brand','make','Make']);
    const selectedModel = pickFirst(curr, ['model','Model','modelName','model_name','name']);

    const listsByField = {};
    // Bikes: if both brand and bikeBrand present, drop brand
    if (famLower === 'bikes') {
      const lowSet = new Set((selectedFields || []).map((s) => String(s).toLowerCase()));
      if (lowSet.has('bikebrand') && lowSet.has('brand')) {
        selectedFields = selectedFields.filter((s) => String(s).toLowerCase() !== 'brand');
      }
    }
    const fields = selectedFields
      .filter(Boolean)
      .sort((a,b) => {
        const order = ['brand','model'];
        const pa = order.indexOf(String(a).toLowerCase());
        const pb = order.indexOf(String(b).toLowerCase());
        if (pa !== -1 || pb !== -1) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
        return 0;
      });

    const buildValues = (field) => {
      const fieldNorm = String(field).toLowerCase().replace(/[^a-z0-9]/g,'');
      const canonicalJsKey = (
        fieldNorm.endsWith('bodytype') ? 'bodyType' :
        fieldNorm.endsWith('fueltype') ? 'fuelType' :
        fieldNorm.endsWith('seats') ? 'seats' :
        // Normalize any '*transmission' (e.g., 'biketransmission') to canonical 'transmission'
        fieldNorm.endsWith('transmission') ? 'transmission' :
        fieldNorm
      );
      const keyCandidates = (() => {
        const f = canonicalJsKey;
        if (f === 'brand' || (famLower === 'bikes' && f === 'bikebrand')) return ['brand','bikeBrand','make','Brand','Make'];
        if (f === 'model') return ['model','modelName','Model','model_name','name'];
        if (f === 'variant') return ['variant','Variant','trim','Trim'];
        if (f === 'transmission') return ['transmission','Transmission','gearbox','gear_type','gearType'];
        if (f === 'bodyType') return ['bodyType','BodyType','body_type','type'];
        if (f === 'fuelType') return ['fuelType','FuelType','fueltype','Fuel','fuel_type'];
        if (f === 'seats') return ['seats','Seats','seatCapacity','SeatCapacity','seatingCapacity','SeatingCapacity'];
        return [field];
      })();
      const vals = new Set();
      models.forEach((m) => {
        const raw = m.raw || m;
        const nselBrand = norm(selectedBrand);
        const nrawBrand = norm(raw?.brand || raw?.bikeBrand || raw?.make || raw?.Brand || raw?.Make || '');
        if (selectedBrand && nrawBrand !== nselBrand) return;
        if (canonicalJsKey !== 'brand' && !(famLower === 'bikes' && canonicalJsKey === 'bikebrand')) {
          const nselModel = norm(selectedModel);
          const nrawModel = norm(raw?.model || raw?.modelName || raw?.Model || raw?.model_name || raw?.name || '');
          if (canonicalJsKey !== 'model' && selectedModel && nrawModel !== nselModel) return;
        }
        let v;
        for (const k of keyCandidates) { if (raw && raw[k] !== undefined && raw[k] !== null) { v = raw[k]; break; } }
        if (v !== undefined && v !== null && String(v).trim() !== '') vals.add(String(v));
      });
      const arr = Array.from(vals);
      if (canonicalJsKey === 'model' && !selectedBrand) return [];
      return arr;
    };

    fields.forEach((field) => {
      listsByField[field] = buildValues(field);
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
        if (val === 'ALL') return true;
        const lvlIds = Array.isArray(row.levelIds) ? row.levelIds.map((x) => String(x)) : [];
        const firstIdx = (lvlIds[0] === 'root') ? 2 : 1;
        const firstSubcatId = lvlIds.length > firstIdx ? lvlIds[firstIdx] : null;
        if (!firstSubcatId) return false;
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

  const packageRows = useMemo(() => {
    try {
      const rows = [];
      const list = Array.isArray(combos) ? combos : [];
      list.forEach((c) => {
        const name = c?.name || 'Package';
        const items = Array.isArray(c?.items) ? c.items : [];
        // collect sizes across all items' variants (null allowed)
        const sizeSet = new Set();
        items.forEach((it) => {
          const vs = Array.isArray(it?.variants) ? it.variants : [];
          if (vs.length === 0) sizeSet.add(null);
          vs.forEach((v) => sizeSet.add(v?.size ?? null));
        });
        const sizes = sizeSet.size ? Array.from(sizeSet) : [null];
        sizes.forEach((sz) => {
          // representative variant for price/terms: first item that has this size
          let rep = null;
          for (const it of items) {
            const vs = Array.isArray(it?.variants) ? it.variants : [];
            const v = vs.find((vv) => (vv?.size ?? null) === (sz ?? null));
            if (v) { rep = v; break; }
          }
          const price = (rep && rep.price != null && rep.price !== '') ? Number(rep.price) : (c && c.basePrice != null && c.basePrice !== '' ? Number(c.basePrice) : null);
          const services = items.map((it) => {
            if (it.kind === 'custom') return it.name || 'Custom Item';
            // category items will be resolved by preview/labels; here show generic 'Service'
            return 'Service';
          }).filter(Boolean).join(' • ');
          rows.push({ key: `${c._id || name}-${String(sz||'default')}`, name, size: sz || 'Default', price, services, terms: (rep && rep.terms) ? rep.terms : (c?.terms || '') });
        });
      });
      return rows;
    } catch { return []; }
  }, [combos]);

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

  const previewCategoryId = (vendor && (vendor.categoryId || vendor.category?._id)) || categoryId || (rows[0]?.categoryId);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Dummy Vendor Categories</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
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
                  style={{ padding: '6px 10px', borderRadius: 12, border: 'none', background: '#16a34a', color: '#fff' }}
                  title={`${it.family}: ${it.name}`}
                >
                  {it.name}
                </button>
              ));
            } catch { return null; }
          })()}
          <button
            onClick={() => {
              if (!previewCategoryId) return;
              const homeLocs = (vendor?.location?.nearbyLocations || []).filter(Boolean);
              const base = PREVIEW_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '');
              const url = `${base}/preview/${vendorId}/${previewCategoryId}?mode=dummy&homeLocs=${encodeURIComponent(JSON.stringify(homeLocs))}&t=${Date.now()}`;
              window.open(url, '_blank');
            }}
            disabled={!previewCategoryId}
            style={{ padding: "8px 12px", borderRadius: 8, background: "#2563eb", color: "#fff", textDecoration: "none", opacity: previewCategoryId ? 1 : 0.6, pointerEvents: previewCategoryId ? "auto" : "none", border: 'none' }}
          >
            Preview
          </button>
        </div>
      </div>
      <div style={{ height: 4 }} />
      {/* Packages Table (Dummy combos) */}
      {combosLoading ? (
        <div style={{ marginTop: 20 }}><p>Loading combos...</p></div>
      ) : combosError ? (
        <div style={{ marginTop: 20 }}><p style={{ color: 'red' }}>{combosError}</p></div>
      ) : (combos && combos.length > 0) ? (
        <div style={{ marginTop: 20, marginBottom: 30 }}>
          <h2 style={{ marginBottom: 8 }}>Packages</h2>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid #ccc', padding: 8 }}>Combo Name</th>
                <th style={{ border: '1px solid #ccc', padding: 8 }}>Combo Includes</th>
                <th style={{ border: '1px solid #ccc', padding: 8 }}>Size</th>
                <th style={{ border: '1px solid #ccc', padding: 8 }}>Price</th>
                <th style={{ border: '1px solid #ccc', padding: 8 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {combos.flatMap((combo) => {
                const comboName = combo.name || 'Combo';
                const items = Array.isArray(combo.items) ? combo.items : [];
                const sizeSet = new Set();
                items.forEach((it) => {
                  const vs = Array.isArray(it.variants) ? it.variants : [];
                  if (vs.length === 0) sizeSet.add(null);
                  vs.forEach((v) => sizeSet.add(v.size || null));
                });
                const sizes = sizeSet.size ? Array.from(sizeSet) : [null];
                const allItemsLabel = (() => {
                  const seen = new Set();
                  const names = [];
                  items.forEach((it) => {
                    let nm = '';
                    if (it.kind === 'custom') nm = it.name || 'Custom';
                    else {
                      const info = categoryInfoCache[String(it.categoryId)] || {};
                      nm = info.parentName || info.name || 'Service';
                    }
                    nm = String(nm || '').trim();
                    const key = nm.toLowerCase();
                    if (nm && !seen.has(key)) { seen.add(key); names.push(nm); }
                  });
                  return names.join(', ');
                })();
                return sizes.map((sz, idx) => {
                  let rep = null;
                  for (const it of items) {
                    const vs = Array.isArray(it.variants) ? it.variants : [];
                    const v = vs.find((vv) => (vv.size || null) === (sz || null));
                    if (v) { rep = v; break; }
                  }
                  const repPrice = (rep && rep.price != null && rep.price !== '') ? Number(rep.price) : null;
                  const base = (combo && combo.basePrice != null && combo.basePrice !== '') ? Number(combo.basePrice) : null;
                  const priceValue = (repPrice != null && !Number.isNaN(repPrice)) ? repPrice : (base != null && !Number.isNaN(base) ? base : null);
                  const priceText = (priceValue != null) ? `₹${priceValue}` : '—';
                  return (
                    <tr key={`${(combo._id?.$oid || combo._id || combo.id || comboName)}-${idx}`}>
                      <td style={{ border: '1px solid #ccc', padding: 8 }}>{comboName}</td>
                      <td style={{ border: '1px solid #ccc', padding: 8 }}>{allItemsLabel}</td>
                      <td style={{ border: '1px solid #ccc', padding: 8 }}>{sz || '—'}</td>
                      <td style={{ border: '1px solid #ccc', padding: 8 }}>{priceText}</td>
                      <td style={{ border: '1px solid #ccc', padding: 8 }}>
                        <button
                          onClick={async () => {
                            try {
                              const input = window.prompt('Enter price', priceValue != null ? String(priceValue) : '');
                              if (input == null) return;
                              const val = input === '' ? null : Number(input);
                              if (input !== '' && Number.isNaN(val)) { alert('Invalid price'); return; }
                              const id = combo._id?.$oid || combo._id || combo.id;
                              const updated = { ...combo };
                              if (sz == null) {
                                // update base price if no specific size variant found
                                updated.basePrice = val;
                              }
                              // update matching size variant across items
                              updated.items = (Array.isArray(combo.items) ? combo.items : []).map((it) => {
                                const next = { ...it };
                                const vs = Array.isArray(it.variants) ? it.variants : [];
                                next.variants = vs.map((vv) => {
                                  const match = (vv.size || null) === (sz || null);
                                  return match ? { ...vv, price: val } : vv;
                                });
                                return next;
                              });
                              await axios.put(`${API_BASE_URL}/api/dummy-combos/${id}`, updated, { headers: { 'Content-Type': 'application/json' } });
                              // refresh
                              const res = await axios.get(`${API_BASE_URL}/api/dummy-combos`, { params: { parentCategoryId: categoryId } });
                              setCombos(Array.isArray(res.data) ? res.data : []);
                            } catch (e) {
                              alert(e?.response?.data?.message || 'Failed to save');
                            }
                          }}
                          style={{ padding: '4px 8px', borderRadius: 4, background: '#0ea5e9', color: '#fff', border: 'none' }}
                        >Edit</button>
                      </td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      ) : null}
       <div style={{ marginTop: 30 }}>
        <h2 style={{ marginBottom: 8 }}>Categories</h2>
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
              {!hasInventory ? (
                <th style={{ border: '1px solid #ccc', padding: 8 }}>Images</th>
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
                          const famLower = String(fam || '').toLowerCase();
                          let pairsAll = Object.entries(fields || {}).filter(([k, v]) => {
                            const fn = String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
                            return fn !== 'modelfields' && v != null && String(v).trim() !== '';
                          });
                          // Bikes: if both bikeBrand and brand present, drop brand
                          if (famLower === 'bikes') {
                            const hasBikeBrand = pairsAll.some(([k]) => String(k).toLowerCase() === 'bikebrand');
                            if (hasBikeBrand) pairsAll = pairsAll.filter(([k]) => String(k).toLowerCase() !== 'brand');
                          }
                          return pairsAll.map(([k, v]) => ({ key: `${fam}:${k}`, label: `${k}:`, value: String(v) }));
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
                {!hasInventory ? (
                  <td style={{ border: '1px solid #ccc', padding: 8, verticalAlign: 'top' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {(Array.isArray(vendor?.rowImages?.[row.id]) ? vendor.rowImages[row.id] : []).map((src, i) => {
                          const raw = String(src || '');
                          const url = raw.startsWith('http') ? raw : `${API_BASE_URL}${raw}`;
                          return (
                            <div key={i} style={{ position: 'relative', width: 56 }}>
                              <img src={url} alt={`img-${i}`} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, border: '1px solid #eee' }} />
                              <div style={{ position: 'absolute', right: 2, top: 2, display: 'flex', gap: 4 }}>
                                <button title="Replace" onClick={() => {
                                  const input = document.createElement('input');
                                  input.type = 'file'; input.accept = 'image/*';
                                  input.onchange = async (e) => {
                                    const file = (e.target.files || [])[0]; if (!file) return;
                                    const form = new FormData(); form.append('image', file);
                                    try {
                                      const res = await axios.put(`${API_BASE_URL}/api/dummy-vendors/${vendorId}/rows/${row.id}/images/${i}`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
                                      const imgs = res.data?.images || [];
                                      // update vendor.state rowImages
                                      setVendor((prev) => ({ ...(prev || {}), rowImages: { ...((prev||{}).rowImages || {}), [row.id]: imgs } }));
                                    } catch {}
                                  };
                                  input.click();
                                }} style={{ padding: 2, border: 'none', background: 'rgba(255,255,255,0.85)', borderRadius: 4, cursor: 'pointer' }}>✎</button>
                                <button title="Delete" onClick={async () => {
                                  try {
                                    const res = await axios.delete(`${API_BASE_URL}/api/dummy-vendors/${vendorId}/rows/${row.id}/images/${i}`);
                                    const imgs = res.data?.images || [];
                                    setVendor((prev) => ({ ...(prev || {}), rowImages: { ...((prev||{}).rowImages || {}), [row.id]: imgs } }));
                                  } catch {}
                                }} style={{ padding: 2, border: 'none', background: 'rgba(255,255,255,0.85)', borderRadius: 4, cursor: 'pointer' }}>🗑️</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: '#475569' }}>Uploaded: {(Array.isArray(vendor?.rowImages?.[row.id]) ? vendor.rowImages[row.id].length : 0)}/5</span>
                        <input type="file" accept="image/*" multiple onChange={async (e) => {
                          const existing = Array.isArray(vendor?.rowImages?.[row.id]) ? vendor.rowImages[row.id].length : 0;
                          const remaining = Math.max(0, 5 - existing);
                          const files = Array.from(e.target.files || []).slice(0, remaining);
                          if (files.length === 0) return;
                          const form = new FormData();
                          files.forEach((f) => form.append('images', f));
                          try {
                            const res = await axios.post(`${API_BASE_URL}/api/dummy-vendors/${vendorId}/rows/${row.id}/images`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
                            const imgs = res.data?.images || [];
                            setVendor((prev) => ({ ...(prev || {}), rowImages: { ...((prev||{}).rowImages || {}), [row.id]: imgs } }));
                          } catch {}
                          e.target.value = '';
                        }} />
                      </div>
                    </div>
                  </td>
                ) : null}
                <td style={{ border: '1px solid #ccc', padding: 8 }}>
                  {match ? (
                    (() => {
                      try {
                        const rowKey = Array.isArray(row.levelIds) && row.levelIds.length ? row.levelIds.map(String).join('|') : String(row.id);
                        const pbr = match && match.pricesByRow && typeof match.pricesByRow === 'object' ? match.pricesByRow : null;
                        const rowPrice = pbr && (pbr[rowKey] !== undefined && pbr[rowKey] !== null) ? pbr[rowKey] : (match.price ?? null);
                        return <span>{rowPrice === undefined || rowPrice === null || rowPrice === '-' ? '-' : rowPrice}</span>;
                      } catch { return <span>-</span>; }
                    })()
                  ) : (
                    editingId === row.categoryId ? (
                      <input type="number" value={editingPrice} onChange={(e) => setEditingPrice(e.target.value)} style={{ width: 100, padding: 6 }} placeholder="Price" />
                    ) : (
                      <span>{row.price === undefined || row.price === null || row.price === '-' ? '-' : row.price}</span>
                    )
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
      </div>

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
                        const hLower = String(heading).toLowerCase().replace(/[^a-z0-9]/g,'');
                        const isBrand = hLower.endsWith('brand');
                        const isModel = hLower.endsWith('model');
                        const brandSelected = Boolean(curr.bikeBrand || curr.brand || curr.Brand || curr.make || curr.Make);
                        const isDisabled = (isModel && !brandSelected) ? true : false;
                        return (
                          <label key={`${familyKey}:${heading}`} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <span style={{ fontSize: 12, color: '#475569' }}>{heading}</span>
                            <select
                              value={val}
                              disabled={isDisabled}
                              onChange={(e) => {
                                const v = e.target.value;
                                setDraftSelections((prev) => {
                                  const nextFam = { ...(prev[familyKey] || {}), [heading]: v };
                                  // On brand change, clear downstream fields
                                  if (isBrand) {
                                    delete nextFam.model; delete nextFam.Model; delete nextFam.modelName; delete nextFam.model_name; delete nextFam.name;
                                    delete nextFam.variant; delete nextFam.Variant; delete nextFam.trim; delete nextFam.Trim;
                                    delete nextFam.transmission; delete nextFam.Transmission; delete nextFam.gearbox; delete nextFam.gear_type; delete nextFam.gearType;
                                    delete nextFam.fuelType; delete nextFam.FuelType; delete nextFam.fueltype; delete nextFam.Fuel; delete nextFam.fuel_type;
                                    delete nextFam.bodyType; delete nextFam.BodyType; delete nextFam.body_type; delete nextFam.type;
                                    delete nextFam.seats; delete nextFam.Seats; delete nextFam.seatCapacity; delete nextFam.SeatCapacity; delete nextFam.seatingCapacity; delete nextFam.SeatingCapacity;
                                  } else if (isModel) {
                                    // On model change, clear fields that depend on model
                                    delete nextFam.variant; delete nextFam.Variant; delete nextFam.trim; delete nextFam.Trim;
                                    delete nextFam.transmission; delete nextFam.Transmission; delete nextFam.gearbox; delete nextFam.gear_type; delete nextFam.gearType;
                                    delete nextFam.fuelType; delete nextFam.FuelType; delete nextFam.fueltype; delete nextFam.Fuel; delete nextFam.fuel_type;
                                    delete nextFam.bodyType; delete nextFam.BodyType; delete nextFam.body_type; delete nextFam.type;
                                    delete nextFam.seats; delete nextFam.Seats; delete nextFam.seatCapacity; delete nextFam.SeatCapacity; delete nextFam.seatingCapacity; delete nextFam.SeatingCapacity;
                                  }
                                  return { ...prev, [familyKey]: nextFam };
                                });
                                if (isBrand) {
                                  try { fetchModelsForFamily(familyKey); } catch {}
                                }
                              }}
                              style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6 }}
                            >
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
            {/* Selected Data (with Images column) */}
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Selected Data</div>
              {(() => {
                const list = Array.isArray(invItems) ? invItems : [];
                const filtered = activeInvScope
                  ? list.filter((it) => String(it.scopeFamily) === String(activeInvScope.family) && String(it.scopeLabel) === String(activeInvScope.label))
                  : list;

                // Build dynamic headings from current selections
                const allKeys = new Set();
                filtered.forEach(item => {
                  Object.values(item.selections || {}).forEach(fields => {
                    Object.keys(fields || {}).forEach(key => {
                      const fn = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
                      if (fn !== 'modelfields') allKeys.add(key);
                    });
                  });
                });
                let dynamicHeadings = Array.from(allKeys);
                // If Bikes scope and both brand and bikeBrand present, hide brand
                if (activeInvScope && String(activeInvScope.family).toLowerCase() === 'bikes') {
                  const hasBikeBrand = dynamicHeadings.some((h) => String(h).toLowerCase() === 'bikebrand');
                  if (hasBikeBrand) dynamicHeadings = dynamicHeadings.filter((h) => String(h).toLowerCase() !== 'brand');
                }

                if (filtered.length === 0) {
                  return (
                    <div style={{ fontSize: 13, color: '#64748b', padding: '20px', textAlign: 'center', background: '#f8fafc', borderRadius: 8 }}>
                      No items added yet. Use the selectors above and click Save to add.
                    </div>
                  );
                }

                return (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '720px' }}>
                      <thead>
                        <tr style={{ background: '#f1f5f9' }}>
                          <th style={{ border: '1px solid #e2e8f0', padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>No</th>
                          <th style={{ border: '1px solid #e2e8f0', padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>Scope</th>
                          {dynamicHeadings.map(heading => (
                            <th key={heading} style={{ border: '1px solid #e2e8f0', padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>
                              {heading}
                            </th>
                          ))}
                          <th style={{ border: '1px solid #e2e8f0', padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>Images</th>
                          <th style={{ border: '1px solid #e2e8f0', padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((it, idx) => {
                          const key = it._id || it.at || idx;
                          const scopeText = `${it.scopeFamily || '-'}`;

                          const rowData = new Map();
                          Object.values(it.selections || {}).forEach(fields => {
                            dynamicHeadings.forEach(heading => {
                              if (fields && fields[heading] != null) {
                                rowData.set(heading, String(fields[heading]));
                              }
                            });
                          });

                          return (
                            <tr key={key} style={{ borderBottom: '1px solid #e2e8f0' }}>
                              <td style={{ border: '1px solid #e2e8f0', padding: '10px 12px' }}>{idx + 1}</td>
                              <td style={{ border: '1px solid #e2e8f0', padding: '10px 12px' }}>{scopeText}</td>
                              {dynamicHeadings.map(heading => (
                                <td key={heading} style={{ border: '1px solid #e2e8f0', padding: '10px 12px' }}>
                                  {rowData.get(heading) || '—'}
                                </td>
                              ))}
                              <td style={{ border: '1px solid #e2e8f0', padding: '10px 12px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {(Array.isArray(it.images) ? it.images : []).map((src, i) => {
                                      const raw = String(src || '');
                                      const url = raw.startsWith('http') ? raw : `${API_BASE_URL}${raw}`;
                                      return (
                                        <div key={i} style={{ position: 'relative', width: 56 }}>
                                          <img src={url} alt={`img-${i}`} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, border: '1px solid #eee' }} />
                                          <div style={{ position: 'absolute', right: 2, top: 2, display: 'flex', gap: 4 }}>
                                            <button title="Replace" onClick={() => {
                                              const input = document.createElement('input');
                                              input.type = 'file'; input.accept = 'image/*';
                                              input.onchange = async (e) => {
                                                try {
                                                  const file = (e.target.files || [])[0]; if (!file) return;
                                                  const form = new FormData(); form.append('image', file);
                                                  const key = String(it._id || it.at);
                                                  const res = await axios.put(`${API_BASE_URL}/api/dummy-vendors/${vendorId}/inventory/${previewCategoryId}/${key}/images/${i}`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
                                                  const imgs = res.data?.images || [];
                                                  setInvItems((prev) => prev.map((p) => ((String(p._id || p.at) === key) ? { ...p, images: imgs } : p)));
                                                } catch {}
                                              };
                                              input.click();
                                            }} style={{ padding: 2, border: 'none', background: 'rgba(255,255,255,0.85)', borderRadius: 4, cursor: 'pointer' }}>✎</button>
                                            <button title="Delete" onClick={async () => {
                                              try {
                                                const key = String(it._id || it.at);
                                                const res = await axios.delete(`${API_BASE_URL}/api/dummy-vendors/${vendorId}/inventory/${previewCategoryId}/${key}/images/${i}`);
                                                const imgs = res.data?.images || [];
                                                setInvItems((prev) => prev.map((p) => ((String(p._id || p.at) === key) ? { ...p, images: imgs } : p)));
                                              } catch {}
                                            }} style={{ padding: 2, border: 'none', background: 'rgba(255,255,255,0.85)', borderRadius: 4, cursor: 'pointer' }}>🗑️</button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    <span style={{ fontSize: 12, color: '#475569' }}>Uploaded: {(Array.isArray(it.images) ? it.images.length : 0)}/5</span>
                                    <input type="file" accept="image/*" multiple onChange={async (e) => {
                                      try {
                                        const existing = Array.isArray(it.images) ? it.images.length : 0;
                                        const remaining = Math.max(0, 5 - existing);
                                        const files = Array.from(e.target.files || []).slice(0, remaining);
                                        if (files.length === 0) return;
                                        const form = new FormData();
                                        files.forEach((f) => form.append('images', f));
                                        const key = String(it._id || it.at);
                                        const res = await axios.post(`${API_BASE_URL}/api/dummy-vendors/${vendorId}/inventory/${previewCategoryId}/${key}/images`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
                                        const imgs = res.data?.images || [];
                                        setInvItems((prev) => prev.map((p) => ((String(p._id || p.at) === key) ? { ...p, images: imgs } : p)));
                                      } catch {}
                                      e.target.value = '';
                                    }} />
                                  </div>
                                </div>
                              </td>
                              <td style={{ border: '1px solid #e2e8f0', padding: '10px 12px' }}>
                                <div style={{ display: 'flex', gap: 8 }}>
                                  <button
                                    type="button"
                                    title="Edit"
                                    onClick={() => {
                                      try {
                                        const scope = it.scopeFamily && it.scopeLabel ? { family: it.scopeFamily, label: it.scopeLabel } : null;
                                        const famPrefix = scope ? `${scope.family}:${scope.label}:` : null;
                                        setEditingItemKey(it._id || it.at || null);
                                        setLinkedAttributes((prev) => {
                                          const next = { ...prev };
                                          if (famPrefix) {
                                            Object.keys(next).forEach((k) => { if (k.startsWith(famPrefix)) delete next[k]; });
                                          }
                                          Object.entries(it.selections || {}).forEach(([fam, fields]) => {
                                            Object.entries(fields || {}).forEach(([field, val]) => {
                                              if (val == null || String(val).trim() === '') return;
                                              const storeKey = famPrefix ? `${famPrefix}${field}` : `${fam}:${field}`;
                                              next[storeKey] = [String(val)];
                                            });
                                          });
                                          return next;
                                        });
                                      } catch {}
                                    }}
                                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff' }}
                                  >✎</button>
                                  <button
                                    type="button"
                                    title="Delete"
                                    onClick={async () => {
                                      try {
                                        const next = (Array.isArray(invItems) ? invItems : []).filter((p) => (p._id || p.at) !== (it._id || it.at));
                                        setInvItems(next);
                                        if (editingItemKey && (editingItemKey === (it._id || it.at))) setEditingItemKey(null);
                                        if (vendorId && previewCategoryId) {
                                          await saveDummyInventorySelections(vendorId, previewCategoryId, next);
                                        }
                                      } catch (e) { /* ignore */ }
                                    }}
                                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #fecaca', background: '#fee2e2', color: '#ef4444' }}
                                  >🗑️</button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button onClick={async () => {
                try {
                  const scope = activeInvScope || null;
                  if (!scope) return alert('Please click a label button (scope) first.');
                  const fam = String(scope.family);
                  const sel = draftSelections[fam] || {};
                  const hasAny = Object.values(sel).some((v) => v != null && String(v).trim() !== '');
                  if (!hasAny) return alert('Please select some values before adding.');
                  const keyNow = editingItemKey || Date.now();
                  // Normalize bikes fields: map brand -> bikeBrand and remove brand
                  const famLower = String(fam).toLowerCase();
                  let selNorm = { ...sel };
                  if (famLower === 'bikes') {
                    if (selNorm.brand && !selNorm.bikeBrand) {
                      selNorm = { ...selNorm, bikeBrand: selNorm.brand };
                    }
                    if (selNorm.brand) { const { brand, ...rest } = selNorm; selNorm = rest; }
                  }
                  const snapshot = {
                    at: keyNow,
                    categoryId,
                    selections: { [fam]: selNorm },
                    scopeFamily: scope.family,
                    scopeLabel: scope.label,
                  };
                  let nextItems;
                  if (editingItemKey) {
                    nextItems = (Array.isArray(invItems) ? invItems : []).map((p) => ((p._id || p.at) === editingItemKey ? { ...snapshot, _id: p._id } : p));
                  } else {
                    nextItems = [...(Array.isArray(invItems) ? invItems : []), snapshot];
                  }
                  setInvItems(nextItems);
                  if (vendorId && previewCategoryId) {
                    await saveDummyInventorySelections(vendorId, previewCategoryId, nextItems);
                    await ensureLinkedSubcategoryForScope(previewCategoryId, scope.family, scope.label);
                  }
                  // clear draft selections for this family so inputs reset
                  setDraftSelections((prev) => ({ ...prev, [fam]: {} }));
                  setEditingItemKey(null);
                } catch (e) {
                  alert('Failed to add data');
                }
              }} style={{ padding: '6px 10px', borderRadius: 6, background: '#16a34a', color: '#fff', border: 'none' }}>Add Data</button>
              <button onClick={() => { setShowLinkedModal(false); setDraftSelections({}); }} style={{ padding: '6px 10px', borderRadius: 6, background: '#e5e7eb', border: 'none' }}>Close</button>
              <button onClick={async () => {
                try {
                  if (!vendorId || !previewCategoryId || !activeInvScope) return;
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
                  await saveDummyInventorySelections(vendorId, previewCategoryId, next);
                  await ensureLinkedSubcategoryForScope(previewCategoryId, fam, label);
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
                    if (vendorId && previewCategoryId) { await saveDummyInventorySelections(vendorId, previewCategoryId, next); }
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
