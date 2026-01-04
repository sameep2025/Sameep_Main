import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import API_BASE_URL from "../../../../../../config";

// Authentication check helper (pure boolean, no UI side-effects)
const checkAuthentication = (vendorId, categoryId) => {
  try {
    if (typeof window === "undefined") return false;
    const tokenKey = `previewToken:${vendorId}:${categoryId}`;
    const identityKey = `previewIdentity:${vendorId}:${categoryId}`;

    const token = window.localStorage.getItem(tokenKey);
    const identityStr = window.localStorage.getItem(identityKey);

    if (!identityStr) return false;

    const identity = JSON.parse(identityStr);
    if (!(identity && identity.loggedIn === true)) return false;

    const role = String(identity?.role || "").trim().toLowerCase();
    if (role === "vendor") return true;
    return !!token;
  } catch {
    return false;
  }
};

// Final My Individual Services page for a specific LVL1 and LVL2 combination.
// Reuses the same dummy vendor/category + inventory logic as the admin page,
// but renders a mobile-friendly UI with Active/Inactive tabs and price editing.

function flattenTree(node, rows = [], parentLevels = [], parentIds = []) {
  if (!node) return rows;
  const levels = [...parentLevels, node.name ?? "Unnamed"];
  const ids = [...parentIds, node._id ?? node.id];
  if (!node.children || node.children.length === 0) {
    rows.push({
      id: node._id ?? node.id,
      levels,
      levelIds: ids,
      price:
        typeof node.vendorPrice === "number" ? node.vendorPrice : node.price ?? "-",
      categoryId: node._id ?? node.id,
      pricingStatus: node.pricingStatus,
      image: node.imageUrl || node.iconUrl || node.image || null,
    });
  } else {
    node.children.forEach((child) => flattenTree(child, rows, levels, ids));
  }
  return rows;
}

export default function MyIndividualServicesDetailPage() {
  const router = useRouter();
  const { vendorId, categoryId, lvl1Id, lvl2Id } = router.query;

  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingPrice, setEditingPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [statusByRow, setStatusByRow] = useState({}); // { key -> 'Active' | 'Inactive' }
  const [activeTab, setActiveTab] = useState("Active");
  const [linkedAttributes, setLinkedAttributes] = useState({});
  const [invItems, setInvItems] = useState([]);
  const [vendor, setVendor] = useState(null);
  const [rowPriceEdit, setRowPriceEdit] = useState(null); // { entryId, rowKey, price, labels }
  const [sessionExpired, setSessionExpired] = useState(false);

  const pricesBackfillDoneRef = useRef({});

  const saveVendorFlowServicePrice = async (serviceId, price) => {
    await fetch(`${API_BASE_URL}/api/vendor-flow/vendor/${vendorId}/services/${serviceId}/price`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ price }),
    });
    return true;
  };

  const saveVendorFlowServiceStatus = async (serviceId, status) => {
    await fetch(`${API_BASE_URL}/api/vendor-flow/vendor/${vendorId}/services/${serviceId}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status }),
    });
    return true;
  };

  const buildDefaultPricesByRowForInventoryItem = (baseRows) => {
    try {
      const rows = Array.isArray(baseRows) ? baseRows : [];
      const defaults = {};
      rows.forEach((r) => {
        const ids = Array.isArray(r?.levelIds) ? r.levelIds : [];
        const rowKey = ids.length ? ids.map(String).join("|") : "";
        if (!rowKey) return;
        const p = r?.price;
        if (p === undefined || p === null || p === "") return;
        if (p === "-") return;
        defaults[rowKey] = p;
      });
      return defaults;
    } catch {
      return {};
    }
  };

  const mergeMissingPricesByRow = (existingPricesByRow, defaults) => {
    try {
      const base =
        existingPricesByRow && typeof existingPricesByRow === "object"
          ? { ...existingPricesByRow }
          : {};
      const def = defaults && typeof defaults === "object" ? defaults : {};
      let changed = false;
      Object.keys(def).forEach((k) => {
        if (base[k] === undefined || base[k] === null || base[k] === "") {
          base[k] = def[k];
          changed = true;
        }
      });
      return { merged: base, changed };
    } catch {
      return { merged: existingPricesByRow, changed: false };
    }
  };

  useEffect(() => {
    if (!vendorId) return;
    
    // Check authentication first
    if (!checkAuthentication(vendorId, categoryId)) {
      setSessionExpired(true);
      setLoading(false);
      return;
    }
    
    const fetchTree = async () => {
      try {
        setLoading(true);
        setError("");
        
        // Use vendor-flow API to get services
        const url = `${API_BASE_URL}/api/vendor-flow/vendor/${vendorId}${categoryId ? `?categoryId=${categoryId}` : ''}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to load services");
        const json = await res.json().catch(() => ({}));
        
        // Extract services from vendor flow response
        const services = Array.isArray(json?.services) ? json.services : [];
        
        // Filter services that match the selected lvl1 and lvl2 categories
        const filteredServices = services.filter(service => {
          const categoryPath = Array.isArray(service?.categoryPath) ? service.categoryPath : [];
          return categoryPath.length >= 2 && 
                 categoryPath[0] === lvl1Id && 
                 categoryPath[1] === lvl2Id;
        });
        
        // Convert services to tree structure for compatibility
        const treeData = filteredServices.map(service => ({
          _id: service._serviceId || service._id || service.categoryId,
          name: service.serviceName || service.name || 'Service',
          price: service.price || 0,
          vendorPrice: service.price || 0,
          pricingStatus: service.status || 'Active',
          imageUrl: service.imageUrl || service.iconUrl || null,
          children: []
        }));
        
        setTree(treeData);
      } catch (e) {
        console.error("MyIndividualServicesDetailPage fetchTree error", e);
        setError(e?.message || "Failed to load services");
        setTree([]);
      } finally {
        setLoading(false);
      }
    };
    fetchTree();
  }, [vendorId]);

  useEffect(() => {
    if (!vendorId || !categoryId) return;
    if (typeof window === "undefined") return;

    const id = setInterval(() => {
      try {
        if (!checkAuthentication(vendorId, categoryId)) {
          setSessionExpired(true);
          clearInterval(id);
        }
      } catch {}
    }, 2000);

    return () => clearInterval(id);
  }, [vendorId, categoryId, router]);

  const rows = useMemo(() => tree.flatMap((root) => flattenTree(root)), [tree]);

  // Load category meta for linkedAttributes
  useEffect(() => {
    if (!categoryId) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/dummy-categories/${categoryId}`);
        if (!res.ok) throw new Error("Failed to load category meta");
        const json = await res.json().catch(() => ({}));
        const la =
          json && typeof json.linkedAttributes === "object"
            ? json.linkedAttributes
            : {};
        setLinkedAttributes(la);
      } catch {
        setLinkedAttributes({});
      }
    })();
  }, [categoryId]);

  // Load inventory selections and vendor (for nodePricingStatus)
  useEffect(() => {
    if (!vendorId || !categoryId) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/dummy-vendors/${vendorId}`);
        if (!res.ok) throw new Error("Failed to load vendor inventory");
        const json = await res.json().catch(() => ({}));
        setVendor(json && typeof json === "object" ? json : null);

        const invRes = await fetch(
          `${API_BASE_URL}/api/dummy-categories/${categoryId}/vendors/${vendorId}/inventory-selections`,
          { cache: "no-store" }
        );
        if (!invRes.ok) {
          setInvItems([]);
          return;
        }
        const invJson = await invRes.json().catch(() => ({}));
        const items = Array.isArray(invJson?.items) ? invJson.items : [];
        setInvItems(items);
      } catch {
        setInvItems([]);
      }
    })();
  }, [vendorId, categoryId]);

  useEffect(() => {
    (async () => {
      try {
        if (!vendorId || !categoryId) return;
        if (!rows || rows.length === 0) return;

        const guardKey = `${vendorId}|${categoryId}`;
        if (pricesBackfillDoneRef.current[guardKey]) return;

        const defaults = buildDefaultPricesByRowForInventoryItem(rows);
        let anyChanged = false;
        const nextItems = (Array.isArray(invItems) ? invItems : []).map((it) => {
          const { merged, changed } = mergeMissingPricesByRow(it?.pricesByRow, defaults);
          if (changed) {
            anyChanged = true;
            return { ...it, pricesByRow: merged };
          }
          return it;
        });

        pricesBackfillDoneRef.current[guardKey] = true;

        if (!anyChanged) return;
        setInvItems(nextItems);
        await saveDummyInventorySelections(vendorId, categoryId, nextItems);
      } catch {
        // ignore
      }
    })();
  }, [vendorId, categoryId, rows, invItems]);

  const rowMatches = useMemo(() => {
    try {
      const map = {};
      const items = Array.isArray(invItems) ? invItems : [];
      rows.forEach((row) => {
        const matches = items.filter((it) => {
          const hasScope = it && it.scopeFamily && it.scopeLabel;
          const keyCandidates = hasScope
            ? [
                `${it.scopeFamily}:${it.scopeLabel}:linkedSubcategory`,
                `${it.scopeFamily}:inventoryLabels:linkedSubcategory`,
              ]
            : [];
          let linked = [];
          keyCandidates.forEach((k) => {
            if (linked.length) return;
            const arr = linkedAttributes?.[k];
            if (Array.isArray(arr) && arr.length) linked = arr;
          });
          const val = Array.isArray(linked) && linked.length ? String(linked[0]) : "";
          if (val === "ALL") return true;
          const lvlIds = Array.isArray(row.levelIds)
            ? row.levelIds.map((x) => String(x))
            : [];
          const firstIdx = lvlIds[0] === "root" ? 2 : 1;
          const firstSubcatId = lvlIds.length > firstIdx ? lvlIds[firstIdx] : null;
          if (!firstSubcatId) return false;
          return String(firstSubcatId) === val;
        });
        map[row.id] = matches;
      });
      return map;
    } catch {
      return {};
    }
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

  // Filter by LVL1 (e.g., "Men's Grooming") and LVL2 (e.g., "Hair")
  // Show all items that are UNDER the specified hierarchy
  // - LVL1 should appear somewhere in the levels (after root)
  // - LVL2 should appear somewhere in the levels (after LVL1)
  const levelFilteredRows = useMemo(() => {
    try {
      const lvl1Target = String(lvl1Id || "").trim().toLowerCase();
      const lvl2Target = String(lvl2Id || "").trim().toLowerCase();
      if (!lvl1Target && !lvl2Target) return expandedRows;

      return expandedRows.filter(({ base }) => {
        const levels = Array.isArray(base.levels) ? base.levels : [];
        if (!levels.length) return false;
        const lower = levels.map((x) => String(x || "").trim().toLowerCase());

        // Skip root (index 0) when matching LVL1 like "Men's Grooming"
        const childLevels = lower.slice(1);
        
        // LVL1 must appear somewhere in the hierarchy
        if (lvl1Target && !childLevels.includes(lvl1Target)) return false;

        // LVL2 must appear somewhere in the hierarchy (after LVL1)
        if (lvl2Target) {
          const lvl1Index = childLevels.indexOf(lvl1Target);
          const levelsAfterLvl1 = lvl1Index >= 0 ? childLevels.slice(lvl1Index + 1) : childLevels;
          if (!levelsAfterLvl1.includes(lvl2Target)) return false;
        }
        return true;
      });
    } catch {
      return expandedRows;
    }
  }, [expandedRows, lvl1Id, lvl2Id]);

  const enrichedRows = useMemo(() => {
    return levelFilteredRows.map(({ base, match, idx }) => {
      const isInventoryRow = Boolean(match);
      const levelIdsKey = Array.isArray(base.levelIds) && base.levelIds.length
        ? base.levelIds.map(String).join("|")
        : String(base.id);
      let statusKey;
      let baseStatus;
      const nodeMap =
        vendor && vendor.nodePricingStatus && typeof vendor.nodePricingStatus === "object"
          ? vendor.nodePricingStatus
          : {};
      const firstSubcatId = (() => {
        try {
          const lvlIds = Array.isArray(base.levelIds) ? base.levelIds.map((x) => String(x)) : [];
          const firstIdx = lvlIds[0] === "root" ? 2 : 1;
          return lvlIds.length > firstIdx ? String(lvlIds[firstIdx]) : null;
        } catch {
          return null;
        }
      })();
      const nodeFallback = (() => {
        try {
          const leafId = String(base.categoryId || base.id || "");
          const vLeaf = leafId ? nodeMap[leafId] : undefined;
          const vLvl1 = firstSubcatId ? nodeMap[String(firstSubcatId)] : undefined;
          return vLeaf || vLvl1 || undefined;
        } catch {
          return undefined;
        }
      })();
      if (isInventoryRow) {
        statusKey = `inv:${String(match._id || match.at)}|${levelIdsKey}`;
        const map =
          match && match.pricingStatusByRow &&
          typeof match.pricingStatusByRow === "object"
            ? match.pricingStatusByRow
            : {};
        baseStatus = map[levelIdsKey] || nodeFallback || "Inactive";
      } else {
        statusKey = `cat:${base.categoryId}`;
        baseStatus = nodeFallback || base.pricingStatus || "Inactive";
      }
      const currentStatus = statusByRow[statusKey] || baseStatus || "Inactive";
      return {
        id: base.id,
        categoryId: base.categoryId,
        levels: base.levels,
        levelIds: base.levelIds,
        price: base.price,
        pricingStatus: currentStatus,
        match,
        idx,
        isInventoryRow,
        statusKey,
        levelIdsKey,
        image: base.image || null,
      };
    });
  }, [levelFilteredRows, statusByRow, vendor]);

  // Debug helper: log the rows we are actually rendering
  useEffect(() => {
    try {
      console.log(
        "DEBUG visibleRows",
        enrichedRows.map((r) => ({
          id: r.id,
          levels: r.levels,
          pricingStatus: r.pricingStatus,
          isInventory: r.isInventoryRow,
        }))
      );
    } catch {}
  }, [enrichedRows]);

  const activeRows = enrichedRows.filter(
    (r) => String(r.pricingStatus || "").toLowerCase() === "active"
  );
  const inactiveRows = enrichedRows.filter(
    (r) => String(r.pricingStatus || "").toLowerCase() !== "active"
  );

  const visibleRows = activeTab === "Active" ? activeRows : inactiveRows;

  const onEdit = (row) => {
    if (row.isInventoryRow && row.match) {
      try {
        const rowKey = row.levelIdsKey;
        const pbr =
          row.match.pricesByRow &&
          typeof row.match.pricesByRow === "object"
            ? row.match.pricesByRow
            : null;
        const rowPrice =
          pbr && Object.prototype.hasOwnProperty.call(pbr, rowKey)
            ? pbr[rowKey]
            : row.match.price ?? "";
        setRowPriceEdit({
          entryId: String(row.match._id || row.match.at),
          rowKey,
          price: rowPrice === null || rowPrice === undefined ? "" : String(rowPrice),
          labels: {
            category:
              Array.isArray(row.levels) && row.levels.length
                ? row.levels[row.levels.length - 1]
                : "Service",
            attrs: row.match.selections || {},
          },
        });
      } catch {
        // fall back to no-op if something goes wrong
      }
      return;
    }
    // Non-inventory rows: keep inline editing as before
    setEditingId(row.categoryId);
    setEditingPrice(
      row.price === "-" || row.price === null || row.price === undefined
        ? ""
        : String(row.price)
    );
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
      
      // Use vendor-flow API to update service price
      await saveVendorFlowServicePrice(editingId, val);
      
      setTree((prev) => {
        const clone = JSON.parse(JSON.stringify(prev || []));
        const visit = (node) => {
          if (!node) return;
          const id = node._id || node.id;
          if (String(id) === String(editingId)) {
            node.price = val;
            node.vendorPrice = val;
          }
          if (Array.isArray(node.children)) {
            node.children.forEach(visit);
          }
        };
        clone.forEach(visit);
        return clone;
      });
      setEditingId(null);
      setEditingPrice("");
    } catch (e) {
      console.error("Failed to save price", e);
      alert(e?.message || "Failed to save price");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (rowKey) => {
    try {
      const current = statusByRow[rowKey] || "Active";
      const next = current === "Active" ? "Inactive" : "Active";
      
      // Find the service ID from the tree
      const serviceId = rowKey.split('|').pop();
      if (!serviceId) return;
      
      // Use vendor-flow API to update service status
      await saveVendorFlowServiceStatus(serviceId, next);
      
      setStatusByRow((prev) => ({ ...prev, [rowKey]: next }));
    } catch (e) {
      console.error("Failed to toggle status", e);
      alert(e?.message || "Failed to update status");
    }
  };

  const toggleStatus = async (row, nextStatus) => {
    try {
      const safe = nextStatus === "Active" ? "Active" : "Inactive";
      setStatusByRow((prev) => ({ ...prev, [row.statusKey]: safe }));

      if (row.isInventoryRow) {
        // Update pricingStatusByRow inside the matching inventory item
        const entryId = String(row.match._id || row.match.at);
        const items = Array.isArray(invItems)
          ? invItems.map((it) => {
              if (String(it._id || it.at) !== entryId) return it;
              const map =
                it.pricingStatusByRow &&
                typeof it.pricingStatusByRow === "object"
                  ? it.pricingStatusByRow
                  : {};
              return {
                ...it,
                pricingStatusByRow: { ...map, [row.levelIdsKey]: safe },
              };
            })
          : [];

        // Also mirror this status at node level so preview, which primarily
        // reads vendor.nodePricingStatus, immediately reflects inventory
        // rows as Active/Inactive for the corresponding category node.
        const nodeId = String(row.categoryId || row.id);
        const existingNodeMap =
          vendor &&
          vendor.nodePricingStatus &&
          typeof vendor.nodePricingStatus === "object"
            ? vendor.nodePricingStatus
            : {};
        const nextNodeMap = { ...existingNodeMap, [nodeId]: safe };

        await saveDummyInventorySelections(vendorId, categoryId, items);
        await fetch(`${API_BASE_URL}/api/dummy-vendors/${vendorId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-actor-role": "vendor",
            "x-vendor-id": vendorId,
            "x-root-category-id": categoryId,
          },
          body: JSON.stringify({ nodePricingStatus: nextNodeMap }),
        });
        setInvItems(items);
        setVendor((prev) => ({ ...(prev || {}), nodePricingStatus: nextNodeMap }));
      } else {
        // Update nodePricingStatus map on vendor
        const nodeId = String(row.categoryId || row.id);
        const existing =
          vendor && vendor.nodePricingStatus &&
          typeof vendor.nodePricingStatus === "object"
            ? vendor.nodePricingStatus
            : {};
        const nextMap = { ...existing, [nodeId]: safe };
        await fetch(`${API_BASE_URL}/api/dummy-vendors/${vendorId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-actor-role": "vendor",
            "x-vendor-id": vendorId,
            "x-root-category-id": categoryId,
          },
          body: JSON.stringify({ nodePricingStatus: nextMap }),
        });
        setVendor((prev) => ({ ...(prev || {}), nodePricingStatus: nextMap }));
      }
    } catch (e) {
      console.error("Failed to update pricing status", e);
      alert("Failed to update pricing status");
    }
  };

  const saveInventoryRowPrice = async () => {
    if (!rowPriceEdit) return;
    try {
      const entryId = rowPriceEdit.entryId;
      const rowKey = rowPriceEdit.rowKey;
      const priceVal =
        rowPriceEdit.price === "" || rowPriceEdit.price == null
          ? null
          : Number(rowPriceEdit.price);
      if (
        rowPriceEdit.price !== "" &&
        rowPriceEdit.price != null &&
        Number.isNaN(priceVal)
      ) {
        alert("Please enter a valid number for price");
        return;
      }
      setSaving(true);
      const items = Array.isArray(invItems)
        ? invItems.map((it) => {
            if (String(it._id || it.at) !== String(entryId)) return it;
            const currentMap =
              it.pricesByRow && typeof it.pricesByRow === "object"
                ? { ...it.pricesByRow }
                : {};
            currentMap[rowKey] = priceVal;
            return { ...it, pricesByRow: currentMap };
          })
        : [];
      await saveDummyInventorySelections(vendorId, categoryId, items);
      setInvItems(items);
      setRowPriceEdit(null);
    } catch (e) {
      console.error("Failed to save inventory row price", e);
      alert("Failed to save price");
    } finally {
      setSaving(false);
    }
  };

  const getCardTitle = (row) => {
    // Drop the top-level category name (e.g., "Driving School")
    const parts = Array.isArray(row.levels) ? row.levels.slice(1) : [];
    return parts.join(" ~ ");
  };

  if (!vendorId || !categoryId) {
    return <div style={{ padding: 16 }}>Missing vendor or category</div>;
  }

  if (loading) {
    return <div style={{ padding: 16 }}>Loading services...</div>;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "16px 16px 40px",
        background: "#fefcff",
        fontFamily: "Poppins, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => {
            try {
              if (!vendorId || !categoryId) return;
              const base = `/preview/${vendorId}/${categoryId}`;
              // Prefer going back to the My Prices list for this LVL1 if present,
              // otherwise fall back to the main preview page.
              const safeLvl1 = lvl1Id ? encodeURIComponent(String(lvl1Id)) : null;
              const target = safeLvl1
                ? `${base}/my-prices/${safeLvl1}`
                : base;
              router.push(target);
            } catch {
              router.push("/");
            }
          }}
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            marginRight: 8,
            fontSize: 20,
          }}
        >
          ←
        </button>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
          MY INDIVIDUAL SERVICES
        </h2>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          borderRadius: 999,
          background: "#e5e7eb",
          padding: 3,
          marginBottom: 16,
        }}
      >
        {["Active", "Inactive"].map((tab) => {
          const selected = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1,
                border: "none",
                borderRadius: 999,
                padding: "6px 0",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                background: selected ? "#ffffff" : "transparent",
                color: selected ? "#111827" : "#6b7280",
                boxShadow: selected ? "0 2px 6px rgba(0,0,0,0.12)" : "none",
              }}
            >
              {tab}
            </button>
          );
        })}
      </div>

      {visibleRows.length === 0 ? (
        <div style={{ padding: 8, color: "#6b7280", fontSize: 14 }}>
          No services in this tab.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {visibleRows.map((row) => {
            const isEditing = editingId === row.categoryId;
            let priceText;
            if (row.isInventoryRow && row.match) {
              const rowKey = row.levelIdsKey;
              const pbr =
                row.match.pricesByRow &&
                typeof row.match.pricesByRow === "object"
                  ? row.match.pricesByRow
                  : null;
              const rowPrice =
                pbr && Object.prototype.hasOwnProperty.call(pbr, rowKey)
                  ? pbr[rowKey]
                  : row.match.price ?? null;
              priceText =
                rowPrice === undefined || rowPrice === null || rowPrice === "-"
                  ? "—"
                  : `₹${rowPrice}`;
            } else {
              priceText =
                row.price === "-" ||
                row.price === null ||
                row.price === undefined
                  ? "Set price"
                  : `₹${row.price}`;
            }
            const status = String(row.pricingStatus || "Inactive");
            const isActive = status.toLowerCase() === "active";
            return (
              <div
                key={`${row.id}-${row.idx}`}
                style={{
                  background: "#ffffff",
                  borderRadius: 16,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                  overflow: "hidden",
                }}
              >
                <div style={{ display: "flex", padding: 12, gap: 10 }}>
                  <div
                    style={{
                      width: 70,
                      height: 60,
                      borderRadius: 12,
                      background: "#f3f4f6",
                    }}
                  >
                    {row.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={row.image}
                        alt={getCardTitle(row) || "Service"}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          borderRadius: 12,
                        }}
                      />
                    ) : null}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>
                      {row.levels && row.levels.length > 1
                        ? row.levels[1]
                        : row.levels?.[0] || "Service"}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: "#4b5563",
                        marginTop: 2,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {getCardTitle(row)}
                    </div>
                    {row.match && row.match.selections && (() => {
                      try {
                        const blocks = Object.entries(row.match.selections || {}).flatMap(
                          ([fam, fields]) => {
                            const famLower = String(fam || "").toLowerCase();
                            let pairsAll = Object.entries(fields || {}).filter(
                              ([k, v]) => {
                                const fn = String(k)
                                  .toLowerCase()
                                  .replace(/[^a-z0-9]/g, "");
                                return (
                                  fn !== "modelfields" &&
                                  v != null &&
                                  String(v).trim() !== ""
                                );
                              }
                            );
                            if (famLower === "bikes") {
                              const hasBikeBrand = pairsAll.some(
                                ([k]) => String(k).toLowerCase() === "bikebrand"
                              );
                              if (hasBikeBrand) {
                                pairsAll = pairsAll.filter(
                                  ([k]) => String(k).toLowerCase() !== "brand"
                                );
                              }
                            }
                            return pairsAll.map(([k, v]) => ({
                              key: `${fam}:${k}`,
                              label: `${k}:`,
                              value: String(v),
                            }));
                          }
                        );
                        if (!blocks.length) return null;
                        return (
                          <div
                            style={{
                              marginTop: 4,
                              fontSize: 11,
                              color: "#4b5563",
                            }}
                          >
                            {blocks.map((b) => (
                              <div key={b.key}>
                                <span style={{ fontWeight: 600 }}>{b.label} </span>
                                <span>{b.value}</span>
                              </div>
                            ))}
                          </div>
                        );
                      } catch {
                        return null;
                      }
                    })()}
                    
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      justifyContent: "space-between",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#16a34a",
                      }}
                    >
                      {isEditing ? (
                        <input
                          type="number"
                          value={editingPrice}
                          onChange={(e) => setEditingPrice(e.target.value)}
                          style={{ width: 80, fontSize: 13 }}
                        />
                      ) : (
                        priceText
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (isEditing) onSave();
                        else onEdit(row);
                      }}
                      disabled={saving && isEditing}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "#2563eb",
                        fontSize: 12,
                        cursor: "pointer",
                        marginTop: 4,
                      }}
                    >
                      {isEditing ? (saving ? "Saving..." : "Save") : "Edit"}
                    </button>
                    {isEditing && (
                      <button
                        type="button"
                        onClick={onCancel}
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "#6b7280",
                          fontSize: 11,
                          cursor: "pointer",
                          marginTop: 2,
                        }}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
                <div
                  style={{
                    borderTop: "1px solid #e5e7eb",
                    padding: "8px 12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: "#4b5563" }}>
                    {isActive
                      ? "Make this service inactive"
                      : "Make this service active"}
                  </span>
                  <label
                    style={{
                      position: "relative",
                      display: "inline-block",
                      width: 44,
                      height: 24,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) =>
                        toggleStatus(row, e.target.checked ? "Active" : "Inactive")
                      }
                      style={{ display: "none" }}
                    />
                    <span
                      style={{
                        position: "absolute",
                        cursor: "pointer",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: isActive ? "#16a34a" : "#d1d5db",
                        transition: ".2s",
                        borderRadius: 999,
                      }}
                    />
                    <span
                      style={{
                        position: "absolute",
                        left: isActive ? 22 : 2,
                        top: 2,
                        width: 20,
                        height: 20,
                        backgroundColor: "white",
                        borderRadius: "50%",
                        transition: ".2s",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                      }}
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {rowPriceEdit && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: 16,
              padding: 16,
              minWidth: 300,
              maxWidth: "90vw",
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Edit Price</h3>
            <div
              style={{
                fontSize: 12,
                color: "#4b5563",
                marginBottom: 8,
              }}
            >
              <div>
                <strong>Service:</strong> {rowPriceEdit.labels?.category}
              </div>
            </div>
            <input
              type="number"
              placeholder="Price"
              value={rowPriceEdit.price}
              onChange={(e) =>
                setRowPriceEdit((prev) => ({
                  ...(prev || {}),
                  price: e.target.value,
                }))
              }
              style={{
                width: "100%",
                padding: 8,
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                marginBottom: 12,
                fontSize: 14,
              }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button
                type="button"
                onClick={() => setRowPriceEdit(null)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                  fontSize: 13,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveInventoryRowPrice}
                disabled={saving}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "none",
                  background: "#16a34a",
                  color: "#ffffff",
                  fontSize: 13,
                }}
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {sessionExpired && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              width: 280,
              borderRadius: 16,
              background: "#ffffff",
              padding: "20px 16px 12px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
              textAlign: "center",
              fontFamily:
                "Poppins, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
            }}
          >
            <div
              style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}
            >
              Session Expired
            </div>
            <div
              style={{
                fontSize: 14,
                color: "#4b5563",
                marginBottom: 16,
              }}
            >
              Please log in again.
            </div>
            <button
              type="button"
              onClick={() => {
                try {
                  if (vendorId && categoryId) {
                    router.replace(`/preview/${vendorId}/${categoryId}`);
                  } else {
                    router.replace("/");
                  }
                } catch {
                  router.replace("/");
                }
              }}
              style={{
                minWidth: 80,
                padding: "8px 24px",
                borderRadius: 999,
                border: "none",
                background: "#16a34a",
                color: "#ffffff",
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
