import { useRouter } from "next/router";
import { useState, useMemo, useEffect } from "react";
import API_BASE_URL, { ASSET_BASE_URL } from "../config";

export default function HomeSection({ businessName, profilePictures = [], heroTitle, heroDescription }) {
  const router = useRouter();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);

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
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          paddingLeft: isMobile ? "16px" : "40px",
          paddingRight: isMobile ? "16px" : "40px",
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 520px",
          gap: isMobile ? 16 : 24,
          alignItems: "start",
        }}
      >
        {/* Left: text */}
        <div>
          <h1
            style={{
              fontSize: "36px",
              fontWeight: "bold",
              marginBottom: "20px",
            }}
          >
            {heroTitle || businessName}
          </h1>

          <p
            style={{
              fontSize: "16px",
              maxWidth: "700px",
              marginBottom: "30px",
            }}
          >
            {heroDescription || "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Quisque euismod est in sapien feugiat, nec ultrices nisl fermentum. Sed vel sem in nulla suscipit finibus. Mauris vitae quam sit amet nulla hendrerit varius."}
          </p>

          <div
            style={{
              display: "flex",
              gap: "40px",
              marginBottom: "30px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontSize: "24px", fontWeight: "900", color: "#FBBF24" }}>15+</div>
              <div>Years Experience</div>
            </div>
            <div>
              <div style={{ fontSize: "24px", fontWeight: "900", color: "#FBBF24" }}>1000+</div>
              <div>Happy Customers</div>
            </div>
            <div>
              <div style={{ fontSize: "24px", fontWeight: "900", color: "#FBBF24" }}>100%</div>
              <div>Pure Organic</div>
            </div>
          </div>

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
                <>
                  <button
                    aria-label="Previous"
                    onClick={() => setCurrentIdx((i) => (i - 1 + normalizedPics.length) % normalizedPics.length)}
                    style={{
                      position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)',
                      width: 32, height: 32, borderRadius: '999px', border: 'none', cursor: 'pointer',
                      background: 'rgba(0,0,0,0.45)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                  >
                    ‹
                  </button>
                  <button
                    aria-label="Next"
                    onClick={() => setCurrentIdx((i) => (i + 1) % normalizedPics.length)}
                    style={{
                      position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                      width: 32, height: 32, borderRadius: '999px', border: 'none', cursor: 'pointer',
                      background: 'rgba(0,0,0,0.45)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                  >
                    ›
                  </button>
                </>
              ) : null}
            </div>
          )}
          {normalizedPics.length > 1 ? (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', marginTop: 6 }}>
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
                    background: i === currentIdx ? '#ffffff' : 'rgba(255,255,255,0.55)',
                    cursor: 'pointer',
                    transition: 'all 150ms ease',
                  }}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
