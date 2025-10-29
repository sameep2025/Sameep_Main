import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";

function flattenTree(node, rows = [], parentLevels = [], parentIds = []) {
  if (!node) return rows;
  const levels = [...parentLevels, node.name ?? "Unnamed"];
  const ids = [...parentIds, (node._id ?? node.id)];
  if (!node.children || node.children.length === 0) {
    rows.push({
      id: node._id ?? node.id,
      levels,
      price:
        typeof node.vendorPrice === "number"
          ? node.vendorPrice
          : node.price ?? "-",
      categoryId: node._id ?? node.id,
      levelIds: ids,
    });
  } else {
    node.children.forEach((child) => flattenTree(child, rows, levels, ids));
  }
  return rows;
}

export default function VendorCategoriesDetailPage() {
  const { vendorId, categoryId } = useParams();
  const navigate = useNavigate();
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [combos, setCombos] = useState([]);
  const [combosLoading, setCombosLoading] = useState(false);
  const [combosError, setCombosError] = useState("");
  const [categoryNameCache, setCategoryNameCache] = useState({});
  const [variantEdit, setVariantEdit] = useState(null); // { comboId, itemIndex, variantIndex|null, price, terms, labels }
  const [rowPriceEdit, setRowPriceEdit] = useState(null); // { key, price, labels }
  const [modalCategory, setModalCategory] = useState(null); // { id, name, vendorPrice }
  const [vendor, setVendor] = useState(null);
  const [vendorLoading, setVendorLoading] = useState(false);
  const [inventoryLabelName, setInventoryLabelName] = useState("");
  const [linkedAttributes, setLinkedAttributes] = useState({});
  const [showLinkedModal, setShowLinkedModal] = useState(false);
  const [allMasters, setAllMasters] = useState([]);
  const [savingLinked, setSavingLinked] = useState(false);
  const [modelsByFamily, setModelsByFamily] = useState({});
  const [cascadeSelection, setCascadeSelection] = useState({}); // { [familyKey]: { brand:'', model:'', variant:'', transmission:'' } }
  const [pairSelection, setPairSelection] = useState({}); // { [familyKey]: Set<'brand|trans'> }
  const [invItems, setInvItems] = useState([]); // array of structured selections to save
  const [activeInvScope, setActiveInvScope] = useState(null); // { family, label }
  const [editingItemKey, setEditingItemKey] = useState(null); // _id or at of the item being edited

  const fetchModelsForFamily = async (familyKey) => {
    try {
      console.log(`Fetching models for family: ${familyKey}`);
      const orig = String(familyKey || '').trim();
      if (!orig) return [];
      const cached = modelsByFamily[orig];
      if (Array.isArray(cached) && cached.length > 0) return cached; // retry fetch if previously cached empty
      const lower = orig.toLowerCase();
      const singular = lower.endsWith('s') ? lower.slice(0, -1) : lower;
      const noSpaces = lower.replace(/\s+/g, '');
      const extras = [];
      // Map Tempo Minibuses variants to tempoBus
      if (
        noSpaces === 'tempobus' ||
        lower === 'tempo bus' ||
        lower.includes('tempo mini') ||
        noSpaces.includes('tempomini') ||
        lower.includes('minibus') ||
        lower.includes('minibuses')
      ) {
        extras.push('tempoBus');
      }
      const candidates = Array.from(new Set([orig, lower, singular, noSpaces, ...extras]));
      let models = [];
      for (const c of candidates) {
        try {
          const res = await axios.get(`http://localhost:5000/api/models`, { params: { category: c } });
          const data = Array.isArray(res.data) ? res.data : [];
          if (data.length) {
            models = data.map((d) => ({ _id: d._id || d.id, name: d.name || d.model || '', raw: d }));
            break;
          }
        } catch {}
      }
      console.log(`Found ${models.length} models for ${familyKey}`, models);
      setModelsByFamily((prev) => ({ ...prev, [orig]: models }));
      return models;
    } catch { return []; }
  };

  const titleCase = (s) => String(s).replace(/([A-Z])/g, ' $1').replace(/[-_]/g, ' ').trim().split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  const getCascadeLists = (familyKey) => {
    let models = modelsByFamily[familyKey] || [];
    if (!models.length) {
      const orig = String(familyKey || '');
      const lower = orig.toLowerCase();
      const singular = lower.endsWith('s') ? lower.slice(0, -1) : lower;
      const noSpaces = lower.replace(/\s+/g, '');
      const keys = [orig, lower, singular, noSpaces];
      for (const k of keys) {
        const m = modelsByFamily[k];
        if (Array.isArray(m) && m.length) { models = m; break; }
      }
    }
    const famKey = String(familyKey || '');
    // Primary source of fields: the family's configured headings array
    let selectedFields = Array.isArray(linkedAttributes[famKey]) ? linkedAttributes[famKey] : [];
    // Merge in family-specific model fields (e.g., seats) so they appear as dropdowns within the scope
    const modelFieldsKey = `${famKey}:modelFields`;
    const modelFields = Array.isArray(linkedAttributes[modelFieldsKey]) ? linkedAttributes[modelFieldsKey] : [];
    if (modelFields.length) {
      const canon = (s) => String(s).trim();
      const set = new Set((selectedFields || []).map((f) => canon(f)));
      modelFields.forEach((mf) => {
        const c = canon(mf);
        // Do NOT auto-add 'model' from :modelFields. Only show 'model' if explicitly selected in headings.
        if (c.toLowerCase() === 'model') return;
        if (c && !set.has(c)) { set.add(c); selectedFields.push(c); }
      });
    }
    // Additional guard: If ':modelFields' does NOT include 'model', hide 'model' field even if present in headings
    try {
      const mfLower = modelFields.map((x) => String(x).toLowerCase());
      if (!mfLower.includes('model')) {
        selectedFields = (selectedFields || []).filter((f) => String(f).toLowerCase() !== 'model');
      }
    } catch {}
    if (!selectedFields || selectedFields.length === 0) {
      // Derive conservative defaults from model keys WITHOUT auto-adding 'model'
      const keys = models.length ? Object.keys(models[0].raw || models[0]) : [];
      const candidates = ['brand','variant','transmission','fuelType','bodyType']; // intentionally excludes 'model'
      selectedFields = candidates.filter((k) => keys.includes(k));
      if (selectedFields.length === 0 && keys.includes('brand')) selectedFields = ['brand'];
    }
    // Build a current selection map for this family from linkedAttributes
    const famPrefix = `${famKey}:`;
    const selMap = {};
    Object.entries(linkedAttributes || {}).forEach(([k, v]) => {
      if (!k.startsWith(famPrefix)) return;
      const hk = String(k.slice(famPrefix.length) || '').toLowerCase().replace(/[^a-z0-9]/g,'');
      const canonical = (
        hk.endsWith('brand') ? 'brand' :
        hk.endsWith('model') ? 'model' :
        hk.endsWith('variant') ? 'variant' :
        hk.endsWith('fueltype') ? 'fuelType' :
        hk.endsWith('bodytype') ? 'bodyType' :
        hk.endsWith('transmission') ? 'transmission' :
        hk.endsWith('seats') ? 'seats' :
        null
      );
      if (!canonical) return;
      const vals = Array.isArray(v) ? v.map(String) : (v ? [String(v)] : []);
      if (vals.length) selMap[canonical] = vals;
    });

    // Build lists per field, filtered by all other selected fields
    const listsByField = {};
    // Ensure brand and model appear first for proper cascading order in UI
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
        // All other selected fields must match current row
        const ok = Object.entries(selMap).every(([f, chosen]) => {
          if (String(f).toLowerCase() === fieldLower) return true; // don't filter by self
          const val = String(raw?.[f] ?? '');
          const vnorm = norm(val);
          return chosen.length === 0 || chosen.some((c) => norm(c) === vnorm);
        });
        if (!ok) return;
        const v = raw?.[field];
        if (v !== undefined && v !== null && String(v).trim() !== '') set.add(String(v));
      });
      let arr = Array.from(set);
      // Intersect with preselected values stored in linkedAttributes to limit UI to only chosen data
      // IMPORTANT: Do NOT restrict 'model' options via preselected list; show full model set
      if (String(field).toLowerCase() !== 'model') {
        const preKey = `${familyKey}:model:${field}`;
        const pre = linkedAttributes[preKey];
        if (Array.isArray(pre) && pre.length > 0) {
          const allow = pre.map(String);
          const intersected = arr.filter((x) => allow.includes(String(x)));
          // Only keep intersection if it still has options; otherwise ignore stale config
          if (intersected.length > 0) arr = intersected;
        }
      }
      listsByField[field] = arr;
    });
    return { fields, listsByField };
  };

  // Initialize cascade selections from previously saved linkedAttributes when modal opens
  useEffect(() => {
    if (!showLinkedModal) return;
    // Always refetch vendor to hydrate latest saved items
    (async () => {
      try {
        if (vendorId) {
          const vres = await axios.get(`http://localhost:5000/api/vendors/${vendorId}`);
          const v = vres.data || {};
          setVendor(v);
          const map = v?.inventorySelections || {};
          const existing = Array.isArray(map?.[categoryId]) ? map[categoryId] : [];
          setInvItems(existing);
        } else {
          const map = vendor?.inventorySelections || {};
          const existing = Array.isArray(map?.[categoryId]) ? map[categoryId] : [];
          setInvItems(existing);
        }
      } catch { setInvItems([]); }
    })();
    const next = {};
    Object.entries(linkedAttributes || {}).forEach(([k, v]) => {
      const parts = String(k).split(':');
      if (parts.length >= 3 && parts[1] === 'model') {
        const fam = parts[0];
        const field = parts.slice(2).join(':');
        const arr = Array.isArray(v) ? v : [];
        // use first value as initial single-select default
        next[fam] = { ...(next[fam] || {}), [field]: arr.length ? [String(arr[0])] : [] };
      }
    });
    if (Object.keys(next).length) setCascadeSelection(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLinkedModal]);

  // Build a human-readable summary of linkedAttributes for quick preview
  const linkedSummary = useMemo(() => {
    try {
      if (!linkedAttributes || Object.keys(linkedAttributes).length === 0) return "";
      const parts = Object.entries(linkedAttributes).map(([master, items]) => {
        const list = Array.isArray(items) ? items : [items];
        return `${master}: ${list.join(', ')}`;
      });
      return parts.join(' • ');
    } catch (e) { return ""; }
  }, [linkedAttributes]);

  const linkedSummaryDisplay = linkedSummary && linkedSummary.length > 80 ? linkedSummary.slice(0, 77) + '...' : linkedSummary;

  const fetchCategoryName = async (id) => {
    if (!id) return "";
    if (categoryNameCache[id]) return categoryNameCache[id];
    try {
      const res = await axios.get(`http://localhost:5000/api/categories/${id}`);
      const name = res.data?.name || "";
      setCategoryNameCache((prev) => ({ ...prev, [id]: name }));
      return name;
    } catch {
      return "";
    }
  };

  const fetchVendor = async () => {
    if (!vendorId) return;
    setVendorLoading(true);
    try {
      const res = await axios.get(`http://localhost:5000/api/vendors/${vendorId}`);
      const v = res.data || {};
      // fetch home location too (to show area/city and nearby)
      try {
        const lr = await axios.get(`http://localhost:5000/api/vendors/${vendorId}/location`);
        v.location = lr.data?.location || v.location || {};
        v.location.nearbyLocations = v.location.nearbyLocations || [];
      } catch {}
      setVendor(v);
    } catch {}
    finally { setVendorLoading(false); }
  };

  const fetchCombos = async () => {
    if (!categoryId) return;
    setCombosLoading(true);
    setCombosError("");
    try {
      const res = await axios.get(`http://localhost:5000/api/combos`, { params: { parentCategoryId: categoryId } });
      const list = Array.isArray(res.data) ? res.data : [];
      setCombos(list);
      const ids = [];
      list.forEach(c => (c.items||[]).forEach(it => { if (it.kind === 'category' && it.categoryId) ids.push(String(it.categoryId)); }));
      const uniq = Array.from(new Set(ids));
      await Promise.all(uniq.map(fetchCategoryName));
    } catch (e) {
      setCombosError(e?.response?.data?.message || "Failed to load combos");
      setCombos([]);
    } finally {
      setCombosLoading(false);
    }
  };

  const fetchVendorCategories = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await axios.get(`http://localhost:5000/api/vendors/${vendorId}/categories`);
      let categories = res.data.categories;
      let treeData;
      if (!categories) treeData = [];
      else if (Array.isArray(categories)) treeData = [{ _id: "root", name: "Root", children: categories }];
      else treeData = [{ ...categories, children: categories.children || [] }];
      setTree(treeData);
    } catch (err) {
      setError("Failed to load categories");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVendorCategories();
    fetchCombos();
    fetchVendor();
    // fetch category meta to get inventory label & linked attributes
    (async () => {
      try {
        if (!categoryId) return;
        const res = await axios.get(`http://localhost:5000/api/categories/${categoryId}`);
        const c = res.data || {};
        const cname = String(c.name || '').toLowerCase();
        const isBikeCat = (cname === 'bike' || cname === 'bikes' || cname.includes('bike'));
        const defaultInvLabel = isBikeCat ? 'Bike Inventory' : '';
        setInventoryLabelName(c.inventoryLabelName || defaultInvLabel);
        const la = { ...(c.linkedAttributes || {}) };
        let hasBikes = Object.keys(la).some((k) => !String(k).includes(':') && String(k).toLowerCase().replace(/[^a-z0-9]/g,'') === 'bikes');
        if (!hasBikes && (cname === 'bike' || cname === 'bikes' || cname.includes('bike'))) {
          la['Bikes'] = ['brand','model','variant','bodyType','transmission','seats'];
          hasBikes = true;
        }
        // If still no bikes family, probe models; if bike models exist, add Bikes headings
        if (!hasBikes) {
          try {
            const models = await fetchModelsForFamily('Bikes');
            if (Array.isArray(models) && models.length > 0) {
              la['Bikes'] = ['brand','model','variant','bodyType','transmission','seats'];
            }
          } catch {}
        }
        setLinkedAttributes(la);
      } catch {}
    })();

    // fetch all masters so we can show sub-attributes
    (async () => {
      try {
        const res = await axios.get('http://localhost:5000/api/masters');
        setAllMasters(Array.isArray(res.data) ? res.data : []);
      } catch (e) { setAllMasters([]); }
    })();

    // Listen for global categorySaved events so we can refresh inventoryLabelName when a category is updated elsewhere
    const onCategorySaved = async (e) => {
      try {
        const savedId = e?.detail?.categoryId;
        if (!savedId) return;
        // If the saved category is the one we're viewing, refetch its metadata
        if (String(savedId) === String(categoryId)) {
          const res = await axios.get(`http://localhost:5000/api/categories/${categoryId}`);
          const c = res.data || {};
          setInventoryLabelName(c.inventoryLabelName || "");
          setLinkedAttributes(c.linkedAttributes || {});
        }
      } catch (err) {
        // ignore
      }
    };
    window.addEventListener('categorySaved', onCategorySaved);
    // cleanup
    return () => { window.removeEventListener('categorySaved', onCategorySaved); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId, categoryId]);

  // Keep invItems synced from vendor on initial load and when vendor/category changes
  useEffect(() => {
    try {
      const map = vendor?.inventorySelections || {};
      const existing = Array.isArray(map?.[categoryId]) ? map[categoryId] : [];
      setInvItems(existing);
    } catch { setInvItems([]); }
  }, [vendor, categoryId]);

  // Prefetch models for all displayed families when the popup opens
  useEffect(() => {
    if (!showLinkedModal) return;
    Object.entries(linkedAttributes || {})
      .filter(([k, v]) => Array.isArray(v) && !String(k).includes(':') && k !== 'model' && k !== 'inventorySelections')
      .forEach(([familyKey]) => {
        fetchModelsForFamily(familyKey);
      });
  }, [showLinkedModal, linkedAttributes]);

  const rows = tree.flatMap((root) => flattenTree(root));
  const maxLevels = rows.reduce((max, row) => Math.max(max, row.levels.length), 0);
  const levelHeaders = Array.from({ length: maxLevels }, (_, idx) => (idx === 0 ? "Category" : `Level ${idx + 1}`));

  // Map of row.id -> list of matching inventory items (based on linked subcategory for each scope)
  const rowMatches = useMemo(() => {
    const map = {};
    const items = Array.isArray(invItems) ? invItems : [];
    rows.forEach((row) => {
      const matches = items.filter((it) => {
        // Determine linked subcategory for this scope (if scoped)
        const hasScope = it && it.scopeFamily && it.scopeLabel;
        // Try label-specific key first, then fallback to inventoryLabels (matches how it's saved in category document)
        const keyCandidates = hasScope
          ? [
              `${it.scopeFamily}:${it.scopeLabel}:linkedSubcategory`,
              `${it.scopeFamily}:inventoryLabels:linkedSubcategory`,
            ]
          : [];
        let linked = [];
        for (const k of keyCandidates) {
          const arr = linkedAttributes?.[k];
          if (Array.isArray(arr) && arr.length) { linked = arr; break; }
        }
        const val = Array.isArray(linked) && linked.length ? String(linked[0]) : '';
        // Only match on Level 2 (first subcategory) cell
        const lvlIds = Array.isArray(row.levelIds) ? row.levelIds.map((x) => String(x)) : [];
        const firstIdx = (lvlIds[0] === 'root') ? 2 : 1;
        const firstSubcatId = lvlIds.length > firstIdx ? lvlIds[firstIdx] : null;
        if (!firstSubcatId) return false;
        // If link is 'ALL', show for all Level 2 rows
        if (val === 'ALL') return true;
        // Otherwise, only when Level 2 equals linked subcategory ID
        return String(firstSubcatId) === val;
      });
      map[row.id] = matches;
    });
    return map;
  }, [rows, invItems, linkedAttributes]);

  // Build expanded rows so each matched attributes item becomes its own row
  const expandedRows = useMemo(() => {
    const out = [];
    rows.forEach((row) => {
      const matches = rowMatches[row.id] || [];
      if (matches.length === 0) {
        out.push({ base: row, match: null, idx: 0 });
      } else {
        matches.forEach((m, i) => out.push({ base: row, match: m, idx: i }));
      }
    });
    return out;
  }, [rows, rowMatches]);

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>Vendor Details</h1>
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
                // Fallback to legacy single label if present
                unique.push({ family: 'inventory', name: inventoryLabelName });
              }
              return unique.map((it, idx) => (
                <button
                  key={`${it.family}:${it.name}:${idx}`}
                  onClick={() => { setActiveInvScope({ family: it.family, label: it.name }); setShowLinkedModal(true); }}
                  style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff' }}
                  title={linkedSummary || ''}
                >
                  {it.name}
                </button>
              ));
            } catch { return null; }
          })()}
          <button
            onClick={() => {
              const homeLocs = (vendor?.location?.nearbyLocations || []).filter(Boolean);
              const url = `http://localhost:3001/preview/${vendorId}/${categoryId}?homeLocs=${encodeURIComponent(JSON.stringify(homeLocs))}&t=${Date.now()}`;
              window.open(url, '_blank');
            }}
            style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#059669', color: '#fff' }}
          >
            NiksPreview
          </button>
          <button
            onClick={() => {
              const homeLocs = (vendor?.location?.nearbyLocations || []).filter(Boolean);
              const url = `http://localhost:3000/preview/${vendorId}/${categoryId}?homeLocs=${encodeURIComponent(JSON.stringify(homeLocs))}&t=${Date.now()}`;
              window.open(url, '_blank');
            }}
            style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#0ea5e9', color: '#fff' }}
          >
            Preview
          </button>
          <button onClick={() => navigate(-1)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff' }}>← Back</button>
        </div>
      </div>

      {/* Packages Table (shown only when combos exist; Terms column removed) */}
      {combosLoading ? (
        <div style={{ marginTop: 20 }}><p>Loading combos...</p></div>
      ) : combosError ? (
        <div style={{ marginTop: 20 }}><p style={{ color: 'red' }}>{combosError}</p></div>
      ) : (combos && combos.length > 0) ? (
        <div style={{ marginTop: 20 }}>
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
                const cid = combo._id?.$oid || combo._id || combo.id;
                const comboName = combo.name || 'Combo';
                const items = Array.isArray(combo.items) ? combo.items : [];
                // Build size list by union across items
                const sizeSet = new Set();
                items.forEach((it) => {
                  const vs = Array.isArray(it.variants) ? it.variants : [];
                  if (vs.length === 0) sizeSet.add(null);
                  vs.forEach((v) => sizeSet.add(v.size || null));
                });
                const sizes = sizeSet.size ? Array.from(sizeSet) : [null];
                // Join all item names into single string
                const allItemsLabel = items
                  .map((it) => it.kind === 'custom' ? (it.name || 'Custom') : (categoryNameCache[String(it.categoryId)] || it.name || 'Service'))
                  .filter(Boolean)
                  .join(', ');

                return sizes.map((sz, idx) => {
                  // Representative variant for this size: first item that has matching size
                  let rep = null;
                  let repItemIndex = 0;
                  let repVariantIndex = null;
                  for (let i = 0; i < items.length; i++) {
                    const vs = Array.isArray(items[i].variants) ? items[i].variants : [];
                    const vi = vs.findIndex((vv) => (vv.size || null) === (sz || null));
                    if (vi >= 0) { rep = vs[vi]; repItemIndex = i; repVariantIndex = vi; break; }
                  }

                  const repPrice = (rep && rep.price != null && rep.price !== '') ? Number(rep.price) : null;
                  const base = (combo && combo.basePrice != null && combo.basePrice !== '') ? Number(combo.basePrice) : null;
                  const priceValue = (repPrice != null && !Number.isNaN(repPrice)) ? repPrice : (base != null && !Number.isNaN(base) ? base : null);
                  const priceText = (priceValue != null) ? `₹${priceValue}` : '—';

                  return (
                    <tr key={`${cid}-${idx}`}>
                      <td style={{ border: '1px solid #ccc', padding: 8 }}>{comboName}</td>
                      <td style={{ border: '1px solid #ccc', padding: 8 }}>{allItemsLabel}</td>
                      <td style={{ border: '1px solid #ccc', padding: 8 }}>{sz || '—'}</td>
                      <td style={{ border: '1px solid #ccc', padding: 8 }}>{priceText}</td>
                      <td style={{ border: '1px solid #ccc', padding: 8 }}>
                        <button
                          onClick={() => setVariantEdit({
                            comboId: cid,
                            itemIndex: repItemIndex,
                            variantIndex: repVariantIndex,
                            price: priceValue ?? '',
                            terms: '',
                            labels: { combo: comboName, item: allItemsLabel, size: sz || '' }
                          })}
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

      {/* Categories Table */}
      <div style={{ marginTop: 30 }}>
        <h2 style={{ marginBottom: 8 }}>Categories</h2>
        {loading ? (
          <p>Loading categories...</p>
        ) : error ? (
          <p style={{ color: 'red' }}>{error}</p>
        ) : rows.length === 0 ? (
          <p>No categories found</p>
        ) : (
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                {levelHeaders.map((h, i) => (
                  <th key={i} style={{ border: '1px solid #ccc', padding: 8 }}>{h}</th>
                ))}
                <th style={{ border: '1px solid #ccc', padding: 8 }}>Attributes</th>
                <th style={{ border: '1px solid #ccc', padding: 8 }}>Price</th>
                <th style={{ border: '1px solid #ccc', padding: 8 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {expandedRows.map(({ base: row, match, idx }) => (
                <tr key={`${row.id}-${idx}`}>
                  {levelHeaders.map((_, i) => (
                    <td key={i} style={{ border: '1px solid #ccc', padding: 8 }}>{row.levels[i] ?? '-'}</td>
                  ))}
                  {/* Attributes column - single item per row */}
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

      {/* Per-row Price Override Edit Modal */}
      {rowPriceEdit && (
        <div style={{ position: 'fixed', inset: 0, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
          <div style={{ background: '#fff', padding: 16, borderRadius: 10, minWidth: 320 }}>
            <h3 style={{ marginTop: 0 }}>Edit Row Price</h3>
            <div style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>
              <div><b>Category:</b> {rowPriceEdit.labels?.category || ''}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input type="number" placeholder="Price" value={rowPriceEdit.price} onChange={(e) => setRowPriceEdit((p) => ({ ...p, price: e.target.value }))} style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
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
                    if (vendorId && categoryId) {
                      await axios.put(`http://localhost:5000/api/vendors/${vendorId}/inventory-selections`, { categoryId, items: next });
                    }
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
                      })()
                    ) : (
                      <span style={{ color: '#94a3b8' }}>—</span>
                    )}
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: 8 }}>
                    {(() => {
                      const rowKey = Array.isArray(row.levelIds) && row.levelIds.length ? row.levelIds.map(String).join('|') : String(row.id);
                      const pbr = match && match.pricesByRow && typeof match.pricesByRow === 'object' ? match.pricesByRow : null;
                      const rowOverrideRaw = pbr && pbr[rowKey];
                      const rowOverride = (rowOverrideRaw !== undefined && rowOverrideRaw !== null && rowOverrideRaw !== '') ? Number(rowOverrideRaw) : null;
                      const itemOverride = (match && match.price != null && match.price !== '') ? Number(match.price) : null;
                      const val = (rowOverride != null && !Number.isNaN(rowOverride)) ? rowOverride : ((itemOverride != null && !Number.isNaN(itemOverride)) ? itemOverride : row.price);
                      return val != null && val !== '-' ? `₹${val}` : '—';
                    })()}
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
                      <button
                        onClick={() => setModalCategory({ id: row.categoryId, name: row.levels.slice(-1)[0], vendorPrice: row.price })}
                        style={{ padding: '4px 8px', borderRadius: 4, background: '#0ea5e9', color: '#fff', border: 'none' }}
                      >Edit</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Variant/Item Price Edit Modal */}
      {variantEdit && (
        <div style={{ position: 'fixed', inset: 0, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
          <div style={{ background: '#fff', padding: 16, borderRadius: 10, minWidth: 320 }}>
            <h3 style={{ marginTop: 0 }}>Edit Price</h3>
            <div style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>
              <div><b>Combo:</b> {variantEdit.labels.combo}</div>
              <div><b>Item:</b> {variantEdit.labels.item}</div>
              {variantEdit.labels.size ? <div><b>Size:</b> {variantEdit.labels.size}</div> : null}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input type="number" placeholder="Price" value={variantEdit.price} onChange={(e) => setVariantEdit((p) => ({ ...p, price: e.target.value }))} style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                <button onClick={() => setVariantEdit(null)} style={{ padding: '6px 10px', borderRadius: 6, background: '#e5e7eb', border: 'none' }}>Cancel</button>
                <button onClick={async () => {
                  try {
                    const { comboId, itemIndex, variantIndex, price } = variantEdit;
                    const payload = { price: price === '' ? null : Number(price) };
                    if (variantIndex === null) {
                      await axios.put(`http://localhost:5000/api/combos/${comboId}/item/${itemIndex}`, payload);
                    } else {
                      await axios.put(`http://localhost:5000/api/combos/${comboId}/item/${itemIndex}/variant/${variantIndex}`, payload);
                    }
                    await fetchCombos();
                    setVariantEdit(null);
                  } catch (e) {
                    alert(e?.response?.data?.message || 'Failed to update');
                  }
                }} style={{ padding: '6px 10px', borderRadius: 6, background: '#0ea5e9', color: '#fff', border: 'none' }}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Category Price Edit Modal */}
      {modalCategory && (
        <div style={{ position: 'fixed', inset: 0, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
          <div style={{ background: '#fff', padding: 16, borderRadius: 10, minWidth: 320 }}>
            <h3 style={{ marginTop: 0 }}>Update Price: {modalCategory.name}</h3>
            <CategoryPriceEditor
              vendorId={vendorId}
              categoryId={modalCategory.id}
              initialPrice={modalCategory.vendorPrice}
              onCancel={() => setModalCategory(null)}
              onSaved={(newPrice) => {
                // update tree immediately
                setTree((prev) => {
                  const updateNode = (node) => {
                    if (!node) return node;
                    if ((node._id ?? node.id) === modalCategory.id) return { ...node, vendorPrice: newPrice };
                    if (node.children) return { ...node, children: node.children.map(updateNode) };
                    return node;
                  };
                  return prev.map(updateNode);
                });
                setModalCategory(null);
              }}
            />
          </div>
        </div>
      )}

      {showLinkedModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}>
          <div style={{ background: '#fff', padding: 16, borderRadius: 10, minWidth: 600, maxWidth: '95vw', maxHeight: '80vh', overflow: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>{activeInvScope?.label || inventoryLabelName}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* For brevity and to fix parsing, we render a simplified view that still allows saving selections */}
              {Object.entries(linkedAttributes || {})
                .filter(([k, v]) => Array.isArray(v) && !String(k).includes(':') && k !== 'model' && k !== 'inventorySelections')
                .filter(([familyKey]) => !activeInvScope || String(familyKey) === String(activeInvScope.family))
                .map(([familyKey, headings]) => (
                  <div key={familyKey} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>{familyKey}</div>
                    {/* Render selects for fields derived from getCascadeLists (includes :modelFields) */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                      {(() => {
                        const { fields, listsByField } = getCascadeLists(familyKey);
                        return (fields || []).map((heading) => {
                          const prefix = activeInvScope ? `${familyKey}:${activeInvScope.label}:` : `${familyKey}:`;
                          const storeKey = `${prefix}${heading}`;
                          const preferValues = Array.isArray(listsByField?.[heading]) ? listsByField[heading] : [];
                          const values = (() => {
                            if (preferValues && preferValues.length) return preferValues;
                            const fam = String(familyKey).toLowerCase();
                            const head = String(heading).toLowerCase();
                            const headNorm = head.replace(/[^a-z0-9]/g, '');
                            // Map composite master headings to canonical model fields (e.g., tempoBusBrand -> brand)
                            const canonical = (
                            headNorm.endsWith('brand') ? 'brand' :
                            headNorm.endsWith('model') ? 'model' :
                            headNorm.endsWith('variant') ? 'variant' :
                            headNorm.endsWith('fueltype') ? 'fueltype' :
                            headNorm.endsWith('bodytype') ? 'bodytype' :
                            headNorm.endsWith('transmission') ? 'transmission' :
                            headNorm.endsWith('seats') ? 'seats' :
                            head
                          );
                            // 1) Try models DB first: union of unique values for this field (filtered by chosen brand/model if present)
                            let models = modelsByFamily[familyKey] || [];
                          if (!models.length) {
                            const origFam = String(familyKey || '');
                            const lowerFam = origFam.toLowerCase();
                            const singularFam = lowerFam.endsWith('s') ? lowerFam.slice(0, -1) : lowerFam;
                            const noSpacesFam = lowerFam.replace(/\s+/g, '');
                            for (const key of [origFam, lowerFam, singularFam, noSpacesFam]) {
                              const m = modelsByFamily[key];
                              if (Array.isArray(m) && m.length) { models = m; break; }
                            }
                          }
                          if (models.length) {
                            const canonicalJsKey = canonical === 'bodytype' ? 'bodyType' : (canonical === 'fueltype' ? 'fuelType' : canonical);
                            // Find selected brand even if the heading key is composite (e.g., tempoBusBrand)
                            const famPrefix = prefix;
                            const brandKey = Object.keys(linkedAttributes || {}).find((k) => {
                              if (!k.startsWith(famPrefix)) return false;
                              const hk = String(k.slice(famPrefix.length) || '').toLowerCase().replace(/[^a-z0-9]/g,'');
                              return hk.endsWith('brand');
                            });
                            const brandSelArr = brandKey && Array.isArray(linkedAttributes[brandKey]) ? linkedAttributes[brandKey] : [];
                            const selectedBrand = brandSelArr[0] || '';
                            // Find selected model even if the heading key is composite (e.g., might just be 'model')
                            const modelKeyForFilter = Object.keys(linkedAttributes || {}).find((k) => {
                              if (!k.startsWith(famPrefix)) return false;
                              const hk = String(k.slice(famPrefix.length) || '').toLowerCase().replace(/[^a-z0-9]/g,'');
                              return hk.endsWith('model');
                            });
                            const modelSelArr = modelKeyForFilter && Array.isArray(linkedAttributes[modelKeyForFilter]) ? linkedAttributes[modelKeyForFilter] : [];
                            const selectedModel = modelSelArr[0] || '';
                            // Support common aliases for brand/model and other field keys
                            const keyCandidates = (() => {
                              if (canonicalJsKey === 'brand') return ['brand','make','Brand','Make'];
                              if (canonicalJsKey === 'model') return ['model','modelName','Model','model_name'];
                              if (canonicalJsKey === 'variant') return ['variant','Variant','trim','Trim'];
                              if (canonicalJsKey === 'transmission') return ['transmission','Transmission','gearbox','gear_type','gearType'];
                              if (canonicalJsKey === 'bodyType') return ['bodyType','BodyType','body_type','type'];
                              if (canonicalJsKey === 'fuelType') return ['fuelType','FuelType','fueltype','Fuel','fuel_type'];
                              if (canonicalJsKey === 'seats') return ['seats','Seats','seatCapacity','SeatCapacity','seatingCapacity','SeatingCapacity'];
                              return [canonicalJsKey];
                            })();
                            const fieldExists = models.some(m => {
                              const raw = m.raw || m;
                              return raw && keyCandidates.some(k => Object.prototype.hasOwnProperty.call(raw, k));
                            });
                            if (fieldExists) {
                              const gather = () => {
                                const setVals = new Set();
                                models.forEach((m) => {
                                  const raw = m.raw || m;
                                  // Apply cascade filters
                                  const nselBrand = norm(selectedBrand);
                                  const nrawBrand = norm(raw?.brand || raw?.make || raw?.Brand || raw?.Make || '');
                                  if (selectedBrand && nrawBrand !== nselBrand) return;
                                  if (canonicalJsKey !== 'brand') {
                                    const nselModel = norm(selectedModel);
                                    const nrawModel = norm(raw?.model || raw?.modelName || raw?.Model || raw?.model_name || '');
                                    // For model field, we don't filter by selectedModel (we are building that list)
                                    if (canonicalJsKey !== 'model' && selectedModel && nrawModel !== nselModel) return;
                                  }
                                  let v;
                                  for (const k of keyCandidates) { if (raw && raw[k] !== undefined && raw[k] !== null) { v = raw[k]; break; } }
                                  if (v !== undefined && v !== null && String(v).trim() !== '') setVals.add(String(v));
                                });
                                return Array.from(setVals);
                              };
                              // Build list strictly respecting chosen brand (if any)
                              const arr = gather();
                              if (arr.length) return arr;
                            }
                            // Only when no brand is selected, list all models to allow choosing brand-agnostic
                            if (canonicalJsKey === 'model' && !selectedBrand) {
                              const all = Array.from(new Set(models.map(m => {
                                const raw = m.raw || m;
                                return String(raw?.model || raw?.modelName || raw?.Model || raw?.model_name || '').trim();
                              }).filter(Boolean)));
                              if (all.length) return all;
                            }
                            // If a brand or model is selected but we couldn't build values from models,
                            // do NOT fallback to masters; return empty to respect the filter strictly.
                            if ((selectedBrand || selectedModel) && canonicalJsKey !== 'brand') {
                              return [];
                            }
                          }
                          // 2) Try masters by fieldType
                          const ftValues = (allMasters || [])
                            .filter(m => {
                              const t = String(m.type || m.category).toLowerCase();
                              const ft = String(m.fieldType || '').toLowerCase();
                              return t === fam && (ft === head || ft.replace(/[^a-z0-9]/g,'').endsWith(canonical));
                            })
                            .map(m => m.name).filter(Boolean);
                          if (ftValues.length) return ftValues;
                          // 3) Else item name with options
                          const item = (allMasters || []).find(m => String(m.type || m.category).toLowerCase() === fam && !m.fieldType && String(m.name || '').toLowerCase() === head);
                          if (item && Array.isArray(item.options)) return item.options.map(String);
                          return [];
                        })();
                        const selectedVals = Array.isArray(linkedAttributes[storeKey]) ? linkedAttributes[storeKey] : [];
                        const value = selectedVals[0] || '';

                        const brandKey = Object.keys(linkedAttributes || {}).find(k => k.startsWith(prefix) && k.toLowerCase().replace(/[^a-z0-9]/g,'').endsWith('brand'));
                        const selectedBrand = (brandKey && linkedAttributes[brandKey] && linkedAttributes[brandKey][0]) || '';
                        console.log(`[${familyKey}] heading="${heading}" | selectedBrand="${selectedBrand}" | values=`, values);

                        const hnorm = String(heading).toLowerCase().replace(/[^a-z0-9]/g,'');
                        const isCascadeField = (
                          hnorm.endsWith('brand') ||
                          hnorm.endsWith('model') ||
                          hnorm.endsWith('variant') ||
                          hnorm.endsWith('transmission') ||
                          hnorm.endsWith('fueltype') ||
                          hnorm.endsWith('bodytype') ||
                          hnorm.endsWith('seats')
                        );

                        return (
                          <div key={storeKey} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ fontWeight: 600, color: '#475569' }}>{heading}</div>
                            {(['brand','model','variant','transmission','fueltype','bodytype','seats'].includes(String((() => {
                              const h = String(heading).toLowerCase().replace(/[^a-z0-9]/g,'');
                              if (h.endsWith('brand')) return 'brand';
                              if (h.endsWith('model')) return 'model';
                              if (h.endsWith('variant')) return 'variant';
                              if (h.endsWith('transmission')) return 'transmission';
                              if (h.endsWith('fueltype')) return 'fueltype';
                              if (h.endsWith('bodytype')) return 'bodytype';
                              if (h.endsWith('seats')) return 'seats';
                              return 'other';
                            })()))) ? (
                              <select value={value} onChange={(e) => {
                                console.log('onChange triggered for heading:', heading, 'with value:', e.target.value);
                                const v = e.target.value;
                                setLinkedAttributes((prev) => {
                                  console.log('Updating linkedAttributes. Prev state:', prev);
                                  const next = { ...prev };
                                  if (!v) delete next[storeKey]; else next[storeKey] = [v];
                                  // If brand/model changed, clear dependent downstream selections
                                  const hLower = String(heading).toLowerCase();
                                  const isBrand = hLower.replace(/[^a-z0-9]/g,'').endsWith('brand');
                                  const isModel = hLower.replace(/[^a-z0-9]/g,'').endsWith('model');
                                  const famPrefix = `${familyKey}:${activeInvScope?.label}:`;
                                  if (isBrand) {
                                    // Clear model and all other dependent fields
                                    Object.keys(next).forEach((k) => {
                                      if (!k.startsWith(famPrefix)) return;
                                      const hk = k.slice(famPrefix.length).toLowerCase().replace(/[^a-z0-9]/g,'');
                                      if (hk === 'model' || hk === 'variant' || hk === 'transmission' || hk === 'fueltype' || hk === 'bodytype' || hk === 'seats') delete next[k];
                                    });
                                  } else if (isModel) {
                                    // Clear fields that depend on model
                                    Object.keys(next).forEach((k) => {
                                      if (!k.startsWith(famPrefix)) return;
                                      const hk = k.slice(famPrefix.length).toLowerCase().replace(/[^a-z0-9]/g,'');
                                      if (hk === 'variant' || hk === 'transmission' || hk === 'fueltype' || hk === 'bodytype' || hk === 'seats') delete next[k];
                                    });
                                  }
                                  console.log('New state:', next);
                                  return next;
                                });
                                // Ensure models are fetched when brand changes
                                try {
                                  const hLower2 = String(heading).toLowerCase();
                                  const isBrand2 = hLower2.replace(/[^a-z0-9]/g,'').endsWith('brand');
                                  if (isBrand2) fetchModelsForFamily(familyKey);
                                } catch {}
                              }} style={{ padding: 8, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                                <option value="">Select</option>
                                {values.map(val => (
                                  <option key={`${storeKey}-${val}`} value={val}>{val}</option>
                                ))}
                              </select>
                            ) : (
                              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <input
                                  type="checkbox"
                                  checked={Array.isArray(selectedVals) && selectedVals.length > 0}
                                  onChange={(e) => {
                                    const on = e.target.checked;
                                    setLinkedAttributes((prev) => {
                                      const next = { ...prev };
                                      if (on) next[storeKey] = [String(heading)]; else delete next[storeKey];
                                      return next;
                                    });
                                  }}
                                />
                                <span>Include {String(heading)}</span>
                              </label>
                            )}
                          </div>
                        );
                      });
                      })()}
                    </div>
                  </div>
                ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Selected Data List (appends via Add Data) */}
              <div style={{ marginTop: 12 }}>
  <div style={{ fontWeight: 700, marginBottom: 6 }}>Selected Data</div>
  {(() => {
    const list = Array.isArray(invItems) ? invItems : [];
    const filtered = activeInvScope
      ? list.filter((it) => String(it.scopeFamily) === String(activeInvScope.family) && String(it.scopeLabel) === String(activeInvScope.label))
      : list;

    // New: Extract all possible keys from selections to build dynamic columns
    const allKeys = new Set();
    filtered.forEach(item => {
      Object.values(item.selections || {}).forEach(fields => {
        Object.keys(fields || {}).forEach(key => {
          const fn = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
          if (fn !== 'modelfields') {
            allKeys.add(key);
          }
        });
      });
    });
    const dynamicHeadings = Array.from(allKeys);

    return filtered.length > 0 ? (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '600px' }}>
          <thead>
            <tr style={{ background: '#f1f5f9' }}>
              <th style={{ border: '1px solid #e2e8f0', padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>No</th>
              <th style={{ border: '1px solid #e2e8f0', padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>Scope</th>
              {dynamicHeadings.map(heading => (
                <th key={heading} style={{ border: '1px solid #e2e8f0', padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>
                  {heading}
                </th>
              ))}
              <th style={{ border: '1px solid #e2e8f0', padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((it, idx) => {
              const key = it._id || it.at || idx;
              const scopeText = `${it.scopeFamily || '-'}`;
              
              // New: Create a map of values for the current row for easy lookup
              const rowData = new Map();
              Object.values(it.selections || {}).forEach(fields => {
                dynamicHeadings.forEach(heading => {
                  if (fields && fields[heading] != null) {
                    rowData.set(heading, String(fields[heading]));
                  }
                });
              });

              return (
                <tr key={key} style={{ background: editingItemKey && (editingItemKey === (it._id || it.at)) ? '#f0f9ff' : '#fff', borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ border: '1px solid #e2e8f0', padding: '10px 12px' }}>{idx + 1}</td>
                  <td style={{ border: '1px solid #e2e8f0', padding: '10px 12px' }}>{scopeText}</td>
                  {dynamicHeadings.map(heading => (
                    <td key={heading} style={{ border: '1px solid #e2e8f0', padding: '10px 12px' }}>
                      {rowData.get(heading) || '—'}
                    </td>
                  ))}
                  <td style={{ border: '1px solid #e2e8f0', padding: '10px 12px' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        title="Edit"
                        onClick={async () => {
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
                            if (vendorId && categoryId) {
                              await axios.put(`http://localhost:5000/api/vendors/${vendorId}/inventory-selections`, { categoryId, items: next });
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
    ) : (
      <div style={{ fontSize: 13, color: '#64748b', padding: '20px', textAlign: 'center', background: '#f8fafc', borderRadius: '8px' }}>
        No items added yet. Click "Add Data" to append current selections.
      </div>
    );
  })()}
</div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <button onClick={async () => {
                  try {
                    // Build a grouped selection snapshot from current linkedAttributes
                    const grouped = {};
                    const usedKeys = [];
                    const scope = activeInvScope || null; // { family, label } | null
                    const prefix = scope ? `${scope.family}:${scope.label}:` : null;
                    Object.entries(linkedAttributes || {}).forEach(([k, v]) => {
                      if (!k.includes(':')) return;
                      if (!Array.isArray(v) || v.length === 0) return;
                      // If scoped, only take keys within the scope prefix
                      if (prefix && !k.startsWith(prefix)) return;
                      const parts = String(k).split(':');
                      const fam = parts.shift();
                      let field = parts.join(':');
                      // When scoped, drop the label segment from field path
                      if (scope) {
                        const lbl = String(scope.label);
                        if (field.startsWith(lbl + ':')) field = field.slice(lbl.length + 1);
                      }
                      const fieldNorm = field.toLowerCase().replace(/[^a-z0-9]/g, '');
                      if (fieldNorm === 'modelfields') return; // skip config keys
                      if (!grouped[fam]) grouped[fam] = {};
                      grouped[fam][field] = v[0];
                      usedKeys.push(k);
                    });
                    const any = Object.keys(grouped).length > 0;
                    if (!any) return alert('Please select some values before adding.');
                    const keyNow = editingItemKey || Date.now();
                    const snapshot = { at: keyNow, categoryId, selections: grouped, scopeFamily: scope ? scope.family : null, scopeLabel: scope ? scope.label : null };
                    let nextItems;
                    if (editingItemKey) {
                      // replace existing item with same key
                      nextItems = (Array.isArray(invItems) ? invItems : []).map((p) => ((p._id || p.at) === editingItemKey ? { ...snapshot, _id: p._id } : p));
                    } else {
                      nextItems = [...(Array.isArray(invItems) ? invItems : []), snapshot];
                    }
                    setInvItems(nextItems);
                    // Auto-persist to vendor DB
                    if (vendorId && categoryId) {
                      await axios.put(`http://localhost:5000/api/vendors/${vendorId}/inventory-selections`, { categoryId, items: nextItems });
                    }
                    // Clear the selected dropdowns so they disappear
                    if (usedKeys.length) {
                      setLinkedAttributes((prev) => {
                        const next = { ...prev };
                        usedKeys.forEach((k) => { delete next[k]; });
                        return next;
                      });
                    }
                    setEditingItemKey(null);
                  } catch (e) {
                    alert('Failed to add data');
                  }
                }} style={{ padding: '6px 10px', borderRadius: 6, background: '#16a34a', color: '#fff', border: 'none', marginRight: 8 }}>{editingItemKey ? 'Update Data' : 'Add Data'}</button>
                <button onClick={() => { setShowLinkedModal(false); setActiveInvScope(null); setEditingItemKey(null); }} style={{ padding: '6px 10px', borderRadius: 6, background: '#e5e7eb', border: 'none', marginRight: 8 }}>Close</button>
                <button onClick={async () => {
                  if (!categoryId) return;
                  try {
                    setSavingLinked(true);
                    const payloadLinked = { ...(linkedAttributes||{}) };
                    await axios.put(`http://localhost:5000/api/categories/${categoryId}`, { linkedAttributes: JSON.stringify(payloadLinked) });
                    // Save inventory items to vendor as well
                    if (vendorId) {
                      const items = Array.isArray(invItems) ? invItems : [];
                      await axios.put(`http://localhost:5000/api/vendors/${vendorId}/inventory-selections`, { categoryId, items });
                      try {
                        const vres = await axios.get(`http://localhost:5000/api/vendors/${vendorId}`);
                        setVendor(vres.data || null);
                      } catch {}
                    }
                    const res = await axios.get(`http://localhost:5000/api/categories/${categoryId}`);
                    const c = res.data || {};
                    setInventoryLabelName(c.inventoryLabelName || "");
                    setLinkedAttributes(c.linkedAttributes || {});
                    setShowLinkedModal(false);
                    setEditingItemKey(null);
                  } catch (e) {
                    alert(e?.response?.data?.message || 'Failed to save linked attributes');
                  } finally { setSavingLinked(false); }
                }} style={{ padding: '6px 10px', borderRadius: 6, background: '#0ea5e9', color: '#fff', border: 'none' }}>{savingLinked ? 'Saving...' : 'Save'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryPriceEditor({ vendorId, categoryId, initialPrice, onCancel, onSaved }) {
  const [price, setPrice] = useState(initialPrice ?? "");

  useEffect(() => {
    setPrice(initialPrice ?? "");
  }, [initialPrice]);

  const save = async () => {
    const newPrice = parseFloat(price);
    if (isNaN(newPrice)) return alert('Enter a valid number');
    await axios.put(`http://localhost:5000/api/vendorPricing/${vendorId}/${categoryId}`, { price: newPrice });

// notify other pages / tabs that pricing changed
try {
  const key = `vendorPricingUpdated:${vendorId}:${categoryId}`;
  const payload = JSON.stringify({ vendorId, categoryId, ts: Date.now() });
  localStorage.setItem(key, payload); // triggers storage event in other tabs
  // trigger an in-tab event as well (storage doesn't fire in same tab)
  window.dispatchEvent(new CustomEvent('vendorPricingUpdated', { detail: { vendorId, categoryId } }));
} catch (e) {
  // ignore harmless localStorage failures
}

onSaved?.(newPrice);

  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Vendor Price" style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{ padding: '6px 10px', borderRadius: 6, background: '#e5e7eb', border: 'none' }}>Cancel</button>
        <button onClick={save} style={{ padding: '6px 10px', borderRadius: 6, background: '#0ea5e9', color: '#fff', border: 'none' }}>Save</button>
      </div>
    </div>
  );
}
