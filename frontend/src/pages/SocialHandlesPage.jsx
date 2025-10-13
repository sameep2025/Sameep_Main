import { useState, useEffect } from "react";
import axios from "axios";

// Card component
function SocialHandleCard({ handle, onEdit, onDelete }) {
  const imageSrc = handle.imageUrl
    ? handle.imageUrl.startsWith("http")
      ? handle.imageUrl
      : `http://localhost:5000${handle.imageUrl}`
    : null;

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
        alignItems: "center",
        gap: 10,
      }}
    >
      <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 6 }}>
        <span style={{ cursor: "pointer", color: "#00AEEF", fontSize: 16 }} onClick={() => onEdit(handle)}>✏️</span>
        <span style={{ cursor: "pointer", color: "red", fontSize: 16 }} onClick={() => onDelete(handle)}>🗑️</span>
      </div>
      {imageSrc ? (
        <img src={imageSrc} alt={handle.name || "icon"} style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }} />
      ) : (
        <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#ccc", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "#fff" }}>?</div>
      )}
      <h4 style={{ margin: 0, fontWeight: 600 }}>{handle.name}</h4>
    </div>
  );
}


// Modal for Add/Edit
function SocialHandleModal({ show, onClose, onSave, initialData }) {
  const [name, setName] = useState("");
  const [file, setFile] = useState(null);

  useEffect(() => {
    if (show) {
      setName(initialData?.name || "");
      // Show existing image with full URL if editing
      setFile(
        initialData?.imageUrl
          ? initialData.imageUrl.startsWith("http")
            ? initialData.imageUrl
            : `http://localhost:5000${initialData.imageUrl}`
          : null
      );
    }
  }, [initialData, show]);

  if (!show) return null;

  const submit = (e) => {
    e.preventDefault();
    onSave({ ...initialData, name, file });
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: "#fff",
          padding: 30,
          borderRadius: 12,
          width: 400,
          boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
        }}
      >
        <h3 style={{ marginTop: 0, color: "#00AEEF" }}>
          {initialData ? "Edit Social Handle" : "Add Social Handle"}
        </h3>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 15 }}>
          <label style={{ fontWeight: "bold" }}>Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Enter social handle name"
            style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ccc", outline: "none" }}
          />
          <label style={{ fontWeight: "bold" }}>Upload Image</label>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files[0])}
            style={{ padding: "4px 0" }}
          />
          {/* Preview existing image */}
          {file && typeof file === "string" && (
            <img
              src={file}
              alt={name}
              style={{ marginTop: 8, width: 80, height: 80, objectFit: "cover", borderRadius: 8 }}
            />
          )}
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
                fontWeight: "bold",
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
                fontWeight: "bold",
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

// Main Page
export default function SocialHandlesPage() {
  const [handles, setHandles] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);

  const fetchHandles = async () => {
    try {
      const res = await axios.get("http://localhost:5000/api/masters", {
        params: { type: "socialHandle" },
      });
      setHandles(res.data);
    } catch (err) {
      console.error(err);
      alert("Failed to fetch social handles");
    }
  };

  useEffect(() => {
    fetchHandles();
  }, []);

  const handleSave = async (data) => {
    try {
      const formData = new FormData();
      formData.append("name", data.name);
      formData.append("type", "socialHandle");
      formData.append("sequence", 0);
      if (data.file instanceof File) {
        formData.append("image", data.file);
      }

      if (data._id) {
        await axios.put(`http://localhost:5000/api/masters/${data._id}`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      } else {
        await axios.post("http://localhost:5000/api/masters", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }

      fetchHandles();
      setShowModal(false);
      setEditing(null);
    } catch (err) {
      console.error(err);
      alert("Failed to save social handle");
    }
  };

  const handleDelete = async (handle) => {
    if (!window.confirm("Delete this handle?")) return;
    try {
      await axios.delete(`http://localhost:5000/api/masters/${handle._id}`);
      fetchHandles();
    } catch (err) {
      console.error(err);
      alert("Failed to delete handle");
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
  &gt; Social Handles
</div>
      <h2 style={{ color: "#00AEEF" }}>Social Handles</h2>
      <button
        onClick={() => {
          setEditing(null);
          setShowModal(true);
        }}
        style={{
          background: "#00AEEF",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "10px 18px",
          cursor: "pointer",
          marginBottom: 20,
          fontWeight: "bold",
        }}
      >
        + Add Social Handle
      </button>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 16,
        }}
      >
        {handles.map((h) => (
          <SocialHandleCard
            key={h._id}
            handle={h}
            onEdit={(h) => {
              setEditing(h);
              setShowModal(true);
            }}
            onDelete={handleDelete}
          />
        ))}
      </div>

      <SocialHandleModal
        show={showModal}
        onClose={() => {
          setShowModal(false);
          setEditing(null);
        }}
        onSave={handleSave}
        initialData={editing}
      />
    </div>
  );
}
