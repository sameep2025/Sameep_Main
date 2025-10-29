// pages/preview/[vendorId]/[categoryId].jsx
import React, { useState, useEffect } from "react";
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

  const loading = loadingVendor || loadingCategories;

  // ----------------- Fetch vendor & categories -----------------
  useEffect(() => {
    if (!router.isReady || !vendorId) return;

    const fetchData = async () => {
      setLoadingVendor(true);
      setLoadingCategories(true);
      try {
        const [vendorRes, categoryRes, locationRes, catMetaRes] = await Promise.all([
          fetch(`/api/vendors/${vendorId}`, { cache: "no-store" }),
          fetch(`/api/vendors/${vendorId}/preview/${categoryId}`, { cache: "no-store" }),
          fetch(`/api/vendors/${vendorId}/location`, { cache: "no-store" }),
          fetch(`/api/categories/${categoryId}`, { cache: "no-store" }),
        ]);

        const vendorData = await vendorRes.json();
        const categoryData = await categoryRes.json();
        const catMeta = await catMetaRes.json().catch(() => ({}));
        let locationData = null;

        try {
          locationData = await locationRes.json();
        } catch (err) {
          locationData = null;
        }

        setVendor(vendorData);
        console.log("CategoryData from API:", categoryData);

        const linkedAttributes = (catMeta && catMeta.linkedAttributes) ? catMeta.linkedAttributes : {};
        const categoriesWithLinked = categoryData?.categories ? { ...categoryData.categories, linkedAttributes } : null;
        setCategoryTree(categoriesWithLinked);


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
    };

    fetchData();
  }, [router.isReady, vendorId, categoryId]);

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

    // Resolve selector display types by inspecting each child node's own config
    const mapToSelectorMode = (dt) => {
      const x = String(dt || '').toLowerCase();
      if (x === 'dropdown' || x === 'select') return 'dropdown';
      return 'buttons';
    };
    const pickDtArr = (arr) => Array.isArray(arr) && arr.length > 0 ? String(arr[0]).toLowerCase() : null;
    const getNodeMode = (n) => pickDtArr(n?.displayType) || getUiForLocal(n).mode || 'buttons';
    const resolveSelectorFromChildren = (children, fallbackMode) => {
      const kids = Array.isArray(children) ? children : [];
      if (kids.length === 0) return mapToSelectorMode(fallbackMode);
      const modes = kids.map((k) => pickDtArr(k?.displayType) || getUiForLocal(k).mode).map((m) => String(m || '').toLowerCase());
      const hasDropdown = modes.includes('dropdown') || modes.includes('select');
      return hasDropdown ? 'dropdown' : 'buttons';
    };
    const parentSelectorMode = resolveSelectorFromChildren(node?.children, mode);
    const childSelectorMode = resolveSelectorFromChildren(selectedParent?.children, mode);
    try { console.log('[preview] in-card modes', { node: node?.name, parentSelectorMode, childOf: selectedParent?.name, childSelectorMode }); } catch {}

    return (
      <section style={{ marginBottom: 28 }}>
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

          {displayNode?.imageUrl && (
            <img
              src={displayNode.imageUrl.startsWith("http") ? displayNode.imageUrl : `http://localhost:5000${displayNode.imageUrl}`}
              alt={displayNode.name}
              style={{ width: 50, height: 50, borderRadius: 8, objectFit: "cover", marginBottom: 12 }}
            />
          )}

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

  const makeLeavesForFamilies = (families, priceSeed, termsSeed) => {
    const out = [];
    (families || []).forEach((fam) => {
      const list = (invByFamily[fam] || []).filter(matchesAttrFilters);
      list.forEach((entry, idx) => {
        const sel = entry?.selections?.[entry?.scopeFamily] || {};
        const parts = Object.values(sel).filter((v) => v != null && String(v).trim() !== "");
        const name = parts.join(" ") || "Item";
        out.push({
          id: `inv-${entry?.scopeFamily || "fam"}-${entry?.at || idx}-${name}`.replace(/\s+/g, "-"),
          name,
          children: [],
          vendorPrice: priceSeed ?? null,
          price: priceSeed ?? null,
          terms: termsSeed || "",
        });
      });
    });
    return out;
  };

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
          const invLeaves = makeLeavesForFamilies(famList, priceForC, termsForC);
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
      <section key={lvl1.id} style={{ marginBottom: 28 }}>
        {/* Attributes Filter Bar (disabled) */}
        {(() => { return null; })()}
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
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
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
                  if (!entry?.pricesByRow) continue;
                  for (const [key, value] of Object.entries(entry.pricesByRow)) {
                    const parts = key.split('|');
                    const sub = parts[1];
                    const leaf = parts[2];
                    if (child.id?.includes(leaf) || child.id?.includes(sub)) { livePrice = value; break; }
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
              if (kids.length === 0) return null;

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

            return (enriched.children || []).map((child) => renderNode(child, enriched));
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
          <HomeSection businessName={vendor?.businessName || "Loading..."} />
          <main id="products" style={{ padding: "20px", marginTop: "10px" }}>
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
