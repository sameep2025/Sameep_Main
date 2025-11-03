// pages/preview/[vendorId]/[categoryId].jsx
import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import TopNavBar from "../../../components/TopNavBar";
import HomeSection from "../../../components/HomeSection";
import BenefitsSection from "../../../components/BenefitsSection";
import AboutSection from "../../../components/AboutSection";
import ContactSection from "../../../components/ContactSection";
import Footer from "../../../components/Footer";
import FullPageShimmer from "../../../components/FullPageShimmer";

export default function PreviewPage() {
  const router = useRouter();
  const { vendorId, categoryId, lat, lng, homeLocs } = router.query;

  const parsedHomeLocations = homeLocs ? JSON.parse(homeLocs) : [];

  const [vendor, setVendor] = useState(null);
  const [categoryTree, setCategoryTree] = useState(null);
  const [loadingVendor, setLoadingVendor] = useState(true);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [error, setError] = useState("");
  const [selectedLeaf, setSelectedLeaf] = useState(null);
  const [location, setLocation] = useState(null);
  const [cardSelections, setCardSelections] = useState({});
  const [nodeSelections, setNodeSelections] = useState({});
  // Attribute filter bar state (driven by uiConfig.attributesBar)
  const [attrSelections, setAttrSelections] = useState({}); // { field: value }
  const [pairSelections, setPairSelections] = useState({}); // { index: "A|B" }
  const [taxiSelections, setTaxiSelections] = useState({}); // { [lvl1Id]: { lvl2, lvl3, bodySeats: "body|seats", fuelType: string, modelBrand: "model|brand" } }
  const [combos, setCombos] = useState([]);
  const [packageSelections, setPackageSelections] = useState({}); // { [idx]: { size: string|null } }
  const [invImgIdx, setInvImgIdx] = useState({}); // { [targetId]: number }

  const loading = loadingVendor || loadingCategories;

  // ----------------- Fetch vendor & categories -----------------
  const fetchData = useCallback(async () => {
    if (!router.isReady || !vendorId) return;
    setLoadingVendor(true);
    setLoadingCategories(true);
    try {
      const [vendorRes, categoryRes, locationRes, catMetaRes, serverTreeRes] = await Promise.all([
        fetch(`/api/vendors/${vendorId}`, { cache: "no-store" }),
        fetch(`/api/vendors/${vendorId}/preview/${categoryId}`, { cache: "no-store" }),
        fetch(`/api/vendors/${vendorId}/location`, { cache: "no-store" }),
        fetch(`/api/categories/${categoryId}`, { cache: "no-store" }),
        fetch(`/api/categories/${categoryId}/tree`, { cache: "no-store" }),
      ]);

      const vendorData = await vendorRes.json();
      const categoryData = await categoryRes.json();
      const catMeta = await catMetaRes.json().catch(() => ({}));
      const serverTree = await serverTreeRes.json().catch(() => null);
      let locationData = null;

      try {
        locationData = await locationRes.json();
      } catch (err) {
        locationData = null;
      }

      setVendor(vendorData);
      console.log("CategoryData from API:", categoryData);

      const linkedAttributes = (catMeta && catMeta.linkedAttributes) ? catMeta.linkedAttributes : {};
      let categoriesWithLinked = categoryData?.categories ? { ...categoryData.categories, linkedAttributes } : null;

      // Overlay per-node config (displayType, uiRules, images) from server tree onto vendor preview tree
      try {
        if (categoriesWithLinked && serverTree && (serverTree._id || serverTree.id)) {
          const pickId = (n) => String(n?.id || n?._id || "");
          const buildIndex = (root) => {
            const idx = new Map();
            const visit = (n) => {
              if (!n) return;
              const k = pickId(n);
              if (k) idx.set(k, n);
              (Array.isArray(n.children) ? n.children : []).forEach(visit);
            };
            visit(root);
            return idx;
          };
          const serverIdx = buildIndex(serverTree);
          // Build children index by parent id for name-based fallback
          const serverChildrenByParent = new Map();
          const collectChildren = (n) => {
            if (!n) return;
            const pid = String(n._id || n.id || "");
            if (Array.isArray(n.children)) serverChildrenByParent.set(pid, n.children);
            (n.children || []).forEach(collectChildren);
          };
          collectChildren(serverTree);
          const mergeFields = (dst, src) => {
            if (!dst || !src) return;
            if (Array.isArray(src.displayType)) dst.displayType = src.displayType;
            if (src.uiRules && typeof src.uiRules === 'object') dst.uiRules = src.uiRules;
            if (typeof src.imageUrl === 'string') dst.imageUrl = src.imageUrl;
            if (typeof src.iconUrl === 'string') dst.iconUrl = src.iconUrl;
          };
          const overlay = (node, srcParent) => {
            if (!node) return;
            const k = pickId(node);
            let src = k ? serverIdx.get(k) : null;
            if (!src && srcParent) {
              // Fallback: match by name under same parent
              const sibs = serverChildrenByParent.get(String(srcParent._id || srcParent.id || "")) || [];
              const byName = sibs.find((c) => String(c?.name || '').toLowerCase() === String(node?.name || '').toLowerCase());
              if (byName) src = byName;
            }
            if (src) mergeFields(node, src);
            const nextSrcParent = src || srcParent;
            (Array.isArray(node.children) ? node.children : []).forEach((ch) => overlay(ch, nextSrcParent));
          };
          overlay(categoriesWithLinked, serverTree);
        }
      } catch {}

      setCategoryTree(categoriesWithLinked);

      // Fetch packages/combos for this category
      try {
        const combosRes = await fetch(`/api/combos?parentCategoryId=${categoryId}`, { cache: 'no-store' });
        const combosData = await combosRes.json().catch(() => []);
        setCombos(Array.isArray(combosData) ? combosData : []);
      } catch { setCombos([]); }

      if (locationData?.success) {
        setLocation(locationData.location);
      } else if (vendorData.location) {
        setLocation(vendorData.location);
      }
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoadingVendor(false);
      setLoadingCategories(false);
    }
  }, [router.isReady, vendorId, categoryId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Initialize Taxi Services / Driving School to cheapest option on first load
  useEffect(() => {
    try {
      if (!vendor || !categoryTree) return;
      const rootName = String(categoryTree?.name || '').toLowerCase();
      const isTaxi = rootName === 'taxi services';
      const isDriving = rootName === 'driving school';
      if (!isTaxi && !isDriving) return;

      const familiesByTarget = new Map();
      try {
        const cfg = vendor?.familiesByTarget || {};
        Object.entries(cfg).forEach(([k, arr]) => {
          familiesByTarget.set(String(k), new Set((arr || []).map(String)));
        });
      } catch {}

      const roots = Array.isArray(categoryTree.children) ? categoryTree.children : [];

      const updateForRoot = (lvl1) => {
        const lvl1Id = String(lvl1?.id || '');
        if (!lvl1Id) return;
        const existing = taxiSelections[lvl1Id];
        if (existing && (existing.bodySeats || existing.fuelType || existing.modelBrand || existing.transmission || existing.bodyType)) return; // don't override user

        const invEntries = (vendor?.inventorySelections?.[categoryId] || []).filter((entry) => {
          try {
            const famSet = familiesByTarget.get(lvl1Id);
            if (famSet) {
              const fam = String(entry?.scopeFamily || '');
              if (fam && !famSet.has(fam)) return false;
            }
            const pbr = entry?.pricesByRow;
            if (pbr && typeof pbr === 'object') {
              for (const key of Object.keys(pbr)) {
                const ids = String(key).split('|');
                if (ids.some((id) => String(id) === lvl1Id)) return true;
              }
              return false;
            }
            return true;
          } catch { return true; }
        });

        let best = { price: null, entry: null };
        invEntries.forEach((entry) => {
          try {
            const pbr = (entry && entry.pricesByRow && typeof entry.pricesByRow === 'object') ? entry.pricesByRow : null;
            if (!pbr) return;
            for (const [key, value] of Object.entries(pbr)) {
              const ids = String(key).split('|');
              if (ids.some((id) => String(id) === lvl1Id)) {
                const num = Number(value);
                if (!Number.isNaN(num) && (best.price == null || num < best.price)) {
                  best = { price: num, entry };
                }
              }
            }
          } catch {}
        });

        if (!best.entry) return;
        const fam = String(best.entry?.scopeFamily || '');
        const sel = (best.entry?.selections && fam && best.entry.selections[fam]) ? best.entry.selections[fam] : {};

        if (isTaxi) {
          const body = fam === 'tempoMinibuses' ? (sel?.tempoBusBodyType ?? '') : (sel?.bodyType ?? '');
          const seats = String(sel?.seats ?? '');
          const fuel = sel?.fuelType != null ? String(sel.fuelType) : undefined;
          const model = String(sel?.model ?? '');
          const brand = fam === 'tempoMinibuses' ? String(sel?.tempoBusBrand ?? '') : String(sel?.brand ?? '');
          const bodySeats = (body && seats) ? `${body}|${seats}` : undefined;
          setTaxiSelections((prev) => ({
            ...prev,
            [lvl1Id]: {
              ...(prev[lvl1Id] || {}),
              bodySeats: bodySeats || prev[lvl1Id]?.bodySeats,
              fuelType: fuel || prev[lvl1Id]?.fuelType,
              modelBrand: (model && brand) ? `${model}|${brand}` : prev[lvl1Id]?.modelBrand,
            },
          }));
        }

        if (isDriving) {
          const transmission = (sel?.transmission ?? sel?.bikeTransmission) != null ? String(sel?.transmission ?? sel?.bikeTransmission) : undefined;
          const bodyType = sel?.bodyType != null ? String(sel.bodyType) : undefined;
          const model = String(sel?.model ?? '');
          const brand = String(sel?.brand ?? sel?.bikeBrand ?? '');
          setTaxiSelections((prev) => ({
            ...prev,
            [lvl1Id]: {
              ...(prev[lvl1Id] || {}),
              transmission: transmission || prev[lvl1Id]?.transmission,
              bodyType: bodyType || prev[lvl1Id]?.bodyType,
              modelBrand: (model && brand) ? `${model}|${brand}` : prev[lvl1Id]?.modelBrand,
            },
          }));
        }
      };

      roots.forEach(updateForRoot);
    } catch {}
  }, [vendor, categoryTree, categoryId]);

  // Listen for vendor pricing updates from other tabs/pages and refresh
  useEffect(() => {
    if (!vendorId || !categoryId) return;
    const storageHandler = (e) => {
      try {
        if (!e || e.key !== `vendorPricingUpdated:${vendorId}:${categoryId}`) return;
        fetchData();
      } catch {}
    };
    const customHandler = (e) => {
      try {
        const v = e?.detail?.vendorId;
        const c = e?.detail?.categoryId;
        if (String(v) === String(vendorId) && String(c) === String(categoryId)) {
          fetchData();
        }
      } catch {}
    };
    window.addEventListener('storage', storageHandler);
    window.addEventListener('vendorPricingUpdated', customHandler);
    return () => {
      window.removeEventListener('storage', storageHandler);
      window.removeEventListener('vendorPricingUpdated', customHandler);
    };
  }, [vendorId, categoryId, fetchData]);

  // ----------------- Helpers -----------------
  const hasChildren = (node) => node?.children?.length > 0;

  const containsId = (node, id) => {
    if (!node || !id) return false;
    if (node.id === id) return true;
    return node.children?.some((c) => containsId(c, id)) || false;
  };

  // ----------------- Card Component -----------------
  const ParentWithSizesCard = ({ node, selection, onSelectionChange, onLeafSelect, mode = "buttons", includeLeafChildren = true }) => {
    if (!node) return null;

    const getDeepestFirstChild = (n) => (!n?.children?.length ? n : getDeepestFirstChild(n.children[0]));

    const selectedParent = selection?.parent || node.children?.[0] || node;
    const selectedChild = selection?.child || getDeepestFirstChild(selectedParent);

    const displayNode = selectedChild || selectedParent;

    const getUiForLocal = (nodeOrId) => ({ mode: 'buttons', includeLeafChildren: true });

    // Resolve selector display type from the NODE'S OWN config
    const mapToSelectorMode = (dt) => {
      const x = String(dt || '').toLowerCase();
      if (x === 'dropdown' || x === 'select') return 'dropdown';
      return 'buttons';
    };
    const pickDtArr = (arr) => Array.isArray(arr) && arr.length > 0 ? String(arr[0]).toLowerCase() : null;
    const getNodeMode = (n) => pickDtArr(n?.displayType) || getUiForLocal(n).mode || 'buttons';
    // Parent selector (for node's immediate children) comes from node's own displayType
    const parentSelectorMode = mapToSelectorMode(getNodeMode(node));
    // Child selector (for selected parent's children) comes from selectedParent's own displayType
    const childSelectorMode = mapToSelectorMode(getNodeMode(selectedParent));
    try { console.log('[preview] in-card modes', { node: node?.name, parentSelectorMode, childOf: selectedParent?.name, childSelectorMode }); } catch {}

    const [imgIdx, setImgIdx] = useState(0);
    const [extraRowImages, setExtraRowImages] = useState({}); // { [id]: string[] }
    // Build images for this card
    const imagesForCard = (() => {
      try {
        const ids = [displayNode?.id, selectedParent?.id, node?.id].map((x) => String(x || ''));
        let arr = [];
        for (const id of ids) {
          if (!id) continue;
          const rows = Array.isArray(vendor?.rowImages?.[id]) ? vendor.rowImages[id] : (Array.isArray(extraRowImages?.[id]) ? extraRowImages[id] : []);
          if (rows.length) { arr = rows.slice(0, 10); break; }
        }
        if (!arr.length && displayNode?.imageUrl) arr = [displayNode.imageUrl];
        return arr.map((s) => String(s).startsWith('http') ? String(s) : `http://localhost:5000${String(s)}`);
      } catch { return []; }
    })();
    useEffect(() => { setImgIdx(0); }, [displayNode?.id, selectedParent?.id, node?.id, imagesForCard.length]);

    // Lazy fetch row images if not present in vendor.rowImages
    useEffect(() => {
      (async () => {
        try {
          const ids = [displayNode?.id, selectedParent?.id, node?.id].map((x) => String(x || ''));
          for (const id of ids) {
            if (!id) continue;
            const hasLocal = Array.isArray(vendor?.rowImages?.[id]) && vendor.rowImages[id].length > 0;
            const hasExtra = Array.isArray(extraRowImages?.[id]) && extraRowImages[id].length > 0;
            if (hasLocal || hasExtra) continue;
            const res = await fetch(`/api/vendors/${vendorId}/rows/${id}/images`, { cache: 'no-store' });
            if (!res.ok) continue;
            const data = await res.json().catch(() => null);
            const imgs = Array.isArray(data?.images) ? data.images : [];
            if (imgs.length) setExtraRowImages((prev) => ({ ...(prev||{}), [id]: imgs }));
          }
        } catch {}
      })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vendorId, displayNode?.id, selectedParent?.id, node?.id]);

    return (
      <section style={{ marginBottom: 8 }}>
        <div
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: 16,
            padding: 20,
            background: "#fff",
            width: 300,
            minHeight: 400,
            boxShadow: "0 1px 6px rgba(0,0,0,0.08)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            fontFamily: "Poppins, sans-serif",
          }}
        >
          <h2 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 600 }}>{node.name}</h2>

          {imagesForCard.length > 0 ? (
            <div style={{ width: 260, height: 160, borderRadius: 10, overflow: 'hidden', background: '#f8fafc', position: 'relative', marginBottom: 12 }}>
              <div style={{ display: 'flex', width: `${imagesForCard.length * 100}%`, height: '100%', transform: `translateX(-${imgIdx * (100 / imagesForCard.length)}%)`, transition: 'transform 400ms ease' }}>
                {imagesForCard.map((src, i) => (
                  <div key={i} style={{ width: `${100 / imagesForCard.length}%`, height: '100%', flex: '0 0 auto' }}>
                    <img src={src} alt={`img-${i}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                ))}
              </div>
              {imagesForCard.length > 1 ? (
                <>
                  <button
                    aria-label="Prev"
                    onClick={() => setImgIdx((i) => (i - 1 + imagesForCard.length) % imagesForCard.length)}
                    style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', width: 26, height: 26, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.45)', color: '#fff', cursor: 'pointer' }}
                  >‹</button>
                  <button
                    aria-label="Next"
                    onClick={() => setImgIdx((i) => (i + 1) % imagesForCard.length)}
                    style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 26, height: 26, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.45)', color: '#fff', cursor: 'pointer' }}
                  >›</button>
                  <div style={{ position: 'absolute', bottom: 6, left: 0, right: 0, display: 'flex', gap: 6, justifyContent: 'center' }}>
                    {imagesForCard.map((_, i) => (
                      <button key={i} onClick={() => setImgIdx(i)} aria-label={`Go to ${i+1}`}
                        style={{ width: i===imgIdx?9:7, height: i===imgIdx?9:7, borderRadius: 999, border: 'none', background: i===imgIdx ? '#fff' : 'rgba(255,255,255,0.6)', cursor: 'pointer' }} />
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {displayNode && (
            <div style={{ marginBottom: 12 }}>
              {(() => {
                const resolvedPrice =
                  (displayNode.vendorPrice ?? displayNode.price) ??
                  (selectedParent?.vendorPrice ?? selectedParent?.price) ??
                  (node.vendorPrice ?? node.price) ?? null;
                if (resolvedPrice == null) return null;
                return (
                  <p style={{ color: "#059669", fontWeight: 600, margin: 0 }}>₹ {resolvedPrice}</p>
                );
              })()}
              {(() => {
                const resolvedTerms = displayNode.terms || selectedParent?.terms || node.terms || "";
                if (!resolvedTerms) return null;
                return (
                  <ul style={{ marginTop: 4, paddingLeft: 18 }}>
                    {resolvedTerms.split(",").map((t, i) => (
                      <li key={i} style={{ fontSize: 13, color: "#4b5563" }}>
                        {t.trim()}
                      </li>
                    ))}
                  </ul>
                );
              })()}
            </div>
          )}

          {/* Parent Buttons / Dropdown (resolved per node) */}
          {node.children?.length > 0 && (
            parentSelectorMode === "buttons" ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                {node.children.map((opt) => {
                  const leaf = getDeepestFirstChild(opt);
                  const isSelectedParent = selectedParent?.id === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        onSelectionChange?.(opt, leaf);
                        onLeafSelect?.(leaf);
                      }}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 999,
                        border: isSelectedParent ? "2px solid #059669" : "1px solid #d1d5db",
                        background: isSelectedParent ? "#059669" : "#f9fafb",
                        color: isSelectedParent ? "#fff" : "#111827",
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      {opt.name}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={{ marginBottom: 10 }}>
                <select
                  value={selectedParent?.id || ""}
                  onChange={(e) => {
                    const next = node.children.find((c) => String(c.id) === e.target.value) || node.children[0];
                    const leaf = getDeepestFirstChild(next);
                    onSelectionChange?.(next, leaf);
                    onLeafSelect?.(leaf);
                  }}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", fontSize: 13 }}
                >
                  {node.children.map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.name}</option>
                  ))}
                </select>
              </div>
            )
          )}

          {/* Child Buttons / Dropdown (resolved per selected parent) */}
          {includeLeafChildren && selectedParent?.children?.length > 0 && (
            childSelectorMode === "buttons" ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                {selectedParent.children.map((child) => (
                  <button
                    key={child.id}
                    type="button"
                    onClick={() => {
                      onSelectionChange?.(selectedParent, child);
                      onLeafSelect?.(child);
                    }}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 999,
                      border: selectedChild?.id === child.id ? "2px solid #2563eb" : "1px solid #d1d5db",
                      background: selectedChild?.id === child.id ? "#2563eb" : "#f9fafb",
                      color: selectedChild?.id === child.id ? "#fff" : "#111827",
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    {child.name}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ marginBottom: 12 }}>
                <select
                  value={selectedChild?.id || ""}
                  onChange={(e) => {
                    const next = selectedParent.children.find((c) => String(c.id) === e.target.value) || selectedParent.children[0];
                    onSelectionChange?.(selectedParent, next);
                    onLeafSelect?.(next);
                  }}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", fontSize: 13 }}
                >
                  {selectedParent.children.map((child) => (
                    <option key={child.id} value={child.id}>{child.name}</option>
                  ))}
                </select>
              </div>
            )
          )}

          <button
            onClick={() => alert(`Booking ${displayNode?.name}`)}
            style={{
              marginTop: "auto",
              width: "100%",
              padding: "10px 14px",
              borderRadius: 28,
              border: "none",
              background: "rgb(245 158 11)",
              color: "#111827",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Book Now
          </button>
        </div>
      </section>
    );
  };

  // ----------------- Render tree -----------------
  const renderTree = (root) => {
    if (!root) return <p>No categories available</p>;
    if (!Array.isArray(root.children) || root.children.length === 0)
      return <p>No categories available</p>;

    const linked = (categoryTree && categoryTree.linkedAttributes && typeof categoryTree.linkedAttributes === "object")
      ? categoryTree.linkedAttributes
      : {};

    // Resolve displayType chain only
    const resolveDisplayTypeFor = (node, parent) => {
      const pick = (arr) => Array.isArray(arr) && arr.length > 0 ? String(arr[0]).toLowerCase() : null;
      return (
        pick(node?.displayType) ||
        pick(parent?.displayType) ||
        pick(root?.displayType) ||
        "card"
      );
    };

    // ... rest of the code remains the same ...
  const familiesByTarget = new Map();
  Object.keys(linked).forEach((k) => {
    if (!k.endsWith(":linkedSubcategory")) return;
    const fam = k.split(":")[0] || "";
    const raw = linked[k];
    const val = Array.isArray(raw) ? String(raw[0] || "") : String(raw || "");
    const key = val || "ALL";
    if (!familiesByTarget.has(key)) familiesByTarget.set(key, new Set());
    familiesByTarget.get(key).add(fam);
  });

  const invEntries = vendor?.inventorySelections?.[categoryId] || [];
  // Build attribute fields/options from inventory selections
  const allFields = new Set();
  const fieldValues = new Map(); // field -> Set(values)
  for (const entry of invEntries) {
    const fam = entry?.scopeFamily;
    const sel = (entry?.selections && fam && entry.selections[fam]) ? entry.selections[fam] : {};
    Object.entries(sel).forEach(([k, v]) => {
      const key = String(k);
      if (!fieldValues.has(key)) fieldValues.set(key, new Set());
      allFields.add(key);
      if (v != null && String(v).trim() !== "") fieldValues.get(key).add(String(v));
    });
  }
  // Restrict to fields selected in linkedAttributes (Link Attributes for Pricing)
  const linkedLA = (categoryTree && categoryTree.linkedAttributes && typeof categoryTree.linkedAttributes === "object")
    ? categoryTree.linkedAttributes
    : {};
  const allowedFields = new Set();
  Object.entries(linkedLA).forEach(([k, arr]) => {
    if (!Array.isArray(arr)) return;
    // keys like 'cars' or 'Bikes' directly list fields (brand, model, seats, etc.)
    const parts = String(k).split(":");
    if (parts.length === 1) {
      arr.forEach((f) => { if (f) allowedFields.add(String(f)); });
    }
    // keys like 'cars:modelFields'
    if (parts.length === 2 && parts[1] === 'modelFields') {
      arr.forEach((f) => { if (f) allowedFields.add(String(f)); });
    }
  });
  const fieldsListRaw = Array.from(allFields);
  const fieldsList = allowedFields.size > 0
    ? fieldsListRaw.filter((f) => allowedFields.has(String(f)))
    : fieldsListRaw;
  const optionsByField = Object.fromEntries(fieldsList.map((f) => [f, Array.from(fieldValues.get(f) || new Set())]));

  // Build pair options for a given field pair
  const getPairOptions = (A, B) => {
    if (!A || !B || A === B) return [];
    const set = new Set();
    for (const entry of invEntries) {
      const fam = entry?.scopeFamily;
      const sel = (entry?.selections && fam && entry.selections[fam]) ? entry.selections[fam] : {};
      const va = sel?.[A];
      const vb = sel?.[B];
      if (va != null && vb != null && String(va).trim() !== "" && String(vb).trim() !== "") {
        set.add(`${String(va)}|${String(vb)}`);
      }
    }
    return Array.from(set);
  };

  const matchesAttrFilters = (entry) => {
    const fam = entry?.scopeFamily;
    const sel = (entry?.selections && fam && entry.selections[fam]) ? entry.selections[fam] : {};
    // singles: all selected singles must match
    for (const [field, val] of Object.entries(attrSelections || {})) {
      if (!val) continue;
      if (String(sel?.[field] ?? "") !== String(val)) return false;
    }
    // pairs: all chosen pairs must match
    for (const [idx, combo] of Object.entries(pairSelections || {})) {
      if (!combo) continue;
      const cfg = (categoryTree?.uiConfig?.attributesBar || [])[Number(idx)];
      if (!cfg || cfg.type !== 'pair') continue;
      const A = cfg.a;
      const B = cfg.b;
      if (!A || !B) continue;
      const [va, vb] = String(combo).split('|');
      const sa = String(sel?.[A] ?? "");
      const sb = String(sel?.[B] ?? "");
      if (!(sa === String(va ?? "") && sb === String(vb ?? ""))) return false;
    }
    return true;
  };
  const invByFamily = invEntries.reduce((acc, entry) => {
    const fam = String(entry?.scopeFamily || "").trim();
    if (!fam) return acc;
    if (!acc[fam]) acc[fam] = [];
    acc[fam].push(entry);
    return acc;
  }, {});

  const rootName = String(root?.name || '').toLowerCase();
  if (rootName.includes('taxi')) {
    const carsList = invByFamily['cars'] || [];
    const tempoList = invByFamily['tempoMinibuses'] || [];

    const extract = (entry) => {
      const fam = entry?.scopeFamily;
      const sel = (entry?.selections && fam && entry.selections[fam]) ? entry.selections[fam] : {};
      if (fam === 'cars') {
        return {
          family: 'cars',
          body: String(sel?.bodyType ?? ''),
          seats: String(sel?.seats ?? ''),
          fuel: sel?.fuelType != null ? String(sel.fuelType) : undefined,
          model: String(sel?.model ?? ''),
          brand: String(sel?.brand ?? ''),
          entry,
        };
      }
      if (fam === 'tempoMinibuses') {
        return {
          family: 'tempoMinibuses',
          body: String(sel?.tempoBusBodyType ?? ''),
          seats: String(sel?.seats ?? ''),
          fuel: undefined, // not applicable for tempos per data
          model: String(sel?.model ?? ''),
          brand: String(sel?.tempoBusBrand ?? ''),
          entry,
        };
      }
      return null;
    };

    const normalized = [
      ...carsList.map(extract).filter(Boolean),
      ...tempoList.map(extract).filter(Boolean),
    ];

    const bodySeatsOptions = Array.from(new Set(normalized
      .filter((n) => n.body && n.seats)
      .map((n) => `${n.body}|${n.seats}`)));

    const filterByBodySeats = (pair) => {
      if (!pair) return normalized;
      const [b, s] = String(pair).split('|');
      return normalized.filter((n) => String(n.body) === String(b ?? '') && String(n.seats) === String(s ?? ''));
    };

    const fuelOptionsFromList = (list) => Array.from(new Set(list
      .map((n) => n.fuel)
      .filter((v) => v != null && String(v).trim() !== '')));

    const modelBrandPairsFromList = (list) => Array.from(new Set(list
      .filter((n) => n.model && n.brand)
      .map((n) => `${n.model}|${n.brand}`)));

    const uiRow = (label, control) => (
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{label}</div>
        {control}
      </div>
    );

    // Compute minimum price from a list of normalized entries for a target node id
    const minPriceForListTarget = (list, targetId) => {
      try {
        const prices = [];
        list.forEach((n) => {
          const pbr = (n.entry && n.entry.pricesByRow && typeof n.entry.pricesByRow === 'object') ? n.entry.pricesByRow : null;
          if (!pbr) return;
          for (const [key, value] of Object.entries(pbr)) {
            const ids = String(key).split('|');
            if (ids.some((id) => String(id) === String(targetId))) {
              const num = Number(value);
              if (!Number.isNaN(num)) prices.push(num);
            }
          }
        });
        if (prices.length === 0) return null;
        return Math.min(...prices);
      } catch { return null; }
    };

    // Local helper: compute min price in subtree for sorting before global is declared
    const localMinPriceInSubtree = (n) => {
      let best = null;
      const visit = (x) => {
        if (!x) return;
        const p = x.vendorPrice ?? x.price;
        if (p != null) {
          const num = Number(p);
          if (!Number.isNaN(num) && (best == null || num < best)) best = num;
        }
        if (Array.isArray(x.children) && x.children.length) x.children.forEach(visit);
      };
      visit(n);
      return best;
    };

    const renderPriceForNode = (node, parentNode) => {
      let livePrice = null;
      const priceRows = vendor?.inventorySelections?.[categoryId] || [];
      for (const entry of priceRows) {
        const pbr = (entry && entry.pricesByRow && typeof entry.pricesByRow === 'object') ? entry.pricesByRow : null;
        if (!pbr) continue;
        for (const [key, value] of Object.entries(pbr)) {
          const ids = String(key).split('|');
          if (ids.some((id) => String(id) === String(node?.id))) { livePrice = Number(value); break; }
        }
        if (livePrice != null) break;
      }
      if (livePrice == null) {
        livePrice = vendor?.pricing?.[node?.id] ?? vendor?.pricing?.[parentNode?.id] ?? node?.vendorPrice ?? node?.price ?? null;
      }
      return livePrice;
    };

    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        {root.children.map((lvl1) => {
      const lvl2KidsRaw = Array.isArray(lvl1.children) ? lvl1.children : [];
      // Sort L2 by min subtree price
      const lvl2Kids = [...lvl2KidsRaw].sort((a, b) => {
        const pa = localMinPriceInSubtree(a);
        const pb = localMinPriceInSubtree(b);
        const va = pa == null ? Number.POSITIVE_INFINITY : Number(pa);
        const vb = pb == null ? Number.POSITIVE_INFINITY : Number(pb);
        return va - vb;
      });
      const selState = taxiSelections[lvl1.id] || {};
      const selectedLvl2 = lvl2Kids.find((c) => String(c.id) === String(selState.lvl2)) || lvl2Kids[0] || null;
      const lvl3KidsRaw = Array.isArray(selectedLvl2?.children) ? selectedLvl2.children : [];
      const lvl3Kids = [...lvl3KidsRaw].sort((a, b) => {
        const pa = localMinPriceInSubtree(a);
        const pb = localMinPriceInSubtree(b);
        const va = pa == null ? Number.POSITIVE_INFINITY : Number(pa);
        const vb = pb == null ? Number.POSITIVE_INFINITY : Number(pb);
        return va - vb;
      });
      const selectedLvl3 = lvl3Kids.find((c) => String(c.id) === String(selState.lvl3)) || lvl3Kids[0] || null;

      const belongsToLvl1 = (entry) => {
        try {
          const lvl1Id = String(lvl1?.id || '');
          const famSet = familiesByTarget.get(lvl1Id);
          if (famSet) {
            const fam = String(entry?.scopeFamily || '');
            if (fam && !famSet.has(fam)) return false;
          }
          const pbr = entry?.pricesByRow;
          if (pbr && typeof pbr === 'object') {
            for (const key of Object.keys(pbr)) {
              const ids = String(key).split('|');
              if (ids.some((id) => String(id) === lvl1Id)) return true;
            }
            return false;
          }
          return true;
        } catch { return true; }
      };

      const normalizedForLvl1 = normalized.filter((n) => belongsToLvl1(n.entry));
      const bodySeatsOptions = Array.from(new Set(normalizedForLvl1
        .filter((n) => n.body && n.seats)
        .map((n) => `${n.body}|${n.seats}`)));
      const filterByBodySeats = (pair) => {
        if (!pair) return normalizedForLvl1;
        const [b, s] = String(pair).split('|');
        return normalizedForLvl1.filter((n) => String(n.body) === String(b ?? '') && String(n.seats) === String(s ?? ''));
      };
      const filteredByBodySeats = filterByBodySeats(selState.bodySeats);
      // Sort bodySeats options by min price for current target
      const targetIdForSort = String((selectedLvl3 || selectedLvl2 || lvl1)?.id || '');
      const bodySeatsWithPrice = bodySeatsOptions.map((opt) => ({
        opt,
        price: minPriceForListTarget(filterByBodySeats(opt), targetIdForSort),
      }));
      bodySeatsWithPrice.sort((a, b) => {
        const va = a.price == null ? Number.POSITIVE_INFINITY : Number(a.price);
        const vb = b.price == null ? Number.POSITIVE_INFINITY : Number(b.price);
        return va - vb;
      });
      const sortedBodySeatsOptions = bodySeatsWithPrice.map((x) => x.opt);
      const fuelOptions = fuelOptionsFromList(filteredByBodySeats);
      const filteredByFuel = selState.fuelType
        ? filteredByBodySeats.filter((n) => String(n.fuel ?? '') === String(selState.fuelType))
        : filteredByBodySeats;
      // Sort fuel options by min price under current bodySeats
      const fuelWithPrice = fuelOptions.map((opt) => ({
        opt,
        price: minPriceForListTarget(filteredByBodySeats.filter((n) => String(n.fuel ?? '') === String(opt)), targetIdForSort),
      }));
      fuelWithPrice.sort((a, b) => {
        const va = a.price == null ? Number.POSITIVE_INFINITY : Number(a.price);
        const vb = b.price == null ? Number.POSITIVE_INFINITY : Number(b.price);
        return va - vb;
      });
      const sortedFuelOptions = fuelWithPrice.map((x) => x.opt);
      const modelBrandOptions = modelBrandPairsFromList(filteredByFuel);
      // Sort modelBrand by min price
      const mbWithPrice = modelBrandOptions.map((opt) => {
        const [m, b] = String(opt).split('|');
        const list = filteredByFuel.filter((n) => String(n.model) === String(m || '') && String(n.brand) === String(b || ''));
        return { opt, price: minPriceForListTarget(list, targetIdForSort) };
      });
      mbWithPrice.sort((a, b) => {
        const va = a.price == null ? Number.POSITIVE_INFINITY : Number(a.price);
        const vb = b.price == null ? Number.POSITIVE_INFINITY : Number(b.price);
        return va - vb;
      });
      const sortedModelBrandOptions = mbWithPrice.map((x) => x.opt);

      const displayNode = selectedLvl3 || selectedLvl2 || lvl1;
      const livePrice = renderPriceForNode(displayNode, selectedLvl2 || lvl1);
      const hasFuelOptions = fuelOptions.length > 0;
      const hasBodySeats = bodySeatsOptions.length > 0;
      const hasModelBrand = modelBrandOptions.length > 0;
      const hasAnyAttributes = hasBodySeats || hasFuelOptions || hasModelBrand;
      const isComplete = (!hasBodySeats || Boolean(selState.bodySeats)) && (!hasFuelOptions || Boolean(selState.fuelType)) && (!hasModelBrand || Boolean(selState.modelBrand));
      const attrAwarePrice = (() => {
        try {
          if (!isComplete) return null;
          const prices = [];
          const targetId = String((selectedLvl3 || selectedLvl2 || lvl1)?.id || '');
          const refined = (() => {
            if (!selState.modelBrand) return filteredByFuel;
            const [m, b] = String(selState.modelBrand).split('|');
            return filteredByFuel.filter((n) => String(n.model) === String(m || '') && String(n.brand) === String(b || ''));
          })();
          refined.forEach((n) => {
            const pbr = (n.entry && n.entry.pricesByRow && typeof n.entry.pricesByRow === 'object') ? n.entry.pricesByRow : null;
            if (!pbr) return;
            for (const [key, value] of Object.entries(pbr)) {
              const ids = String(key).split('|');
              if (ids.some((id) => String(id) === targetId)) {
                const num = Number(value);
                if (!Number.isNaN(num)) prices.push(num);
              }
            }
          });
          if (prices.length === 0) return livePrice;
          return Math.min(...prices);
        } catch {
          return livePrice;
        }
      })();

      return (
        <section key={lvl1.id} style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <h2 style={{ margin: 0, textTransform: 'uppercase', fontSize: 18, fontWeight: 600 }}>{lvl1.name}</h2>
            {lvl2Kids.length > 0 ? (
              <select
                value={String(selectedLvl2?.id || '')}
                onChange={(e) => {
                  const next = lvl2Kids.find((c) => String(c.id) === e.target.value) || lvl2Kids[0] || null;
                  // Compute cheapest defaults for Taxi (bodySeats, fuel, modelBrand) under new selection
                  const nextTargetId = String((selectedLvl3 || next || lvl1)?.id || '');
                  const mp = (list) => {
                    try {
                      const prices = [];
                      list.forEach((n) => {
                        const pbr = (n.entry && n.entry.pricesByRow && typeof n.entry.pricesByRow === 'object') ? n.entry.pricesByRow : null;
                        if (!pbr) return;
                        for (const [key, value] of Object.entries(pbr)) {
                          const ids = String(key).split('|');
                          if (ids.some((id) => String(id) === String(nextTargetId))) {
                            const num = Number(value);
                            if (!Number.isNaN(num)) prices.push(num);
                          }
                        }
                      });
                      if (prices.length === 0) return null;
                      return Math.min(...prices);
                    } catch { return null; }
                  };
                  const nextBodySeatsOptions = Array.from(new Set(normalizedForLvl1
                    .filter((n) => n.body && n.seats)
                    .map((n) => `${n.body}|${n.seats}`)));
                  const bodySeatsWithPrice2 = nextBodySeatsOptions.map((opt) => ({ opt, price: mp(
                    (pair => { const [b,s] = String(pair).split('|'); return normalizedForLvl1.filter((n) => String(n.body)===String(b||'') && String(n.seats)===String(s||'')); })(opt)
                  ) }));
                  bodySeatsWithPrice2.sort((a,b)=>{
                    const va = a.price == null ? Number.POSITIVE_INFINITY : Number(a.price);
                    const vb = b.price == null ? Number.POSITIVE_INFINITY : Number(b.price);
                    return va - vb;
                  });
                  const bestBodySeats = bodySeatsWithPrice2[0]?.opt;
                  const listAfterBody = bestBodySeats ? ((pair)=>{ const [b,s]=String(pair).split('|'); return normalizedForLvl1.filter((n)=> String(n.body)===String(b||'') && String(n.seats)===String(s||'')); })(bestBodySeats) : normalizedForLvl1;
                  const fuelOpts2 = Array.from(new Set(listAfterBody.map((n)=>n.fuel).filter((v)=> v != null && String(v).trim()!=='')));
                  const fuelWithPrice2 = fuelOpts2.map((opt)=>({ opt, price: mp(listAfterBody.filter((n)=> String(n.fuel??'')===String(opt))) }));
                  fuelWithPrice2.sort((a,b)=>{
                    const va = a.price == null ? Number.POSITIVE_INFINITY : Number(a.price);
                    const vb = b.price == null ? Number.POSITIVE_INFINITY : Number(b.price);
                    return va - vb;
                  });
                  const bestFuel = fuelWithPrice2[0]?.opt;
                  const listAfterFuel = bestFuel ? listAfterBody.filter((n)=> String(n.fuel??'')===String(bestFuel)) : listAfterBody;
                  const mbPairs2 = Array.from(new Set(listAfterFuel.filter((n)=> n.model && n.brand).map((n)=> `${n.model}|${n.brand}`)));
                  const mbWithPrice2 = mbPairs2.map((opt)=>{
                    const [m,b] = String(opt).split('|');
                    const lst = listAfterFuel.filter((n)=> String(n.model)===String(m||'') && String(n.brand)===String(b||''));
                    return { opt, price: mp(lst) };
                  });
                  mbWithPrice2.sort((a,b)=>{
                    const va = a.price == null ? Number.POSITIVE_INFINITY : Number(a.price);
                    const vb = b.price == null ? Number.POSITIVE_INFINITY : Number(b.price);
                    return va - vb;
                  });
                  const bestModelBrand = mbWithPrice2[0]?.opt;

                  setTaxiSelections((prev) => ({
                    ...prev,
                    [lvl1.id]: {
                      lvl2: next?.id,
                      lvl3: (Array.isArray(next?.children) && next.children[0]?.id) || undefined,
                      bodySeats: bestBodySeats,
                      fuelType: bestFuel,
                      modelBrand: bestModelBrand,
                    },
                  }));
                }}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 13 }}
              >
                {lvl2Kids.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.name}</option>
                ))}
              </select>
            ) : null}
          </div>

          <div
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: 16,
              padding: 20,
              background: '#fff',
              width: 300,
              minHeight: 400,
              boxShadow: '0 1px 6px rgba(0,0,0,0.08)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              fontFamily: 'Poppins, sans-serif',
            }}
          >
            <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 600 }}>{displayNode?.name}</h3>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 12 }}>
              {(() => {
                try {
                  const targetId = String((selectedLvl3 || selectedLvl2 || lvl1)?.id || '');
                  const refinedForImages = (() => {
                    const list = filteredByFuel;
                    if (!selState.modelBrand) return list;
                    const [m, b] = String(selState.modelBrand).split('|');
                    return list.filter((n) => String(n.model) === String(m || '') && String(n.brand) === String(b || ''));
                  })();
                  // Build images: prefer inventory entry images, then rowImages, then imageUrl
                  let images = [];
                  refinedForImages.some((n) => {
                    const imgs = Array.isArray(n.entry?.images) ? n.entry.images : [];
                    if (imgs.length) { images = imgs.slice(0, 10); return true; }
                    return false;
                  });
                  if (!images.length) {
                    const rows = Array.isArray(vendor?.rowImages?.[targetId]) ? vendor.rowImages[targetId] : [];
                    if (rows.length) images = rows.slice(0, 10);
                  }
                  if (!images.length && displayNode?.imageUrl) images = [displayNode.imageUrl];
                  const normImgs = images.map((s) => String(s).startsWith('http') ? String(s) : `http://localhost:5000${String(s)}`);
                  if (!normImgs.length) return <div />;
                  const idx = Number(invImgIdx[targetId] || 0) % normImgs.length;
                  return (
                    <div style={{ width: 200, height: 120, borderRadius: 10, overflow: 'hidden', background: '#f8fafc', position: 'relative' }}>
                      <div style={{ display: 'flex', width: `${normImgs.length * 100}%`, height: '100%', transform: `translateX(-${idx * (100 / normImgs.length)}%)`, transition: 'transform 400ms ease' }}>
                        {normImgs.map((src, i) => (
                          <div key={i} style={{ width: `${100 / normImgs.length}%`, height: '100%', flex: '0 0 auto' }}>
                            <img src={src} alt={`img-${i}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                        ))}
                      </div>
                      {normImgs.length > 1 ? (
                        <>
                          <button aria-label="Prev" onClick={() => setInvImgIdx((p) => ({ ...p, [targetId]: ((idx - 1 + normImgs.length) % normImgs.length) }))}
                            style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', width: 22, height: 22, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.45)', color: '#fff', cursor: 'pointer' }}>‹</button>
                          <button aria-label="Next" onClick={() => setInvImgIdx((p) => ({ ...p, [targetId]: ((idx + 1) % normImgs.length) }))}
                            style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 22, height: 22, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.45)', color: '#fff', cursor: 'pointer' }}>›</button>
                          <div style={{ position: 'absolute', bottom: 6, left: 0, right: 0, display: 'flex', gap: 6, justifyContent: 'center' }}>
                            {normImgs.map((_, i) => (
                              <button key={i} onClick={() => setInvImgIdx((p) => ({ ...p, [targetId]: i }))} aria-label={`Go to ${i+1}`}
                                style={{ width: i===idx?8:6, height: i===idx?8:6, borderRadius: 999, border: 'none', background: i===idx ? '#fff' : 'rgba(255,255,255,0.6)', cursor: 'pointer' }} />
                            ))}
                          </div>
                        </>
                      ) : null}
                    </div>
                  );
                } catch { return <div />; }
              })()}
              {attrAwarePrice != null ? (
                <div style={{ color: '#059669', fontWeight: 700, fontSize: 18 }}>₹ {attrAwarePrice}</div>
              ) : null}
            </div>

            {lvl3Kids.length > 0 ? uiRow('Options', (
              <select
                value={String(selectedLvl3?.id || '')}
                onChange={(e) => {
                  const next = lvl3Kids.find((c) => String(c.id) === e.target.value) || lvl3Kids[0] || null;
                  setTaxiSelections((prev) => ({
                    ...prev,
                    [lvl1.id]: { ...(prev[lvl1.id] || {}), lvl3: next?.id },
                  }));
                  setSelectedLeaf(next || selectedLvl2 || lvl1);
                }}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 13 }}
              >
                {lvl3Kids.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.name}</option>
                ))}
              </select>
            )) : null}

            {sortedBodySeatsOptions.length > 0 ? uiRow('Body Type + Seats', (
              <select
                value={String(selState.bodySeats || '')}
                onChange={(e) => {
                  const val = e.target.value || undefined;
                  setTaxiSelections((prev) => ({ ...prev, [lvl1.id]: { ...(prev[lvl1.id] || {}), bodySeats: val, fuelType: undefined, modelBrand: undefined } }));
                }}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 13 }}
              >
                <option value="">Any</option>
                {sortedBodySeatsOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt.replace('|', ' | ')}</option>
                ))}
              </select>
            )) : null}

            {sortedFuelOptions.length > 0 ? uiRow('Fuel Type', (
              <select
                value={String(selState.fuelType || '')}
                onChange={(e) => {
                  const val = e.target.value || undefined;
                  setTaxiSelections((prev) => ({ ...prev, [lvl1.id]: { ...(prev[lvl1.id] || {}), fuelType: val, modelBrand: undefined } }));
                }}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', fontSize: 13 }}
              >
                <option value="">Any</option>
                {sortedFuelOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            )) : null}

            {sortedModelBrandOptions.length > 0 ? uiRow('Brand + Model', (
              <select
                value={String(selState.modelBrand || '')}
                onChange={(e) => {
                  const val = e.target.value || undefined;
                  setTaxiSelections((prev) => ({ ...prev, [lvl1.id]: { ...(prev[lvl1.id] || {}), modelBrand: val } }));
                }}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', fontSize: 13 }}
              >
                <option value="">Any</option>
                {sortedModelBrandOptions.map((opt) => {
                  const [model, brand] = String(opt).split('|');
                  return (
                    <option key={opt} value={opt}>{`${brand || ''} | ${model || ''}`.trim()}</option>
                  );
                })}
              </select>
            )) : null}

            <button
              onClick={() => alert(`Booking ${displayNode?.name}`)}
              style={{
                marginTop: 'auto',
                width: '100%',
                padding: '10px 14px',
                borderRadius: 28,
                border: 'none',
                background: 'rgb(245 158 11)',
                color: '#111827',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Book Now
            </button>
          </div>
        </section>
      );
    })}
  </div>
);
}

  // Driving School specialized layout (single card per first-level)
  if (rootName.toLowerCase().includes('driving') || rootName.toLowerCase().includes('taxi')) {
    // Normalize cars and bikes into common fields
    const dsEntries = vendor?.inventorySelections?.[categoryId] || [];
    const extract = (entry) => {
      const fam = entry?.scopeFamily;
      const sel = (entry?.selections && fam && entry.selections[fam]) ? entry.selections[fam] : {};
      if (fam === 'cars') {
        return {
          body: sel?.bodyType != null ? String(sel.bodyType) : '',
          transmission: sel?.transmission != null ? String(sel.transmission) : '',
          fuel: sel?.fuelType != null ? String(sel.fuelType) : '',
          model: sel?.model != null ? String(sel.model) : '',
          brand: sel?.brand != null ? String(sel.brand) : '',
          entry,
        };
      }
      if (fam === 'bikes') {
        return {
          body: '',
          transmission: sel?.bikeTransmission != null ? String(sel.bikeTransmission) : '',
          fuel: sel?.fuelType != null ? String(sel.fuelType) : '',
          model: sel?.model != null ? String(sel.model) : '',
          brand: sel?.bikeBrand != null ? String(sel.bikeBrand) : '',
          entry,
        };
      }
      return null;
    };

    const normalized = dsEntries.map(extract).filter(Boolean);
    const bodyOptions = Array.from(new Set(normalized.map((n) => n.body).filter((v) => v && String(v).trim() !== '')));
    const filterByBody = (body) => (!body ? normalized : normalized.filter((n) => (n.body ? String(n.body) === String(body) : true)));
    const transmissionOptionsFrom = (list) => Array.from(new Set(list.map((n) => n.transmission).filter((v) => v && String(v).trim() !== '')));
    const filterByTransmission = (list, tr) => (!tr ? list : list.filter((n) => String(n.transmission) === String(tr)));
    const fuelOptionsFrom = (list) => Array.from(new Set(list.map((n) => n.fuel).filter((v) => v && String(v).trim() !== '')));
    const modelBrandFrom = (list) => Array.from(new Set(list.filter((n) => n.model && n.brand).map((n) => `${n.model}|${n.brand}`)));
    const uiRow = (label, control) => (
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{label}</div>
        {control}
      </div>
    );

    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {root.children.map((lvl1) => {
      const belongsToLvl1 = (entry) => {
        try {
          const lvl1Id = String(lvl1?.id || '');
          const famSet = familiesByTarget.get(lvl1Id);
          if (famSet) {
            const fam = String(entry?.scopeFamily || '');
            if (fam && !famSet.has(fam)) return false;
          }
          const pbr = entry?.pricesByRow;
          if (pbr && typeof pbr === 'object') {
            for (const key of Object.keys(pbr)) {
              const ids = String(key).split('|');
              if (ids.some((id) => String(id) === lvl1Id)) return true;
            }
            return false;
          }
          return true;
        } catch { return true; }
      };
          const lvl2Kids = Array.isArray(lvl1.children) ? lvl1.children : [];
          const selState = taxiSelections[lvl1.id] || {};
          const selectedLvl2 = lvl2Kids.find((c) => String(c.id) === String(selState.lvl2)) || lvl2Kids[0] || null;
          const lvl3Kids = Array.isArray(selectedLvl2?.children) ? selectedLvl2.children : [];
          const selectedLvl3 = lvl3Kids.find((c) => String(c.id) === String(selState.lvl3)) || lvl3Kids[0] || null;

          const normalizedForLvl1 = normalized.filter((n) => belongsToLvl1(n.entry));
          const transmissionOptions = Array.from(new Set(normalizedForLvl1.map((n) => n.transmission).filter((v) => v && String(v).trim() !== '')));
          const byTr = (!selState.transmission ? normalizedForLvl1 : normalizedForLvl1.filter((n) => String(n.transmission) === String(selState.transmission)));
          const bodyOptions = Array.from(new Set(byTr.map((n) => n.body).filter((v) => v && String(v).trim() !== '')));
          const byBody = (!selState.bodyType ? byTr : byTr.filter((n) => (n.body ? String(n.body) === String(selState.bodyType) : true)));
          const modelBrandOptions = Array.from(new Set(byBody.filter((n) => n.model && n.brand).map((n) => `${n.model}|${n.brand}`)));

          const displayNode = selectedLvl3 || selectedLvl2 || lvl1;
          // Resolve baseline live price for selected node
          let livePrice = null;
          try {
            const priceRows = vendor?.inventorySelections?.[categoryId] || [];
            for (const inv of priceRows) {
              const pbr = (inv && inv.pricesByRow && typeof inv.pricesByRow === 'object') ? inv.pricesByRow : null;
              if (!pbr) continue;
              for (const [key, value] of Object.entries(pbr)) {
                const ids = String(key).split('|');
                if (ids.some((id) => String(id) === String(displayNode?.id))) { livePrice = Number(value); break; }
              }
              if (livePrice != null) break;
            }
          } catch {}
          if (livePrice == null) {
            livePrice = displayNode?.vendorPrice ?? displayNode?.price ?? null;
          }

          const hasBodyOptions = bodyOptions.length > 0;
          const hasTransmissionOptions = transmissionOptions.length > 0;
          const hasModelBrandOptions = modelBrandOptions.length > 0;
          const isComplete = (!hasTransmissionOptions || Boolean(selState.transmission)) && (!hasBodyOptions || Boolean(selState.bodyType)) && (!hasModelBrandOptions || Boolean(selState.modelBrand));
          const attrAwarePrice = (() => {
            try {
              if (!isComplete) return null;
              const prices = [];
              const targetId = String((selectedLvl3 || selectedLvl2 || lvl1)?.id || '');
              const refined = (() => {
                if (!selState.modelBrand) return byBody;
                const [m, b] = String(selState.modelBrand).split('|');
                return byBody.filter((n) => String(n.model) === String(m || '') && String(n.brand) === String(b || ''));
              })();
              refined.forEach((n) => {
                const pbr = (n.entry && n.entry.pricesByRow && typeof n.entry.pricesByRow === 'object') ? n.entry.pricesByRow : null;
                if (!pbr) return;
                for (const [key, value] of Object.entries(pbr)) {
                  const ids = String(key).split('|');
                  if (ids.some((id) => String(id) === targetId)) {
                    const num = Number(value);
                    if (!Number.isNaN(num)) prices.push(num);
                  }
                }
              });
              if (prices.length === 0) return livePrice;
              return Math.min(...prices);
            } catch {
              return livePrice;
            }
          })();

          return (
            <section key={lvl1.id} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <h2 style={{ margin: 0, textTransform: 'uppercase', fontSize: 18, fontWeight: 600 }}>{lvl1.name}</h2>
                {lvl2Kids.length > 0 ? (
                  <select
                    value={String(selectedLvl2?.id || '')}
                    onChange={(e) => {
                      const next = lvl2Kids.find((c) => String(c.id) === e.target.value) || lvl2Kids[0] || null;
                      // Compute cheapest defaults for Driving School (transmission, bodyType, modelBrand)
                      const nextTargetId = String((selectedLvl3 || next || lvl1)?.id || '');
                      const listAll = normalizedForLvl1;
                      const mp = (list) => {
                        try {
                          const prices = [];
                          list.forEach((n) => {
                            const pbr = (n.entry && n.entry.pricesByRow && typeof n.entry.pricesByRow === 'object') ? n.entry.pricesByRow : null;
                            if (!pbr) return;
                            for (const [key, value] of Object.entries(pbr)) {
                              const ids = String(key).split('|');
                              if (ids.some((id) => String(id) === String(nextTargetId))) {
                                const num = Number(value);
                                if (!Number.isNaN(num)) prices.push(num);
                              }
                            }
                          });
                          if (prices.length === 0) return null;
                          return Math.min(...prices);
                        } catch { return null; }
                      };
                      const trOpts = Array.from(new Set(listAll.map((n) => n.transmission).filter((v) => v && String(v).trim() !== '')));
                      const trWithPrice = trOpts.map((opt) => ({ opt, price: mp(listAll.filter((n) => String(n.transmission) === String(opt))) }));
                      trWithPrice.sort((a,b)=>{ const va=a.price==null?Number.POSITIVE_INFINITY:Number(a.price); const vb=b.price==null?Number.POSITIVE_INFINITY:Number(b.price); return va-vb; });
                      const bestTr = trWithPrice[0]?.opt;
                      const afterTr = bestTr ? listAll.filter((n) => String(n.transmission) === String(bestTr)) : listAll;
                      const bodyOpts2 = Array.from(new Set(afterTr.map((n) => n.body).filter((v) => v && String(v).trim() !== '')));
                      const bodyWithPrice = bodyOpts2.map((opt) => ({ opt, price: mp(afterTr.filter((n) => n.body ? String(n.body) === String(opt) : true)) }));
                      bodyWithPrice.sort((a,b)=>{ const va=a.price==null?Number.POSITIVE_INFINITY:Number(a.price); const vb=b.price==null?Number.POSITIVE_INFINITY:Number(b.price); return va-vb; });
                      const bestBody = bodyWithPrice[0]?.opt;
                      const afterBody = bestBody ? afterTr.filter((n) => (n.body ? String(n.body) === String(bestBody) : true)) : afterTr;
                      const mbPairs2 = Array.from(new Set(afterBody.filter((n)=> n.model && n.brand).map((n)=> `${n.model}|${n.brand}`)));
                      const mbWithPrice2 = mbPairs2.map((opt)=>{ const [m,b]=String(opt).split('|'); const lst = afterBody.filter((n)=> String(n.model)===String(m||'') && String(n.brand)===String(b||'')); return { opt, price: mp(lst) }; });
                      mbWithPrice2.sort((a,b)=>{ const va=a.price==null?Number.POSITIVE_INFINITY:Number(a.price); const vb=b.price==null?Number.POSITIVE_INFINITY:Number(b.price); return va-vb; });
                      const bestMB = mbWithPrice2[0]?.opt;

                      setTaxiSelections((prev) => ({
                        ...prev,
                        [lvl1.id]: {
                          lvl2: next?.id,
                          lvl3: (Array.isArray(next?.children) && next.children[0]?.id) || undefined,
                          transmission: bestTr,
                          bodyType: bestBody,
                          modelBrand: bestMB,
                        },
                      }));
                    }}
                    style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 13 }}
                  >
                    {lvl2Kids.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.name}</option>
                    ))}
                  </select>
                ) : null}
              </div>

              <div
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 16,
                  padding: 20,
                  background: '#fff',
                  width: 300,
                  minHeight: 400,
                  boxShadow: '0 1px 6px rgba(0,0,0,0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  fontFamily: 'Poppins, sans-serif',
                }}
              >
                <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 600 }}>{displayNode?.name}</h3>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 12 }}>
                  {(() => {
                    try {
                      const targetId = String((selectedLvl3 || selectedLvl2 || lvl1)?.id || '');
                      // For DS, reuse byBody as the narrowed list
                      const listBase = byBody;
                      const refinedForImages = (() => {
                        if (!selState.modelBrand) return listBase;
                        const [m, b] = String(selState.modelBrand).split('|');
                        return listBase.filter((n) => String(n.model) === String(m || '') && String(n.brand) === String(b || ''));
                      })();
                      // Build images: prefer inventory entry images, then rowImages, then imageUrl
                      let images = [];
                      refinedForImages.some((n) => {
                        const imgs = Array.isArray(n.entry?.images) ? n.entry.images : [];
                        if (imgs.length) { images = imgs.slice(0, 10); return true; }
                        return false;
                      });
                      if (!images.length) {
                        const rows = Array.isArray(vendor?.rowImages?.[targetId]) ? vendor.rowImages[targetId] : [];
                        if (rows.length) images = rows.slice(0, 10);
                      }
                      if (!images.length && displayNode?.imageUrl) images = [displayNode.imageUrl];
                      const normImgs = images.map((s) => String(s).startsWith('http') ? String(s) : `http://localhost:5000${String(s)}`);
                      if (!normImgs.length) return <div />;
                      const idx = Number(invImgIdx[targetId] || 0) % normImgs.length;
                      return (
                        <div style={{ width: 200, height: 120, borderRadius: 10, overflow: 'hidden', background: '#f8fafc', position: 'relative' }}>
                          <div style={{ display: 'flex', width: `${normImgs.length * 100}%`, height: '100%', transform: `translateX(-${idx * (100 / normImgs.length)}%)`, transition: 'transform 400ms ease' }}>
                            {normImgs.map((src, i) => (
                              <div key={i} style={{ width: `${100 / normImgs.length}%`, height: '100%', flex: '0 0 auto' }}>
                                <img src={src} alt={`img-${i}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              </div>
                            ))}
                          </div>
                          {normImgs.length > 1 ? (
                            <>
                              <button aria-label="Prev" onClick={() => setInvImgIdx((p) => ({ ...p, [targetId]: ((idx - 1 + normImgs.length) % normImgs.length) }))}
                                style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', width: 22, height: 22, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.45)', color: '#fff', cursor: 'pointer' }}>‹</button>
                              <button aria-label="Next" onClick={() => setInvImgIdx((p) => ({ ...p, [targetId]: ((idx + 1) % normImgs.length) }))}
                                style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 22, height: 22, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.45)', color: '#fff', cursor: 'pointer' }}>›</button>
                              <div style={{ position: 'absolute', bottom: 6, left: 0, right: 0, display: 'flex', gap: 6, justifyContent: 'center' }}>
                                {normImgs.map((_, i) => (
                                  <button key={i} onClick={() => setInvImgIdx((p) => ({ ...p, [targetId]: i }))} aria-label={`Go to ${i+1}`}
                                    style={{ width: i===idx?8:6, height: i===idx?8:6, borderRadius: 999, border: 'none', background: i===idx ? '#fff' : 'rgba(255,255,255,0.6)', cursor: 'pointer' }} />
                                ))}
                              </div>
                            </>
                          ) : null}
                        </div>
                      );
                    } catch { return <div />; }
                  })()}
                  {attrAwarePrice != null ? (
                    <div style={{ color: '#059669', fontWeight: 700, fontSize: 18 }}>₹ {attrAwarePrice}</div>
                  ) : null}
                </div>

                {lvl3Kids.length > 0 ? uiRow('Options', (
                  <select
                    value={String(selectedLvl3?.id || '')}
                    onChange={(e) => {
                      const next = lvl3Kids.find((c) => String(c.id) === e.target.value) || lvl3Kids[0] || null;
                      setTaxiSelections((prev) => ({
                        ...prev,
                        [lvl1.id]: { ...(prev[lvl1.id] || {}), lvl3: next?.id },
                      }));
                      setSelectedLeaf(next || selectedLvl2 || lvl1);
                    }}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 13 }}
                  >
                    {lvl3Kids.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.name}</option>
                    ))}
                  </select>
                )) : null}

                {transmissionOptions.length > 0 ? uiRow('Transmission', (
                  <select
                    value={String(selState.transmission || '')}
                    onChange={(e) => {
                      const val = e.target.value || undefined;
                      setTaxiSelections((prev) => ({ ...prev, [lvl1.id]: { ...(prev[lvl1.id] || {}), transmission: val, bodyType: undefined, modelBrand: undefined } }));
                    }}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', fontSize: 13 }}
                  >
                    <option value="">Any</option>
                    {transmissionOptions.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                )) : null}

                {bodyOptions.length > 0 ? uiRow('Body Type', (
                  <select
                    value={String(selState.bodyType || '')}
                    onChange={(e) => {
                      const val = e.target.value || undefined;
                      setTaxiSelections((prev) => ({ ...prev, [lvl1.id]: { ...(prev[lvl1.id] || {}), bodyType: val, modelBrand: undefined } }));
                    }}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', fontSize: 13 }}
                  >
                    <option value="">Any</option>
                    {bodyOptions.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                )) : null}

                

                {modelBrandOptions.length > 0 ? uiRow('Brand + Model', (
                  <select
                    value={String(selState.modelBrand ?? modelBrandOptions[0] ?? '')}
                    onChange={(e) => {
                      const val = e.target.value || undefined;
                      setTaxiSelections((prev) => ({ ...prev, [lvl1.id]: { ...(prev[lvl1.id] || {}), modelBrand: val } }));
                    }}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', fontSize: 13 }}
                  >
                    {modelBrandOptions.map((opt) => {
                      const [model, brand] = String(opt).split('|');
                      return (
                        <option key={opt} value={opt}>{`${brand || ''} | ${model || ''}`.trim()}</option>
                      );
                    })}
                  </select>
                )) : null}
                <button
                  onClick={() => alert(`Booking ${displayNode?.name}`)}
                  style={{
                    marginTop: 'auto',
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 28,
                    border: 'none',
                    background: 'rgb(245 158 11)',
                    color: '#111827',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Book Now
                </button>
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  const minPriceInSubtree = (n) => {
    let best = null;
    const visit = (x) => {
      if (!x) return;
      const p = x.vendorPrice ?? x.price;
      if (p != null && (best == null || p < best)) best = p;
      if (Array.isArray(x.children) && x.children.length) x.children.forEach(visit);
    };
    visit(n);
    return best;
  };

  // Build simple inventory leaves under a subcategory for given families
  function makeLeavesForFamilies(famList, priceSeed, termsSeed, subNodeId) {
    try {
      const famSet = new Set(Array.isArray(famList) ? famList.map(String) : []);
      const list = (vendor?.inventorySelections?.[categoryId] || []).filter((e) => famSet.has(String(e?.scopeFamily || '')));
      const buckets = new Map(); // attrKey -> { name, price, terms }
      list.forEach((entry, idx) => {
        const sel = entry?.selections?.[entry?.scopeFamily] || {};
        const parts = Object.values(sel).filter((v) => v != null && String(v).trim() !== "");
        const name = parts.join(" ") || "Item";
        let leafPrice = null;
        try {
          const pbr = (entry && entry.pricesByRow && typeof entry.pricesByRow === 'object') ? entry.pricesByRow : null;
          if (pbr && subNodeId != null) {
            for (const [rk, val] of Object.entries(pbr)) {
              const ids = String(rk).split('|');
              if (ids.some((id) => String(id) === String(subNodeId))) {
                const n = Number(val);
                if (!Number.isNaN(n)) { leafPrice = n; break; }
              }
            }
          }
        } catch {}
        if (leafPrice == null && entry && entry.price != null && entry.price !== '') {
          const n = Number(entry.price);
          if (!Number.isNaN(n)) leafPrice = n;
        }
        if (leafPrice == null) leafPrice = priceSeed ?? null;

        // Build attribute key for grouping: stable key order
        try {
          const fam = String(entry?.scopeFamily || '');
          const kv = Object.entries(sel)
            .filter(([_, v]) => v != null && String(v).trim() !== '')
            .sort(([a], [b]) => String(a).localeCompare(String(b)))
            .map(([k, v]) => `${k}:${v}`)
            .join('|');
          const attrKey = `${fam}|${kv}`;
          const prev = buckets.get(attrKey);
          if (!prev || (prev.price == null || (leafPrice != null && leafPrice < prev.price))) {
            buckets.set(attrKey, { name, price: leafPrice, terms: termsSeed || "" });
          }
        } catch {
          // fallback: unique per entry
          const attrKey = `raw-${entry?.scopeFamily || 'fam'}-${entry?.at || idx}`;
          const prev = buckets.get(attrKey);
          if (!prev || (prev.price == null || (leafPrice != null && leafPrice < prev.price))) {
            buckets.set(attrKey, { name, price: leafPrice, terms: termsSeed || "" });
          }
        }
      });
      // Emit cheapest per attribute combo, sorted by price asc
      const out = Array.from(buckets.entries())
        .map(([key, v], i) => ({
          id: `inv-${key}-${i}`.replace(/\s+/g, '-'),
          name: v.name,
          children: [],
          vendorPrice: v.price,
          price: v.price,
          terms: v.terms,
        }))
        .sort((a, b) => {
          const pa = a.vendorPrice == null ? Number.POSITIVE_INFINITY : Number(a.vendorPrice);
          const pb = b.vendorPrice == null ? Number.POSITIVE_INFINITY : Number(b.vendorPrice);
          return pa - pb;
        });
      return out;
    } catch {
      return [];
    }
  }

  // Helper: deepest first child
  const deepestFirstChild = (n) => (!n?.children?.length ? n : deepestFirstChild(n.children[0]));

  const enrichNode = (node) => {
    const nodeId = String(node?.id || node?._id || "");
    const famsForNode = new Set([
      ...(familiesByTarget.get(nodeId) || new Set()),
      ...(familiesByTarget.get("ALL") || new Set()),
    ]);
    const famList = Array.from(famsForNode);

    const newChildren = Array.isArray(node?.children)
      ? node.children.map((c) => {
          const priceForC = minPriceInSubtree(c) ?? (c.vendorPrice ?? c.price) ?? null;
          const termsForC = c.terms ?? node.terms ?? "";
          const invLeaves = makeLeavesForFamilies(famList, priceForC, termsForC, c.id);
          const mergedChildren = Array.isArray(c.children) && c.children.length > 0
            ? [...c.children, ...invLeaves]
            : [...invLeaves];
          return { ...c, children: mergedChildren };
        })
      : [];

    return { ...node, children: newChildren };
  };

  // 🧠 First-level headings only
  const rendered = root.children.map((lvl1) => {
    const enriched = enrichNode(lvl1);
    return (
            <section key={lvl1.id} style={{ marginBottom: 16 }}>        {(() => { return null; })()}
        <h2
          style={{
            margin: "0 0 12px",
            textTransform: "uppercase",
            fontSize: 18,
            fontWeight: 600,
          }}
        >
          {lvl1.name}
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {(() => {
            const mapModeToDt = (m) => {
              const x = String(m || '').toLowerCase();
              if (x === 'card') return 'card';
              if (x === 'dropdown' || x === 'select') return 'dropdown';
              if (x === 'button' || x === 'buttons') return 'buttons';
              return null;
            };

            const renderNode = (child, parentNode) => {
              const pick = (arr) => Array.isArray(arr) && arr.length > 0 ? String(arr[0]).toLowerCase() : null;
              // Precedence: node.displayType -> parent.displayType -> root.displayType -> card
              let dt = pick(child?.displayType) || pick(parentNode?.displayType) || pick(lvl1?.displayType) || 'card';

              // Debug trace
              try {
                const id = child?.id || child?._id || '';
                const name = child?.name || '';
                console.log('[preview] layout', { id, name, resolvedDt: dt });
              } catch {}

              // Card: keep existing rich card behavior
              if (dt === 'card') {
                let livePrice = null;
                const priceRows = vendor?.inventorySelections?.[categoryId] || [];
                for (const entry of priceRows) {
                  const pbr = (entry && entry.pricesByRow && typeof entry.pricesByRow === 'object') ? entry.pricesByRow : null;
                  if (!pbr) continue;
                  for (const [key, value] of Object.entries(pbr)) {
                    const ids = String(key).split('|');
                    if (ids.some((id) => String(id) === String(child.id))) { livePrice = Number(value); break; }
                  }
                  if (livePrice != null) break;
                }
                if (livePrice == null) {
                  livePrice = vendor?.pricing?.[child.id] ?? vendor?.pricing?.[parentNode?.id] ?? child.vendorPrice ?? child.price ?? null;
                }
                const nodeWithLivePrice = { ...child, vendorPrice: livePrice, price: livePrice };
                return (
                  <ParentWithSizesCard
                    key={child.id}
                    node={nodeWithLivePrice}
                    selection={cardSelections[child.id]}
                    onSelectionChange={(parent, leaf) =>
                      setCardSelections((prev) => ({ ...prev, [child.id]: { parent, child: leaf } }))
                    }
                    onLeafSelect={(leaf) => setSelectedLeaf(leaf)}
                    mode={'buttons'}
                    includeLeafChildren={Boolean(child?.uiRules?.includeLeafChildren ?? true)}
                  />
                );
              }

              const kids = Array.isArray(child.children) ? child.children : [];
              if (kids.length === 0) {
                // Render standalone card with price/terms/image when a first-level child has no children
                let livePrice = null;
                try {
                  const priceRows = vendor?.inventorySelections?.[categoryId] || [];
                  for (const entry of priceRows) {
                    const pbr = (entry && entry.pricesByRow && typeof entry.pricesByRow === 'object') ? entry.pricesByRow : null;
                    if (!pbr) continue;
                    for (const [key, value] of Object.entries(pbr)) {
                      const ids = String(key).split('|');
                      if (ids.some((id) => String(id) === String(child.id))) { livePrice = Number(value); break; }
                    }
                    if (livePrice != null) break;
                  }
                } catch {}
                if (livePrice == null) {
                  livePrice = vendor?.pricing?.[child.id] ?? vendor?.pricing?.[parentNode?.id] ?? child.vendorPrice ?? child.price ?? null;
                }
                const imgSrc = (() => {
                  const s = String(child?.imageUrl || '');
                  if (!s) return null;
                  if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:')) return s;
                  if (s.startsWith('/')) return `http://localhost:5000${s}`;
                  return `http://localhost:5000/${s}`;
                })();
                const termsRaw = child?.terms || '';
                const termsArr = Array.isArray(termsRaw)
                  ? termsRaw
                  : String(termsRaw || '')
                      .split(/\r?\n|,|;|\u2022/g)
                      .map((s) => s.trim())
                      .filter(Boolean);
                const terms = termsArr.join(', ');
                return (
                  <section key={child.id} style={{ flex: '1 1 320px', minWidth: 300 }}>
                    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: '#fff', display: 'flex', flexDirection: 'column', gap: 10, width: 300, minHeight: 400, justifyContent: 'space-between' }}>
                      <h3 style={{ margin: 0 }}>{child.name}</h3>
                      {imgSrc ? (
                        <img src={imgSrc} alt={child.name} style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 8 }} />
                      ) : null}
                      {livePrice != null ? (
                        <div style={{ fontSize: 18, fontWeight: 800, color: '#111827' }}>₹{Number(livePrice)}</div>
                      ) : null}
                      {terms ? (
                        <div style={{ fontSize: 12, color: '#6b7280' }}>{terms}</div>
                      ) : null}
                      <button
                        onClick={() => alert(`Booking ${child?.name}`)}
                        style={{ marginTop: 'auto', width: '100%', padding: '10px 14px', borderRadius: 28, border: 'none', background: 'rgb(245 158 11)', color: '#111827', fontWeight: 600, cursor: 'pointer' }}
                      >
                        Book Now
                      </button>
                    </div>
                  </section>
                );
              }

              const selectedId = nodeSelections[child.id] || kids[0]?.id;
              const selected = kids.find((k) => String(k.id) === String(selectedId)) || kids[0];

              if (dt === 'buttons' || dt === 'button') {
                return (
                  <div key={child.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 260 }}>
                    <div style={{ fontWeight: 600 }}>{child.name}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {kids.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setNodeSelections((p) => ({ ...p, [child.id]: opt.id }));
                            const leaf = deepestFirstChild(opt);
                            if (leaf) setSelectedLeaf(leaf);
                          }}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 999,
                            border: String(selected?.id) === String(opt.id) ? '2px solid #2563eb' : '1px solid #d1d5db',
                            background: String(selected?.id) === String(opt.id) ? '#2563eb' : '#f9fafb',
                            color: String(selected?.id) === String(opt.id) ? '#fff' : '#111827',
                            cursor: 'pointer',
                            fontSize: 13,
                          }}
                        >
                          {opt.name}
                        </button>
                      ))}
                    </div>
                    {selected ? renderNode(selected, child) : null}
                  </div>
                );
              }

              if (dt === 'dropdown' || dt === 'select') {
                return (
                  <div key={child.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 260 }}>
                    <div style={{ fontWeight: 600 }}>{child.name}</div>
                    <select
                      value={String(selected?.id || '')}
                      onChange={(e) => {
                        const next = kids.find((c) => String(c.id) === e.target.value) || kids[0];
                        setNodeSelections((p) => ({ ...p, [child.id]: next?.id }));
                        const leaf = deepestFirstChild(next);
                        if (leaf) setSelectedLeaf(leaf);
                      }}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 13 }}
                    >
                      {kids.map((opt) => (
                        <option key={opt.id} value={opt.id}>{opt.name}</option>
                      ))}
                    </select>
                    {selected ? renderNode(selected, child) : null}
                  </div>
                );
              }

              // fallback to card if unknown
              return renderNode({ ...child, displayType: ['Card'] }, parentNode);
            };

            const kidsTop = Array.isArray(enriched.children) ? enriched.children : [];
            if (kidsTop.length === 0) {
              // Render the first-level node itself as a card (leaf L1)
              let livePrice = null;
              try {
                const priceRows = vendor?.inventorySelections?.[categoryId] || [];
                for (const entry of priceRows) {
                  const pbr = (entry && entry.pricesByRow && typeof entry.pricesByRow === 'object') ? entry.pricesByRow : null;
                  if (!pbr) continue;
                  for (const [key, value] of Object.entries(pbr)) {
                    const ids = String(key).split('|');
                    if (ids.some((id) => String(id) === String(enriched.id))) { livePrice = Number(value); break; }
                  }
                  if (livePrice != null) break;
                }
              } catch {}
              if (livePrice == null) {
                livePrice = vendor?.pricing?.[enriched.id] ?? vendor?.pricing?.[root?.id] ?? enriched.vendorPrice ?? enriched.price ?? null;
              }
              const imgSrc = (() => {
                const s = String(enriched?.imageUrl || '');
                if (!s) return null;
                if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:')) return s;
                if (s.startsWith('/')) return `http://localhost:5000${s}`;
                return `http://localhost:5000/${s}`;
              })();
              const termsRaw = enriched?.terms || '';
              const termsArr = Array.isArray(termsRaw) ? termsRaw : String(termsRaw || '')
                .split(/\r?\n|,|;|\u2022/g).map((s) => s.trim()).filter(Boolean);
              const terms = termsArr.join(', ');
              return [
                (
                  <section key={enriched.id} style={{ flex: '1 1 320px', minWidth: 300 }}>
                    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: '#fff', display: 'flex', flexDirection: 'column', gap: 10, width: 300, minHeight: 400, justifyContent: 'space-between' }}>
                      <h3 style={{ margin: 0 }}>{enriched.name}</h3>
                      {imgSrc ? (
                        <img src={imgSrc} alt={enriched.name} style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 8 }} />
                      ) : null}
                      {livePrice != null ? (
                        <div style={{ fontSize: 18, fontWeight: 800, color: '#111827' }}>₹{Number(livePrice)}</div>
                      ) : null}
                      {terms ? (
                        <div style={{ fontSize: 12, color: '#6b7280' }}>{terms}</div>
                      ) : null}
                      <button
                        onClick={() => alert(`Booking ${enriched?.name}`)}
                        style={{ marginTop: 'auto', width: '100%', padding: '10px 14px', borderRadius: 28, border: 'none', background: 'rgb(245 158 11)', color: '#111827', fontWeight: 600, cursor: 'pointer' }}
                      >
                        Book Now
                      </button>
                    </div>
                  </section>
                )
              ];
            }
            // Sort children by minimum price in their subtree
            const sortedKids = [...kidsTop].sort((a, b) => {
              const pa = minPriceInSubtree(a);
              const pb = minPriceInSubtree(b);
              const va = pa == null ? Number.POSITIVE_INFINITY : Number(pa);
              const vb = pb == null ? Number.POSITIVE_INFINITY : Number(pb);
              return va - vb;
            });
            return sortedKids.map((child) => renderNode(child, enriched));
          })()}
        </div>
      </section>
    );
  });

  return rendered;
};


  return (
    <div style={{ padding: 0, background: "#F0FDF4" }}>
      {loading ? (
        <FullPageShimmer />
      ) : (
        <>
          <TopNavBar businessName={vendor?.businessName || "Loading..."} categoryTree={categoryTree} selectedLeaf={selectedLeaf} onLeafSelect={setSelectedLeaf} />
          <HomeSection businessName={vendor?.businessName || "Loading..."} profilePictures={vendor?.profilePictures || []} />
          <main id="products" style={{ padding: "20px", marginTop: "10px" }}>
            {Array.isArray(combos) && combos.length > 0 ? (
              <section style={{ marginBottom: 8 }}>
                <h2 style={{ margin: '0 0 10px 0' }}>Packages</h2>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 0 }}>
                  {combos.map((combo, idx) => {
                    const name = combo?.name || 'Package';
                    const img = combo?.imageUrl || combo?.image || null;
                    const items = Array.isArray(combo?.items) ? combo.items : [];
                    // Compute best price from variants across items, fallback to basePrice
                    let variantPrices = [];
                    try {
                      items.forEach((it) => {
                        const vs = Array.isArray(it?.variants) ? it.variants : [];
                        vs.forEach((v) => {
                          const p = v?.price;
                          if (p !== undefined && p !== null && String(p) !== '' && !Number.isNaN(Number(p))) {
                            variantPrices.push(Number(p));
                          }
                        });
                      });
                    } catch {}
                    // Build includes label and sizes list
                    const includesLabel = (() => {
                      try {
                        const labels = items.map((it) => it?.name || (it?.kind === 'custom' ? 'Custom' : 'Service')).filter(Boolean);
                        return labels.join(', ');
                      } catch { return ''; }
                    })();
                    const sizes = (() => {
                      try {
                        const set = new Set();
                        items.forEach((it) => {
                          const vs = Array.isArray(it?.variants) ? it.variants : [];
                          if (vs.length === 0) set.add('—');
                          vs.forEach((v) => set.add(v?.size || '—'));
                        });
                        return Array.from(set);
                      } catch { return []; }
                    })();
                    const base = (combo && combo.basePrice != null && combo.basePrice !== '') ? Number(combo.basePrice) : null;
                    const selectedSize = (packageSelections[idx]?.size != null) ? packageSelections[idx].size : (sizes[0] ?? null);
                    const priceBySize = (() => {
                      try {
                        if (!selectedSize) return null;
                        const prices = [];
                        items.forEach((it) => {
                          const vs = Array.isArray(it?.variants) ? it.variants : [];
                          vs.forEach((v) => {
                            const match = (v?.size || '—') === selectedSize;
                            if (match) {
                              const p = v?.price;
                              if (p !== undefined && p !== null && String(p) !== '' && !Number.isNaN(Number(p))) prices.push(Number(p));
                            }
                          });
                        });
                        if (prices.length) return Math.min(...prices);
                        return null;
                      } catch { return null; }
                    })();
                    const bestVar = variantPrices.length ? Math.min(...variantPrices) : null;
                    const price = (priceBySize != null ? priceBySize : (bestVar != null ? bestVar : base));
                    const priceNode = (price != null && !Number.isNaN(price)) ? (
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#111827' }}>₹{price}</div>
                    ) : null;
                    const termsRaw = combo?.terms || combo?.term || '';
                    const termsArr = Array.isArray(termsRaw)
                      ? termsRaw
                      : String(termsRaw || '')
                          .split(/\r?\n|,|;|\u2022/g)
                          .map((s) => s.trim())
                          .filter(Boolean);
                    const terms = termsArr.join(', ');
                    const imgSrc = (() => {
                      if (!img) return null;
                      const s = String(img);
                      if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:')) return s;
                      if (s.startsWith('/')) return `http://localhost:5000${s}`;
                      return `http://localhost:5000/${s}`;
                    })();
                    return (
                      <section key={`pkg-${idx}`} style={{ flex: '1 1 320px', minWidth: 300, marginBottom: 0 }}>
                        <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: '#fff', display: 'flex', flexDirection: 'column', gap: 10, width: 300, minHeight: 400, justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {imgSrc ? (
                              <img src={imgSrc} alt={name} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 8 }} />
                            ) : null}
                            <h3 style={{ margin: 0 }}>{name}</h3>
                          </div>
                          {/* Size selector */}
                          {sizes && sizes.length ? (
                            <div>
                              <div style={{ fontSize: 12, marginBottom: 4, color: '#374151', fontWeight: 600 }}>Size</div>
                              <select
                                value={String(selectedSize || '')}
                                onChange={(e) => setPackageSelections((prev) => ({ ...prev, [idx]: { ...(prev[idx] || {}), size: e.target.value } }))}
                                style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', fontSize: 13 }}
                              >
                                {sizes.map((sz) => (
                                  <option key={String(sz)} value={String(sz)}>{String(sz)}</option>
                                ))}
                              </select>
                            </div>
                          ) : null}
                          {priceNode}
                          {includesLabel ? (
                            <div style={{ fontSize: 16, color: '#374151' }}>
                              <span style={{ fontWeight: 600 }}>Includes: </span>
                              <span>{includesLabel}</span>
                            </div>
                          ) : null}
                          {termsArr.length ? (
                            <ul style={{ margin: 0, paddingLeft: 18, color: '#6b7280', fontSize: 12 }}>
                              {termsArr.map((t, i) => (
                                <li key={i}>{t}</li>
                              ))}
                            </ul>
                          ) : null}
                          <button
                            onClick={() => alert(`Booking ${name}`)}
                            style={{ marginTop: 'auto', width: '100%', padding: '10px 14px', borderRadius: 28, border: 'none', background: 'rgb(245 158 11)', color: '#111827', fontWeight: 600, cursor: 'pointer' }}
                          >
                            Book Now
                          </button>
                        </div>
                      </section>
                    );
                  })}
                </div>
              </section>
            ) : null}
            <h2 style={{ margin: '0', padding: '0 0 10px 0' }}>Individuals</h2>
            {renderTree(categoryTree)}
          </main>
          <BenefitsSection />
          <AboutSection />
          <ContactSection
            contactNumber={vendor?.customerId?.fullNumber || vendor?.phone || "-"}
            location={location}
            vendorId={vendorId}
            businessHours={vendor?.businessHours || []}
            onLocationUpdate={(newLoc) => {
              setLocation(newLoc);
              setVendor((prev) => ({ ...prev, location: newLoc }));
            }}
          />
          <Footer />
        </>
      )}
    </div>
  );
}
