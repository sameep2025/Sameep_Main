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
    setOpenActivate(true);
  };
  const handleActivateDummyClick = (customer) => {
    setSelectedCustomer(customer);
    setOpenActivateDummy(true);
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
          <button
            onClick={() => selectedCustomer ? handleActivateDummyClick(selectedCustomer) : alert("Select a customer first")}
            style={{ padding:"8px 14px", borderRadius:8, background:"#6b7280", color:"#fff", border:"none", cursor:"pointer" }}
          >
            Activate Dummy
          </button>
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
                <th>Action</th>
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default CustomersPage;
