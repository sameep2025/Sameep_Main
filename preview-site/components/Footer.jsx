// components/Footer.jsx
import React from "react";

export default function Footer() {
  return (
    <footer
      style={{
        background: "#111827", // dark background
        color: "#d1d5db", // light gray text
        padding: "50px 20px 20px",
        fontFamily: "Poppins, sans-serif",
      }}
    >
      {/* Top Section - 4 Columns */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "30px",
          maxWidth: "1200px",
          margin: "0 auto",
        }}
      >
        {/* Column 1 - About */}
        <div>
          <h3 style={{ fontSize: "18px", fontWeight: "bold", color: "white", marginBottom: "15px" }}>
            Lorem Ipsum
          </h3>
          <p style={{ fontSize: "14px", lineHeight: "1.8" }}>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
          </p>
        </div>

        {/* Column 2 - Links */}
        <div>
          <h3 style={{ fontSize: "18px", fontWeight: "bold", color: "white", marginBottom: "15px" }}>
            Lorem Links
          </h3>
          <ul style={{ listStyle: "none", padding: 0, lineHeight: "1.8" }}>
            <li><a href="#" style={{ color: "#d1d5db", textDecoration: "none" }}>Lorem</a></li>
            <li><a href="#" style={{ color: "#d1d5db", textDecoration: "none" }}>Ipsum</a></li>
            <li><a href="#" style={{ color: "#d1d5db", textDecoration: "none" }}>Dolor</a></li>
          </ul>
        </div>

        {/* Column 3 - Products */}
        <div>
          <h3 style={{ fontSize: "18px", fontWeight: "bold", color: "white", marginBottom: "15px" }}>
            Sample Products
          </h3>
          <ul style={{ listStyle: "none", padding: 0, lineHeight: "1.8" }}>
            <li>Lorem Product 1</li>
            <li>Ipsum Product 2</li>
            <li>Dolor Product 3</li>
          </ul>
        </div>

        {/* Column 4 - Contact Info */}
        <div>
          <h3 style={{ fontSize: "18px", fontWeight: "bold", color: "white", marginBottom: "15px" }}>
            Contact Info
          </h3>
          <p>+00 123456789</p>
          <p>Lorem City, Ipsum State</p>
          <p>9:00 AM – 6:00 PM</p>
        </div>
      </div>

      {/* Bottom Section - Copyright */}
      <div
        style={{
          textAlign: "center",
          marginTop: "40px",
          borderTop: "1px solid #374151",
          paddingTop: "15px",
          fontSize: "14px",
        }}
      >
        © 2025 Sameep Company. All Rights Reserved.
      </div>
    </footer>
  );
}
