import { useState, useEffect } from "react";
import axios from "axios";

// Status Card with edit/delete
function StatusCard({ status, onEdit, onDelete }) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: 16,
        position: "relative",
        background: "#fff",
        width: 220,
        boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
      }}
    >
      <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 8 }}>
        <span style={{ cursor: "pointer", color: "#00AEEF" }} onClick={() => onEdit(status)}>✏️</span>
        <span style={{ cursor: "pointer", color: "red" }} onClick={() => onDelete(status)}>🗑️</span>
      </div>
      <h4 style={{ margin: 0, textAlign: "center" }}>{status.name}</h4>
    </div>
  );
}

// Modal Component
function StatusModal({ show, onClose, onSave, initialData }) {
  const [name, setName] = useState("");

  useEffect(() => {
    // If editing, show the status name, else blank
    setName(initialData?.name || "");
  }, [initialData]);

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
        boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
        animation: "fadeIn 0.3s ease"
      }}>
        <h3 style={{ marginTop: 0, color: "#00AEEF" }}>{initialData ? "Edit Status" : "Create New Status"}</h3>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 15 }}>
          <label style={{ fontWeight: "bold" }}>Status Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Enter status name"
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

export default function StatusPage() {
  const [statuses, setStatuses] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);

  const fetchStatuses = async () => {
    try {
      const res = await axios.get("http://localhost:5000/api/masters", { params: { type: "status" } });
      setStatuses(res.data);
    } catch (err) {
      console.error(err);
      alert("Failed to fetch statuses");
    }
  };

  useEffect(() => {
    fetchStatuses();
  }, []);

  const handleSave = async (data) => {
    try {
      if (data._id) {
        await axios.put(`http://localhost:5000/api/masters/${data._id}`, { name: data.name, sequence: 0 });
      } else {
        await axios.post("http://localhost:5000/api/masters", { name: data.name, type: "status", sequence: 0 });
      }
      fetchStatuses();
      setShowModal(false);
      setEditing(null); // reset after save
    } catch (err) {
      console.error(err);
      alert("Failed to save status");
    }
  };

  const handleDelete = async (status) => {
    if (!window.confirm("Delete this status?")) return;
    try {
      await axios.delete(`http://localhost:5000/api/masters/${status._id}`);
      fetchStatuses();
    } catch (err) {
      console.error(err);
      alert("Failed to delete status");
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
  &gt; Status
</div>

      <h2 style={{ color: "#00AEEF" }}>Status</h2>
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
        + Add Status
      </button>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
        {statuses.map((s) => (
          <StatusCard
            key={s._id}
            status={s}
            onEdit={(s) => { setEditing(s); setShowModal(true); }}
            onDelete={handleDelete}
          />
        ))}
      </div>

      <StatusModal
        show={showModal}
        onClose={() => { setShowModal(false); setEditing(null); }}
        onSave={handleSave}
        initialData={editing}
      />
    </div>
  );
}
