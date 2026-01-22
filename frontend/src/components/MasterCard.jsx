// src/components/MasterCard.jsx
export default function MasterCard({ title, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        borderRadius: 12,
        background: "#fff",
        padding: "20px",
        boxSizing: "border-box",
        width: "100%",
        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
        border: "1px solid #e5e7eb",
        cursor: "pointer",
        textAlign: "center",
        fontWeight: 400,
        wordWrap: "break-word",
        minHeight: "100px",
        transition: "transform 0.2s, box-shadow 0.2s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-4px)";
        e.currentTarget.style.boxShadow = "0 8px 16px rgba(0,0,0,0.15)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)";
      }}
    >
      <h3 style={{ color: "#00AEEF", margin: 0, fontWeight: 400 }}>{title}</h3>
    </div>
  );
}
