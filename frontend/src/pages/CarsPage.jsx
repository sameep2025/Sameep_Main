import { useNavigate } from "react-router-dom";

function Card({ title, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        borderRadius: 12,
        background: "#fff",
        padding: "20px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
        border: "1px solid #e5e7eb",
        cursor: "pointer",
        textAlign: "center",
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
      <h3 style={{ color: "#00AEEF", fontWeight: 500 }}>{title}</h3>
    </div>
  );
}

export default function CarsPage() {
  const navigate = useNavigate();

  return (
    <div style={{ padding: "40px" }}>
      <h2 style={{ color: "#000", marginBottom: "30px", fontWeight: "bold" }}>
        Manage Cars
      </h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "24px",
        }}
      >
        <Card title="Brands" onClick={() => navigate("/master/cars/brands")} />
        <Card title="Fuel Types" onClick={() => navigate("/master/cars/fuel-types")} />
        <Card title="Transmission Types" onClick={() => navigate("/master/cars/transmission-types")} />
        <Card title="Body Types" onClick={() => navigate("/master/cars/body-types")} />
        <Card title="Models" onClick={() => navigate("/master/cars/models")} />
      </div>
    </div>
  );
}
