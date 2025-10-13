import React from "react";
import  categoryThemes  from "../utils/categoryThemes";

export default function ProductsSection({ categoryName, vendor }) {
  const theme = categoryThemes[categoryName] || categoryThemes.Default;

  return (
    <section
      id="products"
      style={{
        padding: "40px 20px",
        textAlign: "center",
        fontFamily: "Poppins, sans-serif",
        background: theme.background,
        color: theme.text,
      }}
    >
      <h2
        style={{
          fontSize: "40px",
          fontWeight: 700,
          lineHeight: "48px",
          color: theme.primary,
          marginBottom: "16px",
        }}
      >
        {categoryName}
      </h2>

      <p
        style={{
          fontSize: "17.6px",
          lineHeight: "26.4px",
          color: theme.text,
          margin: "0 auto 30px",
          maxWidth: "700px",
        }}
      >
        <strong>{vendor.businessName}</strong> Services & Pricing
      </p>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "15px",
        }}
      >
        {vendor.categories?.map((cat) =>
          cat.children?.map((child) => (
            <div
              key={child.id}
              style={{
                border: `1px solid ${theme.accent}`,
                borderRadius: "8px",
                width: "200px",
                padding: "10px",
                color: theme.text,
                textAlign: "start",
                transition: "all 0.3s ease",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-5px)";
                e.currentTarget.style.boxShadow = `0 6px 15px rgba(0,0,0,0.15)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              {child.imageUrl && (
                <img
                  src={`http://localhost:5000${child.imageUrl}`}
                  alt={child.name}
                  style={{
                    width: "100%",
                    height: "120px",
                    objectFit: "cover",
                    marginBottom: "8px",
                    borderRadius: "6px",
                  }}
                />
              )}
              <h4 style={{ fontWeight: "bold", marginBottom: "4px", color: theme.primary }}>
                {child.name}
              </h4>
              <p style={{ margin: 0 }}>Price: ₹{child.price ?? "N/A"}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
