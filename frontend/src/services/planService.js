import API from "../api";
import API_BASE_URL from "../config";

const BASE = API_BASE_URL ? `${API_BASE_URL}/api/admin/plans` : "/api/admin/plans";

export async function getPlans() {
  const res = await API.get(BASE);
  return res.data;
}

export async function createPlan(data) {
  const res = await API.post(BASE, data);
  return res.data;
}

export async function updatePlan(id, data) {
  const res = await API.put(`${BASE}/${id}`, data);
  return res.data;
}

export async function deletePlan(id) {
  const res = await API.delete(`${BASE}/${id}`);
  return res.data;
}
