import { useState, useEffect } from "react";
import axios from "axios";

// Card component
// Card component
function CategoryVisibilityCard({ item, onEdit, onDelete }) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 16,
        position: "relative",
        background: "#fff",
        width: 220,
        minHeight: 100,
        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: 8,
        boxSizing: "border-box",
      }}
    >
      {/* Edit/Delete icons */}
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          display: "flex",
          gap: 8,
        }}
      >
        <span
          style={{ cursor: "pointer", color: "#00AEEF", fontSize: 16, lineHeight: 1 }}
          onClick={() => onEdit(item)}
        >
          ✏️
        </span>
        <span
          style={{ cursor: "pointer", color: "red", fontSize: 16, lineHeight: 1 }}
          onClick={() => onDelete(item)}
        >
          🗑️
        </span>
      </div>

      {/* Name */}
      <h4
        style={{
          margin: 0,
          fontSize: 16,
          fontWeight: 600,
          color: "#111",
          textAlign: "center",
          wordBreak: "break-word",
        }}
      >
        {item.name}
      </h4>
    </div>
  );
}


// Modal component
function CategoryVisibilityModal({ show, onClose, onSave, initialData }) {
  const [name, setName] = useState("");

  useEffect(() => {
    if (show) setName(initialData?.name || "");
  }, [initialData, show]);

  if (!show) return null;

  const submit = (e) => {
    e.preventDefault();
    onSave({ ...initialData, name });
  };

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.6)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000
    }}>
      <div style={{
        background: "#fff",
        padding: 30,
        borderRadius: 12,
        width: 400,
        boxShadow: "0 10px 30px rgba(0,0,0,0.3)"
      }}>
        <h3 style={{ marginTop: 0, color: "#00AEEF" }}>
          {initialData ? "Edit Category Visibility" : "Add Category Visibility"}
        </h3>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 15 }}>
          <label style={{ fontWeight: "bold" }}>Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Enter visibility name"
            style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ccc", outline: "none", fontSize: 14 }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button type="button" onClick={onClose} style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "1px solid #ccc",
              background: "#fff",
              cursor: "pointer",
              fontWeight: "bold"
            }}>Cancel</button>
            <button type="submit" style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "none",
              background: "#00AEEF",
              color: "#fff",
              cursor: "pointer",
              fontWeight: "bold"
            }}>Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Main Page
export default function CategoryVisibilityPage() {
  const [items, setItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);

  const fetchItems = async () => {
    try {
      const res = await axios.get("http://localhost:5000/api/masters", { params: { type: "categoryVisibility" } });
      setItems(res.data);
    } catch (err) {
      console.error(err);
      alert("Failed to fetch category visibility items");
    }
  };

  useEffect(() => { fetchItems(); }, []);

  const handleSave = async (data) => {
    try {
      if (data._id) {
        await axios.put(`http://localhost:5000/api/masters/${data._id}`, { name: data.name });
      } else {
        await axios.post("http://localhost:5000/api/masters", { name: data.name, type: "categoryVisibility" });
      }
      fetchItems();
      setShowModal(false);
      setEditing(null);
    } catch (err) {
      console.error(err);
      alert("Failed to save category visibility item");
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm("Delete this item?")) return;
    try {
      await axios.delete(`http://localhost:5000/api/masters/${item._id}`);
      fetchItems();
    } catch (err) {
      console.error(err);
      alert("Failed to delete item");
    }
  };

  return (
    <div style={{ padding: 30 }}>
        <div style={{ marginBottom: 10, fontSize: 14, color: "#555" }}>
  <span
    style={{ cursor: "pointer", color: "#00AEEF" }}
    onClick={() => window.history.back()}
  >
    Go back
  </span>{" "}
  &gt; Category Visibility
</div>
      <h2 style={{ color: "#00AEEF" }}>Category Visibility</h2>
      <button onClick={() => { setEditing(null); setShowModal(true); }} style={{
        background: "#00AEEF",
        color: "#fff",
        border: "none",
        borderRadius: 8,
        padding: "10px 18px",
        cursor: "pointer",
        marginBottom: 20,
        fontWeight: "bold"
      }}>+ Add Category Visibility</button>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
        {items.map((i) => (
          <CategoryVisibilityCard
            key={i._id}
            item={i}
            onEdit={(i) => { setEditing(i); setShowModal(true); }}
            onDelete={handleDelete}
          />
        ))}
      </div>

      <CategoryVisibilityModal
        show={showModal}
        onClose={() => { setShowModal(false); setEditing(null); }}
        onSave={handleSave}
        initialData={editing}
      />
    </div>
  );
}
