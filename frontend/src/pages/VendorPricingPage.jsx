import { useEffect, useState } from "react";
import axios from "axios";

function VendorPricingPage({ vendorId }) {
  const [pricing, setPricing] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!vendorId) return;
    const fetchPricing = async () => {
      try {
        const res = await axios.get(`http://localhost:5000/api/vendorPricing/${vendorId}`);
        const items = Array.isArray(res.data?.pricing) ? res.data.pricing : [];
        setPricing(items);
      } catch (err) {
        console.error(err);
        alert("Failed to fetch vendor pricing");
      } finally {
        setLoading(false);
      }
    };
    fetchPricing();
  }, [vendorId]);

  const handleInlineSave = async (categoryId, price) => {
    try {
      await axios.put(`http://localhost:5000/api/vendorPricing/${vendorId}/${categoryId}`, { price: Number(price) });
    } catch (err) {
      console.error(err);
      alert("Failed to save price");
    }
  };

  if (loading) return <div>Loading...</div>;

  const maxLevels = pricing.reduce((m, p) => {
    let n = 0;
    for (let i = 1; i <= 5; i++) if (p[`level${i}`]) n = i;
    return Math.max(m, n);
  }, 1);
  const headers = Array.from({ length: maxLevels }, (_, i) => `Level ${i + 1}`);

  return (
    <div style={{ padding: 16 }}>
      <h2>Vendor Pricing</h2>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{ border: "1px solid #ccc", padding: 8 }}>{h}</th>
            ))}
            <th style={{ border: "1px solid #ccc", padding: 8 }}>Category ID</th>
            <th style={{ border: "1px solid #ccc", padding: 8 }}>Price</th>
            <th style={{ border: "1px solid #ccc", padding: 8 }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {pricing.map((p) => (
            <tr key={p.categoryId}>
              {headers.map((_, i) => (
                <td key={i} style={{ border: "1px solid #ccc", padding: 8 }}>{p[`level${i + 1}`] || "-"}</td>
              ))}
              <td style={{ border: "1px solid #ccc", padding: 8 }}>{p.categoryId}</td>
              <td style={{ border: "1px solid #ccc", padding: 8 }}>
                <input
                  type="number"
                  value={p.price ?? 0}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPricing((prev) => prev.map((x) => x.categoryId === p.categoryId ? { ...x, price: Number(val) } : x));
                  }}
                  style={{ width: 100 }}
                />
              </td>
              <td style={{ border: "1px solid #ccc", padding: 8 }}>
                <button onClick={() => handleInlineSave(p.categoryId, p.price)} style={{ padding: "6px 10px" }}>Save</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default VendorPricingPage;
