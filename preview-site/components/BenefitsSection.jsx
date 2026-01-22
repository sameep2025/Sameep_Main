// components/BenefitsSection.jsx
import React from "react";
import { Zap, Award, ShieldCheck, CalendarCheck2, Handshake, Gem } from "lucide-react";

export default function BenefitsSection({ categoryName, businessName, whyUs }) {
  const isDriving = String(categoryName || "").toLowerCase() === "driving school";
  const trimmedBusiness = String(businessName || "").trim();

  const applyBusinessName = (text) => {
    const raw = text == null ? "" : String(text);
    const base = raw.trim();
    if (!base) return base;
    if (!trimmedBusiness) return base.replace(/\{business name\}/gi, "").trim();
    return base.replace(/\{business name\}/gi, trimmedBusiness);
  };

  const hasWhyUs =
    whyUs && typeof whyUs === "object" &&
    ((whyUs.heading && String(whyUs.heading).trim()) ||
      (whyUs.subHeading && String(whyUs.subHeading).trim()) ||
      (Array.isArray(whyUs.cards) && whyUs.cards.length));

  const baseHeading = trimmedBusiness
    ? `Why Choose ${trimmedBusiness}?`
    : isDriving
    ? "Why Choose Driving School?"
    : "Why Choose Us";

  const heading = hasWhyUs && whyUs.heading && String(whyUs.heading).trim()
    ? applyBusinessName(whyUs.heading)
    : applyBusinessName(baseHeading);

  const baseSubText = isDriving
    ? "Experience the difference with our commitment to excellence, safety, and customer satisfaction."
    : "We provide top-notch services and products that help you achieve the best results. Our commitment to quality and customer satisfaction is unmatched.";

  const subText = hasWhyUs && whyUs.subHeading && String(whyUs.subHeading).trim()
    ? String(whyUs.subHeading).trim()
    : baseSubText;

  const fallbackBenefits = isDriving
    ? [
        {
          title: "Efficient Learning",
          desc: "Structured lessons for quick, effective skill acquisition.",
        },
        {
          title: "Certified Instructors",
          desc: "Learn from the best, with experienced and patient teachers.",
        },
        {
          title: "Safety First",
          desc: "Modern vehicles and rigorous safety protocols.",
        },
        {
          title: "Flexible Scheduling",
          desc: "Lessons designed to fit your busy lifestyle.",
        },
        {
          title: "Personalized Approach",
          desc: "Tailored lessons to meet individual learning needs.",
        },
        {
          title: "Great Value",
          desc: "Premium education at competitive, fair pricing.",
        },
      ]
    : [
        { title: "Fast Delivery", desc: "Get your orders quickly and reliably." },
        { title: "Quality Products", desc: "Only the best products for our customers." },
        { title: "Expert Advice", desc: "Professional guidance for your needs." },
        { title: "Organic", desc: "100% pure and natural products." },
        { title: "Trusted Service", desc: "We value long-term customer relationships." },
        { title: "Special Offers", desc: "Exciting deals and discounts regularly." },
      ];

  const benefitsData = (() => {
    if (!hasWhyUs || !Array.isArray(whyUs.cards)) return fallbackBenefits;
    const cleaned = whyUs.cards
      .map((c) => c || {})
      .map((c) => ({
        title: String(c.title || "").trim(),
        desc: String(c.description || "").trim(),
        iconUrl: c.iconUrl || "",
      }))
      .filter((c) => c.title || c.desc || c.iconUrl);
    return cleaned.length ? cleaned : fallbackBenefits;
  })();

  const icons = [Zap, Award, ShieldCheck, CalendarCheck2, Handshake, Gem];

  return (
    <section
      id="benefits"
      style={{
        padding: "72px 16px",
        backgroundColor: "#ECFDF5", // forced mint background
        fontFamily:
          "Poppins, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
        fontSize: "16px",
      }}
    >
      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <h2
          style={{
            fontSize: "36px",
            fontWeight: 900,
            color: "#0f172a",
            margin: 0,
            marginBottom: 10,
          }}
        >
          {heading}
        </h2>
        <p
          className="benefits-subtitle"
          style={{
            fontSize: "26px",
            color: "#64748b",
            maxWidth: 760,
            margin: "10px auto 44px auto",
          }}
        >
          {subText}
        </p>

        {/* Cards grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 24,
          }}
        >
          {benefitsData.map((item, idx) => {
            const Icon = icons[idx % icons.length];
            return (
              <div
                key={idx}
                style={{
                  backgroundColor: "#FFFFFF", // forced card background
                  borderRadius: 16,
                  padding: 26,
                  boxShadow: "0 14px 28px rgba(15,23,42,0.10)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  textAlign: "center",
                  transition: "transform 0.2s ease, box-shadow 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-4px)";
                  e.currentTarget.style.boxShadow =
                    "0 18px 36px rgba(15,23,42,0.16)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow =
                    "0 14px 28px rgba(15,23,42,0.10)";
                }}
              >
                <div
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: 999,
                    backgroundColor: "#D1FAE5", // icon bg
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#059669", // icon color
                    marginBottom: 16,
                    overflow: "hidden",
                  }}
                >
                  {item.iconUrl ? (
                    <img
                      src={item.iconUrl}
                      alt={item.title || "Icon"}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <Icon style={{ width: 28, height: 28 }} />
                  )}
                </div>
                <h3
                  style={{
                    fontSize: 19,
                    fontWeight: 700,
                    color: "#111827",
                    margin: 0,
                    marginBottom: 10,
                  }}
                >
                  {item.title}
                </h3>
                <p
                  style={{
                    fontSize: "14px",
                    color: "#6b7280",
                    margin: 0,
                  }}
                >
                  {item.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
