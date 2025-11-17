import { useRouter } from "next/router";
import { useState, useMemo, useEffect } from "react";
import API_BASE_URL, { ASSET_BASE_URL } from "../config";

export default function HomeSection({ businessName, profilePictures = [], heroTitle, heroDescription }) {
  const router = useRouter();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  const [primaryHover, setPrimaryHover] = useState(false);
  const [secondaryHover, setSecondaryHover] = useState(false);

  const normalizedPics = useMemo(() => {
    return (Array.isArray(profilePictures) ? profilePictures : [])
      .map((s) => {
        const str = String(s || "");
        if (!str) return null;
        if (str.startsWith("http://") || str.startsWith("https://") || str.startsWith("data:")) return str;
        if (str.startsWith("/")) return `${ASSET_BASE_URL}${str}`;
        return `${ASSET_BASE_URL}/${str}`;
      })
      .filter(Boolean);
  }, [profilePictures]);

  // no-op if no images

  useEffect(() => {
    if (normalizedPics.length <= 1) return;
    setCurrentIdx(0);
    const id = setInterval(() => {
      setCurrentIdx((i) => (i + 1) % normalizedPics.length);
    }, 3000);
    return () => clearInterval(id);
  }, [normalizedPics.length]);

  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', onResize);
      setVw(window.innerWidth);
      return () => window.removeEventListener('resize', onResize);
    }
  }, []);

  const isMobile = vw <= 768;
  const isTablet = vw > 768 && vw <= 1024;

  const titleSource = heroTitle || businessName || "";
  const titleWords = String(titleSource).trim().split(/\s+/).filter(Boolean);
  const lastWord = titleWords.length > 1 ? titleWords[titleWords.length - 1] : titleWords[0] || "";
  const firstPart = titleWords.length > 1 ? titleWords.slice(0, -1).join(" ") : titleWords[0] || "";

  return (
    <section
      style={{
        minHeight: "100vh",
        paddingTop: 80,
        paddingBottom: 64,
        backgroundColor: "#D6EEDE",
        fontFamily: "Poppins, sans-serif",
        color: "#111827",
      }}
    >
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          paddingLeft: isMobile ? 16 : 0,
          paddingRight: isMobile ? 16 : 18,
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1.1fr) minmax(0,0.9fr)",
          gap: isMobile ? 24 : 40,
          alignItems: "center",
        }}
      >
        {/* Left: text */}
        <div style={{ textAlign: isMobile ? "center" : "left" }}>
          <h1
            style={{
              fontSize: isMobile ? 34 : 46,
              lineHeight: 1.1,
              fontWeight: 800,
              marginBottom: 20,
              color: "#111827",
            }}
          >
            <span>{firstPart}</span>{firstPart && " "}
            <span
              style={{
                backgroundImage: "linear-gradient(to right,#059669,#34d399)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                display: "inline-block",
              }}
            >
              {lastWord}
            </span>
          </h1>

          <p
            style={{
              fontSize: 18,
              color: "#4b5563",
              maxWidth: 560,
              margin: isMobile ? "0 auto 32px" : "0 0 32px",
            }}
          >
            {heroDescription || ""}
          </p>

          <div
            style={{
              display: "flex",
              gap: 32,
              marginBottom: 32,
              flexWrap: "wrap",
              justifyContent: isMobile ? "center" : "flex-start",
            }}
          >
            <div>
              <div style={{ fontSize: 34, fontWeight: 900, color: "#f59e0b", marginBottom: 4 }}>15+</div>
              <div style={{ color: "#374151", fontWeight: 500 }}>Years Experience</div>
            </div>
            <div>
              <div style={{ fontSize: 34, fontWeight: 900, color: "#f59e0b", marginBottom: 4 }}>1000+</div>
              <div style={{ color: "#374151", fontWeight: 500 }}>Happy Customers</div>
            </div>
            <div>
              <div style={{ fontSize: 34, fontWeight: 900, color: "#f59e0b", marginBottom: 4 }}>Top-Rated</div>
              <div style={{ color: "#374151", fontWeight: 500 }}>Quality Service</div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 16,
              flexWrap: "wrap",
              justifyContent: isMobile ? "center" : "flex-start",
            }}
          >
            <button
              onClick={() => {
                const el = document.getElementById("products");
                if (el) el.scrollIntoView({ behavior: "smooth" });
              }}
              onMouseEnter={() => setPrimaryHover(true)}
              onMouseLeave={() => setPrimaryHover(false)}
              style={{
                padding: "12px 28px",
                backgroundColor: "#16a34a",
                color: "#ffffff",
                border: "none",
                borderRadius: 999,
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 15,
                boxShadow: "0 8px 20px rgba(22,163,74,0.35)",
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                whiteSpace: "nowrap",
                fontFamily: "Poppins, sans-serif",
                justifyContent: "center",
                transform: primaryHover ? "translateY(-7px)" : "translateY(0)",
                opacity: primaryHover ? 1 : 0.9,
                transition: "transform 250ms ease, box-shadow 250ms ease, opacity 250ms ease",
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", whiteSpace: "nowrap", fontFamily: "Poppins, sans-serif" }}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ color: "#ffffff" }}
                >
                  <rect x="3" y="11" width="18" height="5" rx="2" ry="2" />
                  <path d="M5 11V9a3 3 0 0 1 3-3h4.5a3 3 0 0 1 2.7 1.7L17 11" />
                  <circle cx="7" cy="17" r="1.2" />
                  <circle cx="17" cy="17" r="1.2" />
                </svg>
              </span>
              <span>Explore Courses</span>
            </button>

            <button
              onClick={() => alert("Order Now Clicked")}
              onMouseEnter={() => setSecondaryHover(true)}
              onMouseLeave={() => setSecondaryHover(false)}
              style={{
                padding: "12px 28px",
                backgroundColor: "#ffffff",
                color: "#16a34a",
                border: "2px solid #16a34a",
                borderRadius: 999,
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 15,
                boxShadow: "0 8px 20px rgba(0,0,0,0.06)",
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                whiteSpace: "nowrap",
                fontFamily: "Poppins, sans-serif",
                justifyContent: "center",
                transform: secondaryHover ? "translateY(-7px)" : "translateY(0)",
                opacity: secondaryHover ? 1 : 0.9,
                transition: "transform 250ms ease, box-shadow 250ms ease, opacity 250ms ease",

              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center" }}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ color: "#16a34a" }}
                >
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.12.9.37 1.77.72 2.6a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.48-1.24a2 2 0 0 1 2.11-.45c.83.35 1.7.6 2.6.72A2 2 0 0 1 22 16.92z" />
                </svg>
              </span>
              <span>Get a Quote</span>
            </button>
          </div>
        </div>

        {/* Right: profile pictures slider */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          {normalizedPics.length === 0 ? (
            <div style={{ width: isMobile ? '100%' : 500, height: isMobile ? 240 : 360, borderRadius: 14, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>No Image</div>
          ) : (
            <div style={{ width: isMobile ? '100%' : 500, height: isMobile ? 240 : 360, borderRadius: 14, overflow: 'hidden', background: '#fff', position: 'relative' }}>
              <div
                style={{
                  display: 'flex',
                  width: `${normalizedPics.length * 100}%`,
                  height: '100%',
                  transform: `translateX(-${currentIdx * (100 / normalizedPics.length)}%)`,
                  transition: 'transform 500ms ease',
                }}
              >
                {normalizedPics.map((src, i) => (
                  <div key={i} style={{ width: `${100 / normalizedPics.length}%`, height: '100%', flex: '0 0 auto' }}>
                    <img src={src} alt={`Profile ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                ))}
              </div>
              {normalizedPics.length > 1 ? (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 10,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    padding: '4px 8px',
                    borderRadius: 999,
                    background: 'rgba(0,0,0,0.35)',
                    display: 'flex',
                    gap: 6,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {normalizedPics.map((_, i) => (
                    <button
                      key={i}
                      aria-label={`Go to slide ${i + 1}`}
                      onClick={() => setCurrentIdx(i)}
                      style={{
                        width: i === currentIdx ? 10 : 8,
                        height: i === currentIdx ? 10 : 8,
                        borderRadius: '999px',
                        border: 'none',
                        background: i === currentIdx ? '#ffffff' : 'rgba(255,255,255,0.7)',
                        cursor: 'pointer',
                        transition: 'all 150ms ease',
                      }}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
