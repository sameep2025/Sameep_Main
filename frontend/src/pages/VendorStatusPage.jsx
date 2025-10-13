import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";

const STATUSES = [
  "Accepted",
  "Pending",
  "Rejected",
  "Waiting for Approval",
  "Registered",
];

export default function VendorStatusPage() {
  const { categoryId } = useParams();
  const [category, setCategory] = useState(null);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const fetchData = async () => {
    try {
      setLoading(true);
      const [catRes, countsRes] = await Promise.all([
        axios.get(`http://localhost:5000/api/categories/${categoryId}`),
        axios.get(
          `http://localhost:5000/api/vendors/categories/counts?categoryId=${categoryId}`
        ),
      ]);
      setCategory(catRes.data);
      setCounts(countsRes.data?.[0]?.statusCounts || {});
    } catch (err) {
      console.error(err);
      alert("Failed to load status counts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [categoryId]);

  return (
    <div>
      <h2>{category?.name || "Category"} - Status</h2>
      {loading ? (
        <div>Loading...</div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 16,
          }}
        >
          {STATUSES.map((st) => (
            <div
              key={st}
              onClick={() =>
                navigate(
                  `/vendors/status/${categoryId}/${encodeURIComponent(st)}`
                )
              }
              style={{
                border: "1px solid #ccc",
                borderRadius: 8,
                padding: 12,
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                cursor: "pointer",
              }}
            >
              <h3 style={{ margin: 0 }}>{st}</h3>
              <div style={{ marginTop: 8, fontWeight: "bold" }}>
                {counts[st] || 0}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
