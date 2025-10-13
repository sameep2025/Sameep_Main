import Link from "next/link";

function VendorCard({ vendor, category }) {
  if (!vendor || !category) return null; // avoid errors

  return (
    <div style={{ border: "1px solid #ddd", padding: "12px", borderRadius: "8px", marginBottom: "10px" }}>
      <h2>{vendor.businessName}</h2>
      <Link href={`/preview/${vendor._id}/${category._id}`}>
        <button style={{ padding: "8px 16px", background: "#047857", color: "white", border: "none", borderRadius: "4px" }}>
          Preview
        </button>
      </Link>
    </div>
  );
}

export default VendorCard;