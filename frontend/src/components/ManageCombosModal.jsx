import { useEffect, useMemo, useState } from "react";

export default function ManageCombosModal({ show, onClose, subcategoryId, initialEditingCombo = null, onSaved = null }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // data
  const [leaves, setLeaves] = useState([]); // flat leaves with price
  const [treeRoot, setTreeRoot] = useState(null); // full subtree

  // form state
  const [editingCombo, setEditingCombo] = useState(null);
  const [name, setName] = useState("");
  const [iconUrl, setIconUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [iconFile, setIconFile] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [type, setType] = useState("Standard");
  const [basePrice, setBasePrice] = useState("");
  const [terms, setTerms] = useState("");
  // removed combo-level sizes; we will use per-item sizes instead
  const [selectedLeafIds, setSelectedLeafIds] = useState([]);
  const [customItems, setCustomItems] = useState([]); // {name,sizeOptions[],price,terms}
  // per-size variant overrides: key = `${kind}:${idOrIndex}:${sizeIndex}` => { price, terms, file, imageUrl }
  const [variantOverrides, setVariantOverrides] = useState({});
  // per-item sizes for category-kind items in Step 3
  const [itemSizesOverride, setItemSizesOverride] = useState({}); // key: `category:<id>` or `custom:<idx>` -> [sizes]
  // Step 4: enable combo types editor
  const [enableComboTypes, setEnableComboTypes] = useState(false);
  // Step 4: combined combo sizes and overrides (applied to all items)
  const [comboSizes, setComboSizes] = useState([]); // ["Small", "Large", ...]
  const [comboVariantOverrides, setComboVariantOverrides] = useState({}); // key: `combo:${j}` -> { price, terms, file }

  // UI state
  const [cardCollapsed, setCardCollapsed] = useState({});
  const [branchFilter, setBranchFilter] = useState("all");
  const [collapsedBranches, setCollapsedBranches] = useState({});

  const toAbs = (u) => {
    if (!u) return "";
    if (typeof u !== 'string') return "";
    const host = 'http://localhost:5000';
    if (u.startsWith('http://') || u.startsWith('https://')) return u;
    if (u.startsWith('/uploads/')) return `${host}${u}`;
    if (u.startsWith('/')) return `${host}${u}`;
    // plain filename or 'uploads/filename'
    const p = u.startsWith('uploads/') ? u : `uploads/${u}`;
    return `${host}/${p}`;
  };

  // fetch data
  useEffect(() => {
    if (!show || !subcategoryId) return;
    (async () => {
      try {
        const r = await fetch(`http://localhost:5000/api/categories/${subcategoryId}/leaf`);
        const j = await r.json();
        setLeaves(Array.isArray(j) ? j : []);
      } catch {
        setLeaves([]);
      }
    })();
    (async () => {
      try {
        const r = await fetch(`http://localhost:5000/api/categories/${subcategoryId}/tree`);
        const j = await r.json();
        setTreeRoot(j || null);
      } catch {
        setTreeRoot(null);
      }
    })();
  }, [show, subcategoryId]);

  // reset
  useEffect(() => {
    if (!show) return;
    if (!editingCombo) {
      setStep(1);
      setName("");
      setIconUrl("");
      setImageUrl("");
      setIconFile(null);
      setImageFile(null);
      setType("Standard");
      setBasePrice("");
      setTerms("");
      setItemSizesOverride({});
      setSelectedLeafIds([]);
      setCustomItems([]);
      setVariantOverrides({});
      setEnableComboTypes(false);
      setComboSizes([]);
      setComboVariantOverrides({});
    }
  }, [show, editingCombo]);

  useEffect(() => {
    if (show && initialEditingCombo) onEdit(initialEditingCombo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, initialEditingCombo]);

  // maps and helpers (must be defined before effects below)
  const leafMap = useMemo(() => {
    const m = new Map();
    leaves.forEach((l) => m.set(String(l._id), l));
    return m;
  }, [leaves]);

  // path maps
  const pathMap = useMemo(() => {
    const map = new Map();
    const dfs = (n, acc) => {
      if (!n) return;
      const id = String(n._id || "root");
      const here = [...acc, n.name || ""];
      map.set(id, here);
      (n.children || []).forEach((c) => dfs(c, here));
    };
    if (treeRoot) dfs(treeRoot, []);
    return map;
  }, [treeRoot]);

  // parent map for orphan detection
  const parentMap = useMemo(() => {
    const p = new Map();
    const dfs = (n, pid) => {
      if (!n) return;
      const id = String(n._id || "root");
      p.set(id, pid);
      (n.children || []).forEach((c) => dfs(c, id));
    };
    if (treeRoot) dfs(treeRoot, null);
    return p;
  }, [treeRoot]);
  const getPathNamesById = (id) => pathMap.get(String(id)) || [];
  const getTopBranchNameById = (id) => {
    const p = getPathNamesById(id);
    // Use the top-most ancestor name for grouping (avoids repeating the same name as the card title)
    return p[0] || "";
  };

  // When editing and tree is available, expand saved category parent selections to leaf IDs
  // and prefill per-item sizes for category items from existing variants
  useEffect(() => {
    if (!show || !editingCombo || !treeRoot) return;
    try {
      const catItems = (editingCombo.items || []).filter((it) => it.kind === 'category' && it.categoryId);
      if (catItems.length === 0) return;

      // Build a set of selected leaf IDs under each saved parent category
      const targetParentIds = new Set(catItems.map((it) => String(it.categoryId)));
      const selectedLeafSet = new Set();
      const st = [treeRoot];
      while (st.length) {
        const n = st.pop();
        if (!n) continue;
        const id = String(n._id || '');
        if (targetParentIds.has(id)) {
          const leavesUnder = getLeafIdsUnder(n);
          leavesUnder.forEach((lid) => selectedLeafSet.add(String(lid)));
          // no need to traverse deeper for this branch
          continue;
        }
        (n.children || []).forEach((c) => st.push(c));
      }
      if (selectedLeafSet.size > 0) {
        setSelectedLeafIds(Array.from(selectedLeafSet));
      }

      // Prefill sizes for category items from their variants
      const nextItemSizes = {};
      catItems.forEach((it) => {
        const key = `category:${String(it.categoryId)}`;
        const sizes = Array.from(new Set((Array.isArray(it.variants) ? it.variants : []).map((v) => String(v.size || '').trim()).filter(Boolean)));
        if (sizes.length) nextItemSizes[key] = sizes;
      });
      if (Object.keys(nextItemSizes).length) {
        setItemSizesOverride((prev) => ({ ...prev, ...nextItemSizes }));
      }
    } catch {}
  }, [show, editingCombo, treeRoot]);

  // Prefill variantOverrides from existing combo variants so edit fields show saved data
  useEffect(() => {
    if (!show || !editingCombo) return;
    try {
      // Compose ordered items same as Step 3/UI uses
      const selectedParentIds = Array.from(new Set(selectedLeafIds.map((lid) => parentMap.get(String(lid))).filter(Boolean)));
      const catItems = selectedParentIds.map((pid) => ({ kind: 'category', key: String(pid) }));
      const custItems = customItems.filter(c => (c.name||'').trim()).map((_, idx) => ({ kind: 'custom', key: `custom-${idx}` }));
      const ordered = [...catItems, ...custItems];

      // Build a quick lookup for saved items
      const saved = Array.isArray(editingCombo.items) ? editingCombo.items : [];
      const findSavedFor = (it, catIndex) => {
        if (it.kind === 'category') {
          return saved.find(s => s.kind === 'category' && String(s.categoryId) === it.key) || null;
        }
        // custom: try same index among saved custom items
        const savedCustoms = saved.filter(s => s.kind === 'custom');
        return savedCustoms[catIndex] || null;
      };

      const next = {};
      ordered.forEach((it, i) => {
        const isCustom = it.kind === 'custom';
        const catCount = catItems.length;
        const savedItem = findSavedFor(it, i - catCount);
        if (!savedItem) return;
        const variants = Array.isArray(savedItem.variants) ? savedItem.variants : [];
        variants.forEach((v, j) => {
          const ovKey = `${it.kind}:${it.key}:${j}`;
          next[ovKey] = { price: v.price ?? '', terms: v.terms || '', imageUrl: v.imageUrl || '' };
        });
      });
      if (Object.keys(next).length) setVariantOverrides((prev) => ({ ...prev, ...next }));
    } catch {}
  }, [show, editingCombo, selectedLeafIds, customItems, parentMap]);
 
  // Prefill comboSizes and comboVariantOverrides from existing items when they share identical variant schema
  useEffect(() => {
    if (!show || !editingCombo) return;
    try {
      const items = Array.isArray(editingCombo.items) ? editingCombo.items : [];
      if (items.length === 0) return;
      const normalized = items.map((it) => Array.isArray(it.variants) ? it.variants.map((v) => ({
        size: v.size || null,
        price: typeof v.price === 'number' ? v.price : null,
        terms: v.terms || '',
        imageUrl: v.imageUrl || ''
      })) : []);
      if (normalized.some(vs => vs.length === 0)) return; // require variants on all items
      // Check same length and same sizes order across items
      const len = normalized[0].length;
      if (!normalized.every(vs => vs.length === len)) return;
      const sizes0 = normalized[0].map(v => v.size || null);
      const sameSizes = normalized.every(vs => vs.map(v => v.size || null).every((sz, i) => sz === sizes0[i]));
      if (!sameSizes) return;
      // Build overrides from the first item
      const first = normalized[0];
      const derivedSizes = sizes0.filter((s) => s !== null);
      const nextSizes = derivedSizes;
      const nextOv = {};
      first.forEach((v, j) => {
        nextOv[`combo:${j}`] = { price: v.price ?? '', terms: v.terms || '', imageUrl: v.imageUrl || '' };
      });
      setEnableComboTypes(true);
      setComboSizes(nextSizes);
      setComboVariantOverrides((prev) => ({ ...prev, ...nextOv }));
    } catch {}
  }, [show, editingCombo]);
  
  // tree helpers
  const nodeChildren = (node) => node?.children || [];
  const isLeafNode = (node) => Array.isArray(node?.children) && node.children.length === 0;
  const getLeafIdsUnder = (node) => {
    const acc = [];
    const st = [node];
    while (st.length) {
      const n = st.pop();
      if (!n) continue;
      if (isLeafNode(n)) acc.push(String(n._id));
      else nodeChildren(n).forEach((c) => st.push(c));
    }
    return acc;
  };

  // helper: detect if a label looks like a size
  const isSizeLabel = (t) => {
    const v = String(t || "").trim().toLowerCase();
    if (!v) return false;
    const known = [
      "xs", "extra small", "x-small", "extra-small",
      "s", "small",
      "m", "medium", "med",
      "l", "large",
      "xl", "extra large", "x-large", "extra-large",
      "xxl", "2xl", "extra extra large", "xx-large", "xx-large",
    ];
    return known.includes(v);
  };
  const getCheckedState = (node) => {
    if (isLeafNode(node)) {
      const checked = selectedLeafIds.includes(String(node._id));
      return { all: checked, some: false };
    }
    const leavesUnder = getLeafIdsUnder(node);
    const selectedCount = leavesUnder.filter((id) => selectedLeafIds.includes(id)).length;
    const all = selectedCount > 0 && selectedCount === leavesUnder.length;
    const some = selectedCount > 0 && !all;
    return { all, some };
  };

  const toggleNode = (node, checked) => {
    const ids = getLeafIdsUnder(node);
    setSelectedLeafIds((prev) => {
      const set = new Set(prev);
      if (checked) ids.forEach((id) => set.add(String(id)));
      else ids.forEach((id) => set.delete(String(id)));
      return Array.from(set);
    });
  };

  const toggleLeaf = (id) => {
    setSelectedLeafIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };
  // collect orphan leaves: leaves whose direct parent is not a last-level parent
  const getOrphanLeavesByBranch = (rootNode, lastLevelParentIds) => {
    if (!rootNode) return new Map();
    const orphans = [];
    const st = [rootNode];
    while (st.length) {
      const n = st.pop();
      if (!n) continue;
      if (isLeafNode(n)) {
        const id = String(n._id);
        const pid = parentMap.get(id);
        if (!lastLevelParentIds.has(String(pid))) {
          orphans.push(n);
        }
      } else {
        nodeChildren(n).forEach((c) => st.push(c));
      }
    }
    const groups = new Map();
    orphans.forEach((leaf) => {
      const b = getTopBranchNameById(leaf._id) || "Other";
      if (!groups.has(b)) groups.set(b, []);
      groups.get(b).push(leaf);
    });
    return groups; // Map<branch, leafNode[]>
  };

const getLastLevelParents = (node) => {
const out = [];
const st = [node];
while (st.length) {
const n = st.pop();
if (!n) continue;
const ch = nodeChildren(n);
if (ch.length === 0) continue;
const allLeaves = ch.every((c) => isLeafNode(c));
if (allLeaves) out.push(n);
else ch.forEach((c) => st.push(c));
}
return out;
};

const onEdit = (combo) => {
 setEditingCombo(combo);
 setName(combo?.name || "");
 setIconUrl(combo?.iconUrl || "");
 setImageUrl(combo?.imageUrl || "");
 setIconFile(null);
 setImageFile(null);
 setType(combo?.type || "Standard");
 setBasePrice(combo?.basePrice ?? "");
 setTerms(combo?.terms || "");
 // Do not inject category IDs directly into selectedLeafIds here; a later effect expands to leaf IDs safely
 setSelectedLeafIds([]);
 const customs = (combo?.items || [])
 .filter((it) => it.kind === "custom")
 .map((it) => ({ name: it.name || "", sizeOptions: it.sizeOptions || [], price: it.price ?? "", terms: it.terms || "" }));
 setCustomItems(customs);
 setStep(1);
};
  

  const submit = async () => {
    setLoading(true);
    setError("");
    try {
      // Build items from selections:
      // - last-level parents that have any of their leaves selected
      // - orphan leaves (whose parent is not a last-level parent) as direct leaf items
      const lastLevelParents = treeRoot ? getLastLevelParents(treeRoot) : [];
      const lastLevelParentIdSet = new Set(lastLevelParents.map((p) => String(p._id)));
      const selectedLeafSet = new Set(selectedLeafIds.map(String));
      const selectedParentIdsRaw = Array.from(new Set(selectedLeafIds.map((lid) => parentMap.get(String(lid))).filter(Boolean)));
      const selectedAllowedParents = selectedParentIdsRaw.filter((pid) => lastLevelParentIdSet.has(String(pid)));
      const orphanLeafIds = Array.from(selectedLeafSet).filter((lid) => !lastLevelParentIdSet.has(String(parentMap.get(String(lid)))));

      const builtItems = [
        // last-level parent category items
        ...selectedAllowedParents.map((pid) => ({ kind: "category", categoryId: pid })),
        // orphan leaves included directly
        ...orphanLeafIds.map((lid) => ({ kind: "category", categoryId: lid })),
        // customs
        ...customItems
          .filter((c) => (c.name || "").trim())
          .map((c) => ({
            kind: "custom",
            name: c.name.trim(),
            sizeOptions: c.sizeOptions || [],
            price: (typeof c.price === 'undefined' || c.price === "") ? null : Number(c.price),
            terms: c.terms || "",
          })),
      ];
      const fd = new FormData();
      fd.append("name", name);
      fd.append("parentCategoryId", subcategoryId);
      fd.append("type", type);
      // attach variants to items
      const catCount = selectedAllowedParents.length + orphanLeafIds.length;
      const itemsWithVariants = builtItems.map((it, i) => {
        // If Combo Types enabled, use global combo sizes and overrides
        if (enableComboTypes) {
          const useSizes = (comboSizes.length ? comboSizes : [null]);
          const variants = useSizes.map((sz, j) => {
            const key = `combo:${j}`;
            const ov = comboVariantOverrides[key] || {};
            return {
              size: sz,
              price: ov.price === "" || typeof ov.price === 'undefined' ? (typeof it.price === 'number' ? it.price : null) : Number(ov.price),
              terms: typeof ov.terms === 'string' && ov.terms.length ? ov.terms : (it.terms || ""),
              imageUrl: ov.imageUrl || "",
            };
          });
          return { ...it, variants };
        }

        // Otherwise, per-item behavior (legacy)
        const itemSizeOptions = it.kind === 'custom' && Array.isArray(customItems[i - catCount]?.sizeOptions)
          ? customItems[i - catCount].sizeOptions
          : Array.isArray(it.sizeOptions) ? it.sizeOptions : [];
        const perItemSizes = (it.kind === 'category')
          ? (itemSizesOverride[`category:${String(it.categoryId)}`] || [])
          : itemSizeOptions;
        const unionSizes = Array.from(new Set(perItemSizes.map(s => String(s).trim()).filter(Boolean)));
        const label = it.kind === 'category'
          ? (getPathNamesById(String(it.categoryId)).slice(-1)[0] || '')
          : (customItems[i - catCount]?.name || it.name || '');
        const labelIsSize = isSizeLabel(label);
        const itemSizes = labelIsSize && it.kind === 'category' ? [label] : unionSizes;
        const useSizes = itemSizes.length > 0 ? itemSizes : [null];
        const variants = useSizes.map((sz, j) => {
          const key = `${it.kind}:${it.kind === 'category' ? String(it.categoryId) : `custom-${i}`}:${j}`;
          const ov = variantOverrides[key] || {};
          return {
            size: sz,
            price: ov.price === "" || typeof ov.price === 'undefined' ? (typeof it.price === 'number' ? it.price : null) : Number(ov.price),
            terms: typeof ov.terms === 'string' && ov.terms.length ? ov.terms : (it.terms || ""),
            imageUrl: ov.imageUrl || "",
          };
        });
        return { ...it, variants };
      });
      fd.append("items", JSON.stringify(itemsWithVariants));
      fd.append("basePrice", basePrice === "" ? "" : String(Number(basePrice)));
      fd.append("terms", terms || "");
      // no combo-level sizes anymore
      if (iconFile) fd.append("icon", iconFile);
      if (imageFile) fd.append("image", imageFile);
      if (!iconFile && iconUrl) fd.append("iconUrl", iconUrl);
      if (!imageFile && imageUrl) fd.append("imageUrl", imageUrl);
      // attach variant images files
      itemsWithVariants.forEach((it, i) => {
        if (!Array.isArray(it.variants)) return;
        it.variants.forEach((v, j) => {
          if (enableComboTypes) {
            const ov = comboVariantOverrides[`combo:${j}`];
            if (ov && ov.file) fd.append(`variant_${i}_${j}`, ov.file);
          } else {
            const keyCat = `${it.kind}:${it.kind === 'category' ? String(it.categoryId) : `custom-${i}`}:${j}`;
            const ov = variantOverrides[keyCat];
            if (ov && ov.file) fd.append(`variant_${i}_${j}`, ov.file);
          }
        });
      });

      const isEdit = Boolean(editingCombo?.id || editingCombo?._id);
      const url = isEdit ? `http://localhost:5000/api/combos/${editingCombo.id || editingCombo._id}` : `http://localhost:5000/api/combos`;
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, { method, body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to save combo");
      }

      if (onSaved) onSaved();
      onClose?.();

      // reset
      setEditingCombo(null);
      setStep(1);
      setName("");
      setType("Standard");
      setBasePrice("");
      setTerms("");
      setItemSizesOverride({});
      setSelectedLeafIds([]);
      setCustomItems([]);
      setIconUrl("");
      setImageUrl("");
      setIconFile(null);
      setImageFile(null);
      setVariantOverrides({});
      setEnableComboTypes(false);
      setComboSizes([]);
      setComboVariantOverrides({});
    } catch (e) {
      setError(e.message || "Failed to save");
    } finally {
      setLoading(false);
    }
  };

  const includedItemsPreview = useMemo(() => {
    const names = [];
    // show only last-level parent names for selected leaves
    const selectedParentIds = Array.from(new Set(selectedLeafIds.map((lid) => parentMap.get(String(lid))).filter(Boolean)));
    selectedParentIds.forEach((pid) => {
      const label = getPathNamesById(String(pid)).slice(-1)[0] || '';
      if (label) names.push(label);
    });
    customItems.forEach((ci) => { if ((ci.name||'').trim()) names.push(ci.name.trim()); });
    return names.join(", ");
  }, [selectedLeafIds, customItems, parentMap, getPathNamesById]);

  if (!show) return null;

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {step === 1 && <h2 style={{ margin: 0 }}>Manage Combos</h2>}
          <button onClick={onClose} style={closeBtn}>×</button>
        </div>
        {error && <div style={errorBox}>{error}</div>}
        <div>
          {step === 1 && <h3 style={sectionTitle}>{editingCombo ? 'Edit Combo' : 'Create Combo'}</h3>}
          <div style={stepperWrap}>
            {[1, 2, 3, 4].map((s) => (
              <div key={s} style={{ ...stepPill, background: step === s ? '#0ea5e9' : '#e5e7eb', color: step === s ? '#fff' : '#111827' }} onClick={() => setStep(s)}>
                Step {s}
              </div>
            ))}
          </div>

          {step === 1 ? (
            <div>
              <label style={label}>Combo Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} style={input} placeholder="e.g., Trims Combo" />

              <label style={label}>Upload Icon</label>
              <input id="iconInput" type="file" accept="image/*" onChange={(e) => setIconFile(e.target.files?.[0] || null)} style={{ display: 'none' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label htmlFor="iconInput" style={btnSecondary}>Choose File</label>
                <span style={{ fontSize: 12, color: '#475569' }}>{iconFile?.name || (iconUrl ? 'Existing image selected' : 'No file selected')}</span>
              </div>
              {(iconFile || iconUrl) && (
                <div style={{ marginTop: 6 }}>
                  <img src={iconFile ? URL.createObjectURL(iconFile) : toAbs(iconUrl)} alt="Icon Preview" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: "1px solid #ddd" }} />
                </div>
              )}

              <label style={label}>Upload Image</label>
              <input id="imageInput" type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} style={{ display: 'none' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label htmlFor="imageInput" style={btnSecondary}>Choose File</label>
                <span style={{ fontSize: 12, color: '#475569' }}>{imageFile?.name || (imageUrl ? 'Existing image selected' : 'No file selected')}</span>
              </div>
              {(imageFile || imageUrl) && (
                <div style={{ marginTop: 6 }}>
                  <img src={imageFile ? URL.createObjectURL(imageFile) : toAbs(imageUrl)} alt="Image Preview" style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 8, border: "1px solid #ddd" }} />
                </div>
              )}

              <div style={{ marginTop: 10 }}>
                <label style={label}>Type</label>
                <div style={{ display: "flex", gap: 10 }}>
                  {["Standard", "Custom"].map((t) => (
                    <label key={t} style={{ fontSize: 14 }}>
                      <input type="radio" value={t} checked={type === t} onChange={(e) => setType(e.target.value)} style={{ marginRight: 6 }} />
                      {t}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div>
              <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 8, marginBottom: 10, background: '#fafafa' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 700, minWidth: 160 }}>Combo: {name || '(no name)'}</div>
                  {iconFile || iconUrl ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, color: '#475569' }}>Icon</span>
                      <img src={iconFile ? URL.createObjectURL(iconFile) : toAbs(iconUrl)} alt="Icon" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 6, border: '1px solid #ddd' }} />
                    </div>
                  ) : null}
                  {imageFile || imageUrl ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, color: '#475569' }}>Image</span>
                      <img src={imageFile ? URL.createObjectURL(imageFile) : toAbs(imageUrl)} alt="Image" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, border: '1px solid #ddd' }} />
                    </div>
                  ) : null}
                  <div style={{ fontSize: 12, color: '#111827' }}>Type: <b>{type}</b></div>
                </div>
              </div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Select Services / Products</div>
              <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 8, maxHeight: 420, overflowY: 'auto' }}>
                {!treeRoot ? (
                  <div style={{ color: '#666' }}>No categories found</div>
                ) : (
                  (() => {
                    const parents = getLastLevelParents(treeRoot);
                    if (parents.length === 0) return <div style={{ color: '#666' }}>No last-level parents</div>;
                    const withBranch = parents.map((p) => ({ p, branch: getTopBranchNameById(p._id) || 'Other' }));
                    const lastParentIds = new Set(withBranch.map(({ p }) => String(p._id)));
                    const orphanGroups = getOrphanLeavesByBranch(treeRoot, lastParentIds);
                    const branches = Array.from(new Set(withBranch.map((x) => x.branch)));
                    orphanGroups.forEach((_, b) => { if (!branches.includes(b)) branches.push(b); });
                    const active = branchFilter === 'all' ? branches : branches.filter((b) => b.toLowerCase() === branchFilter.toLowerCase());
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {active.map((b) => {
                          const items = withBranch.filter((x) => x.branch === b).map((x) => x.p);
                          return (
                            <div key={b}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 0 8px' }}>
                                <div style={{ fontWeight: 700 }}>{b}</div>
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                                {items.map((p) => {
                                  const pid = String(p._id);
                                  const pState = getCheckedState(p);
                                  const pathNames = getPathNamesById(pid);
                                  const chip = pathNames.slice(0, Math.max(0, pathNames.length - 1)).join(' › ');
                                  return (
                                    <div key={pid} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 8, background: '#fafafa' }}>
                                      <div style={{ fontSize: 11, color: '#475569', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={chip}>{chip}</div>
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                          <input type="checkbox" ref={(el) => { if (el) el.indeterminate = pState.some; }} checked={pState.all} onChange={(e) => toggleNode(p, e.target.checked)} />
                                          <div style={{ fontWeight: 600 }}>{p.name}</div>
                                        </div>
                                      </div>
                                      {/* Requested: do not render leaf nodes under last-level parent */}
                                    </div>
                                  );
                                })}
                              </div>
                              {orphanGroups.get(b)?.length ? (
                                <div style={{ marginTop: 10 }}>
                                  <div style={{ fontSize: 12, color: '#475569', marginBottom: 6 }}>Leaf Items</div>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                                    {orphanGroups.get(b).map((lf) => {
                                      const lid = String(lf._id);
                                      const l = leafMap.get(lid);
                                      const st = getCheckedState(lf);
                                      return (
                                        <div key={lid} style={{ padding: 8, borderRadius: 8, background: '#fff', border: '1px solid #e5e7eb' }}>
                                          <div style={{ fontSize: 11, color: '#475569', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={(getPathNamesById(lid) || []).join(' › ')}>
                                            {(getPathNamesById(lid) || []).join(' › ')}
                                          </div>
                                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                              <input type="checkbox" checked={st.all} onChange={() => toggleLeaf(lid)} />
                                              <span>{lf.name}</span>
                                            </label>
                                            <div style={{ fontSize: 12, color: '#444' }}>{typeof l?.price === 'number' ? `₹${l.price}` : '-'}</div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()
                )}
              </div>

              <div style={{ marginTop: 12, fontWeight: 700 }}>Custom Products / Services</div>
              {(customItems || []).map((ci, idx) => (
                <div key={idx} style={{ border: '1px solid #eee', borderRadius: 8, padding: 8, marginTop: 8 }}>
                  <input value={ci.name} onChange={(e) => updateCustomItem(idx, 'name', e.target.value)} placeholder="Custom item name" style={input} />
                </div>
              ))}
              <button type="button" onClick={() => setCustomItems((p) => [...p, { name: '' }])} style={{ ...btnPrimary, marginTop: 8 }}>+ Add Custom Item</button>
            </div>
          ) : null}

          {step === 3 ? (
            <div>
              <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 8, marginBottom: 10, background: '#fafafa' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 700, minWidth: 160 }}>Combo: {name || '(no name)'}</div>
                  
                  {iconFile || iconUrl ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, color: '#475569' }}>Icon</span>
                      <img src={iconFile ? URL.createObjectURL(iconFile) : toAbs(iconUrl)} alt="Icon" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 6, border: '1px solid #ddd' }} />
                    </div>
                  ) : null}
                  {imageFile || imageUrl ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, color: '#475569' }}>Image</span>
                      <img src={imageFile ? URL.createObjectURL(imageFile) : toAbs(imageUrl)} alt="Image" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, border: '1px solid #ddd' }} />
                    </div>
                  ) : null}
                  <div style={{ fontSize: 12, color: '#111827' }}>Type: <b>{type}</b></div>
                  <div style={{ fontSize: 12, color: '#111827' }}>Includes: <b>{includedItemsPreview || '(none)'}</b></div>
                </div>
              </div>
              
              <label style={label}>Base Price</label>
              <input type="number" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} placeholder="e.g., 799" style={input} />
              {/* Combo-level sizes removed; use per-item sizes below */}
              <label style={label}>Terms</label>
              <textarea value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Terms..." style={textarea} />
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={() => setStep(2)} style={btnSecondary}>Back</button>
                <button onClick={() => setStep(4)} style={btnPrimary}>Next</button>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div>
              <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 8, marginBottom: 10, background: '#fafafa' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 700, minWidth: 160 }}>Combo: {name || '(no name)'}</div>
                  {iconFile || iconUrl ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, color: '#475569' }}>Icon</span>
                      <img src={iconFile ? URL.createObjectURL(iconFile) : toAbs(iconUrl)} alt="Icon" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 6, border: '1px solid #ddd' }} />
                    </div>
                  ) : null}
                  {imageFile || imageUrl ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, color: '#475569' }}>Image</span>
                      <img src={imageFile ? URL.createObjectURL(imageFile) : toAbs(imageUrl)} alt="Image" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, border: '1px solid #ddd' }} />
                    </div>
                  ) : null}
                  <div style={{ fontSize: 12, color: '#111827' }}>Type: <b>{type}</b></div>
                  <div style={{ fontSize: 12, color: '#111827' }}>Base: <b>{basePrice || '-'}</b></div>
                  <div style={{ fontSize: 12, color: '#111827' }}>Terms: <b>{(terms || '-').slice(0, 40)}{(terms||'').length>40?'...':''}</b></div>
                  <div style={{ fontSize: 12, color: '#111827' }}>Includes: <b>{includedItemsPreview || '(none)'}</b></div>
                </div>
              </div>

              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <input type="checkbox" checked={enableComboTypes} onChange={(e) => setEnableComboTypes(e.target.checked)} />
                <span style={{ fontWeight: 600 }}>Combo Types</span>
              </label>

              {enableComboTypes && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Per-size price, terms, and image </div>
                  <div style={{ marginBottom: 8 }}>
                    <SizeAdder
                      current={comboSizes}
                      onAdd={(sz) => {
                        const v = String(sz).trim();
                        if (!v) return;
                        setComboSizes((prev) => {
                          const exists = prev.some((p) => String(p).toLowerCase() === v.toLowerCase());
                          if (exists) { alert('This combo type already exists.'); return prev; }
                          return [...prev, v];
                        });
                      }}
                    />
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                      {comboSizes.map((sz) => (
                        <span key={sz} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #e5e7eb', background: '#f8fafc', color: '#0f172a', borderRadius: 999, padding: '4px 8px' }}>
                          {sz}
                          <button type="button" onClick={() => setComboSizes((prev) => prev.filter((s) => s !== sz))} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#ef4444' }}>×</button>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
                    {(comboSizes.length ? comboSizes : [null]).map((sz, j) => {
                      const ovKey = `combo:${j}`;
                      const ov = comboVariantOverrides[ovKey] || {};
                      return (
                        <div key={ovKey} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 8, background: '#fff' }}>
                          <div style={{ fontWeight: 600, marginBottom: 6 }}>{sz || 'Default'}</div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <input type="number" placeholder="Price" value={ov.price ?? ''} onChange={(e) => setComboVariantOverrides((prev) => ({ ...prev, [ovKey]: { ...prev[ovKey], price: e.target.value } }))} style={{ ...input, flex: 1 }} />
                            <input placeholder="Terms" value={ov.terms ?? ''} onChange={(e) => setComboVariantOverrides((prev) => ({ ...prev, [ovKey]: { ...prev[ovKey], terms: e.target.value } }))} style={{ ...input, flex: 2 }} />
                          </div>
                          <div style={{ marginTop: 6 }}>
                            <input id={`file_${ovKey}`} type="file" accept="image/*" onChange={(e) => {
                              const file = e.target.files?.[0] || null;
                              setComboVariantOverrides((prev) => ({ ...prev, [ovKey]: { ...prev[ovKey], file } }));
                            }} style={{ display: 'none' }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <label htmlFor={`file_${ovKey}`} style={btnSecondary}>Choose File</label>
                              <span style={{ fontSize: 12, color: '#475569' }}>{ov.file?.name || (ov.imageUrl ? 'Existing image selected' : 'No file selected')}</span>
                            </div>
                          </div>
                          <div style={{ marginTop: 6 }}>
                            {(ov.file || ov.imageUrl) ? (
                              <img src={ov.file ? URL.createObjectURL(ov.file) : toAbs(ov.imageUrl)} alt="Variant" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 8, border: '1px solid #ddd' }} />
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={() => setStep(3)} style={btnSecondary}>Back</button>
                <button onClick={submit} disabled={loading || !name.trim()} style={btnPrimary}>{editingCombo ? 'Save Changes' : 'Create Combo'}</button>
              </div>
            </div>
          ) : null}

          {(step === 1 || step === 2) ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              {step > 1 && <button onClick={() => setStep(step - 1)} style={btnSecondary}>Back</button>}
              <button onClick={() => setStep(step + 1)} style={btnPrimary}>Next</button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  function updateCustomItem(idx, key, value) {
    setCustomItems((prev) => {
      const next = [...prev];
      if (key === 'sizeOptions' && typeof value === 'string') next[idx].sizeOptions = value.split(',').map((s) => s.trim()).filter(Boolean);
      else if (key === 'price') next[idx].price = value;
      else next[idx][key] = value;
      return next;
    });
  }
}

function SizeAdder({ current = [], onAdd }) {
  const [val, setVal] = useState("");
  return (
    <div style={{ display: 'flex', gap: 8, width: '100%' }}>
      <input
        placeholder="Type a size (e.g., Small)"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const v = String(val).trim();
            if (v) onAdd?.(v);
            setVal("");
          }
        }}
        style={{ ...input, flex: 1 }}
      />
      <button type="button" onClick={() => { const v = String(val).trim(); if (v) onAdd?.(v); setVal(""); }} style={btnPrimary}>Add</button>
    </div>
  );
}

const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modalStyle = { background: '#fff', width: 'min(980px, 95vw)', maxHeight: '90vh', overflow: 'auto', borderRadius: 12, padding: 16, boxShadow: '0 10px 30px rgba(0,0,0,0.25)' };
const errorBox = { background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', padding: 8, borderRadius: 8, margin: '8px 0' };
const sectionTitle = { margin: 0, marginBottom: 8 };
const stepperWrap = { display: 'flex', gap: 6, marginBottom: 12 };
const stepPill = { padding: '6px 10px', borderRadius: 999, fontSize: 12, cursor: 'pointer' };
const label = { display: 'block', fontSize: 13, fontWeight: 600, marginTop: 8, marginBottom: 6 };
const input = { width: '100%', border: '1px solid #ddd', borderRadius: 8, padding: 8 };
const textarea = { width: '100%', minHeight: 80, border: '1px solid #ddd', borderRadius: 8, padding: 8 };
const btnPrimary = { background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' };
const btnSecondary = { background: '#e5e7eb', color: '#111827', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' };
const closeBtn = { background: 'transparent', border: 'none', fontSize: 18, cursor: 'pointer' };
