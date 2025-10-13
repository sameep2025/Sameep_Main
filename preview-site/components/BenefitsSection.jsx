// components/BenefitsSection.jsx
import React from "react";

export default function BenefitsSection() {
  const benefitsData = [
    { title: "Fast Delivery", desc: "Get your orders quickly and reliably." },
    { title: "Quality Products", desc: "Only the best products for our customers." },
    { title: "Expert Advice", desc: "Professional guidance for your needs." },
    { title: "Organic", desc: "100% pure and natural products." },
    { title: "Trusted Service", desc: "We value long-term customer relationships." },
    { title: "Special Offers", desc: "Exciting deals and discounts regularly." },
  ];

  return (
    <section
      id="benefits"
      style={{
        padding: "50px 20px",
        fontFamily: "Poppins, sans-serif",
        textAlign: "center",
      }}
    >
      {/* Heading */}
      <h2
        style={{
          fontSize: "32px",
          fontWeight: "bold",
          marginBottom: "15px",
          color: "#000",
        }}
      >
        Why Choose Us
      </h2>

      {/* Paragraph */}
      <p
        style={{
          fontSize: "16px",
          marginBottom: "40px",
          maxWidth: "600px",
          margin: "0 auto",
          color: "#475467",
        }}
      >
        We provide top-notch services and products that help you achieve the best results.
        Our commitment to quality and customer satisfaction is unmatched.
      </p>

      {/* Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "20px",
          maxWidth: "1000px",
          margin: "0 auto",
        }}
      >
        {benefitsData.map((item, idx) => (
          <div
            key={idx}
            style={{
              background: "#F0FDF4",
              borderRadius: "12px",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              transition: "all 0.3s ease",
              cursor: "pointer",
              border: "1px solid transparent", // default border
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.border = "3px solid #047857"; // green border
              e.currentTarget.style.transform = "translateY(-5px)";
              e.currentTarget.style.boxShadow = "0 6px 15px rgba(0,0,0,0.15)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.border = "1px solid transparent";
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            {/* Small green circle */}
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "50%",
                backgroundColor: "#047857",
                marginBottom: "15px",
              }}
            ></div>

            {/* Card heading */}
            <h3
              style={{
                fontSize: "18px",
                fontWeight: "bold",
                marginBottom: "8px",
                color: "#000",
                textAlign: "center",
              }}
            >
              {item.title}
            </h3>

            {/* Card description */}
            <p style={{ fontSize: "14px", color: "#475467", textAlign: "center" }}>
              {item.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
