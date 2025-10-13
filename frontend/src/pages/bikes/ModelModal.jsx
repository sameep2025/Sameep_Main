import { useState, useEffect } from "react";

export default function ModelModal({ show, onClose, onSave, initialData, brands, bodyTypes }) {
  const [brand, setBrand] = useState("");
  const [bodyType, setBodyType] = useState("");
  const [model, setModel] = useState("");
  const [variant, setVariant] = useState("");
  const [seatType, setSeatType] = useState(1);

  useEffect(() => {
    if (show) {
      setBrand(initialData?.brand || "");
      setBodyType(initialData?.bodyType || "");
      setModel(initialData?.model || "");
      setVariant(initialData?.variant || "");
      setSeatType(initialData?.seats || 1); // ✅ fixed: use seats instead of seatType
    }
  }, [initialData, show]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ ...initialData, brand, bodyType, model, variant, seatType });
  };

  if (!show) return null;

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
      <div style={{ background: "#fff", padding: 30, borderRadius: 12, width: 400 }}>
        <h3>{initialData ? "Edit Model" : "Add Model"}</h3>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 15 }}>
          <label>Brand</label>
          <select value={brand} onChange={(e) => setBrand(e.target.value)} required>
            <option value="">Select Brand</option>
            {brands.map((b) => (
              <option key={b._id} value={b.name}>
                {b.name}
              </option>
            ))}
          </select>

          <label>Body Type</label>
          <select value={bodyType} onChange={(e) => setBodyType(e.target.value)} required>
            <option value="">Select Body Type</option>
            {bodyTypes.map((b) => (
              <option key={b._id} value={b.name}>
                {b.name}
              </option>
            ))}
          </select>

          <label>Model</label>
          <input value={model} onChange={(e) => setModel(e.target.value)} required />

          <label>Variant</label>
          <input value={variant} onChange={(e) => setVariant(e.target.value)} required />

          <label>Seats</label>
          <input
            type="number"
            min={1}
            max={10}
            value={seatType}
            onChange={(e) => setSeatType(e.target.value)}
            required
          />

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}
