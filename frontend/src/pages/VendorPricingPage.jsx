import { useEffect, useState } from "react";
import axios from "axios";

function VendorReportPage({ vendorId }) {
  const [vendorPricing, setVendorPricing] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPricing = async () => {
      try {
        const res = await axios.get(`http://localhost:5000/api/vendors/pricing/${vendorId}`);
        setVendorPricing(res.data);
      } catch (err) {
        console.error(err);
        alert("Failed to fetch vendor pricing");
      } finally {
        setLoading(false);
      }
    };

    fetchPricing();
  }, [vendorId]);

  const handlePriceChange = (index, value) => {
    setVendorPricing((prev) => {
      const newPrices = [...prev];
      newPrices[index].price = Number(value);
      return newPrices;
    });
  };

  const handleSave = async () => {
    try {
      await axios.post(`http://localhost:5000/api/vendors/pricing/${vendorId}`, {
        prices: vendorPricing.map((p) => ({
          categoryId: p.categoryId,
          subcategoryId: p.subcategoryId,
          price: p.price,
        })),
      });
      alert("Prices updated successfully!");
    } catch (err) {
      console.error(err);
      alert("Failed to update prices");
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h1>Vendor Pricing Report</h1>
      <div>
        {vendorPricing.map((item, idx) => (
          <div
            key={`${item.categoryId}-${item.subcategoryId || "main"}`}
            style={{ marginBottom: "10px", paddingLeft: item.subcategoryId ? "20px" : "0px" }}
          >
            <strong>
              {item.subcategoryId ? `Subcategory` : `Category`}:
            </strong>{" "}
            <span>ID: {item.subcategoryId || item.categoryId}</span>
            <br />
            Price: ₹
            <input
              type="number"
              value={item.price}
              onChange={(e) => handlePriceChange(idx, e.target.value)}
              style={{ width: "80px", marginLeft: "10px" }}
            />
          </div>
        ))}
      </div>
      <button
        onClick={handleSave}
        style={{
          marginTop: "20px",
          padding: "10px 20px",
          borderRadius: "6px",
          border: "none",
          background: "#00AEEF",
          color: "#fff",
          cursor: "pointer",
        }}
      >
        Save Prices
      </button>
    </div>
  );
}

export default VendorReportPage;
