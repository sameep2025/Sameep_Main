import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

function VendorPage() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const res = await axios.get(
        "http://localhost:5000/api/vendors/categories/counts"
      );
      setCategories(res.data || []);
    } catch (err) {
      console.error(err);
      alert("Failed to load categories");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  return (
    <div>
      <h1>Vendors</h1>
      {loading ? (
        <div>Loading...</div>
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
          {categories.map((c) => (
            <div
              key={c.categoryId}
              onClick={() =>
                navigate(`/vendors/status/${c.categoryId}`)
              }
              style={{
                border: "1px solid #ccc",
                borderRadius: 8,
                padding: 12,
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                cursor: "pointer",
              }}
            >
              <img
                src={c.imageUrl ? `http://localhost:5000${c.imageUrl}` : ""}
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
              <div style={{ marginTop: 8, fontWeight: "bold" }}>
                Vendors Count: {c.totalVendors || 0}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default VendorPage;
