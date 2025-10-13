import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import CategoryCard from "./CategoryCard";
import CreateCategoryModal from "./CreateCategoryModal";

function CategoryList({ parentId = null }) {
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


  // 🔹 handleCreated refresh
  const handleCreated = () => setRefresh((prev) => !prev);

  // 🔹 Fetch categories
  // fetch categories & breadcrumb
const fetchCategories = useCallback(async () => {
  try {
    const params = parentId !== null ? { parentId } : { parentId: null };
    const res = await axios.get("http://localhost:5000/api/categories", { params });
    setCategories(res.data);

    // breadcrumb
    const crumbs = [];
    let currentId = parentId;
    while (currentId) {
      const catRes = await axios.get(`http://localhost:5000/api/categories/${currentId}`);
      crumbs.unshift({ id: catRes.data._id, name: catRes.data.name });
      setParentEnableFreeText(catRes.data.enableFreeText); // ✅ important
      currentId = catRes.data.parent;
    }
    setBreadcrumb(crumbs);
  } catch (err) {
    console.error(err);
  }
}, [parentId, refresh]);


  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // 🔹 Open create modal (ensure parentCategoryType is correct)
  const handleOpenModal = async () => {
  let parentType = null;
  if (parentId) {
    try {
      const res = await axios.get(`http://localhost:5000/api/categories/${parentId}`);
      parentType = res.data.categoryType;
      // ❌ wrong: parentEnableFreeText = res.data.enableFreeText;
      setParentEnableFreeText(res.data.enableFreeText); // ✅ correct
    } catch (err) {
      console.error(err);
    }
  }
  setSelectedParentId(parentId || null);
  setSelectedParentType(parentType);
  setModalOpen(true);
};



  const handleEdit = async (category) => {
  let parentType = null;
  let enableFreeText = false;

  if (category.parent) {
    try {
      const res = await axios.get(`http://localhost:5000/api/categories/${category.parent}`);
      parentType = res.data.categoryType;
      enableFreeText = res.data.enableFreeText;
    } catch (err) {
      console.error(err);
    }
  }

  setEditing({ ...category, parentCategoryType: parentType });
  setParentEnableFreeText(enableFreeText);
  setEditModalOpen(true);
};


  const handleDelete = async (category) => {
    if (!window.confirm(`Delete "${category.name}" and its subcategories?`)) return;
    try {
      await axios.delete(`http://localhost:5000/api/categories/${category._id}`);
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
        <div style={{ marginBottom: 12, fontWeight: "bold", fontSize: 14 }}>
          <span style={{ cursor: "pointer" }} onClick={() => navigate("/categories")}>
            Categories
          </span>
          {breadcrumb.map((b) => (
            <span key={b.id}>
              {" "} &gt;{" "}
              <span
                style={{ cursor: "pointer", textDecoration: "underline" }}
                onClick={() => navigate(`/categories/${b.id}`)}
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
      </div>

      {/* Modals */}
      <CreateCategoryModal
        show={modalOpen}
        onClose={() => setModalOpen(false)}
        parentId={selectedParentId}
        parentCategoryType={selectedParentType}
        parentEnableFreeText={parentEnableFreeText}
        onCreated={handleCreated}
      />
      {editing && (
  <CreateCategoryModal
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
          <CategoryCard
            key={cat._id}
            category={cat}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  );
}

export default CategoryList;
