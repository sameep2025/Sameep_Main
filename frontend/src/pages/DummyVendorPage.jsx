import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import API_BASE_URL from "../config";
import axios from "axios";

export default function DummyVendorPage() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [totals, setTotals] = useState({}); // categoryId -> total vendors
  const navigate = useNavigate();

  const fetchCategories = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE_URL}/api/dummy-categories`);
      const data = res.ok ? await res.json() : [];
      setCategories(Array.isArray(data) ? data : []);
    } catch (e) {
      setError("Failed to load dummy categories");
      setCategories([]);
    } finally {
      setLoading(false);
    }
  };

  const readLocalTotals = (catId) => {
    try {
      const raw = localStorage.getItem(`dv_counts_${catId}`);
      if (!raw) return 0;
      const parsed = JSON.parse(raw);
      return Number(parsed.total || 0);
    } catch { return 0; }
  };

  const fetchCounts = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/dummy-vendors/categories/counts`);
      const list = Array.isArray(res.data) ? res.data : [];
      const base = {};
      list.forEach((row) => {
        const id = row.categoryId?._id || row.categoryId;
        if (id) base[String(id)] = Number(row.totalVendors || 0);
      });
      // Overlay local UI totals
      const merged = { ...base };
      categories.forEach((c) => {
        const id = String(c._id || c.id);
        merged[id] = (merged[id] || 0) + readLocalTotals(id);
      });
      setTotals(merged);
    } catch {
      // If backend missing, compute from local only
      const onlyLocal = {};
      categories.forEach((c) => {
        const id = String(c._id || c.id);
        onlyLocal[id] = readLocalTotals(id);
      });
      setTotals(onlyLocal);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    if (categories.length) fetchCounts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories.map((c) => c._id).join(",")]);

  return (
    <div>
      <h1>Dummy Vendors</h1>
      {loading ? (
        <div>Loading...</div>
      ) : error ? (
        <div>{error}</div>
      ) : categories.length === 0 ? (
        <div>No categories found</div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
            gap: 16,
          }}
        >
          {categories.map((c) => {
            const id = c._id || c.id;
            const img = c.imageUrl
              ? (String(c.imageUrl).startsWith("http")
                ? c.imageUrl
                : `${API_BASE_URL}${c.imageUrl}`)
              : "";
            return (
              <div
                key={id}
                onClick={() => navigate(`/dummy-vendors/status/${id}`)}
                style={{
                  border: "1px solid #ccc",
                  borderRadius: 8,
                  padding: 12,
                  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                  cursor: "pointer",
                }}
              >
                <img
                  src={img}
                  alt={c.name}
                  style={{
                    width: "100%",
                    height: 140,
                    objectFit: "cover",
                    borderRadius: 6,
                    background: "#f3f3f3",
                  }}
                />
                <h3 style={{ marginTop: 10 }}>{c.name}</h3>
                <div style={{ marginTop: 4, color: "#374151", fontSize: 13 }}>
                  Vendors: <strong>{totals[String(id)] || 0}</strong>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
