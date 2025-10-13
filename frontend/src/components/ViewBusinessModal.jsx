import { useEffect, useState } from "react";
import axios from "axios";

function ViewBusinessModal({ show, onClose, vendorId }) {
  const [vendor, setVendor] = useState(null);
  const [categoryDetails, setCategoryDetails] = useState(null);

  useEffect(() => {
    if (!show || !vendorId) return;

    const fetchData = async () => {
      try {
        // Fetch vendor info
        const vendorRes = await axios.get(
          `http://localhost:5000/api/vendors/${vendorId}`
        );
        setVendor(vendorRes.data);

        // Fetch category + subcategories
        const catRes = await axios.get(
          `http://localhost:5000/api/categories/${vendorRes.data.categoryId._id}`
        );
        const subRes = await axios.get(`http://localhost:5000/api/categories`, {
          params: { parentId: vendorRes.data.categoryId._id },
        });

        setCategoryDetails({ ...catRes.data, subcategories: subRes.data });
      } catch (err) {
        console.error(err);
        alert("Failed to load business details");
      }
    };

    fetchData();
  }, [show, vendorId]);

  if (!show) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 30,
          width: "80%",
          maxWidth: 600,
          maxHeight: "90%",
          overflowY: "auto",
        }}
      >
        <h2>Business Details</h2>
        {vendor ? (
          <>
            <p>
              <b>Customer:</b> {vendor.customerId?.fullNumber}
            </p>
            <p>
              <b>Business Name:</b> {vendor.businessName}
            </p>
            <p>
              <b>Contact Name:</b> {vendor.contactName}
            </p>
            <p>
              <b>Category:</b> {vendor.categoryId?.name}
            </p>

            {categoryDetails?.subcategories?.length > 0 && (
              <>
                <h4>Subcategories & Prices</h4>
                <ul>
                  {categoryDetails.subcategories.map((sub) => (
                    <li key={sub._id}>
                      {sub.name} - ₹{sub.price ?? "N/A"}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        ) : (
          <p>Loading...</p>
        )}

        <div style={{ textAlign: "right", marginTop: 20 }}>
          <button
            onClick={onClose}
            style={{
              padding: "10px 16px",
              border: "none",
              borderRadius: 8,
              background: "#00AEEF",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default ViewBusinessModal;
