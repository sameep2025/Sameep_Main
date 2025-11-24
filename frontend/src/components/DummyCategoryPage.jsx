import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import DummyCategoryList from "./DummyCategoryList";
import DummyManageCombosModal from "./DummyManageCombosModal";
import API_BASE_URL from "../config";

function DummyCategoryPage() {
  const { parentId } = useParams();
  const navigate = useNavigate();
  const [showCombos, setShowCombos] = useState(false);
  const [combos, setCombos] = useState([]);
  const [combosLoading, setCombosLoading] = useState(false);
  const [combosError, setCombosError] = useState("");
  const [editingCombo, setEditingCombo] = useState(null);
  const [viewMode, setViewMode] = useState("individual"); // 'individual' | 'packages'
  const [isTopParentSubcategory, setIsTopParentSubcategory] = useState(false);
  const [parentSelectorLabel, setParentSelectorLabel] = useState("");
  const [showLabelPopup, setShowLabelPopup] = useState(false);
  const [labelInput, setLabelInput] = useState("");

  const toAbs = (u) => {
    if (!u) return "";
    let s = String(u).trim();
    s = s.replace(/\\/g, "/");
    if (/^https?:\/\//i.test(s)) return s;
    s = s.replace(/^\.\//, "");
    s = s.replace(/^\//, "");
    const upIdx = s.toLowerCase().indexOf("uploads/");
    if (upIdx >= 0) s = s.substring(upIdx + "uploads/".length);
    return `${API_BASE_URL}/uploads/${s}`;
  };

  const loadCombos = async () => {
    if (!parentId) return;
    setCombosLoading(true);
    setCombosError("");
    try {
      let res = await fetch(`${API_BASE_URL}/api/dummy-combos/byParent/${parentId}`);
      let data;
      if (res.ok) {
        data = await res.json();
      } else {
        res = await fetch(`${API_BASE_URL}/api/dummy-combos?parentCategoryId=${parentId}`);
        data = await res.json();
      }
      let arr = Array.isArray(data) ? data : [];
      if (arr.length === 0) {
        try {
          const allRes = await fetch(`${API_BASE_URL}/api/dummy-combos`);
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
      if (!parentId) {
        setIsTopParentSubcategory(false);
        return;
      }
      try {
        const res = await fetch(`${API_BASE_URL}/api/dummy-categories/${parentId}`);
        if (!res.ok) {
          setIsTopParentSubcategory(false);
          return;
        }
        const data = await res.json();
        const hasParent = Boolean(data?.parent || data?.parentId);
        setIsTopParentSubcategory(!hasParent);
        setParentSelectorLabel(typeof data.parentSelectorLabel === 'string' ? data.parentSelectorLabel : "");
      } catch {
        setIsTopParentSubcategory(false);
        setParentSelectorLabel("");
      }
    };
    checkTop();
  }, [parentId]);

  return (
    <div>
      <h1 style={{ margin: "4px 0 8px 0", fontSize: "22px", fontWeight: "700" }}>
        {parentId ? "Dummy Subcategories" : "Dummy Categories"}
      </h1>

      {parentId && isTopParentSubcategory && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            margin: "20px 0",
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                border: "1px solid #e5e7eb",
                padding: 4,
                borderRadius: 8,
              }}
            >
              <button
                onClick={() => setViewMode("individual")}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "none",
                  background: viewMode === "individual" ? "#0ea5e9" : "transparent",
                  color: viewMode === "individual" ? "#fff" : "#0f172a",
                  fontWeight: 600,
                }}
              >
                Individual
              </button>
              <button
                onClick={() => setViewMode("packages")}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "none",
                  background: viewMode === "packages" ? "#0ea5e9" : "transparent",
                  color: viewMode === "packages" ? "#fff" : "#0f172a",
                  fontWeight: 600,
                }}
              >
                Packages
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setLabelInput(parentSelectorLabel || "");
                setShowLabelPopup(true);
              }}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "none",
                background: "#4b5563",
                color: "#fff",
                fontWeight: 600,
              }}
            >
              Add Label
            </button>
          </div>
        </div>
      )}

      {(!parentId || viewMode === "individual") && (
        <DummyCategoryList
          parentId={parentId || null}
          onManageCombosClick={() => setShowCombos(true)}
          showManageCombosButton={parentId && isTopParentSubcategory}
        />
      )}

      {parentId && viewMode === "packages" && (
        <div style={{ marginTop: 12 }}>
          {combosLoading ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  style={{
                    border: "1px solid #eee",
                    borderRadius: 10,
                    padding: 10,
                    background: "#fafafa",
                    height: 70,
                  }}
                />
              ))}
            </div>
          ) : combosError ? (
            <div
              style={{
                color: "#991b1b",
                background: "#fee2e2",
                border: "1px solid #fecaca",
                padding: 10,
                borderRadius: 8,
              }}
            >
              {combosError}
            </div>
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
              <div style={{ color: "#334155" }}>
                No packages have been created for this subcategory yet.
              </div>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: "16px",
              }}
            >
              {combos.map((c) => {
                const cid = c._id?.$oid || c._id || c.id;
                return (
                  <div
                    key={cid}
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: 12,
                      background: "#ffffff",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                      overflow: "hidden",
                      cursor: "pointer",
                    }}
                    onClick={() => navigate(`/combos/${cid}`)}
                  >
                    <div style={{ position: "relative", width: "100%", height: 120 }}>
                      {c.iconUrl || c.imageUrl ? (
                        <img
                          src={toAbs(c.iconUrl || c.imageUrl)}
                          alt={c.name}
                          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : null}
                      <div style={{ position: "absolute", left: 10, bottom: 10, color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}>
                        <div style={{ fontWeight: 700, fontSize: 18 }}>{c.name}</div>
                        <div style={{ fontWeight: 500, opacity: 0.95 }}>{typeof c.basePrice === "number" ? `₹${c.basePrice} onWards` : ""}</div>
                      </div>
                    </div>
                    <div style={{ borderTop: "1px solid #e2e8f0", padding: "8px 12px", display: "flex", justifyContent: "flex-end", gap: 8 }}>
                      <button
                        title="Edit"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingCombo(c);
                          setShowCombos(true);
                        }}
                        style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 6, background: "#fff", color: "#0ea5e9", cursor: "pointer", fontWeight: 600 }}
                      >
                        ✏️
                      </button>
                      <button
                        title="Delete"
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!window.confirm("Delete this combo?")) return;
                          try {
                            const delId = c._id?.$oid || c._id || c.id;
                            const res = await fetch(`${API_BASE_URL}/api/dummy-combos/${delId}`, { method: "DELETE" });
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

      <DummyManageCombosModal
        show={Boolean(showCombos && parentId)}
        onClose={() => {
          setShowCombos(false);
          setEditingCombo(null);
          loadCombos();
        }}
        subcategoryId={parentId || null}
        initialEditingCombo={editingCombo}
        onSaved={() => loadCombos()}
      />

      {showLabelPopup && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1400,
          }}
        >
          <div
            style={{
              background: "#fff",
              padding: 16,
              borderRadius: 10,
              minWidth: 320,
              maxWidth: "90vw",
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Parent selector label</h3>
            <input
              type="text"
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              placeholder="e.g., Select course type"
              style={{
                width: "100%",
                padding: 8,
                borderRadius: 6,
                border: "1px solid #cbd5e1",
                marginBottom: 12,
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowLabelPopup(false)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    if (!parentId) return;
                    const val = String(labelInput || "");
                    await fetch(`${API_BASE_URL}/api/dummy-categories/${parentId}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ parentSelectorLabel: val }),
                    });
                    setParentSelectorLabel(val);
                    setShowLabelPopup(false);
                  } catch (e) {
                    alert(e?.message || "Failed to save label");
                  }
                }}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "none",
                  background: "#16a34a",
                  color: "#fff",
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default DummyCategoryPage;