import { useNavigate } from "react-router-dom";
import MasterCard from "../../components/MasterCard";

export default function BikesMainPage() {
  const navigate = useNavigate();

  return (
    <div style={{ padding: "40px", maxWidth: "1200px", margin: "0 auto" }}>
      <h2
        style={{
          color: "#000",
          marginBottom: "30px",
          fontWeight: "bold",
          fontSize: "28px",
        }}
      >
        Manage Bikes
      </h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "24px",
          width: "100%",
        }}
      >
        <MasterCard title="Brands" onClick={() => navigate("/master/bikes/brands")} />
<MasterCard title="Body Types" onClick={() => navigate("/master/bikes/body-types")} />
<MasterCard title="Models" onClick={() => navigate("/master/bikes/models")} />
        <MasterCard title="Transmission Types" onClick={() => navigate("/master/bikes/transmission-types")} />

      </div>
    </div>
  );
}
