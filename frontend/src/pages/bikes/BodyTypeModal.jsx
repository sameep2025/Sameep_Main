import { useState, useEffect } from "react";

export default function BodyTypeModal({ show, onClose, onSave, initialData }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(null);

  useEffect(() => {
    if (show) {
      setName(initialData?.name || "");
      setIcon(null);
    }
  }, [initialData, show]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ ...initialData, name, icon });
  };

  if (!show) return null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ background: "#fff", padding: 30, borderRadius: 12, width: 400 }}>
        <h3>{initialData ? "Edit Body Type" : "Add Body Type"}</h3>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 15 }}>
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
          <label>Icon</label>
          <input type="file" accept="image/*" onChange={(e) => setIcon(e.target.files[0])} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}
