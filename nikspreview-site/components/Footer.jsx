import React from "react";
import categoryThemes from "../utils/categoryThemes";

export default function Footer({ categoryName = "default" }) {
  const theme = categoryThemes[categoryName] || categoryThemes.default;

  return (
    <footer
      style={{
        background: theme.primary,
        color: theme.text,
        padding: "50px 20px 20px",
        fontFamily: "Poppins, sans-serif",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "30px",
          maxWidth: "1200px",
          margin: "0 auto",
        }}
      >
        <div>
          <h3 style={{ fontSize: "18px", fontWeight: "bold", color: theme.text, marginBottom: "15px" }}>Lorem Ipsum</h3>
          <p style={{ fontSize: "14px", lineHeight: "1.8", color: theme.text }}>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit.
          </p>
        </div>

        <div>
          <h3 style={{ fontSize: "18px", fontWeight: "bold", color: theme.text, marginBottom: "15px" }}>Lorem Links</h3>
          <ul style={{ listStyle: "none", padding: 0, lineHeight: "1.8" }}>
            <li><a href="#" style={{ color: theme.text, textDecoration: "none" }}>Lorem</a></li>
            <li><a href="#" style={{ color: theme.text, textDecoration: "none" }}>Ipsum</a></li>
            <li><a href="#" style={{ color: theme.text, textDecoration: "none" }}>Dolor</a></li>
          </ul>
        </div>

        <div>
          <h3 style={{ fontSize: "18px", fontWeight: "bold", color: theme.text, marginBottom: "15px" }}>Sample Products</h3>
          <ul style={{ listStyle: "none", padding: 0, lineHeight: "1.8", color: theme.text }}>
            <li>Lorem Product 1</li>
            <li>Ipsum Product 2</li>
            <li>Dolor Product 3</li>
          </ul>
        </div>

        <div>
          <h3 style={{ fontSize: "18px", fontWeight: "bold", color: theme.text, marginBottom: "15px" }}>Contact Info</h3>
          <p>+00 123456789</p>
          <p>Lorem City, Ipsum State</p>
          <p>9:00 AM – 6:00 PM</p>
        </div>
      </div>

      <div
        style={{
          textAlign: "center",
          marginTop: "40px",
          borderTop: `1px solid ${theme.accent}`,
          paddingTop: "15px",
          fontSize: "14px",
          color: theme.text,
        }}
      >
        © 2025 Sameep Company. All Rights Reserved.
      </div>
    </footer>
  );
}
