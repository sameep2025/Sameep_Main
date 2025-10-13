import React, { useState, useEffect } from "react";
import axios from "axios";

export default function ModelPage() {
  const [showModal, setShowModal] = useState(false);
  const [models, setModels] = useState([]);

  const [brands, setBrands] = useState([]);
  const [fuels, setFuels] = useState([]);
  const [transmissions, setTransmissions] = useState([]);
  const [bodies, setBodies] = useState([]);

  const [form, setForm] = useState({
    brand: "",
    fuelType: "",
    transmission: "",
    bodyType: "",
    model: "",
    variant: "",
    seats: 4,
  });

  // Fetch master data dynamically
  useEffect(() => {
    const fetchMasterData = async () => {
      try {
        const [brandRes, fuelRes, transRes, bodyRes] = await Promise.all([
          axios.get("/api/master?type=brand"),
          axios.get("/api/master?type=fuelType"),
          axios.get("/api/master?type=transmissionType"),
          axios.get("/api/master?type=bodyType"),
        ]);

        setBrands(brandRes.data.map((b) => b.name));
        setFuels(fuelRes.data.map((f) => f.name));
        setTransmissions(transRes.data.map((t) => t.name));
        setBodies(bodyRes.data.map((b) => b.name));
      } catch (err) {
        console.error(err);
      }
    };
    fetchMasterData();
  }, []);

  // Fetch existing models from backend (optional)
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await axios.get("/api/models");
        setModels(res.data);
      } catch (err) {
        console.error(err);
      }
    };
    fetchModels();
  }, []);

  const handleSave = async () => {
    if (!form.model || !form.brand) return alert("Brand and model are required");
    try {
      const res = await axios.post("/api/models", form);
      setModels([...models, res.data]);
      setForm({
        brand: "",
        fuelType: "",
        transmission: "",
        bodyType: "",
        model: "",
        variant: "",
        seats: 4,
      });
      setShowModal(false);
    } catch (err) {
      console.error(err);
      alert("Error saving model");
    }
  };

  return (
    <div style={{ padding: 40 }}>
      <h2>Models</h2>
      <button
        style={{
          background: "#00AEEF",
          color: "#fff",
          border: "none",
          padding: "10px 16px",
          borderRadius: 6,
          cursor: "pointer",
        }}
        onClick={() => setShowModal(true)}
      >
        + Add Model
      </button>

      <div style={{ marginTop: 20 }}>
        {models.map((m, i) => (
          <div
            key={i}
            style={{
              border: "1px solid #ddd",
              padding: 10,
              borderRadius: 8,
              marginBottom: 10,
            }}
          >
            <strong>{m.model}</strong> - {m.variant} ({m.brand}) | {m.fuelType}, {m.transmission}, {m.bodyType}, Seats: {m.seats}
          </div>
        ))}
      </div>

      {showModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.3)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <div
            style={{
              background: "#fff",
              padding: 24,
              borderRadius: 10,
              width: 400,
            }}
          >
            <h3>Add Model</h3>

            <label>Brand</label>
            <select
              value={form.brand}
              onChange={(e) => setForm({ ...form, brand: e.target.value })}
              style={{ width: "100%", marginBottom: 8 }}
            >
              <option value="">Select</option>
              {brands.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>

            <label>Fuel Type</label>
            <select
              value={form.fuelType}
              onChange={(e) => setForm({ ...form, fuelType: e.target.value })}
              style={{ width: "100%", marginBottom: 8 }}
            >
              <option value="">Select</option>
              {fuels.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>

            <label>Transmission</label>
            <select
              value={form.transmission}
              onChange={(e) => setForm({ ...form, transmission: e.target.value })}
              style={{ width: "100%", marginBottom: 8 }}
            >
              <option value="">Select</option>
              {transmissions.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>

            <label>Body Type</label>
            <select
              value={form.bodyType}
              onChange={(e) => setForm({ ...form, bodyType: e.target.value })}
              style={{ width: "100%", marginBottom: 8 }}
            >
              <option value="">Select</option>
              {bodies.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>

            <label>Model Name</label>
            <input
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              style={{ width: "100%", marginBottom: 8 }}
            />

            <label>Variant</label>
            <input
              value={form.variant}
              onChange={(e) => setForm({ ...form, variant: e.target.value })}
              style={{ width: "100%", marginBottom: 8 }}
            />

            <label>Seats</label>
            <input
              type="number"
              min={1}
              max={10}
              value={form.seats}
              onChange={(e) => setForm({ ...form, seats: Number(e.target.value) })}
              style={{ width: "100%", marginBottom: 8 }}
            />

            <div style={{ textAlign: "right" }}>
              <button onClick={() => setShowModal(false)}>Cancel</button>
              <button
                onClick={handleSave}
                style={{
                  background: "#00AEEF",
                  color: "#fff",
                  border: "none",
                  marginLeft: 8,
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
