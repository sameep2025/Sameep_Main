import { useState, useEffect } from "react";
import axios from "axios";
import BikeBrandModal from "./BikeBrandModal";

export default function BikeBrandsPage() {
  const [brands, setBrands] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);

  const fetchBrands = async () => {
    try {
      const res = await axios.get("http://localhost:5000/api/masters", { params: { type: "bikeBrand" } });
      setBrands(res.data);
    } catch (err) {
      console.error(err);
      alert("Failed to fetch brands");
    }
  };

  useEffect(() => {
    fetchBrands();
  }, []);

  const handleSave = async (data) => {
    try {
      const formData = new FormData();
      formData.append("name", data.name);
      if (data.icon) formData.append("image", data.icon);
      formData.append("type", "bikeBrand");

      if (data._id) {
        await axios.put(`http://localhost:5000/api/masters/${data._id}`, formData, { headers: { "Content-Type": "multipart/form-data" } });
      } else {
        await axios.post("http://localhost:5000/api/masters", formData, { headers: { "Content-Type": "multipart/form-data" } });
      }
      fetchBrands();
      setShowModal(false);
      setEditing(null);
    } catch (err) {
      console.error(err);
      alert("Failed to save brand");
    }
  };

  const handleDelete = async (brand) => {
    if (!window.confirm("Delete this brand?")) return;
    try {
      await axios.delete(`http://localhost:5000/api/masters/${brand._id}`);
      fetchBrands();
    } catch (err) {
      console.error(err);
      alert("Failed to delete brand");
    }
  };

  return (
    <div style={{ padding: 30 }}>
      <h2 style={{ color: "#00AEEF" }}>Bike Brands</h2>
      <button onClick={() => { setEditing(null); setShowModal(true); }} style={{ marginBottom: 20 }}>+ Add Brand</button>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
        {brands.map((b) => (
          <div key={b._id} style={{ border: "1px solid #ccc", padding: 12, borderRadius: 8, position: "relative" }}>
            {b.imageUrl && (
  <img 
    src={`http://localhost:5000${b.imageUrl}`} 
    alt={b.name} 
    style={{ width: "100%", height: 80, objectFit: "contain" }} 
  />
)}

            <h4>{b.name}</h4>
            <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 6 }}>
              <span style={{ cursor: "pointer" }} onClick={() => { setEditing(b); setShowModal(true); }}>✏️</span>
              <span style={{ cursor: "pointer" }} onClick={() => handleDelete(b)}>🗑️</span>
            </div>
          </div>
        ))}
      </div>

      {showModal && <BikeBrandModal show={showModal} onClose={() => setShowModal(false)} onSave={handleSave} initialData={editing} />}
    </div>
  );
}
