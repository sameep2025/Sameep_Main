import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import API_BASE_URL from "../config";

const FALLBACK_STATUSES = [
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
  const [statuses, setStatuses] = useState(FALLBACK_STATUSES);
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
      let masterStatuses = null;
      try {
        const stRes = await axios.get(`${API_BASE_URL}/api/masters`, { params: { type: "status" } });
        const list = Array.isArray(stRes.data) ? stRes.data : [];
        masterStatuses = list
          .map((m) => ({
            name: m && m.name != null ? String(m.name).trim() : "",
            sequence: typeof m?.sequence === "number" ? m.sequence : 0,
          }))
          .filter((m) => m.name);
        masterStatuses.sort((a, b) => {
          if ((a.sequence || 0) !== (b.sequence || 0)) return (a.sequence || 0) - (b.sequence || 0);
          return a.name.localeCompare(b.name);
        });
      } catch {
        masterStatuses = null;
      }

      if (Array.isArray(masterStatuses) && masterStatuses.length) {
        setStatuses(masterStatuses.map((s) => s.name));
      } else {
        setStatuses(FALLBACK_STATUSES);
      }

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
          {statuses.map((st) => (
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
