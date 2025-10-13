import React, { useState, useEffect } from "react";
import axios from "axios";

export default function CarModelsPage() {
  const [models, setModels] = useState([]);
  const [brands, setBrands] = useState([]);
  const [bodyTypes, setBodyTypes] = useState([]);
  const [fuelTypes, setFuelTypes] = useState([]);
  const [transmissions, setTransmissions] = useState([]);

  const [showModal, setShowModal] = useState(false);
  const [editModel, setEditModel] = useState(null);

  const [form, setForm] = useState({
    category: "car",
    brand: "",
    bodyType: "",
    fuelType: "",
    transmission: "",
    model: "",
    variant: "",
    seats: 4,
  });

  // ---------- FETCH MASTERS ----------
  const fetchMasters = async (type, setter) => {
    try {
      const res = await axios.get("http://localhost:5000/api/masters", {
        params: { type },
      });
      setter(res.data.map((item) => item.name));
    } catch (err) {
      console.error(`Failed to fetch ${type}:`, err);
    }
  };

  // ---------- FETCH CAR MODELS ----------
  const fetchModels = async () => {
    try {
      const res = await axios.get("http://localhost:5000/api/models", {
        params: { category: "car" },
      });
      setModels(res.data);
    } catch (err) {
      console.error("Failed to fetch models:", err);
    }
  };

  // ---------- INITIAL LOAD ----------
  useEffect(() => {
    fetchMasters("brand", setBrands);
    fetchMasters("bodyType", setBodyTypes);
    fetchMasters("fuelType", setFuelTypes);
    fetchMasters("transmission", setTransmissions);
    fetchModels();
  }, []);

  // ---------- SAVE MODEL ----------
  const handleSave = async () => {
    if (!form.brand || !form.model) {
      alert("Brand and Model are required");
      return;
    }

    try {
      const payload = { ...form };
      if (editModel) {
        await axios.put(
          `http://localhost:5000/api/models/${editModel._id}`,
          payload
        );
      } else {
        await axios.post("http://localhost:5000/api/models", payload);
      }

      setShowModal(false);
      setEditModel(null);
      resetForm();
      fetchModels();
    } catch (err) {
      console.error("Failed to save model:", err);
      alert("Error saving model. Check console for details.");
    }
  };

  // ---------- EDIT MODEL ----------
  const handleEdit = (model) => {
    setEditModel(model);
    setForm({
      category: "car",
      brand: model.brand || "",
      bodyType: model.bodyType || "",
      fuelType: model.fuelType || "",
      transmission: model.transmission || "",
      model: model.model || "",
      variant: model.variant || "",
      seats: model.seats || 4,
    });
    setShowModal(true);
  };

  // ---------- DELETE MODEL ----------
  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this model?")) return;
    try {
      await axios.delete(`http://localhost:5000/api/models/${id}`);
      fetchModels();
    } catch (err) {
      console.error("Failed to delete model:", err);
      alert("Error deleting model");
    }
  };

  // ---------- RESET FORM ----------
  const resetForm = () => {
    setForm({
      category: "car",
      brand: "",
      bodyType: "",
      fuelType: "",
      transmission: "",
      model: "",
      variant: "",
      seats: 4,
    });
  };

  return (
    <div style={{ padding: 30 }}>
      <h2 style={{ marginBottom: 16, color: "#00AEEF" }}>Car Models</h2>

      <button
        onClick={() => {
          resetForm();
          setEditModel(null);
          setShowModal(true);
        }}
        style={{
          marginBottom: 20,
          padding: "10px 16px",
          borderRadius: 6,
          background: "#00AEEF",
          color: "#fff",
          border: "none",
          cursor: "pointer",
        }}
      >
        + Add Model
      </button>

      {/* ---------- TABLE ---------- */}
      <div style={{ overflowX: "auto" }}>
        <div
          style={{
            display: "flex",
            fontWeight: "bold",
            borderBottom: "2px solid #ccc",
            paddingBottom: 8,
            gap: 16,
          }}
        >
          <div style={{ minWidth: 120 }}>Brand</div>
          <div style={{ minWidth: 120 }}>Model</div>
          <div style={{ minWidth: 120 }}>Variant</div>
          <div style={{ minWidth: 120 }}>Body Type</div>
          <div style={{ minWidth: 100 }}>Fuel Type</div>
          <div style={{ minWidth: 120 }}>Transmission</div>
          <div style={{ minWidth: 80 }}>Seats</div>
          <div style={{ minWidth: 80 }}>Actions</div>
        </div>

        {models.map((m) => (
          <div
            key={m._id}
            style={{
              display: "flex",
              gap: 16,
              padding: "8px 0",
              borderBottom: "1px solid #eee",
              alignItems: "center",
            }}
          >
            <div style={{ minWidth: 120 }}>{m.brand}</div>
            <div style={{ minWidth: 120 }}>{m.model}</div>
            <div style={{ minWidth: 120 }}>{m.variant || "-"}</div>
            <div style={{ minWidth: 120 }}>{m.bodyType || "-"}</div>
            <div style={{ minWidth: 100 }}>{m.fuelType || "-"}</div>
            <div style={{ minWidth: 120 }}>{m.transmission || "-"}</div>
            <div style={{ minWidth: 80 }}>{m.seats}</div>
            <div style={{ minWidth: 80, display: "flex", gap: 8 }}>
              <span
                style={{ cursor: "pointer", color: "#00AEEF" }}
                onClick={() => handleEdit(m)}
              >
                ✏️
              </span>
              <span
                style={{ cursor: "pointer", color: "red" }}
                onClick={() => handleDelete(m._id)}
              >
                🗑️
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ---------- MODAL ---------- */}
      {showModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 999,
          }}
        >
          <div
            style={{
              background: "#fff",
              padding: 24,
              borderRadius: 12,
              width: 400,
            }}
          >
            <h3>{editModel ? "Edit Car Model" : "Add Car Model"}</h3>

            {/* BRAND */}
            <label>Brand</label>
            <select
              value={form.brand}
              onChange={(e) => setForm({ ...form, brand: e.target.value })}
              style={{ width: "100%", marginBottom: 8 }}
            >
              <option value="">Select</option>
              {brands.map((b, i) => (
                <option key={i} value={b}>{b}</option>
              ))}
            </select>

            {/* BODY TYPE */}
            <label>Body Type</label>
            <select
              value={form.bodyType}
              onChange={(e) => setForm({ ...form, bodyType: e.target.value })}
              style={{ width: "100%", marginBottom: 8 }}
            >
              <option value="">Select</option>
              {bodyTypes.map((b, i) => (
                <option key={i} value={b}>{b}</option>
              ))}
            </select>

            {/* FUEL TYPE */}
            <label>Fuel Type</label>
            <select
              value={form.fuelType}
              onChange={(e) => setForm({ ...form, fuelType: e.target.value })}
              style={{ width: "100%", marginBottom: 8 }}
            >
              <option value="">Select</option>
              {fuelTypes.map((f, i) => (
                <option key={i} value={f}>{f}</option>
              ))}
            </select>

            {/* TRANSMISSION */}
            <label>Transmission</label>
            <select
              value={form.transmission}
              onChange={(e) => setForm({ ...form, transmission: e.target.value })}
              style={{ width: "100%", marginBottom: 8 }}
            >
              <option value="">Select</option>
              {transmissions.map((t, i) => (
                <option key={i} value={t}>{t}</option>
              ))}
            </select>

            {/* MODEL NAME */}
            <label>Model Name</label>
            <input
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              style={{ width: "100%", marginBottom: 8 }}
            />

            {/* VARIANT */}
            <label>Variant</label>
            <input
              value={form.variant}
              onChange={(e) => setForm({ ...form, variant: e.target.value })}
              style={{ width: "100%", marginBottom: 8 }}
            />

            {/* SEATS */}
            <label>Seats</label>
            <input
              type="number"
              min={1}
              max={10}
              value={form.seats}
              onChange={(e) => setForm({ ...form, seats: Number(e.target.value) })}
              style={{ width: "100%", marginBottom: 8 }}
            />

            {/* BUTTONS */}
            <div style={{ textAlign: "right" }}>
              <button
                onClick={() => {
                  setShowModal(false);
                  setEditModel(null);
                  resetForm();
                }}
                style={{ marginRight: 8 }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                style={{
                  background: "#00AEEF",
                  color: "#fff",
                  border: "none",
                  padding: "6px 12px",
                  borderRadius: 4,
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
