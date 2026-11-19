import API from "../api";
import API_BASE_URL from "../config";

export const getPlans = () =>
  API.get(`${API_BASE_URL}/api/admin/plans`);

export const getVendorSubscription = (vendorId) =>
  API.get(`${API_BASE_URL}/api/admin/vendor-subscriptions/${vendorId}`);

export const assignVendorPlan = (data) =>
  API.post(`${API_BASE_URL}/api/admin/vendor-subscriptions`, data);

export const updateVendorSubscription = (vendorId, data) =>
  API.put(`${API_BASE_URL}/api/admin/vendor-subscriptions/${vendorId}`, data);
