import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import API_BASE_URL from "../config";
import axios from "axios";

export default function DummyVendorPage() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const fetchCategories = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await axios.get(
        `${API_BASE_URL}/api/dummy-vendors/categories/counts`
      );
      setCategories(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setError("Failed to load dummy categories");
      setCategories([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  return (
    <div>
      <h1> Vendors</h1>
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
            const id = c.categoryId || c._id || c.id;
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
                  Vendors: <strong>{c.totalVendors || 0}</strong>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
