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
  const [showAddonPopup, setShowAddonPopup] = useState(false);
  const [individualAddon, setIndividualAddon] = useState({ heading: "", description: "", buttonLabel: "" });
  const [packagesAddon, setPackagesAddon] = useState({ heading: "", description: "", buttonLabel: "" });
  const [addonForm, setAddonForm] = useState({
    individualHeading: "",
    individualDescription: "",
    individualButtonLabel: "",
    packagesHeading: "",
    packagesDescription: "",
    packagesButtonLabel: "",
  });

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
        if (data.individualAddon && typeof data.individualAddon === 'object') {
          setIndividualAddon({
            heading: data.individualAddon.heading || "",
            description: data.individualAddon.description || "",
            buttonLabel: data.individualAddon.buttonLabel || "",
          });
        } else {
          setIndividualAddon({ heading: "", description: "", buttonLabel: "" });
        }
        if (data.packagesAddon && typeof data.packagesAddon === 'object') {
          setPackagesAddon({
            heading: data.packagesAddon.heading || "",
            description: data.packagesAddon.description || "",
            buttonLabel: data.packagesAddon.buttonLabel || "",
          });
        } else {
          setPackagesAddon({ heading: "", description: "", buttonLabel: "" });
        }
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

      {parentId && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            margin: "20px 0",
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {isTopParentSubcategory && (
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
            )}
            {isTopParentSubcategory && (
              <button
                type="button"
                onClick={() => {
                  setAddonForm({
                    individualHeading: individualAddon.heading || "",
                    individualDescription: individualAddon.description || "",
                    individualButtonLabel: individualAddon.buttonLabel || "",
                    packagesHeading: packagesAddon.heading || "",
                    packagesDescription: packagesAddon.description || "",
                    packagesButtonLabel: packagesAddon.buttonLabel || "",
                  });
                  setShowAddonPopup(true);
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
                Add On Text
              </button>
            )}
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

      {showAddonPopup && (
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
              minWidth: 480,
              maxWidth: "90vw",
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Add On Text</h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 16,
              }}
            >
              <div>
                <h4 style={{ margin: "0 0 8px 0", fontSize: 14 }}>Individual</h4>
                <input
                  type="text"
                  value={addonForm.individualHeading}
                  onChange={(e) =>
                    setAddonForm({ ...addonForm, individualHeading: e.target.value })
                  }
                  placeholder="Heading"
                  style={{
                    width: "100%",
                    padding: 8,
                    borderRadius: 6,
                    border: "1px solid #cbd5e1",
                    marginBottom: 8,
                  }}
                />
                <textarea
                  value={addonForm.individualDescription}
                  onChange={(e) =>
                    setAddonForm({
                      ...addonForm,
                      individualDescription: e.target.value,
                    })
                  }
                  placeholder="Description"
                  rows={3}
                  style={{
                    width: "100%",
                    padding: 8,
                    borderRadius: 6,
                    border: "1px solid #cbd5e1",
                    marginBottom: 8,
                  }}
                />
                <input
                  type="text"
                  value={addonForm.individualButtonLabel}
                  onChange={(e) =>
                    setAddonForm({
                      ...addonForm,
                      individualButtonLabel: e.target.value,
                    })
                  }
                  placeholder="Button label"
                  style={{
                    width: "100%",
                    padding: 8,
                    borderRadius: 6,
                    border: "1px solid #cbd5e1",
                  }}
                />
              </div>
              <div>
                <h4 style={{ margin: "0 0 8px 0", fontSize: 14 }}>Packages</h4>
                <input
                  type="text"
                  value={addonForm.packagesHeading}
                  onChange={(e) =>
                    setAddonForm({ ...addonForm, packagesHeading: e.target.value })
                  }
                  placeholder="Heading"
                  style={{
                    width: "100%",
                    padding: 8,
                    borderRadius: 6,
                    border: "1px solid #cbd5e1",
                    marginBottom: 8,
                  }}
                />
                <textarea
                  value={addonForm.packagesDescription}
                  onChange={(e) =>
                    setAddonForm({
                      ...addonForm,
                      packagesDescription: e.target.value,
                    })
                  }
                  placeholder="Description"
                  rows={3}
                  style={{
                    width: "100%",
                    padding: 8,
                    borderRadius: 6,
                    border: "1px solid #cbd5e1",
                    marginBottom: 8,
                  }}
                />
                <input
                  type="text"
                  value={addonForm.packagesButtonLabel}
                  onChange={(e) =>
                    setAddonForm({
                      ...addonForm,
                      packagesButtonLabel: e.target.value,
                    })
                  }
                  placeholder="Button label"
                  style={{
                    width: "100%",
                    padding: 8,
                    borderRadius: 6,
                    border: "1px solid #cbd5e1",
                  }}
                />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <button
                type="button"
                onClick={() => setShowAddonPopup(false)}
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
                  if (!parentId) return;
                  try {
                    const fd = new FormData();
                    fd.append("individualAddonHeading", addonForm.individualHeading || "");
                    fd.append("individualAddonDescription", addonForm.individualDescription || "");
                    fd.append("individualAddonButtonLabel", addonForm.individualButtonLabel || "");
                    fd.append("packagesAddonHeading", addonForm.packagesHeading || "");
                    fd.append("packagesAddonDescription", addonForm.packagesDescription || "");
                    fd.append("packagesAddonButtonLabel", addonForm.packagesButtonLabel || "");

                    await fetch(`${API_BASE_URL}/api/dummy-categories/${parentId}`, {
                      method: "PUT",
                      body: fd,
                    });

                    setIndividualAddon({
                      heading: addonForm.individualHeading || "",
                      description: addonForm.individualDescription || "",
                      buttonLabel: addonForm.individualButtonLabel || "",
                    });
                    setPackagesAddon({
                      heading: addonForm.packagesHeading || "",
                      description: addonForm.packagesDescription || "",
                      buttonLabel: addonForm.packagesButtonLabel || "",
                    });
                    setShowAddonPopup(false);
                  } catch (e) {
                    alert(e?.message || "Failed to save add-on text");
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