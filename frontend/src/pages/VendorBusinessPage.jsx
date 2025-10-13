import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";

// Modal for updating vendor price
function UpdatePriceModal({ show, onClose, category, vendorId, onUpdated }) {
  const [price, setPrice] = useState(category?.vendorPrice ?? category?.price ?? "");

  useEffect(() => {
    setPrice(category?.vendorPrice ?? category?.price ?? "");
  }, [category]);

  if (!show || !category) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newPrice = parseFloat(price);
    if (isNaN(newPrice)) return alert("Enter a valid number");

    try {
      await axios.put(
        `http://localhost:5000/api/vendors/${vendorId}/prices`,
        { categoryId: category.id, price: newPrice }
      );
      onUpdated(category.id, newPrice);
      onClose();
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || "Failed to update price");
    }
  };

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: "rgba(0,0,0,0.5)",
      display: "flex", justifyContent: "center", alignItems: "center",
      zIndex: 1000
    }}>
      <div style={{ background: "#fff", padding: "20px", borderRadius: "10px", minWidth: "300px" }}>
        <h3>Update Price: {category.name}</h3>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <input
            type="number" step="0.01" value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Vendor Price" required
            style={{ padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
          />
          <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={{ padding: "8px 16px", borderRadius: "6px", background: "#ccc", border: "none" }}>Cancel</button>
            <button type="submit" style={{ padding: "8px 16px", borderRadius: "6px", background: "#00AEEF", border: "none", color: "#fff" }}>Update</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Flatten nested tree for table rows
function flattenTree(node, rows = [], parentLevels = []) {
  if (!node) return rows;
  const levels = [...parentLevels, node.name ?? "Unnamed"];

  if (!node.children || node.children.length === 0) {
    rows.push({
      id: node._id ?? node.id,
      levels,
      price: typeof node.vendorPrice === "number" ? node.vendorPrice : node.price ?? "-",
      categoryId: node._id ?? node.id,
      imageUrl: node.imageUrl ?? null
    });
  } else {
    node.children.forEach(child => flattenTree(child, rows, levels));
  }
  return rows;
}

export default function Step3Page() {
  const { vendorId } = useParams();
  const [vendor, setVendor] = useState(null);
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalCategory, setModalCategory] = useState(null);

  const fetchTree = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`http://localhost:5000/api/vendors/${vendorId}/categories`);
      setVendor(res.data.vendor);

      let categories = res.data.categories;
      if (!categories) setTree([]);
      else if (Array.isArray(categories)) setTree([{ _id: "root", name: "Root", children: categories }]);
      else setTree([{ ...categories, children: categories.children || [] }]);
    } catch (err) {
      console.error(err);
      alert("Failed to fetch vendor categories");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTree();
  }, [vendorId]);

  const rows = tree.flatMap(root => flattenTree(root));
  const maxLevels = rows.reduce((max, row) => Math.max(max, row.levels.length), 0);
  const levelHeaders = Array.from({ length: maxLevels }, (_, idx) => idx === 0 ? "Category" : `Level ${idx + 1}`);

  const handlePriceUpdate = (categoryId, newPrice) => {
    setTree(prevTree => {
      const updateNode = (node) => {
        if (!node) return node;
        if ((node._id ?? node.id) === categoryId) return { ...node, vendorPrice: newPrice };
        if (node.children) return { ...node, children: node.children.map(updateNode) };
        return node;
      };
      return prevTree.map(updateNode);
    });
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>{vendor?.businessName || "Step 3 Vendor Categories"}</h1>
      {vendor && <p>Contact: {vendor.contactName || "-"} | Phone: {vendor.customerId?.fullNumber || vendor.phone || "-"}</p>}

      {loading ? <p>Loading...</p> : rows.length === 0 ? <p>No categories found</p> : (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              {levelHeaders.map((header, idx) => (
                <th key={idx} style={{ border: "1px solid #ccc", padding: "8px" }}>{header}</th>
              ))}
              <th style={{ border: "1px solid #ccc", padding: "8px" }}>Price</th>
              <th style={{ border: "1px solid #ccc", padding: "8px" }}>Image</th>
              <th style={{ border: "1px solid #ccc", padding: "8px" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id}>
                {levelHeaders.map((_, idx) => (
                  <td key={idx} style={{ border: "1px solid #ccc", padding: "8px" }}>{row.levels[idx] ?? "-"}</td>
                ))}
                <td>{row.price}</td>
                <td>{row.imageUrl ? <img src={`http://localhost:5000${row.imageUrl}`} alt={row.levels.slice(-1)[0]} style={{ width: 60, height: 40, objectFit: "cover", borderRadius: 4 }} /> : "-"}</td>
                <td>
                  <button onClick={() => setModalCategory({ id: row.categoryId, name: row.levels.slice(-1)[0], vendorPrice: row.price })}
                    style={{ padding: "4px 8px", borderRadius: "4px", background: "#00AEEF", color: "#fff", border: "none" }}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <UpdatePriceModal show={!!modalCategory} onClose={() => setModalCategory(null)} category={modalCategory} vendorId={vendorId} onUpdated={handlePriceUpdate} />
    </div>
  );
}
