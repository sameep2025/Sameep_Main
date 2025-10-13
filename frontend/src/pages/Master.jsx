import { useNavigate } from "react-router-dom";

// Card Component
function MasterCard({ title, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        borderRadius: 12,
        background: "#fff",
        padding: "20px",
        boxSizing: "border-box", // prevent overflow
        width: "100%", // full width of grid cell
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

export default function MasterPage() {
  const navigate = useNavigate();

  return (
    <div style={{ padding: "40px", maxWidth: "1200px", margin: "0 auto" }}>
      <h2 style={{ color: "#000", marginBottom: "30px", fontWeight: "bold" }}>
        Master Data
      </h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "24px",
          width: "100%",
        }}
      >
        <MasterCard title="Manage Status" onClick={() => navigate("/master/status")} />
        <MasterCard title="Manage Vendor Signup Levels" onClick={() => navigate("/master/signup-levels")} />
        <MasterCard title="Manage Display Types" onClick={() => navigate("/master/display-types")} />
        <MasterCard title="Manage Category Pricing Model" onClick={() => navigate("/master/category-pricing")} />
        <MasterCard title="Manage Category Models" onClick={() => navigate("/master/category-models")} />
        <MasterCard title="Manage Category Visibility" onClick={() => navigate("/master/category-visibility")} />
        <MasterCard title="Manage Social Handles" onClick={() => navigate("/master/social-handles")} />
        <MasterCard title="Manage Business Field List" onClick={() => navigate("/master/business-fields")} />
          <MasterCard
          title="Manage Cars"
          onClick={() => navigate("/master/cars")}
        />
        <MasterCard title="Manage Tempo Mini Bus" onClick={() => navigate("/master/tempo-mini-bus")} />
          <MasterCard title="Manage Bikes" onClick={() => navigate("/master/bikes")} />

          

      </div>
    </div>
  );
}
