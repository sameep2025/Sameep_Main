import { useEffect, useMemo, useState } from "react";

export default function DummyManageCombosModal({ show, onClose, subcategoryId, initialEditingCombo = null, onSaved = null }) {
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
  const [selectedLeafIds, setSelectedLeafIds] = useState([]);
  const [customItems, setCustomItems] = useState([]);
  const [variantOverrides, setVariantOverrides] = useState({});
  const [itemSizesOverride, setItemSizesOverride] = useState({});
  const [enableComboTypes, setEnableComboTypes] = useState(false);
  const [comboSizes, setComboSizes] = useState([]);
  const [comboVariantOverrides, setComboVariantOverrides] = useState({});

  const [branchFilter, setBranchFilter] = useState("all");

  const toAbs = (u) => {
    if (!u) return "";
    if (typeof u !== 'string') return "";
    const host = 'http://localhost:5000';
    if (u.startsWith('http://') || u.startsWith('https://')) return u;
    if (u.startsWith('/uploads/')) return `${host}${u}`;
    if (u.startsWith('/')) return `${host}${u}`;
    const p = u.startsWith('uploads/') ? u : `uploads/${u}`;
    return `${host}/${p}`;
  };

  // Build simple two-level tree from dummy categories
  useEffect(() => {
    if (!show || !subcategoryId) return;
    (async () => {
      try {
        // fetch parent category
        const parentRes = await fetch(`http://localhost:5000/api/dummy-categories/${subcategoryId}`);
        const parent = parentRes.ok ? await parentRes.json() : null;
        // fetch direct children as leaves
        const leavesRes = await fetch(`http://localhost:5000/api/dummy-categories?parentId=${subcategoryId}`);
        const childArr = leavesRes.ok ? await leavesRes.json() : [];
        const children = Array.isArray(childArr) ? childArr.map((c) => ({ ...c, children: [] })) : [];
        setLeaves(childArr || []);
        setTreeRoot(parent ? { ...parent, children } : { _id: subcategoryId, name: parent?.name || "", children });
      } catch {
        setLeaves([]);
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

  const leafMap = useMemo(() => {
    const m = new Map();
    leaves.forEach((l) => m.set(String(l._id), l));
    return m;
  }, [leaves]);

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
  const getPathNamesById = (id) => pathMap.get(String(id)) || [];

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
    setSelectedLeafIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
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
      const selectedLeafSet = new Set(selectedLeafIds.map(String));
      // In dummy, last-level parents are just the root parent itself, and leaves are its direct children
      const orphanLeafIds = Array.from(selectedLeafSet);
      const builtItems = [
        ...orphanLeafIds.map((lid) => ({ kind: "category", categoryId: lid })),
        ...customItems
          .filter((c) => (c.name || "").trim())
          .map((c) => ({
            kind: "custom",
            name: c.name.trim(),
            sizeOptions: c.sizeOptions || [],
            price: typeof c.price === 'undefined' || c.price === "" ? null : Number(c.price),
            terms: c.terms || "",
          })),
      ];

      const fd = new FormData();
      fd.append("name", name);
      fd.append("parentCategoryId", subcategoryId);
      fd.append("type", type);

      const itemsWithVariants = builtItems.map((it, i) => {
        if (enableComboTypes) {
          const useSizes = comboSizes.length ? comboSizes : [null];
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
        const useSizes = [null];
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
      if (iconFile) fd.append("icon", iconFile);
      if (imageFile) fd.append("image", imageFile);
      if (!iconFile && iconUrl) fd.append("iconUrl", iconUrl);
      if (!imageFile && imageUrl) fd.append("imageUrl", imageUrl);
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
      const url = isEdit ? `http://localhost:5000/api/dummy-combos/${editingCombo.id || editingCombo._id}` : `http://localhost:5000/api/dummy-combos`;
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

  if (!show) return null;

  // Simplified UI based on ManageCombosModal core pieces
  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {step === 1 && <h2 style={{ margin: 0 }}>Manage Combos</h2>}
          <button onClick={onClose} style={closeBtn}>×</button>
        </div>
        {error && <div style={errorBox}>{error}</div>}
        <div>
          {step === 1 && (
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
          )}

          {step === 2 && (
            <div>
              <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 8, maxHeight: 420, overflowY: 'auto' }}>
                {!treeRoot ? (
                  <div style={{ color: '#666' }}>No categories found</div>
                ) : (
                  <div>
                    <div style={{ fontWeight: 700, margin: '4px 0 8px' }}>{treeRoot.name || 'Category'}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                      {(treeRoot.children || []).map((lf) => {
                        const lid = String(lf._id);
                        const checked = selectedLeafIds.includes(lid);
                        return (
                          <div key={lid} style={{ padding: 8, borderRadius: 8, background: '#fff', border: '1px solid #e5e7eb' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <input type="checkbox" checked={checked} onChange={() => toggleLeaf(lid)} />
                                <span>{lf.name}</span>
                              </label>
                              <div style={{ fontSize: 12, color: '#444' }}>{typeof lf?.price === 'number' ? `₹${lf.price}` : '-'}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Custom Products / Services</div>
              {(customItems || []).map((ci, idx) => (
                <div key={idx} style={{ border: '1px solid #eee', borderRadius: 8, padding: 8, marginTop: 8 }}>
                  <input value={ci.name} onChange={(e) => {
                    const arr = [...customItems];
                    arr[idx] = { ...arr[idx], name: e.target.value };
                    setCustomItems(arr);
                  }} placeholder="Custom item name" style={input} />
                </div>
              ))}
              <button type="button" onClick={() => setCustomItems((p) => [...p, { name: '' }])} style={{ ...btnPrimary, marginTop: 8 }}>+ Add Custom Item</button>
            </div>
          )}

          {step === 4 && (
            <div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Review & Save</div>
              <button disabled={loading} onClick={submit} style={btnPrimary}>{loading ? 'Saving...' : 'Save Combo'}</button>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {[1,2,3,4].map((s) => (
                <button key={s} type="button" onClick={() => setStep(s)} style={{ ...stepPill, background: step === s ? '#0ea5e9' : '#e5e7eb', color: step === s ? '#fff' : '#111827' }}>Step {s}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {step > 1 && <button type="button" onClick={() => setStep((p) => p - 1)} style={btnSecondary}>Back</button>}
              {step < 4 && <button type="button" onClick={() => setStep((p) => p + 1)} style={btnPrimary}>Next</button>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 };
const modalStyle = { width: 'min(100%, 920px)', maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 10px 30px rgba(0,0,0,0.2)' };
const closeBtn = { border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer' };
const errorBox = { background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', padding: 10, borderRadius: 8, margin: '8px 0' };
const sectionTitle = { fontWeight: 700, margin: '6px 0' };
const label = { display: 'block', marginTop: 8, fontWeight: 600, color: '#111827' };
const input = { width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: 8, outline: 'none' };
const btnPrimary = { background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontWeight: 700 };
const btnSecondary = { background: '#fff', color: '#111827', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontWeight: 600 };
const stepPill = { border: 'none', borderRadius: 999, padding: '6px 10px', cursor: 'pointer', fontWeight: 700 };
