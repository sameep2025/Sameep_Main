export default function ProductsSection({ categoryName, vendor }) {
  return (
    <section id="products" style={{ padding: "40px 20px", textAlign: "center", fontFamily: "Poppins, sans-serif" }}>
      
      

      {/* Header */}
      <h2
        style={{
          fontSize: "40px",
          fontWeight: 700,
          lineHeight: "48px",
          color: "#1F2937",
          marginBottom: "16px",
          textAlign: "center",
        }}
      >
        {categoryName}
      </h2>

      {/* Paragraph */}
      <p
        style={{
          fontSize: "17.6px",
          fontWeight: 400,
          lineHeight: "26.4px",
          color: "#6B7280",
          margin: "0 auto 30px",
          maxWidth: "700px",
          textAlign: "center",
        }}
      >
        <strong>{vendor.businessName}</strong> Services & Pricing
      </p>

      {/* Cards */}
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "15px" }}>
        {vendor.categories?.map((cat) =>
          cat.children?.map((child) => (
            <div
              key={child.id}
              style={{
                border: "1px solid #ddd",
                borderRadius: "8px",
                width: "200px",
                padding: "10px",
                fontFamily: "Poppins, sans-serif",
                fontSize: "16px",
                lineHeight: "24px",
                color: "#000000",
                textAlign: "start",
              }}
            >
              {child.imageUrl && (
                <img
                  src={`http://localhost:5000${child.imageUrl}`}
                  alt={child.name}
                  style={{ width: "100%", height: "120px", objectFit: "cover", marginBottom: "8px", borderRadius: "6px" }}
                />
              )}
              <h4 style={{ fontWeight: "bold", marginBottom: "4px", color: "#1F2937" }}>{child.name}</h4>
              <p style={{ margin: 0 }}>Price: ₹{child.price ?? "N/A"}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
