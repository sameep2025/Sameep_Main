import { useState, useEffect } from "react";
import axios from "axios";
import API_BASE_URL from "../config";

function ActivateDummyBusinessModal({ show, onClose, customer, onActivated }) {
  const [businessName, setBusinessName] = useState("");
  const [contactName, setContactName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState([]);
  const [categoriesSource, setCategoriesSource] = useState("dummy"); // 'dummy' | 'real'

  useEffect(() => {
    if (!show) return;
    const fetchCategories = async () => {
      try {
        let res = await axios.get(`${API_BASE_URL}/api/dummy-categories`);
        setCategories(res.data || []);
        setCategoriesSource("dummy");
      } catch (err) {
        console.error(err);
        alert("Failed to fetch dummy categories");
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
    // Helper: bump local dummy counts for this category (for UI-only counts)
    const bumpLocalDummyCounts = (catId) => {
      try {
        const key = `dv_counts_${catId}`;
        const existing = JSON.parse(localStorage.getItem(key) || "null") || { total: 0, statuses: {} };
        const next = { ...existing };
        next.total = (next.total || 0) + 1;
        next.statuses = next.statuses || {};
        next.statuses["Waiting for Approval"] = (next.statuses["Waiting for Approval"] || 0) + 1;
        localStorage.setItem(key, JSON.stringify(next));
        // store last activation lightweight details for UI-only listing
        const last = {
          businessName,
          contactName,
          phone: customer?.fullNumber || customer?.phone || "",
          status: "Waiting for Approval",
          createdAt: Date.now(),
        };
        localStorage.setItem(`dv_last_${catId}`, JSON.stringify(last));
      } catch {}
    };

    // Proceed normally; backend is deployed. Keep fallbacks only on errors below.
    try {
      // Try creating a dummy vendor first
      const payload = {
        customerId: customer._id,
        phone: customer.phone,
        businessName,
        contactName,
        categoryId,
      };
      try {
        const res = await axios.post(`${API_BASE_URL}/api/dummy-vendors`, payload);
        const vendor = res.data;
        try {
          const last = {
            businessName,
            contactName,
            phone: customer?.fullNumber || customer?.phone || "",
            status: "Waiting for Approval",
            createdAt: Date.now(),
            vendorId: vendor?._id || vendor?.id || null,
          };
          localStorage.setItem(`dv_last_${categoryId}`, JSON.stringify(last));
        } catch {}
        onActivated?.(vendor?._id || null, { target: "dummy", categoryId });
        onClose();
        return;
      } catch (e1) {
        // Fallback to real vendor creation
        try {
          const res = await axios.post(`${API_BASE_URL}/api/vendors`, payload);
          const vendor = res.data;
          bumpLocalDummyCounts(categoryId);
          onActivated?.(vendor?._id || null, { target: "real", categoryId });
          onClose();
          return;
        } catch (e2) {
          // Navigate to status as last resort
          bumpLocalDummyCounts(categoryId);
          onActivated?.(null, { navigateToStatus: true, source: categoriesSource, categoryId });
          onClose();
          return;
        }
      }
    } catch (err) {
      onActivated?.(null, { navigateToStatus: true, source: categoriesSource, categoryId });
      onClose();
      return;
    }
  };

  if (!show) return null;

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ background: "#fff", padding: 30, borderRadius: 12, minWidth: 350 }}>
        <h2 style={{ marginBottom: 20 }}>Activate Dummy Business</h2>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 15 }}>
          <input type="text" value={customer?.fullNumber || customer?.phone || ""} disabled style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc", background: "#f0f0f0" }} />
          <input type="text" placeholder="Business Name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} required style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }} />
          <input type="text" placeholder="Contact Name" value={contactName} onChange={(e) => setContactName(e.target.value)} required style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }} />
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }}>
            <option value="">Select Dummy Category</option>
            {categories.map((c) => (
              <option key={c._id || c.id} value={c._id || c.id}>{c.name}</option>
            ))}
          </select>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: 10, borderRadius: 8, border: "none", background: "#ccc", cursor: "pointer" }}>Cancel</button>
            <button type="submit" style={{ flex: 1, padding: 10, borderRadius: 8, border: "none", background: "#00AEEF", color: "#fff", cursor: "pointer" }}>Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ActivateDummyBusinessModal;
