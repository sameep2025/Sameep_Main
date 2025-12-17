import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import API_BASE_URL from "../config";

const STATUSES = [
  "Accepted",
  "Pending",
  "Rejected",
  "Waiting for Approval",
  "Registered",
  "Profile Setup",
  "Preview",
  "Published",
];

export default function DummyVendorStatusPage() {
  const { categoryId } = useParams();
  const [category, setCategory] = useState(null);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const readLocalCounts = (catId) => {
    try {
      const raw = localStorage.getItem(`dv_counts_${catId}`);
      if (!raw) return { statuses: {} };
      const parsed = JSON.parse(raw);
      return { statuses: parsed.statuses || {} };
    } catch { return { statuses: {} }; }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      // Always try to fetch the category from dummy first, then fallback to real
      let catRes;
      try {
        catRes = await axios.get(`${API_BASE_URL}/api/dummy-categories/${categoryId}`);
      } catch {
        catRes = await axios.get(`${API_BASE_URL}/api/categories/${categoryId}`);
      }
      setCategory(catRes.data);

      // Try dummy counts; if unavailable, start from empty and overlay local UI counts
      let baseCounts = {};
      try {
        const countsRes = await axios.get(`${API_BASE_URL}/api/dummy-vendors/categories/counts`, { params: { categoryId } });
        baseCounts = countsRes.data?.[0]?.statusCounts || {};
      } catch {
        baseCounts = {};
      }

      // Overlay local UI counts (e.g., increments set during activation)
      const local = readLocalCounts(categoryId);
      const merged = { ...baseCounts };
      Object.entries(local.statuses || {}).forEach(([st, inc]) => {
        merged[st] = (merged[st] || 0) + Number(inc || 0);
      });

      setCounts(merged);
    } catch (err) {
      // Soft-fail with minimal noise
      const local = readLocalCounts(categoryId);
      setCounts(local.statuses || {});
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
          {STATUSES.map((st) => (
            <div
              key={st}
              onClick={() => navigate(`/dummy-vendors/status/${categoryId}/${encodeURIComponent(st)}`)}
              style={{ border: "1px solid #ccc", borderRadius: 8, padding: 12, boxShadow: "0 2px 4px rgba(0,0,0,0.1)", cursor: "pointer" }}
            >
              <h3 style={{ margin: 0 }}>{st}</h3>
              <div style={{ marginTop: 8, fontWeight: "bold" }}>{counts[st] || 0}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
