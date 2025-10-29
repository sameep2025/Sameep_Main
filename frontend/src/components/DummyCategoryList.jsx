import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import DummyCreateCategoryModal from "./DummyCreateCategoryModal";
import DummyCategoryCard from "./DummyCategoryCard";

function DummyCategoryList({ parentId = null, onManageCombosClick, showManageCombosButton }) {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [refresh, setRefresh] = useState(false);
  const [breadcrumb, setBreadcrumb] = useState([]);
  const [selectedParentId, setSelectedParentId] = useState(null);
  const [selectedParentType, setSelectedParentType] = useState(null);
  const [parentEnableFreeText, setParentEnableFreeText] = useState(false);

  // 🔹 Refresh on create
  const handleCreated = () => setRefresh((prev) => !prev);

  // 🔹 Fetch categories + breadcrumb
  const fetchCategories = useCallback(async () => {
    try {
      const params = parentId !== null ? { parentId } : { parentId: null };
      const res = await axios.get("http://localhost:5000/api/dummy-categories", { params });
      setCategories(res.data);

      // Breadcrumb + parent logic
      const crumbs = [];
      let currentId = parentId;
      let first = true;
      while (currentId) {
        const catRes = await axios.get(`http://localhost:5000/api/dummy-categories/${currentId}`);
        const cat = catRes.data;
        crumbs.unshift({ id: cat._id, name: cat.name });
        setParentEnableFreeText(cat.enableFreeText);
        if (first) first = false;
        currentId = cat.parent;
      }
      setBreadcrumb(crumbs);
    } catch (err) {
      console.error(err);
      alert("Failed to fetch dummy categories");
    }
  }, [parentId, refresh]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // 🔹 Open Create Modal (get parent type)
  const handleOpenModal = async () => {
    let parentType = null;
    if (parentId) {
      try {
        const res = await axios.get(`http://localhost:5000/api/dummy-categories/${parentId}`);
        parentType = res.data.categoryType;
        setParentEnableFreeText(res.data.enableFreeText);
      } catch (err) {
        console.error(err);
      }
    }
    setSelectedParentId(parentId || null);
    setSelectedParentType(parentType);
    setModalOpen(true);
  };

  // 🔹 Handle Edit
  const handleEdit = async (category) => {
    let parentType = null;
    let enableFreeText = false;
    try {
      // Always fetch the fresh subcategory document to avoid mixing parent fields
      const current = await axios.get(`http://localhost:5000/api/dummy-categories/${category._id}`);
      const item = current.data || category;

      if (item.parent) {
        try {
          const pres = await axios.get(`http://localhost:5000/api/dummy-categories/${item.parent}`);
          parentType = pres.data?.categoryType || null;
          enableFreeText = Boolean(pres.data?.enableFreeText);
        } catch (err) {
          console.error(err);
        }
      }

      setEditing({ ...item, parentCategoryType: parentType });
      setParentEnableFreeText(enableFreeText);
      setEditModalOpen(true);
    } catch (err) {
      console.error(err);
      alert("Failed to open edit");
    }
  };

  // 🔹 Handle Delete
  const handleDelete = async (category) => {
    if (!window.confirm(`Delete "${category.name}" and its subcategories?`)) return;
    try {
      await axios.delete(`http://localhost:5000/api/dummy-categories/${category._id}`);
      setRefresh((prev) => !prev);
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || "Failed to delete");
    }
  };

  return (
    <div>
      {/* Breadcrumb */}
      {breadcrumb.length > 0 && (
        <div style={{ marginBottom: 6, fontWeight: "bold", fontSize: 14 }}>
          <span style={{ cursor: "pointer" }} onClick={() => navigate("/dummy-categories")}>
            Categories
          </span>
          {breadcrumb.map((b) => (
            <span key={b.id}>
              {" "} &gt;{" "}
              <span
                style={{ cursor: "pointer", textDecoration: "underline" }}
                onClick={() => navigate(`/dummy-categories/${b.id}`)}
              >
                {b.name}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Buttons */}
      <div style={{ marginBottom: 12, display: "flex", gap: "10px" }}>
        {parentId && (
          <button
            onClick={() => navigate(-1)}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "none",
              background: "#fff",
              color: "#333",
              cursor: "pointer",
              fontWeight: "bold",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            }}
          >
            ⬅ Back
          </button>
        )}

        <button
          onClick={handleOpenModal}
          style={{
            padding: "8px 16px",
            borderRadius: "8px",
            border: "none",
            background: "#00AEEF",
            color: "#fff",
            cursor: "pointer",
            fontWeight: "bold",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
          }}
        >
          {parentId ? "+ Create Subcategory" : "+ Create Category"}
        </button>

        {showManageCombosButton && (
          <button
            onClick={onManageCombosClick}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "none",
              background: "#0ea5e9",
              color: "#fff",
              cursor: "pointer",
              fontWeight: "bold",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            }}
          >
            Manage Combos
          </button>
        )}
      </div>

      {/* Modals */}
      <DummyCreateCategoryModal
        show={modalOpen}
        onClose={() => setModalOpen(false)}
        parentId={selectedParentId}
        parentCategoryType={selectedParentType}
        parentEnableFreeText={parentEnableFreeText}
        onCreated={handleCreated}
      />

      {editing && (
        <DummyCreateCategoryModal
          show={editModalOpen}
          onClose={() => {
            setEditModalOpen(false);
            setEditing(null);
          }}
          onCreated={() => {
            setEditModalOpen(false);
            setEditing(null);
            setRefresh((prev) => !prev);
          }}
          initialData={editing}
          parentId={editing?.parent || null}
          parentCategoryType={editing?.parentCategoryType || null}
        />
      )}

      {/* Category Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: "16px",
          marginTop: "20px",
        }}
      >
        {categories.map((cat) => (
          <DummyCategoryCard key={cat._id} category={cat} onEdit={handleEdit} onDelete={handleDelete} />
        ))}
      </div>
    </div>
  );
}

export default DummyCategoryList;
