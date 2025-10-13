import React, { useState, useEffect } from "react";
import axios from "axios";

function FuelTypeCard({ item, onEdit, onDelete }) {
  const imageSrc = item.imageUrl
    ? item.imageUrl.startsWith("http")
      ? item.imageUrl
      : `http://localhost:5000${item.imageUrl}`
    : null;

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 16,
        display: "flex",
        alignItems: "center",
        gap: 16,
        background: "#fff",
        position: "relative",
        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
        minHeight: 100,
      }}
    >
      <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 6 }}>
        <span style={{ cursor: "pointer", color: "#00AEEF" }} onClick={() => onEdit(item)}>✏️</span>
        <span style={{ cursor: "pointer", color: "red" }} onClick={() => onDelete(item)}>🗑️</span>
      </div>
      {imageSrc ? (
        <img
          src={imageSrc}
          alt={item.name}
          style={{ width: 100, height: 100, objectFit: "contain", borderRadius: 12 }}
        />
      ) : (
        <div
          style={{
            width: 100,
            height: 100,
            borderRadius: 12,
            background: "#ccc",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 36,
            color: "#fff",
          }}
        >
          ?
        </div>
      )}
      <h4 style={{ margin: 0 }}>{item.name}</h4>
    </div>
  );
}

export default function FuelTypePage() {
  const [items, setItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ name: "", file: null, preview: null });
  const TYPE = "fuelType";

  const fetchItems = async () => {
    try {
      const res = await axios.get(`http://localhost:5000/api/masters?type=${TYPE}`);
      setItems(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => { fetchItems(); }, []);

  const handleSave = async () => {
    if (!form.name) return alert("Enter name");

    const formData = new FormData();
    formData.append("name", form.name);
    formData.append("type", TYPE);
    if (form.file) formData.append("image", form.file);

    try {
      if (editItem) {
        await axios.put(`http://localhost:5000/api/masters/${editItem._id}`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      } else {
        await axios.post("http://localhost:5000/api/masters", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }
      setShowModal(false);
      setEditItem(null);
      setForm({ name: "", file: null, preview: null });
      fetchItems();
    } catch (err) {
      console.error(err);
    }
  };

  const handleEdit = (item) => {
    setEditItem(item);
    setForm({
      name: item.name,
      file: null,
      preview: item.imageUrl ? (item.imageUrl.startsWith("http") ? item.imageUrl : `http://localhost:5000${item.imageUrl}`) : null,
    });
    setShowModal(true);
  };

  const handleDelete = async (item) => {
    if (!window.confirm("Delete this fuel type?")) return;
    try {
      await axios.delete(`http://localhost:5000/api/masters/${item._id}`);
      fetchItems();
    } catch (err) {
      console.error(err);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) setForm({ ...form, file, preview: URL.createObjectURL(file) });
  };

  return (
    <div style={{ padding: 30 }}>
      <h2 style={{ color: "#00AEEF" }}>Fuel Types</h2>
      <button
        onClick={() => { setShowModal(true); setEditItem(null); setForm({ name: "", file: null, preview: null }); }}
        style={{ marginBottom: 20, background: "#00AEEF", color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", cursor: "pointer" }}
      >
        + Add Fuel Type
      </button>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 16 }}>
        {items.map((b) => (
          <FuelTypeCard key={b._id} item={b} onEdit={handleEdit} onDelete={handleDelete} />
        ))}
      </div>

      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 }}>
          <div style={{ background: "#fff", padding: 30, borderRadius: 12, width: 400 }}>
            <h3 style={{ marginTop: 0 }}>{editItem ? "Edit Fuel Type" : "Add Fuel Type"}</h3>
            <input
              type="text"
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              style={{ width: "100%", padding: 8, marginBottom: 10, borderRadius: 6, border: "1px solid #ccc" }}
            />
            <input type="file" onChange={handleFileChange} style={{ marginBottom: 10 }} />
            {form.preview && (
              <img
                src={form.preview}
                alt="preview"
                style={{ width: 100, height: 100, objectFit: "contain", marginBottom: 10, borderRadius: 12 }}
              />
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => { setShowModal(false); setEditItem(null); setForm({ name: "", file: null, preview: null }); }} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #ccc", cursor: "pointer" }}>Cancel</button>
              <button onClick={handleSave} style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: "#00AEEF", color: "#fff", cursor: "pointer" }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
