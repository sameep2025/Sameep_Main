import { useState, useEffect } from "react";
import axios from "axios";
import { useParams } from "react-router-dom";

export default function CarsSubPage() {
  const { type } = useParams(); // e.g., carBrand, fuelType
  const [items, setItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);

  const fetchItems = async () => {
    try {
      const res = await axios.get("http://localhost:5000/api/masters", { params: { type } });
      setItems(res.data);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { fetchItems(); }, [type]);

  const handleSave = async (data) => {
    try {
      if (data._id) await axios.put(`http://localhost:5000/api/masters/${data._id}`, data);
      else await axios.post("http://localhost:5000/api/masters", { ...data, type });
      fetchItems();
      setShowModal(false);
      setEditing(null);
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (item) => {
    if (!window.confirm("Delete?")) return;
    try { await axios.delete(`http://localhost:5000/api/masters/${item._id}`); fetchItems(); } 
    catch (err) { console.error(err); }
  };

  const labels = {
    carBrand: "Brand",
    fuelType: "Fuel Type",
    transmissionType: "Transmission Type",
    bodyType: "Body Type"
  };

  return (
    <div style={{ padding: 30 }}>
      <h2 style={{ color: "#00AEEF" }}>Manage {labels[type]}</h2>
      <button onClick={() => { setEditing(null); setShowModal(true); }}
        style={{ background: "#00AEEF", color: "#fff", padding: "8px 16px", border: "none", borderRadius: 6, marginBottom: 20 }}
      >
        + Add {labels[type]}
      </button>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
        {items.map(i => (
          <div key={i._id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, position: "relative", background: "#fff" }}>
            <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 6 }}>
              <span style={{ cursor: "pointer", color: "#00AEEF" }} onClick={() => { setEditing(i); setShowModal(true); }}>✏️</span>
              <span style={{ cursor: "pointer", color: "red" }} onClick={() => handleDelete(i)}>🗑️</span>
            </div>
            <h4>{i.name}</h4>
          </div>
        ))}
      </div>

      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#fff", padding: 30, borderRadius: 12, width: 400 }}>
            <h3>{editing ? "Edit" : "Add"} {labels[type]}</h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              handleSave({ ...editing, name: e.target.name.value });
            }}>
              <input name="name" defaultValue={editing?.name || ""} required
                placeholder={`Enter ${labels[type]}`} style={{ width: "100%", padding: 8, marginBottom: 10 }}/>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button type="button" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
