import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import AddCustomerModal from "../components/AddCustomerModal";
import ActivateBusinessModal from "../components/ActivateBusinessModal";
import ActivateDummyBusinessModal from "../components/ActivateDummyBusinessModal";
import API_BASE_URL from "../config";

function CustomersPage() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [openAdd, setOpenAdd] = useState(false);
  const [openActivate, setOpenActivate] = useState(false);
  const [openActivateDummy, setOpenActivateDummy] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dummyAvailable, setDummyAvailable] = useState(true);
  const [loginHistory, setLoginHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_BASE_URL}/api/customers`);
      setCustomers(res.data);
    } catch (err) {
      console.error(err);
      alert("Failed to load customers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
    // Avoid noisy 404s in hosted envs lacking dummy endpoints; hide button instead
    try {
      const isHosted = /go-kar\.net/i.test(String(API_BASE_URL || ""));
      setDummyAvailable(!isHosted);
    } catch { setDummyAvailable(true); }
  }, []);

  const handleActivateClick = (customer) => {
    setSelectedCustomer(customer);
    setOpenActivateDummy(true);
  };
  const handleActivateDummyClick = (customer) => {
    setSelectedCustomer(customer);
    setOpenActivateDummy(true);
  };

  const handleLoginHistoryClick = async (customer) => {
    try {
      setSelectedCustomer(customer);
      setShowHistory(true);
      setHistoryLoading(true);
      const res = await axios.get(`${API_BASE_URL}/api/customers/${customer._id}/login-history`);
      setLoginHistory(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
      alert("Failed to load login history");
      setLoginHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <h1>Customers</h1>
        <div style={{ display:"flex", gap:8 }}>
          <button
            onClick={() => setOpenAdd(true)}
            style={{ padding:"8px 14px", borderRadius:8, background:"#00AEEF", color:"#fff", border:"none", cursor:"pointer" }}
          >
            + Add Customer
          </button>
          {/* <button
            onClick={() => selectedCustomer ? handleActivateDummyClick(selectedCustomer) : alert("Select a customer first")}
            style={{ padding:"8px 14px", borderRadius:8, background:"#6b7280", color:"#fff", border:"none", cursor:"pointer" }}
          >
            Activate Dummy
          </button> */}
        </div>
      </div>

      {/* Add Customer Modal */}
      <AddCustomerModal
        show={openAdd}
        onClose={() => setOpenAdd(false)}
        onAdded={() => { setOpenAdd(false); fetchCustomers(); }}
      />

      {/* Activate Business Modal */}
      <ActivateBusinessModal
        show={openActivate}
        onClose={() => setOpenActivate(false)}
        customer={selectedCustomer}
        onActivated={(vendorId /*, categoryId*/ ) => {
          setOpenActivate(false);
          fetchCustomers();
          setSelectedCustomer(null);
          if (vendorId) navigate(`/vendors/${vendorId}`);
        }}
      />

      {/* Activate Dummy Business Modal */}
      <ActivateDummyBusinessModal
        show={openActivateDummy}
        onClose={() => setOpenActivateDummy(false)}
        customer={selectedCustomer}
        onActivated={(vendorId, meta) => {
          setOpenActivateDummy(false);
          fetchCustomers();
          setSelectedCustomer(null);
          // If creation failed but we have a category to show, jump to status page
          if (!vendorId && meta?.navigateToStatus && meta?.categoryId) {
            if (meta?.source === "dummy") navigate(`/dummy-vendors/status/${meta.categoryId}`);
            else navigate(`/vendors/status/${meta.categoryId}`);
            return;
          }
          if (!vendorId) return;
          if (meta?.target === "dummy") navigate(`/dummy-vendors/${vendorId}`);
          else navigate(`/vendors/${vendorId}`);
        }}
      />

      <div style={{ marginTop: 20 }}>
        {loading ? (
          <div>Loading...</div>
        ) : customers.length === 0 ? (
          <div>No customers yet</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th>Select</th>
                <th>Mobile</th>
                <th>Added At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c._id} style={{ borderBottom: "1px solid #ccc" }}>
                  <td style={{ textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={selectedCustomer?._id === c._id}
                      onChange={() => handleActivateClick(c)}
                    />
                  </td>
                  <td>{c.countryCode ? `+${c.countryCode}` : ""} {c.phone}</td>
                  <td>{new Date(c.createdAt).toLocaleString()}</td>
                  <td>
                    <div style={{ display:"flex", gap:8 }}>
                      <button
                        onClick={() => handleActivateClick(c)}
                        style={{
                          padding:"6px 12px",
                          borderRadius:6,
                          border:"none",
                          background:"#28a745",
                          color:"#fff",
                          cursor:"pointer"
                        }}
                      >
                        Activate
                      </button>
                      <button
                        onClick={() => handleLoginHistoryClick(c)}
                        style={{
                          padding:"6px 12px",
                          borderRadius:6,
                          border:"1px solid #6b7280",
                          background:"#fff",
                          color:"#374151",
                          cursor:"pointer",
                          fontSize:12
                        }}
                      >
                        Login History
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showHistory && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "#fff",
              padding: 20,
              borderRadius: 10,
              width: 720,
              maxWidth: "90vw",
              maxHeight: "70vh",
              overflowY: "auto",
              fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Login History</h3>
              <button
                type="button"
                onClick={() => { setShowHistory(false); setLoginHistory([]); }}
                style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 16 }}
              >
                ×
              </button>
            </div>
            {selectedCustomer && (
              <div style={{ marginBottom: 8, fontSize: 13, color: "#4b5563" }}>
                {selectedCustomer.countryCode ? `+${selectedCustomer.countryCode}` : ""} {selectedCustomer.phone}
              </div>
            )}
            {historyLoading ? (
              <div>Loading history...</div>
            ) : loginHistory.length === 0 ? (
              <div>No login history yet</div>
            ) : (
              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  overflow: "hidden",
                  fontSize: 13,
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ backgroundColor: "#f3f4f6" }}>
                      <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #e5e7eb" }}>S.No</th>
                      <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #e5e7eb" }}>Mobile</th>
                      <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #e5e7eb" }}>Device / Browser</th>
                      <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #e5e7eb" }}>Login Time</th>
                      <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #e5e7eb" }}>Expiry Time</th>
                      <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #e5e7eb" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loginHistory.map((h, idx) => {
                      const status = h.status || (new Date(h.expiryTime) > new Date() ? "active" : "expired");
                      const device = h.deviceInfo || "-";
                      const mobile = selectedCustomer
                        ? `${selectedCustomer.countryCode ? `+${selectedCustomer.countryCode}` : ""} ${selectedCustomer.phone}`
                        : "";
                      const isActive = status === "active";
                      return (
                        <tr
                          key={h._id || `${h.loginTime}-${idx}`}
                          style={{ backgroundColor: idx % 2 === 0 ? "#ffffff" : "#f9fafb" }}
                        >
                          <td style={{ padding: "6px 8px", borderBottom: "1px solid #e5e7eb" }}>{idx + 1}</td>
                          <td style={{ padding: "6px 8px", borderBottom: "1px solid #e5e7eb" }}>{mobile}</td>
                          <td
                            style={{
                              padding: "6px 8px",
                              borderBottom: "1px solid #e5e7eb",
                              maxWidth: 220,
                              whiteSpace: "normal",
                              wordBreak: "break-all",
                              fontSize: 11,
                            }}
                          >
                            {device}
                          </td>
                          <td
                            style={{
                              padding: "6px 8px",
                              borderBottom: "1px solid #e5e7eb",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {new Date(h.loginTime).toLocaleString()}
                          </td>
                          <td
                            style={{
                              padding: "6px 8px",
                              borderBottom: "1px solid #e5e7eb",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {new Date(h.expiryTime).toLocaleString()}
                          </td>
                          <td style={{ padding: "6px 8px", borderBottom: "1px solid #e5e7eb" }}>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 8px",
                                borderRadius: 999,
                                fontSize: 11,
                                textTransform: "capitalize",
                                backgroundColor: isActive ? "#dcfce7" : "#fee2e2",
                                color: isActive ? "#166534" : "#991b1b",
                              }}
                            >
                              {status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default CustomersPage;
