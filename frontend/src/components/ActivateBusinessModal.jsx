import { useState, useEffect } from "react";
import axios from "axios";

function ActivateBusinessModal({ show, onClose, customer, onActivated }) {
  const [businessName, setBusinessName] = useState("");
  const [contactName, setContactName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    if (!show) return;
    const fetchCategories = async () => {
      try {
        const res = await axios.get("http://localhost:5000/api/categories");
        setCategories(res.data);
      } catch (err) {
        console.error(err);
        alert("Failed to fetch categories");
      }
    };
    fetchCategories();
  }, [show]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!customer || !businessName || !contactName || !categoryId) {
      alert("All fields are required");
      return;
    }

    try {
      const res = await axios.post("http://localhost:5000/api/vendors", {
        customerId: customer._id,
        phone: customer.phone || customer.fullNumber, // ✅ added phone
        businessName,
        contactName,
        categoryId,
      });

      alert("Business activated successfully!");
      setBusinessName("");
      setContactName("");
      setCategoryId("");

      // Send new vendor ID back to parent
      onActivated?.(res.data._id);

      onClose();
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || "Failed to activate business");
    }
  };

  if (!show) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div style={{ background: "#fff", padding: 30, borderRadius: 12, minWidth: 350 }}>
        <h2 style={{ marginBottom: 20 }}>Activate Business Account</h2>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 15 }}>
          <input
            type="text"
            value={customer?.fullNumber || customer?.phone || ""}
            disabled
            style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc", background: "#f0f0f0" }}
          />
          <input
            type="text"
            placeholder="Business Name"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            required
            style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
          />
          <input
            type="text"
            placeholder="Contact Name"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            required
            style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
          />
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            required
            style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
          >
            <option value="">Select Category</option>
            {categories.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{ flex: 1, padding: 10, borderRadius: 8, border: "none", background: "#ccc", cursor: "pointer" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{ flex: 1, padding: 10, borderRadius: 8, border: "none", background: "#00AEEF", color: "#fff", cursor: "pointer" }}
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ActivateBusinessModal;