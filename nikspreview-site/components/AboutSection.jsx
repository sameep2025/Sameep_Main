import React from "react";
import  categoryThemes  from "../utils/categoryThemes";



// Fallback theme if category not found
const fallbackTheme = {
  background: "#F4F4F5",
  text: "#111827",
  primary: "#059669",
  accent: "#10B981",
};

export default function AboutSection({ categoryName, theme: propTheme }) {
  // Use prop theme if provided, otherwise fallback to categoryThemes
  const theme = propTheme || categoryThemes[categoryName] || fallbackTheme;

  return (
    <section
      id="about"
      style={{
        display: "flex",
        gap: "40px",
        padding: "50px 20px",
        alignItems: "center",
        backgroundColor: theme.background || fallbackTheme.background,
        fontFamily: "Poppins, sans-serif",
        flexWrap: "wrap",
      }}
    >
      {/* Left Column */}
      <div style={{ flex: 1 }}>
        <h2
          style={{
            fontSize: "32px",
            fontWeight: "bold",
            marginBottom: "20px",
            color: theme.primary || fallbackTheme.primary,
          }}
        >
          About Our Business
        </h2>
        <p
          style={{
            marginBottom: "30px",
            lineHeight: "1.6",
            color: theme.text || fallbackTheme.text,
          }}
        >
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer nec odio.
          Praesent libero. Sed cursus ante dapibus diam. Sed nisi. Nulla quis sem at nibh
          elementum imperdiet. Duis sagittis ipsum. Praesent mauris.
        </p>

        <div style={{ display: "flex", gap: "20px" }}>
          <div
            style={{
              flex: 1,
              border: "1px solid #ddd",
              padding: "20px",
              borderRadius: "10px",
              boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
            }}
          >
            <h4 style={{ marginBottom: "10px", color: theme.primary || fallbackTheme.primary }}>
              Our Mission
            </h4>
            <p style={{ fontSize: "14px", color: theme.text || fallbackTheme.text }}>
              To provide the best quality service to our customers.
            </p>
          </div>

          <div
            style={{
              flex: 1,
              border: "1px solid #ddd",
              padding: "20px",
              borderRadius: "10px",
              boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
            }}
          >
            <h4 style={{ marginBottom: "10px", color: theme.primary || fallbackTheme.primary }}>
              Our Vision
            </h4>
            <p style={{ fontSize: "14px", color: theme.text || fallbackTheme.text }}>
              To become the most trusted brand worldwide.
            </p>
          </div>
        </div>
      </div>

      {/* Right Column */}
      <div
        style={{
          flex: 1,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div
          style={{
            width: "80%",
            padding: "40px",
            textAlign: "center",
            borderRadius: "15px",
            backgroundColor: theme.primary || fallbackTheme.primary,
            boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
          }}
        >
          {/* Circle Icon */}
          <div
            style={{
              width: "70px",
              height: "70px",
              borderRadius: "50%",
              backgroundColor: theme.accent || fallbackTheme.accent,
              margin: "0 auto 20px auto",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              color: "white",
              fontSize: "24px",
            }}
          ></div>

          <h3 style={{ marginBottom: "10px", color: "white" }}>Quality</h3>
          <p style={{ marginBottom: "20px", color: "white" }}>Pure Service</p>

          <button
            style={{
              padding: "10px 20px",
              backgroundColor: theme.accent || fallbackTheme.accent,
              color: "white",
              border: "none",
              borderRadius: "30px",
              cursor: "pointer",
            }}
          >
            Learn More
          </button>
        </div>
      </div>
    </section>
  );
}
