import { useRouter } from "next/router";
import  categoryThemes  from "../utils/categoryThemes";

export default function HomeSection({ businessName, categoryName }) {
  const router = useRouter();

  // Get theme for this category, fallback to Default
  const theme = categoryThemes[categoryName] || categoryThemes.Default;

  return (
    <section
      id="home"
      style={{
        minHeight: "100vh",
        paddingTop: "80px",
        paddingBottom: "40px",
        background: theme.primary,  // dynamically set background
        fontFamily: "Poppins, sans-serif",
        color: theme.text,          // dynamically set text color
      }}
    >
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          paddingLeft: "40px",
          paddingRight: "40px",
        }}
      >
        {/* Business Name */}
        <h1
          style={{
            fontSize: "36px",
            fontWeight: "bold",
            marginBottom: "20px",
            color: theme.text, // use text color for heading
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
            color: theme.text, // dynamic text color
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
                color: theme.accent, // dynamic accent color
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
                color: theme.accent,
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
                color: theme.accent,
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
              backgroundColor: theme.accent, // dynamic accent
              color: "white",
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
              backgroundColor: theme.primary, // dynamic primary
              color: "white",
              border: `2px solid ${theme.text}`,
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
