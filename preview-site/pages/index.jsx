import { useState } from "react";
import { useRouter } from "next/router";

export default function Home() {
  const router = useRouter();
  const [vendorId, setVendorId] = useState("");
  const [categoryId, setCategoryId] = useState("");

  const go = (e) => {
    e.preventDefault();
    if (!vendorId || !categoryId) return;
    router.push(`/preview/${encodeURIComponent(vendorId)}/${encodeURIComponent(categoryId)}`);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc" }}>
      <form onSubmit={go} style={{ background: "#fff", padding: 24, borderRadius: 12, boxShadow: "0 2px 10px rgba(0,0,0,0.06)", width: 360, display: "flex", flexDirection: "column", gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Open Preview</h1>
        <input placeholder="Vendor ID" value={vendorId} onChange={(e) => setVendorId(e.target.value)} style={{ padding: 10, border: "1px solid #e5e7eb", borderRadius: 8 }} />
        <input placeholder="Category ID" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={{ padding: 10, border: "1px solid #e5e7eb", borderRadius: 8 }} />
        <button type="submit" style={{ padding: 10, borderRadius: 8, border: "none", background: "#0ea5e9", color: "#fff", fontWeight: 600, cursor: "pointer" }}>Go</button>
      </form>
    </div>
  );
}
