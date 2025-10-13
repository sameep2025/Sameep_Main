import { useState, useEffect } from "react";
import axios from "axios";
import AddCustomerModal from "../components/AddCustomerModal";
import ActivateBusinessModal from "../components/ActivateBusinessModal";

function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [openAdd, setOpenAdd] = useState(false);
  const [openActivate, setOpenActivate] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const res = await axios.get("http://localhost:5000/api/customers");
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
  }, []);

  const handleActivateClick = (customer) => {
    setSelectedCustomer(customer);
    setOpenActivate(true);
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <h1>Customers</h1>
        <button
          onClick={() => setOpenAdd(true)}
          style={{ padding:"8px 14px", borderRadius:8, background:"#00AEEF", color:"#fff", border:"none", cursor:"pointer" }}
        >
          + Add Customer
        </button>
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
        onActivated={() => { setOpenActivate(false); fetchCustomers(); setSelectedCustomer(null); }}
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
