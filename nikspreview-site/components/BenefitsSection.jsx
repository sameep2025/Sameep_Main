import categoryThemes from "../utils/categoryThemes";

const fallbackTheme = {
  primary: "#1249c1ff",
  accent: "#2563EB",
  background: "#F9FAFB",
  cardBg: "#FFFFFF",
  text: "#255bd0ff"
};
export default function BenefitsSection({ categoryName, theme }) {
  // Use theme from props if passed, otherwise fallback
  const appliedTheme = theme || categoryThemes[categoryName] || fallbackTheme;

  return (
    <section
      id="benefits"
      style={{
        padding: "50px 20px",
        fontFamily: "Poppins, sans-serif",
        textAlign: "center",
        backgroundColor: appliedTheme.background,
        color: appliedTheme.text,
      }}
    >
      <h2
        style={{
          fontSize: "32px",
          fontWeight: "bold",
          marginBottom: "15px",
          color: appliedTheme.primary,
        }}
      >
        Why Choose Us
      </h2>

      <p
        style={{
          fontSize: "16px",
          marginBottom: "40px",
          maxWidth: "600px",
          margin: "0 auto",
          color: appliedTheme.text,
        }}
      >
        We provide top-notch services and products that help you achieve the best results.
        Our commitment to quality and customer satisfaction is unmatched.
      </p>

      {/* Benefits cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "20px",
          maxWidth: "1000px",
          margin: "0 auto",
        }}
      >
        {[
          { title: "Fast Delivery", desc: "Get your orders quickly and reliably." },
          { title: "Quality Products", desc: "Only the best products for our customers." },
          { title: "Expert Advice", desc: "Professional guidance for your needs." },
          { title: "Organic", desc: "100% pure and natural products." },
          { title: "Trusted Service", desc: "We value long-term customer relationships." },
          { title: "Special Offers", desc: "Exciting deals and discounts regularly." },
        ].map((item, idx) => (
          <div
            key={idx}
            style={{
              background: appliedTheme.cardBg || appliedTheme.background,
              borderRadius: "12px",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              cursor: "pointer",
              border: `1px solid transparent`,
              transition: "all 0.3s ease",
            }}
          >
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "50%",
                backgroundColor: appliedTheme.primary,
                marginBottom: "15px",
              }}
            ></div>

            <h3 style={{ fontSize: "18px", fontWeight: "bold", marginBottom: "8px", color: appliedTheme.text, textAlign: "center" }}>
              {item.title}
            </h3>

            <p style={{ fontSize: "14px", color: appliedTheme.text, textAlign: "center" }}>
              {item.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
