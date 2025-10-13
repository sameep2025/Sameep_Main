import { useState, useEffect } from "react";
import axios from "axios";

// Card for each signup level
function SignupLevelCard({ level, onEdit, onDelete }) {
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
      }}
    >
      <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 8 }}>
        <span style={{ cursor: "pointer", color: "#00AEEF", fontSize: 16 }} onClick={() => onEdit(level)}>✏️</span>
        <span style={{ cursor: "pointer", color: "red", fontSize: 16 }} onClick={() => onDelete(level)}>🗑️</span>
      </div>
      <h4 style={{ margin: 0, fontWeight: 600, textAlign: "center" }}>{level.name}</h4>
    </div>
  );
}


// Modal for Add/Edit
function SignupLevelModal({ show, onClose, onSave, initialData }) {
  const [name, setName] = useState("");

  // Reset input whenever modal opens
  useEffect(() => {
    if (show) setName(initialData?.name || ""); // blank for new
  }, [initialData, show]);

  if (!show) return null;

  const submit = (e) => {
    e.preventDefault();
    onSave({ ...initialData, name });
    onClose(); // close modal after save
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
        <h3 style={{ marginTop: 0, color: "#00AEEF" }}>{initialData ? "Edit Signup Level" : "Add Signup Level"}</h3>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 15 }}>
          <label style={{ fontWeight: "bold" }}>Level Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Enter level name"
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              border: "1px solid #ccc",
              outline: "none",
              fontSize: 14
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                border: "1px solid #ccc",
                background: "#fff",
                cursor: "pointer",
                fontWeight: "bold"
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                border: "none",
                background: "#00AEEF",
                color: "#fff",
                cursor: "pointer",
                fontWeight: "bold"
              }}
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Main Signup Level Page
export default function SignupLevelPage() {
  const [levels, setLevels] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);

  const fetchLevels = async () => {
    try {
      const res = await axios.get("http://localhost:5000/api/masters", { params: { type: "signupLevel" } });
      setLevels(res.data);
    } catch (err) {
      console.error(err);
      alert("Failed to fetch signup levels");
    }
  };

  useEffect(() => {
    fetchLevels();
  }, []);

  const handleSave = async (data) => {
    try {
      if (data._id) {
        await axios.put(`http://localhost:5000/api/masters/${data._id}`, { name: data.name, sequence: 0 });
      } else {
        await axios.post("http://localhost:5000/api/masters", { name: data.name, type: "signupLevel", sequence: 0 });
      }
      fetchLevels();
      setEditing(null);
    } catch (err) {
      console.error(err);
      alert("Failed to save signup level");
    }
  };

  const handleDelete = async (level) => {
    if (!window.confirm("Delete this level?")) return;
    try {
      await axios.delete(`http://localhost:5000/api/masters/${level._id}`);
      fetchLevels();
    } catch (err) {
      console.error(err);
      alert("Failed to delete level");
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
  &gt; Vendor Signup Levels
</div>
      <h2 style={{ color: "#00AEEF" }}>Vendor Signup Levels</h2>
      <button
        onClick={() => { setEditing(null); setShowModal(true); }}
        style={{
          background: "#00AEEF",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "10px 18px",
          cursor: "pointer",
          marginBottom: 20,
          fontWeight: "bold"
        }}
      >
        + Add Signup Level
      </button>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
        {levels.map((l) => (
          <SignupLevelCard
            key={l._id}
            level={l}
            onEdit={(l) => { setEditing(l); setShowModal(true); }}
            onDelete={handleDelete}
          />
        ))}
      </div>

      <SignupLevelModal
        show={showModal}
        onClose={() => { setShowModal(false); setEditing(null); }}
        onSave={handleSave}
        initialData={editing}
      />
    </div>
  );
}
