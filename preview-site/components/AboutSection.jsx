import React from "react";
import { Target, Eye, Star } from "lucide-react";

export default function AboutSection({ categoryName, businessName, about }) {
  const isDriving = String(categoryName || "").toLowerCase() === "driving school";

  const trimmedBusiness = String(businessName || "").trim();

  const applyBusinessName = (text) => {
    const raw = text == null ? "" : String(text);
    const base = raw.trim();
    if (!base) return base;
    if (!trimmedBusiness) return base.replace(/\{business name\}/gi, "").trim();
    return base.replace(/\{business name\}/gi, trimmedBusiness);
  };

  const trimOrNull = (v) => {
    const s = v == null ? "" : String(v);
    const t = s.trim();
    return t || null;
  };

  const aboutHeading = about && typeof about === "object" ? trimOrNull(about.heading) : null;
  const aboutMainText = about && typeof about === "object" ? trimOrNull(about.mainText) : null;
  const aboutMission = about && typeof about === "object" ? trimOrNull(about.mission) : null;
  const aboutVision = about && typeof about === "object" ? trimOrNull(about.vision) : null;
  const aboutCard = about && typeof about === "object" && about.card && typeof about.card === "object" ? about.card : null;
  const aboutCardTitle = aboutCard ? trimOrNull(aboutCard.title) : null;
  const aboutCardDescription = aboutCard ? trimOrNull(aboutCard.description) : null;
  const aboutCardButtonLabel = aboutCard ? trimOrNull(aboutCard.buttonLabel) : null;
  const aboutCardIconUrl = aboutCard ? trimOrNull(aboutCard.iconUrl) : null;

  const heading = applyBusinessName(
    aboutHeading
      || (trimmedBusiness
        ? `About ${trimmedBusiness}`
        : isDriving
        ? "About Driving School"
        : "About Our Business")
  );

  const mainText = aboutMainText
    || (trimmedBusiness || isDriving
      ? `At ${trimmedBusiness || "Driving School"}, we believe that learning to drive should be a journey of excitement, not anxiety. With over 15 years of experience, we've helped thousands of students gain the skills and confidence to navigate the roads safely and responsibly.`
      : "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer nec odio. Praesent libero. Sed cursus ante dapibus diam. Sed nisi. Nulla quis sem at nibh elementum imperdiet. Duis sagittis ipsum. Praesent mauris.");

  const missionText = aboutMission
    || (trimmedBusiness || isDriving
      ? "To empower every student with the essential driving skills and unwavering confidence needed for a lifetime of safe and enjoyable travel."
      : "To provide the best quality service to our customers.");

  const visionText = aboutVision
    || (trimmedBusiness || isDriving
      ? "To be the most trusted and innovative driving school, setting the standard for excellence in driver education globally."
      : "To become the most trusted brand worldwide.");

  const rightTitle = aboutCardTitle
    || (trimmedBusiness || isDriving ? "Unmatched Quality" : "Why Customers Trust Us");
  const rightText = aboutCardDescription
    || (trimmedBusiness || isDriving
      ? "Every lesson, every car, every instructor – curated for your success."
      : "We carefully design our services, team, and support to deliver a consistently great experience.");
  const rightButtonLabel = aboutCardButtonLabel || "Discover More";

  return (
    <section
      id="about"
      style={{
        padding: "72px 16px",
        backgroundColor: "#ffffff",
        fontFamily:
          "Poppins, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
      }}
    >
      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)",
          gap: 48,
          alignItems: "center",
          paddingLeft: "12px",
          paddingRight: 16,
          transform: "translateX(-20px)",
        }}
      >
        {/* Left Column */}
        <div>
          <h2
            style={{
              fontSize: 36,
              fontWeight: 900,
              color: "#0f172a",
              margin: "0 0 24px 0",
            }}
          >
            {heading}
          </h2>
          <p
            className="about-main-text"
            style={{
              fontSize: 18,
              color: "#374151",
              lineHeight: 1.7,
              margin: "0 0 32px 0",
            }}
          >
            {mainText}
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 20,
            }}
          >
            <div
              style={{
                background:
                  "linear-gradient(135deg, #ecfdf3 0%, #ffffff 60%, #f9fafb 100%)",
                padding: 24,
                borderRadius: 16,
                boxShadow: "0 8px 20px rgba(15,23,42,0.04)",
                border: "1px solid #e5e7eb",
              }}
            >
              <h4
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: "#111827",
                  margin: 0,
                  marginBottom: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Target style={{ width: 20, height: 20, color: "#059669" }} />
                Our Mission
              </h4>
              <p
                style={{
                  fontSize: 14,
                  color: "#6b7280",
                  margin: 0,
                  marginTop: 6,
                }}
              >
                {missionText}
              </p>
            </div>

            <div
              style={{
                background:
                  "linear-gradient(135deg, #eff6ff 0%, #ffffff 60%, #f9fafb 100%)",
                padding: 24,
                borderRadius: 16,
                boxShadow: "0 8px 20px rgba(15,23,42,0.04)",
                border: "1px solid #e5e7eb",
              }}
            >
              <h4
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: "#111827",
                  margin: 0,
                  marginBottom: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Eye style={{ width: 20, height: 20, color: "#2563eb" }} />
                Our Vision
              </h4>
              <p
                style={{
                  fontSize: 14,
                  color: "#6b7280",
                  margin: 0,
                  marginTop: 6,
                }}
              >
                {visionText}
              </p>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 320,
              padding: 36,
              borderRadius: 28,
              backgroundColor: "#16a34a",
              boxShadow: "0 20px 40px rgba(5,150,105,0.45)",
              textAlign: "center",
              color: "#ffffff",
              transform: "translateY(0)",
              transition: "transform 0.2s ease, box-shadow 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-4px)";
              e.currentTarget.style.boxShadow =
                "0 26px 52px rgba(5,150,105,0.6)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow =
                "0 20px 40px rgba(5,150,105,0.45)";
            }}
          >
            <div
              style={{
                width: 96,
                height: 96,
                borderRadius: 999,
                backgroundColor: "#22c55e",
                margin: "0 auto 20px auto",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 12px 24px rgba(0,0,0,0.28)",
                overflow: "hidden",
              }}
            >
              {aboutCardIconUrl ? (
                <img
                  src={aboutCardIconUrl}
                  alt={aboutCardTitle || "About"}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <Star style={{ width: 40, height: 40, color: "#ffffff" }} />
              )}
            </div>
            <h3
              style={{
                fontSize: 30,
                fontWeight: 800,
                color: "#ffffff",
                margin: "0 0 12px 0",
              }}
            >
              {rightTitle}
            </h3>
            <p
              className="about-right-text"
              style={{
                fontSize: 16,
                color: "#DCFCE7",
                margin: "0 0 24px 0",
              }}
            >
              {rightText}
            </p>
            <button
              style={{
                padding: "11px 26px",
                borderRadius: 999,
                backgroundColor: "#ffffff",
                color: "#047857",
                border: "none",
                fontWeight: 700,
                cursor: "pointer",
                fontSize: 14,
                boxShadow: "0 10px 18px rgba(255,255,255,0.32)",
                maxWidth: 260,
                margin: "0 auto",
                whiteSpace: "normal",
                lineHeight: 1.3,
                wordBreak: "break-word",
              }}
            >
              {rightButtonLabel}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
