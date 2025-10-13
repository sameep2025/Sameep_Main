import { useState, useEffect } from "react";
import axios from "axios";
import BodyTypeModal from "./BodyTypeModal";

export default function BikeBodyTypesPage() {
  const [bodyTypes, setBodyTypes] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);

  const fetchBodyTypes = async () => {
    try {
      const res = await axios.get("http://localhost:5000/api/masters", { params: { type: "bikeBodyType" } });
      setBodyTypes(res.data);
    } catch (err) {
      console.error(err);
      alert("Failed to fetch body types");
    }
  };

  useEffect(() => {
    fetchBodyTypes();
  }, []);

  const handleSave = async (data) => {
    try {
      const formData = new FormData();
      formData.append("name", data.name);
      if (data.icon) formData.append("image", data.icon);
      formData.append("type", "bikeBodyType");

      if (data._id) {
        await axios.put(`http://localhost:5000/api/masters/${data._id}`, formData, { headers: { "Content-Type": "multipart/form-data" } });
      } else {
        await axios.post("http://localhost:5000/api/masters", formData, { headers: { "Content-Type": "multipart/form-data" } });
      }
      fetchBodyTypes();
      setShowModal(false);
      setEditing(null);
    } catch (err) {
      console.error(err);
      alert("Failed to save body type");
    }
  };

  const handleDelete = async (bodyType) => {
    if (!window.confirm("Delete this body type?")) return;
    try {
      await axios.delete(`http://localhost:5000/api/masters/${bodyType._id}`);
      fetchBodyTypes();
    } catch (err) {
      console.error(err);
      alert("Failed to delete body type");
    }
  };

  return (
    <div style={{ padding: 30 }}>
      <h2 style={{ color: "#00AEEF" }}>Bike Body Types</h2>
      <button onClick={() => { setEditing(null); setShowModal(true); }} style={{ marginBottom: 20 }}>+ Add Body Type</button>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
        {bodyTypes.map((b) => (
          <div key={b._id} style={{ border: "1px solid #ccc", padding: 12, borderRadius: 8, position: "relative" }}>
            {/* {b.imageUrl && <img src={b.imageUrl} alt={b.name} style={{ width: "100%", height: 80, objectFit: "contain" }} />} */}
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

      {showModal && <BodyTypeModal show={showModal} onClose={() => setShowModal(false)} onSave={handleSave} initialData={editing} />}
    </div>
  );
}
