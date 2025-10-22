import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";

function flattenTree(node, rows = [], parentLevels = []) {
  if (!node) return rows;
  const levels = [...parentLevels, node.name ?? "Unnamed"];
  if (!node.children || node.children.length === 0) {
    rows.push({
      id: node._id ?? node.id,
      levels,
      price:
        typeof node.vendorPrice === "number"
          ? node.vendorPrice
          : node.price ?? "-",
      categoryId: node._id ?? node.id,
    });
  } else {
    node.children.forEach((child) => flattenTree(child, rows, levels));
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
  const [modalCategory, setModalCategory] = useState(null); // { id, name, vendorPrice }
  const [vendor, setVendor] = useState(null);
  const [vendorLoading, setVendorLoading] = useState(false);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId, categoryId]);

  const rows = tree.flatMap((root) => flattenTree(root));
  const maxLevels = rows.reduce((max, row) => Math.max(max, row.levels.length), 0);
  const levelHeaders = Array.from({ length: maxLevels }, (_, idx) => (idx === 0 ? "Category" : `Level ${idx + 1}`));

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>Vendor Details</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
                <th style={{ border: '1px solid #ccc', padding: 8 }}>Price</th>
                <th style={{ border: '1px solid #ccc', padding: 8 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  {levelHeaders.map((_, i) => (
                    <td key={i} style={{ border: '1px solid #ccc', padding: 8 }}>{row.levels[i] ?? '-'}</td>
                  ))}
                  <td style={{ border: '1px solid #ccc', padding: 8 }}>{row.price}</td>
                  <td style={{ border: '1px solid #ccc', padding: 8 }}>
                    <button
                      onClick={() => setModalCategory({ id: row.categoryId, name: row.levels.slice(-1)[0], vendorPrice: row.price })}
                      style={{ padding: '4px 8px', borderRadius: 4, background: '#0ea5e9', color: '#fff', border: 'none' }}
                    >Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Variant/Item Price Edit Modal */}
      {variantEdit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
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
    </div>
  );
}

function CategoryPriceEditor({ vendorId, categoryId, initialPrice, onCancel, onSaved }) {
  const [price, setPrice] = useState(initialPrice ?? "");
  const save = async () => {
    const newPrice = parseFloat(price);
    if (isNaN(newPrice)) return alert('Enter a valid number');
    try {
      await axios.put(`http://localhost:5000/api/vendorPricing/${vendorId}/${categoryId}`, { price: newPrice });
      onSaved?.(newPrice);
    } catch (e) {
      alert(e?.response?.data?.message || 'Failed to update');
    }
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
