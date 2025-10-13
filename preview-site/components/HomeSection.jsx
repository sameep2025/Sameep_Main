import { useRouter } from "next/router";

export default function HomeSection({ businessName }) {
  const router = useRouter();

  return (
    <section
      style={{
        minHeight: "100vh",
        paddingTop: "80px",
        paddingBottom: "40px",
        background: "#058C63",
        fontFamily: "Poppins, sans-serif",
        color: "white",
      }}
    >
      {/* Centered container with limited width */}
      <div
        style={{
          maxWidth: "1200px",   // 👈 set max page width
          margin: "0 auto",     // 👈 center horizontally
          paddingLeft: "40px",  // 👈 inner padding
          paddingRight: "40px",
        }}
      >
        {/* Business Name */}
        <h1
          style={{
            fontSize: "36px",
            fontWeight: "bold",
            marginBottom: "20px",
          }}
        >
          {businessName}
        </h1>

        {/* Description Paragraph */}
        <p
          style={{
            fontSize: "16px",
            maxWidth: "700px",
            marginBottom: "30px",
          }}
        >
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Quisque
          euismod est in sapien feugiat, nec ultrices nisl fermentum. Sed vel
          sem in nulla suscipit finibus. Mauris vitae quam sit amet nulla
          hendrerit varius.
        </p>

        {/* Stats Row */}
        <div
          style={{
            display: "flex",
            gap: "40px",
            marginBottom: "30px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "24px",
                fontWeight: "900",
                color: "#FBBF24",
              }}
            >
              15+
            </div>
            <div>Years Experience</div>
          </div>
          <div>
            <div
              style={{
                fontSize: "24px",
                fontWeight: "900",
                color: "#FBBF24",
              }}
            >
              1000+
            </div>
            <div>Happy Customers</div>
          </div>
          <div>
            <div
              style={{
                fontSize: "24px",
                fontWeight: "900",
                color: "#FBBF24",
              }}
            >
              100%
            </div>
            <div>Pure Organic</div>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
          <button
  onClick={() => {
    const el = document.getElementById("products");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  }}
  style={{
    padding: "12px 24px",
    backgroundColor: "#FBBF24",
    color: "black",
    border: "none",
    borderRadius: "30px",
    cursor: "pointer",
    fontWeight: "bold",
    fontSize: "16px",
  }}
>
  View Products
</button>

          <button
            onClick={() => alert("Order Now Clicked")}
            style={{
              padding: "12px 24px",
              backgroundColor: "#058963",
              color: "white",
              border: "white 2px solid",
              borderRadius: "30px",
              cursor: "pointer",
              fontWeight: "bold",
              fontSize: "16px",
            }}
          >
            Order Now
          </button>
        </div>
      </div>
    </section>
  );
}
