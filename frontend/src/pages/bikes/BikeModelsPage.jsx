import { useState, useEffect } from "react";
import axios from "axios";
import ModelModal from "./ModelModal";

export default function BikeModelsPage() {
  const [models, setModels] = useState([]);
  const [brands, setBrands] = useState([]);
  const [bodyTypes, setBodyTypes] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);

  // ✅ Fetch all data
  const fetchData = async () => {
    try {
      const [modelsRes, brandsRes, bodyTypesRes] = await Promise.all([
        axios.get("http://localhost:5000/api/models?category=bike"),
        axios.get("http://localhost:5000/api/masters", { params: { type: "bikeBrand" } }),
        axios.get("http://localhost:5000/api/masters", { params: { type: "bikeBodyType" } }),
      ]);

      setModels(modelsRes.data);
      setBrands(brandsRes.data);
      setBodyTypes(bodyTypesRes.data);
    } catch (err) {
      console.error(err);
      alert("Failed to fetch models, brands, or body types");
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ✅ Handle Save / Update
  const handleSave = async (data) => {
    if (!data.brand || !data.model) {
      alert("Brand and Model are required");
      return;
    }

    const payload = {
      category: "bike", // 🏍 important
      brand: data.brand,
      bodyType: data.bodyType || "",
      model: data.model,
      variant: data.variant || "",
      seats: data.seatType || 0,
    };

    try {
      if (data._id) {
        await axios.put(`http://localhost:5000/api/models/${data._id}`, payload);
      } else {
        await axios.post("http://localhost:5000/api/models", payload);
      }

      fetchData();
      setShowModal(false);
      setEditing(null);
    } catch (err) {
      console.error(err.response?.data || err.message);
      alert("Failed to save model");
    }
  };

  // ✅ Handle Delete
  const handleDelete = async (model) => {
    if (!window.confirm("Delete this model?")) return;
    try {
      await axios.delete(`http://localhost:5000/api/models/${model._id}`);
      fetchData();
    } catch (err) {
      console.error(err);
      alert("Failed to delete model");
    }
  };

  // ✅ UI
  return (
    <div style={{ padding: 30 }}>
      <h2 style={{ color: "#00AEEF" }}>Bike Models</h2>
      <button
        onClick={() => {
          setEditing(null);
          setShowModal(true);
        }}
        style={{ marginBottom: 20 }}
      >
        + Add Model
      </button>

      <table
  style={{
    width: "100%",
    borderCollapse: "collapse",
    marginTop: 20,
  }}
>
  <thead>
    <tr style={{ background: "#00AEEF", color: "#fff", textAlign: "left" }}>
      <th style={{ padding: 10 }}>Brand</th>
      <th style={{ padding: 10 }}>Body Type</th>
      <th style={{ padding: 10 }}>Seats</th>
      <th style={{ padding: 10 }}>Model</th>
      <th style={{ padding: 10 }}>Variant</th>
      <th style={{ padding: 10, textAlign: "center" }}>Actions</th>
    </tr>
  </thead>
  <tbody>
    {models.map((m, i) => (
      <tr
        key={m._id}
        style={{
          borderBottom: "1px solid #ccc",
          background: i % 2 === 0 ? "#f9f9f9" : "#fff",
        }}
      >
        <td style={{ padding: 10 }}>{m.brand}</td>
        <td style={{ padding: 10 }}>{m.bodyType}</td>
        <td style={{ padding: 10 }}>{m.seats}</td>
        <td style={{ padding: 10 }}>{m.model}</td>
        <td style={{ padding: 10 }}>{m.variant}</td>
        <td style={{ padding: 10, textAlign: "center" }}>
          <button
            onClick={() => {
              setEditing(m);
              setShowModal(true);
            }}
            style={{
              // background: "#ffc107",
              border: "none",
              borderRadius: 5,
              padding: "4px 8px",
              cursor: "pointer",
              marginRight: 6,
            }}
          >
            ✏️ 
          </button>
          <button
            onClick={() => handleDelete(m)}
            style={{
              // background: "#dc3545",
              color: "#fff",
              border: "none",
              borderRadius: 5,
              padding: "4px 8px",
              cursor: "pointer",
            }}
          >
            🗑️ 
          </button>
        </td>
      </tr>
    ))}
  </tbody>
</table>


      {showModal && (
        <ModelModal
          show={showModal}
          onClose={() => setShowModal(false)}
          onSave={handleSave}
          brands={brands}
          bodyTypes={bodyTypes}
          initialData={editing}
        />
      )}
    </div>
  );
}
